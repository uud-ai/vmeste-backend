import { Router } from "express";
import { queryOne, queryAll } from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureFreshDay } from "../utils/dayReset.js";
import { computeStatus } from "../utils/status.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { familyId } = req.user;
    await ensureFreshDay(familyId);

    const settings = await queryOne("SELECT * FROM settings WHERE family_id = $1", [familyId]);
    const schedule = await queryAll(
      "SELECT * FROM schedule_blocks WHERE family_id = $1 ORDER BY sort_order",
      [familyId]
    );

    const today = new Date().toISOString().slice(0, 10);
    const topApps = await queryAll(
      "SELECT app_name as name, category, minutes FROM apps_usage WHERE family_id = $1 AND usage_date = $2 ORDER BY minutes DESC LIMIT 3",
      [familyId, today]
    );

    // ::int обязателен: SUM() над integer в Postgres возвращает bigint, а pg
    // отдаёт bigint строкой (защита от потери точности) — без каста minutes
    // пришёл бы в JSON как "46", а не как число 46.
    const categoryBreakdown = await queryAll(
      "SELECT category, SUM(minutes)::int as minutes FROM apps_usage WHERE family_id = $1 AND usage_date = $2 GROUP BY category ORDER BY minutes DESC",
      [familyId, today]
    );

    const totalAvailable = settings.daily_limit_minutes + settings.bonus_minutes;
    const remainingMinutes = Math.max(totalAvailable - settings.used_minutes, 0);
    const status = computeStatus({ remaining: remainingMinutes, schedule });

    res.json({
      usedMinutes: settings.used_minutes,
      limitMinutes: settings.daily_limit_minutes,
      bonusMinutes: settings.bonus_minutes,
      totalAvailable,
      remainingMinutes,
      status,
      streak: settings.streak_count,
      topApps,
      categoryBreakdown,
    });
  })
);

export default router;
