import { Router } from "express";
import { queryOne } from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Заглушка: возвращает последнюю сохранённую геопозицию семьи. В реальном продукте
// её обновляло бы нативное приложение на устройстве ребёнка через отдельный
// защищённый маршрут — см. предупреждение про нативные приложения в README.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const location = await queryOne("SELECT label, address, updated_at FROM locations WHERE family_id = $1", [
      req.user.familyId,
    ]);
    res.json({ location });
  })
);

export default router;
