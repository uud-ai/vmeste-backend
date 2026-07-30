-- Postgres-версия схемы (раньше была SQLite). Одна семья = один родительский
-- аккаунт + один или несколько детских.
CREATE TABLE IF NOT EXISTS families (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Моя семья',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Токен восстановления пароля: NULL, пока не запрошен сброс. Одна активная
-- ссылка на пользователя — новый запрос перезаписывает старый токен.
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

-- Настройки лимита экранного времени. used_minutes/bonus_minutes сбрасываются
-- раз в сутки (см. src/utils/dayReset.js). used_date остаётся TEXT формата
-- YYYY-MM-DD (а не DATE) намеренно: JS-код сравнивает его напрямую со строкой
-- new Date().toISOString().slice(0,10), и это должно оставаться строкой,
-- а не превращаться в объект Date на стороне pg-драйвера.
CREATE TABLE IF NOT EXISTS settings (
  family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  daily_limit_minutes INTEGER NOT NULL DEFAULT 120,
  bonus_minutes INTEGER NOT NULL DEFAULT 0,
  used_minutes INTEGER NOT NULL DEFAULT 0,
  used_date TEXT NOT NULL DEFAULT CURRENT_DATE::text,
  streak_count INTEGER NOT NULL DEFAULT 0
);

-- block_type используется для логики статуса ("Учится"), а label — то, что видит семья.
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  block_type TEXT NOT NULL DEFAULT 'other' CHECK (block_type IN ('study', 'sleep', 'other')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Одна строка на приложение и на день (usage_date — тот же принцип TEXT, что и used_date выше).
-- В реальном продукте сюда писал бы агент на устройстве ребёнка (см. POST /api/usage/log).
CREATE TABLE IF NOT EXISTS apps_usage (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL,
  category TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  usage_date TEXT NOT NULL DEFAULT CURRENT_DATE::text,
  UNIQUE (family_id, app_name, usage_date)
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('high', 'medium', 'low')),
  risk INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  app_name TEXT,
  discussed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quests (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reward_minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'pending_review', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- type='quest' запросы создаются автоматически при отправке квеста на проверку
-- (см. POST /api/quests/:id/submit) и ссылаются на quest_id.
CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('time', 'unlock', 'quest')),
  quest_id INTEGER REFERENCES quests(id),
  amount INTEGER,
  label TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  parent_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Заглушка геопозиции: в реальном продукте её обновляло бы нативное приложение
-- на устройстве ребёнка (см. предупреждение про native-приложения в README).
CREATE TABLE IF NOT EXISTS locations (
  family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Дома',
  address TEXT NOT NULL DEFAULT 'ул. Солнечная, 14',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);
CREATE INDEX IF NOT EXISTS idx_requests_family_status ON requests(family_id, status);
CREATE INDEX IF NOT EXISTS idx_apps_usage_family_date ON apps_usage(family_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_alerts_family ON alerts(family_id);
