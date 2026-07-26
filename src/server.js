import "dotenv/config";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";

async function start() {
  await migrate();
  const didSeed = await seedIfEmpty();
  if (!didSeed) {
    console.log(
      "ℹ️  База уже содержит данные — демо-данные не пересоздавались (npm run seed — пересоздать вручную)"
    );
  }

  const app = createApp();
  const PORT = process.env.PORT || 4000;

  app.listen(PORT, () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
    console.log(`   Проверка: http://localhost:${PORT}/api/health`);
  });
}

start().catch((err) => {
  console.error("❌ Не удалось запустить сервер:", err);
  process.exit(1);
});
