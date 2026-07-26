import "dotenv/config";
import dns from "node:dns";
import pg from "pg";

dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

// Настоящая персистентность вместо файла SQLite: подключаемся к управляемому
// Postgres (например, бесплатному проекту Supabase). DATABASE_URL — это полная
// строка подключения вида postgresql://user:password@host:port/database.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL не задан. Укажите строку подключения к Postgres (например, из Supabase) в .env — см. .env.example"
  );
}

// Supabase (и почти любой облачный Postgres) требует TLS-соединение.
// rejectUnauthorized: false отключает строгую проверку цепочки сертификата —
// обычная практика для управляемых провайдеров. Если нужна строгая проверка
// (например, свой сертификат/CA), поставьте PGSSL_STRICT=true.
// PGSSL=false полностью отключает TLS — только для локальной разработки
// с локальным Postgres без TLS вообще.
const ssl =
  process.env.PGSSL === "false"
    ? false
    : { rejectUnauthorized: process.env.PGSSL_STRICT === "true" };

export const pool = new Pool({ connectionString, ssl, connectionTimeoutMillis: 10000 });

pool.on("error", (err) => {
  // Ошибки на простаивающих соединениях пула — не должны валить процесс.
  console.error("Неожиданная ошибка на простаивающем клиенте Postgres:", err);
});

export async function queryAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function queryOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] ?? null;
}

export async function execute(sql, params = []) {
  const result = await pool.query(sql, params);
  return { changes: result.rowCount, rows: result.rows };
}

// Транзакция: важно, что BEGIN/COMMIT/ROLLBACK и все запросы внутри fn идут
// через ОДИН и тот же client, а не через pool.query() — иначе каждый вызов
// мог бы уйти на разное соединение из пула, и атомарности бы не было.
export async function transaction(fn) {
  const client = await pool.connect();
  const scoped = {
    queryAll: async (sql, params = []) => (await client.query(sql, params)).rows,
    queryOne: async (sql, params = []) => (await client.query(sql, params)).rows[0] ?? null,
    execute: async (sql, params = []) => {
      const result = await client.query(sql, params);
      return { changes: result.rowCount, rows: result.rows };
    },
  };
  try {
    await client.query("BEGIN");
    const result = await fn(scoped);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
