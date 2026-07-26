#!/bin/bash
# Первичная настройка чистого Ubuntu 22.04/24.04 VPS (Timeweb Cloud, Selectel и
# т.п.) под бэкенд «Вместе»: Node.js 22 + pm2 + nginx (+ certbot, если есть домен).
#
# Запускать от root на СВЕЖЕМ сервере:
#   chmod +x deploy/setup-vps.sh
#   sudo ./deploy/setup-vps.sh
#
# Перед запуском отредактируйте три переменные ниже.

set -euo pipefail

# ---- НАСТРОЙТЕ ПОД СЕБЯ --------------------------------------------------
REPO_URL="https://github.com/ВАШ_ЛОГИН/vmeste-backend.git"   # ваш репозиторий
APP_DIR="/opt/vmeste-backend"
DOMAIN=""   # например "api.вашдомен.ru". Пусто -- пропустить SSL и работать по IP
# ---------------------------------------------------------------------------

echo "==> Обновление системы"
apt update && apt upgrade -y

echo "==> Установка Node.js 22.x (NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
echo "    $(node --version) установлен -- для этого проекта достаточно 18.0.0 или новее"

echo "==> Установка nginx, git, certbot"
apt install -y nginx git certbot python3-certbot-nginx

echo "==> Установка pm2 глобально"
npm install -g pm2

echo "==> Получение кода в $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo "==> Установка зависимостей"
npm install --omit=dev

if [ ! -f .env ]; then
  echo "==> Создаю .env со случайным JWT_SECRET"
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  sed -i "s#JWT_SECRET=.*#JWT_SECRET=$SECRET#" .env
  echo "    !!! ВАЖНО: впишите настоящий DATABASE_URL в $APP_DIR/.env вручную"
  echo "        (строка подключения к вашему проекту Supabase) -- без него сервер не стартует."
fi

echo "==> Запуск через pm2"
pm2 start deploy/ecosystem.config.cjs
pm2 save
STARTUP_CMD=$(pm2 startup systemd -u root --hp /root | tail -n 1)
eval "$STARTUP_CMD" || echo "    Не удалось выполнить автоматически -- см. вывод 'pm2 startup' выше и выполните команду вручную"

echo "==> Настройка nginx"
cp deploy/nginx-vmeste-backend.conf /etc/nginx/sites-available/vmeste-backend
if [ -n "$DOMAIN" ]; then
  sed -i "s/api.ваш-домен.ru/$DOMAIN/" /etc/nginx/sites-available/vmeste-backend
fi
ln -sf /etc/nginx/sites-available/vmeste-backend /etc/nginx/sites-enabled/vmeste-backend
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if [ -n "$DOMAIN" ]; then
  echo "==> Выпуск SSL-сертификата для $DOMAIN (замените email в команде ниже на свой, если нужно)"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect \
    || echo "    certbot не отработал автоматически -- запустите вручную: certbot --nginx -d $DOMAIN"
else
  echo "==> DOMAIN не задан -- пропускаю certbot. Пока сервер доступен по http://<IP_VPS>/"
  echo "    Когда появится домен -- впишите его в DOMAIN и запустите:  sudo certbot --nginx -d ваш-домен.ru"
fi

echo ""
echo "==> Готово. Проверка:"
echo "    curl http://127.0.0.1:4000/api/health"
echo "    pm2 status"
echo "    pm2 logs vmeste-backend"
