import { Router } from "express";
import { queryAll, queryOne, transaction } from "../db/connection.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const quests = await queryAll("SELECT * FROM quests WHERE family_id = $1 ORDER BY created_at", [
      req.user.familyId,
    ]);
    res.json({ quests });
  })
);

// Ребёнок отправляет квест на проверку: квест уходит в pending_review и одновременно
// создаётся запись в requests, которую увидит родитель в Центре запросов.
router.post(
  "/:id/submit",
  requireAuth,
  requireRole("child"),
  asyncHandler(async (req, res) => {
    const quest = await queryOne("SELECT * FROM quests WHERE id = $1 AND family_id = $2", [
      req.params.id,
      req.user.familyId,
    ]);
    if (!quest) return res.status(404).json({ error: "Квест не найден" });
    if (quest.status !== "available") {
      return res.status(400).json({ error: "Этот квест уже отправлен на проверку или выполнен" });
    }

    await transaction(async ({ execute }) => {
      await execute("UPDATE quests SET status = 'pending_review' WHERE id = $1", [quest.id]);
      await execute(
        `INSERT INTO requests (family_id, type, quest_id, amount, label, reason, status)
         VALUES ($1, 'quest', $2, $3, $4, 'Готово! Жду проверки 🙂', 'pending')`,
        [req.user.familyId, quest.id, quest.reward_minutes, quest.title]
      );
    });

    res.json({ ok: true });
  })
);

export default router;
