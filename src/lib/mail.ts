/**
 * Mail adapter. With RESEND_API_KEY and MAIL_FROM set, emails go out through Resend.
 * Without them the email is kept as a rendered preview (status "preview") so it can be reviewed
 * on the registration's manage page. Swapping providers means changing this one file.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type MailResult = "sent" | "preview";

export async function sendMail(env: Env, msg: MailMessage): Promise<MailResult> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return "preview";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Email provider returned ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return "sent";
}
