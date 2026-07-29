import { Router } from "express";
import { queryAll } from "../db/connection.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Список членов семьи с точки зрения родителя (только родитель может его смотреть) —
// используется, чтобы показывать настоящие имена вместо общего слова "ребёнок"
// в интерфейсе. Пароли/хэши сюда намеренно не попадают.
router.get(
  "/members",
  requireAuth,
  requireRole("parent"),
  asyncHandler(async (req, res) => {
    const members = await queryAll(
      "SELECT id, role, name, email FROM users WHERE family_id = $1 ORDER BY created_at",
      [req.user.familyId]
    );
    res.json({ members });
  })
);

export default router;
