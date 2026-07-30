import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { queryOne, execute } from "../db/connection.js";
import { signToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { sendEmail } from "../utils/email.js";

const router = Router();

// Адрес фронтенда для ссылки в письме — та же переменная, что уже настроена для CORS.
const FRONTEND_URL = (process.env.CORS_ORIGIN || "https://app.vmestefamily.site").split(",")[0].trim();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Подождите 15 минут и попробуйте снова." },
});

// Отдельный, более строгий лимит на forgot-password — это ещё и отправка
// письма (не бесплатно и не бесконечно на тарифе Resend), не только защита от подбора.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов на сброс пароля. Подождите 15 минут." },
});

router.post(
  "/register",
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

    await sendEmail({
      to: email,
      subject: "Добро пожаловать в «Вместе»",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #2b2b28;">
          <h2>Здравствуйте, ${parentName}!</h2>
          <p>Вы зарегистрировали семью «${familyName || "Моя семья"}» в приложении «Вместе».</p>
          <p>Загляните в дашборд — там можно добавить ребёнка, настроить расписание и первые квесты.</p>
          <p style="color: #8a8a82; font-size: 13px; margin-top: 24px;">
            Если вы не регистрировались в «Вместе» — просто проигнорируйте это письмо.
          </p>
        </div>
      `,
    });

    const token = signToken({ id: userId, familyId, role: "parent" });
    res.status(201).json({ token, user: { id: userId, familyId, role: "parent", name: parentName, email } });
  })
);

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
  loginLimiter,
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

// Запрос ссылки для сброса пароля. Ответ намеренно одинаковый независимо от
// того, зарегистрирован email или нет — иначе через эту форму можно было бы
// проверять, какие адреса вообще есть в базе.
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Укажите email" });

    const genericMessage = "Если такой email зарегистрирован, на него отправлена ссылка для сброса пароля";

    const user = await queryOne("SELECT id, name FROM users WHERE email = $1", [email]);
    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 час
      await execute("UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3", [
        resetToken,
        expires,
        user.id,
      ]);

      const resetUrl = `${FRONTEND_URL}/?resetToken=${resetToken}`;
      await sendEmail({
        to: email,
        subject: "Восстановление пароля в «Вместе»",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #2b2b28;">
            <h2>Здравствуйте, ${user.name}!</h2>
            <p>Вы (или кто-то другой) запросили сброс пароля для аккаунта в «Вместе».</p>
            <p><a href="${resetUrl}" style="color: #2563eb; font-weight: bold;">Задать новый пароль</a></p>
            <p style="color: #8a8a82; font-size: 13px; margin-top: 24px;">
              Ссылка действует 1 час. Если это были не вы — просто проигнорируйте письмо, пароль не изменится.
            </p>
          </div>
        `,
      });
    }

    res.json({ message: genericMessage });
  })
);

// Установка нового пароля по токену из письма.
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: "Некорректная ссылка для сброса пароля" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Пароль должен быть не короче 8 символов" });
    }

    const user = await queryOne("SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > now()", [
      token,
    ]);
    if (!user) {
      return res.status(400).json({ error: "Ссылка недействительна или уже устарела — запросите новую" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await execute(
      "UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
      [passwordHash, user.id]
    );

    res.json({ ok: true });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await queryOne(
      'SELECT id, family_id as "familyId", role, name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ user });
  })
);

export default router;
