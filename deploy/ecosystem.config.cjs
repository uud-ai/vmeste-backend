// pm2-конфиг для запуска бэкенда на VPS.
// .cjs — намеренно: в package.json стоит "type": "module", а pm2 ожидает
// CommonJS-конфиг; расширение .cjs заставляет Node прочитать файл как CJS
// независимо от "type" в package.json.
//
// Секреты (JWT_SECRET и т.д.) сюда не кладём — сервер сам подхватит их
// из файла .env рядом с src/server.js через dotenv/config (см. .env.example).
//
// Запуск (из корня backend/):
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save
//   pm2 startup   # выводит команду для автозапуска после перезагрузки VPS

module.exports = {
  apps: [
    {
      name: "vmeste-backend",
      script: "src/server.js",
      cwd: __dirname + "/..",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      out_file: "deploy/logs/out.log",
      error_file: "deploy/logs/error.log",
      time: true,
    },
  ],
};
