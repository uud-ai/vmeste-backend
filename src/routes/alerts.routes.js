import { Router } from "express";
import { queryAll, queryOne, execute } from "../db/connection.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRole("parent"),
  asyncHandler(async (req, res) => {
    const alerts = await queryAll("SELECT * FROM alerts WHERE family_id = $1 ORDER BY created_at DESC", [
      req.user.familyId,
    ]);
    res.json({ alerts });
  })
);

router.post(
  "/:id/discuss",
  requireAuth,
  requireRole("parent"),
  asyncHandler(async (req, res) => {
    const alert = await queryOne("SELECT * FROM alerts WHERE id = $1 AND family_id = $2", [
      req.params.id,
      req.user.familyId,
    ]);
    if (!alert) return res.status(404).json({ error: "Уведомление не найдено" });

    await execute("UPDATE alerts SET discussed = 1 WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  })
);

export default router;
