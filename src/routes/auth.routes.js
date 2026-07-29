import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { queryOne, execute } from "../db/connection.js";
import { signToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Не больше 20 попыток входа с одного IP за 15 минут. 20 — с запасом на то, что
// вся семья обычно сидит за одним домашним интернетом и может пробовать войти
// почти одновременно с нескольких устройств; для подбора пароля этого всё равно
// мало — перебор с такой скоростью займёт годы даже по короткому словарю.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Подождите 15 минут и попробуйте снова." },
});

// Создаёт новую семью и родительский аккаунт (первый пользователь семьи всегда родитель).
router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { familyName, parentName, email, password } = req.body;
    if (!parentName || !email || !password) {
      return res.status(400).json({ error: "Заполните имя, email и пароль" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Пароль должен быть не короче 8 символов" });
    }
    const existing = await queryOne("SELECT id FROM users WHERE email = $1", [email]);
    if (existing) return res.status(409).json({ error: "Этот email уже зарегистрирован" });

    const family = await queryOne("INSERT INTO families (name) VALUES ($1) RETURNING id", [
      familyName || "Моя семья",
    ]);
    const familyId = family.id;

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await queryOne(
      "INSERT INTO users (family_id, role, name, email, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [familyId, "parent", parentName, email, passwordHash]
    );
    const userId = user.id;

    await execute("INSERT INTO settings (family_id) VALUES ($1)", [familyId]);
    await execute("INSERT INTO locations (family_id) VALUES ($1)", [familyId]);

    const token = signToken({ id: userId, familyId, role: "parent" });
    res.status(201).json({ token, user: { id: userId, familyId, role: "parent", name: parentName, email } });
  })
);

// Только родитель может добавить ребёнка в свою семью.
router.post(
  "/register-child",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "parent") {
      return res.status(403).json({ error: "Только родитель может добавить ребёнка" });
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Заполните имя, email и пароль" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Пароль должен быть не короче 8 символов" });
    }
    const existing = await queryOne("SELECT id FROM users WHERE email = $1", [email]);
    if (existing) return res.status(409).json({ error: "Этот email уже зарегистрирован" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await queryOne(
      "INSERT INTO users (family_id, role, name, email, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [req.user.familyId, "child", name, email, passwordHash]
    );
    const userId = user.id;

    const token = signToken({ id: userId, familyId: req.user.familyId, role: "child" });
    res.status(201).json({ token, user: { id: userId, familyId: req.user.familyId, role: "child", name, email } });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Заполните email и пароль" });

    const user = await queryOne("SELECT * FROM users WHERE email = $1", [email]);
    if (!user) return res.status(401).json({ error: "Неверный email или пароль" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Неверный email или пароль" });

    const token = signToken({ id: user.id, familyId: user.family_id, role: user.role });
    res.json({
      token,
      user: { id: user.id, familyId: user.family_id, role: user.role, name: user.name, email: user.email },
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Алиас familyId в кавычках обязателен: Postgres по умолчанию приводит
    // некавыченные идентификаторы к нижнему регистру (было бы "familyid").
    const user = await queryOne(
      'SELECT id, family_id as "familyId", role, name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ user });
  })
);

export default router;
