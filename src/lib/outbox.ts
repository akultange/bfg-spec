import { syncToCrm } from "./crm";
import { sendMail } from "./mail";
import { minutesAgoIso, nowIso } from "./util";

interface OutboxRow {
  id: string;
  kind: "confirmation" | "manage_link" | "crm_sync";
  recipient: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  payload: string | null;
  attempts: number;
}

const MAX_ATTEMPTS = 5;

/**
 * Delivers pending emails and CRM updates. Each row is claimed with a conditional UPDATE, so two
 * requests running this at once never send the same email twice. Failures stay pending and are
 * retried on later requests; after five attempts a row is marked failed for a person to look at.
 */
export async function processOutbox(db: D1Database, env: Env, limit = 6) {
  const stale = minutesAgoIso(5);
  const { results } = await db
    .prepare(
      `SELECT id, kind, recipient, subject, body_html, body_text, payload, attempts FROM outbox
       WHERE (status = 'pending' OR (status = 'processing' AND updated_at < ?)) AND attempts < ?
       ORDER BY created_at LIMIT ?`,
    )
    .bind(stale, MAX_ATTEMPTS, limit)
    .all<OutboxRow>();

  for (const row of results) {
    const claimed = await db
      .prepare(
        "UPDATE outbox SET status = 'processing', updated_at = ? WHERE id = ? AND (status = 'pending' OR (status = 'processing' AND updated_at < ?))",
      )
      .bind(nowIso(), row.id, stale)
      .run();
    if (!claimed.meta.changes) continue;

    try {
      const status =
        row.kind === "crm_sync"
          ? await syncToCrm(env, JSON.parse(row.payload || "{}"))
          : await sendMail(env, {
              to: row.recipient || "",
              subject: row.subject || "",
              html: row.body_html || "",
              text: row.body_text || "",
            });
      await db
        .prepare("UPDATE outbox SET status = ?, attempts = attempts + 1, last_error = NULL, updated_at = ? WHERE id = ?")
        .bind(status, nowIso(), row.id)
        .run();
    } catch (e) {
      await db
        .prepare(
          `UPDATE outbox SET status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END,
           attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(MAX_ATTEMPTS, String((e as any)?.message ?? e).slice(0, 300), nowIso(), row.id)
        .run();
    }
  }
}
