import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { pool, queryOne, transaction } from "./connection.js";
import { migrate } from "./migrate.js";

const DEMO_PARENT = { name: "Родитель", email: "parent@demo.family", password: "demo1234" };
const DEMO_CHILD = { name: "Соня", email: "sonya@demo.family", password: "demo1234" };

export async function seedIfEmpty() {
  const row = await queryOne("SELECT COUNT(*) as count FROM families");
  if (Number(row.count) > 0) return false;
  await seed();
  return true;
}

export async function seed() {
  await transaction(async ({ queryOne: txQueryOne, execute }) => {
    const family = await txQueryOne("INSERT INTO families (name) VALUES ($1) RETURNING id", [
      "Семья Сони",
    ]);
    const familyId = family.id;

    const parentHash = await bcrypt.hash(DEMO_PARENT.password, 10);
    const childHash = await bcrypt.hash(DEMO_CHILD.password, 10);

    await execute(
      "INSERT INTO users (family_id, role, name, email, password_hash) VALUES ($1,$2,$3,$4,$5)",
      [familyId, "parent", DEMO_PARENT.name, DEMO_PARENT.email, parentHash]
    );
    await execute(
      "INSERT INTO users (family_id, role, name, email, password_hash) VALUES ($1,$2,$3,$4,$5)",
      [familyId, "child", DEMO_CHILD.name, DEMO_CHILD.email, childHash]
    );

    await execute(
      "INSERT INTO settings (family_id, daily_limit_minutes, bonus_minutes, used_minutes, streak_count) VALUES ($1,120,0,52,4)",
      [familyId]
    );

    await execute("INSERT INTO locations (family_id) VALUES ($1)", [familyId]);

    const scheduleRows = [
      [familyId, "Учёба", "study", "08:00", "15:00", 1],
      [familyId, "Семейный ужин", "other", "19:00", "20:00", 2],
      [familyId, "Сон", "sleep", "21:00", "07:00", 3],
    ];
    for (const row of scheduleRows) {
      await execute(
        "INSERT INTO schedule_blocks (family_id, label, block_type, start_time, end_time, active, sort_order) VALUES ($1,$2,$3,$4,$5,1,$6)",
        row
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const usageRows = [
      [familyId, "YouTube Kids", "Видео", 34, today],
      [familyId, "Roblox", "Игры", 28, today],
      [familyId, "Учи.ру", "Учёба", 22, today],
      [familyId, "Мессенджер", "Соцсети", 12, today],
    ];
    for (const row of usageRows) {
      await execute(
        "INSERT INTO apps_usage (family_id, app_name, category, minutes, usage_date) VALUES ($1,$2,$3,$4,$5)",
        row
      );
    }

    const alertRows = [
      [
        familyId,
        "high",
        85,
        "Обнаружен потенциальный буллинг",
        "В чате «Класс 5Б» несколько сообщений похожи на травлю одноклассника.",
        "Мессенджер",
      ],
      [
        familyId,
        "medium",
        54,
        "Активность в необычное время",
        "Всплеск активности в Roblox зафиксирован в 03:14 ночи.",
        "Roblox",
      ],
      [
        familyId,
        "low",
        20,
        "Новый контакт в игре",
        "В Roblox появился новый друг, не входящий в список одноклассников Сони.",
        "Roblox",
      ],
    ];
    for (const row of alertRows) {
      await execute(
        "INSERT INTO alerts (family_id, level, risk, title, description, app_name) VALUES ($1,$2,$3,$4,$5,$6)",
        row
      );
    }

    const questRows = [
      [familyId, "Сделать домашку по математике", "Все задания в тетради на стр. 24", 30],
      [familyId, "Помочь по дому", "Убраться в комнате и полить цветы", 15],
      [
        familyId,
        "Пройти тест на цифровую грамотность",
        "10 коротких вопросов о безопасности в интернете",
        20,
      ],
    ];
    for (const row of questRows) {
      await execute(
        "INSERT INTO quests (family_id, title, description, reward_minutes) VALUES ($1,$2,$3,$4)",
        row
      );
    }

    await execute(
      `INSERT INTO requests (family_id, type, amount, label, reason, status)
       VALUES ($1,'time',20,'Доп. 20 минут','Хочу доиграть матч в Roblox с друзьями','pending')`,
      [familyId]
    );

    await execute(
      `INSERT INTO requests (family_id, type, amount, label, reason, status, parent_comment, resolved_at)
       VALUES ($1, 'time', 15, 'Доп. 15 минут', 'Хочу досмотреть видео', 'approved', 'Хорошо, но потом собери портфель на завтра 🙂', NOW() - INTERVAL '1 day')`,
      [familyId]
    );

    await execute(
      `INSERT INTO requests (family_id, type, amount, label, reason, status, parent_comment, resolved_at)
       VALUES ($1, 'unlock', NULL, 'Разблокировать «TikTok»', 'Все смотрят, хочу тоже', 'declined', 'Сегодня учебный день, вернёмся к этому на выходных', NOW() - INTERVAL '1 day')`,
      [familyId]
    );
  });

  console.log("🌱 Демо-данные созданы:");
  console.log(`   Родитель: ${DEMO_PARENT.email} / ${DEMO_PARENT.password}`);
  console.log(`   Ребёнок:  ${DEMO_CHILD.email} / ${DEMO_CHILD.password}`);
}

// Позволяет запускать напрямую: npm run seed
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    await migrate();
    await seed();
    await pool.end();
  })().catch((err) => {
    console.error("❌ Сидинг не удался:", err);
    process.exit(1);
  });
}
