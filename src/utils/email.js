import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";

// Отправка письма никогда не должна ломать основной запрос (регистрацию,
// восстановление пароля и т.д.): если Resend недоступен, ключ неверный или
// домен ещё не подтверждён — просто пишем в лог Render и не бросаем ошибку.
export async function sendEmail({ to, subject, html }) {
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error("Не удалось отправить email:", err.message);
  }
}
