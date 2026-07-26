import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET не задан в .env — используется небезопасный дефолт. Смените его перед деплоем.");
}

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
