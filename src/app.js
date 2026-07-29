import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import overviewRoutes from "./routes/overview.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import alertsRoutes from "./routes/alerts.routes.js";
import questsRoutes from "./routes/quests.routes.js";
import requestsRoutes from "./routes/requests.routes.js";
import historyRoutes from "./routes/history.routes.js";
import usageRoutes from "./routes/usage.routes.js";
import locationRoutes from "./routes/location.routes.js";
import familyRoutes from "./routes/family.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  // Render (и большинство хостингов) стоит перед приложением как прокси: реальный IP
  // пользователя приходит в заголовке X-Forwarded-For, а не в самом соединении.
  // Без этой строчки express-rate-limit (см. auth.routes.js) не сможет отличить
  // разных пользователей друг от друга и будет банить всех сразу после нескольких
  // попыток входа с любого устройства — единица означает «доверяем ровно одному
  // прокси перед нами», что и есть конфигурация Render.
  app.set("trust proxy", 1);

  // CORS:

  // CORS: по умолчанию открыт для всех источников (удобно для локальной разработки
  // и первого теста на Render). Задайте CORS_ORIGIN в переменных окружения — один
  // домен или несколько через запятую — чтобы сузить доступ перед реальным использованием.
  const allowedOrigins = (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({ origin: allowedOrigins.includes("*") ? true : allowedOrigins }));
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/overview", overviewRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/alerts", alertsRoutes);
  app.use("/api/quests", questsRoutes);
  app.use("/api/requests", requestsRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/usage", usageRoutes);
  app.use("/api/location", locationRoutes);
  app.use("/api/family", familyRoutes);

  app.use((req, res) => res.status(404).json({ error: "Маршрут не найден" }));
  app.use(errorHandler);

  return app;
}
