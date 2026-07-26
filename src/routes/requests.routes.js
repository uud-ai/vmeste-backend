import { Router } from "express";
import { queryAll, queryOne, transaction } from "../db/connection.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const rows = status
      ? await queryAll(
          "SELECT * FROM requests WHERE family_id = $1 AND status = $2 ORDER BY created_at DESC",
          [req.user.familyId, status]
        )
      : await queryAll("SELECT * FROM requests WHERE family_id = $1 ORDER BY created_at DESC", [
          req.user.familyId,
        ]);
    res.json({ requests: rows });
  })
);

// Ребёнок просит доп. время или разблокировку сайта (форма "Попросить больше").
router.post(
  "/",
  requireAuth,
  requireRole("child"),
  asyncHandler(async (req, res) => {
    const { type, amount, label, reason } = req.body;
    if (!["time", "unlock"].includes(type) || !label || !reason) {
      return res.status(400).json({ error: 'Укажите type ("time" или "unlock"), label и reason' });
    }
    const info = await queryOne(
      "INSERT INTO requests (family_id, type, amount, label, reason, status) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id",
      [req.user.familyId, type, amount ?? null, label, reason]
    );
    res.status(201).json({ id: info.id });
  })
);

// Родитель одобряет/отклоняет: при одобрении bonus_minutes растёт на request.amount
// (для type='time' И type='quest' — ОДИН И ТОТ ЖЕ путь, чтобы не начислить бонус дважды),
// а связанный квест (если есть) переводится в completed или обратно в available.
router.post(
  "/:id/respond",
  requireAuth,
  requireRole("parent"),
  asyncHandler(async (req, res) => {
    const { decision, comment } = req.body;
    if (!["approved", "declined"].includes(decision)) {
      return res.status(400).json({ error: 'decision должен быть "approved" или "declined"' });
    }
    const request = await queryOne("SELECT * FROM requests WHERE id = $1 AND family_id = $2", [
      req.params.id,
      req.user.familyId,
    ]);
    if (!request) return res.status(404).json({ error: "Запрос не найден" });
    if (request.status !== "pending") return res.status(400).json({ error: "Этот запрос уже обработан" });

    await transaction(async ({ execute }) => {
      await execute(
        "UPDATE requests SET status = $1, parent_comment = $2, resolved_at = NOW() WHERE id = $3",
        [decision, comment || null, request.id]
      );

      if (decision === "approved" && request.amount) {
        await execute("UPDATE settings SET bonus_minutes = bonus_minutes + $1 WHERE family_id = $2", [
          request.amount,
          req.user.familyId,
        ]);
      }
      if (request.type === "quest" && request.quest_id) {
        await execute("UPDATE quests SET status = $1 WHERE id = $2", [
          decision === "approved" ? "completed" : "available",
          request.quest_id,
        ]);
      }
    });

    res.json({ ok: true });
  })
);

export default router;
