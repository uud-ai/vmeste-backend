import { Router } from "express";
import { queryOne, queryAll, execute } from "../db/connection.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const settings = await queryOne(
      "SELECT daily_limit_minutes, bonus_minutes FROM settings WHERE family_id = $1",
      [req.user.familyId]
    );
    const schedule = await queryAll(
      "SELECT * FROM schedule_blocks WHERE family_id = $1 ORDER BY sort_order",
      [req.user.familyId]
    );
    res.json({ limitMinutes: settings.daily_limit_minutes, bonusMinutes: settings.bonus_minutes, schedule });
  })
);

// Родитель двигает слайдер лимита — ребёнок увидит новое значение при следующем
// GET /api/overview (в отличие от прототипа на чистом стейте, здесь это происходит
// через перезапрос к API, а не мгновенно в той же вкладке — см. README про поллинг).
router.put(
  "/limit",
  requireAuth,
  requireRole("parent"),
  asyncHandler(async (req, res) => {
    const { limitMinutes } = req.body;
    if (typeof limitMinutes !== "number" || limitMinutes < 15 || limitMinutes > 720) {
      return res.status(400).json({ error: "limitMinutes должен быть числом от 15 до 720" });
    }
    await execute("UPDATE settings SET daily_limit_minutes = $1 WHERE family_id = $2", [
      limitMinutes,
      req.user.familyId,
    ]);
    res.json({ limitMinutes });
  })
);

router.put(
  "/schedule/:id",
  requireAuth,
  requireRole("parent"),
  asyncHandler(async (req, res) => {
    const block = await queryOne("SELECT * FROM schedule_blocks WHERE id = $1 AND family_id = $2", [
      req.params.id,
      req.user.familyId,
    ]);
    if (!block) return res.status(404).json({ error: "Блок расписания не найден" });

    await execute("UPDATE schedule_blocks SET active = $1 WHERE id = $2", [
      req.body.active ? 1 : 0,
      req.params.id,
    ]);
    res.json({ ok: true });
  })
);

export default router;
