// Только для локальной разработки/тестов: полностью очищает все таблицы и
// сбрасывает автоинкременты обратно на 1 — аналог того, что раньше делал
// `rm -rf data` с файлом SQLite. Не импортируется server.js и никак не
// доступен через HTTP-API — только `node src/db/reset.js` руками.
import { fileURLToPath } from "node:url";
import { pool } from "./connection.js";

const TABLES = [
  "families",
  "users",
  "settings",
  "schedule_blocks",
  "apps_usage",
  "alerts",
  "quests",
  "requests",
  "locations",
];

export async function resetDatabase() {
  await pool.query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetDatabase()
    .then(() => {
      console.log("🗑️  База очищена (все таблицы, автоинкременты сброшены)");
      return pool.end();
    })
    .catch((err) => {
      console.error("❌ Не удалось очистить базу:", err);
      process.exit(1);
    });
}
