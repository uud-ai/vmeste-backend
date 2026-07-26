import { queryOne, execute } from "../db/connection.js";

// Лениво сбрасывает использованные и бонусные минуты, когда наступают новые сутки.
// Вызывается в начале любого роута, который читает или пишет settings.
export async function ensureFreshDay(familyId) {
  const today = new Date().toISOString().slice(0, 10);
  const settings = await queryOne("SELECT used_date FROM settings WHERE family_id = $1", [familyId]);
  if (settings && settings.used_date !== today) {
    await execute(
      "UPDATE settings SET used_minutes = 0, bonus_minutes = 0, used_date = $1 WHERE family_id = $2",
      [today, familyId]
    );
  }
}
