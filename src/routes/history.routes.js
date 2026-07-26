import { Router } from "express";
import { queryAll } from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await queryAll(
      `SELECT id, type, label, status, parent_comment, resolved_at
       FROM requests
       WHERE family_id = $1 AND status != 'pending'
       ORDER BY resolved_at DESC
       LIMIT 20`,
      [req.user.familyId]
    );
    res.json({ history: rows });
  })
);

export default router;
