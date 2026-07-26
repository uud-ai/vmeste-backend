import { Router } from "express";
import { transaction } from "../db/connection.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureFreshDay } from "../utils/dayReset.js";

const router = Router();

// В реальном продукте сюда стучался бы нативный агент на устройстве ребёнка
// (iOS Screen Time API / Android Digital Wellbeing и т.п.) — см. README.
// Для разработки/теста можно вызывать вручную, чтобы увидеть, как обновляется
// топ-3 приложения и разбивка по категориям на /api/overview.
router.post(
  "/log",
  requireAuth,
  requireRole("child"),
  asyncHandler(async (req, res) => {
    const { appName, category, minutes } = req.body;
    if (!appName || !category || typeof minutes !== "number" || minutes <= 0) {
      return res.status(400).json({ error: "Укажите appName, category и minutes (число больше 0)" });
    }

    await ensureFreshDay(req.user.familyId);
    const today = new Date().toISOString().slice(0, 10);

    await transaction(async ({ queryOne, execute }) => {
      const existing = await queryOne(
        "SELECT id FROM apps_usage WHERE family_id = $1 AND app_name = $2 AND usage_date = $3",
        [req.user.familyId, appName, today]
      );

      if (existing) {
        await execute("UPDATE apps_usage SET minutes = minutes + $1 WHERE id = $2", [
          minutes,
          existing.id,
        ]);
      } else {
        await execute(
          "INSERT INTO apps_usage (family_id, app_name, category, minutes, usage_date) VALUES ($1,$2,$3,$4,$5)",
          [req.user.familyId, appName, category, minutes, today]
        );
      }

      await execute("UPDATE settings SET used_minutes = used_minutes + $1 WHERE family_id = $2", [
        minutes,
        req.user.familyId,
      ]);
    });

    res.json({ ok: true });
  })
);

export default router;
