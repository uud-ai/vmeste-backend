import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Нет токена авторизации" });
  try {
    req.user = verifyToken(token); // { id, familyId, role }
    next();
  } catch {
    return res.status(401).json({ error: "Токен недействителен или истёк" });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Этот маршрут доступен только для роли "${role}"` });
    }
    next();
  };
}
