import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  // Без параметров pg отправляет текст через simple query protocol, который,
  // в отличие от parameterized-запросов, умеет выполнять несколько
  // SQL-операторов через точку с запятой за один вызов — как раньше db.exec().
  await pool.query(schema);
}

// Позволяет запускать напрямую: node src/db/migrate.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => {
      console.log("✅ Таблицы созданы (или уже существовали)");
      return pool.end();
    })
    .catch((err) => {
      console.error("❌ Миграция не удалась:", err);
      process.exit(1);
    });
}
