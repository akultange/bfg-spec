import type { CrmPayload } from "./crm";
import { confirmationEmail, manageLinkEmail } from "./emails";
import { CONSENT_TEXT, NOTICE_VERSION } from "./fields";
import { BASE, makeReference, minutesAgoIso, nowIso, randomToken, type Audience } from "./util";
import type { Answers, ValidInput } from "./validate";

export interface RegistrationRow {
  id: string;
  reference: string;
  idem_key: string;
  email_norm: string;
  audience: Audience;
  answers: string;
  consent_contact: number;
  consent_contact_text: string;
  consent_contact_at: string;
  consent_updates: number;
  consent_updates_text: string | null;
  consent_updates_at: string | null;
  notice_version: string;
  manage_token: string;
  origin: string | null;
  created_at: string;
  updated_at: string;
}

export const managePath = (token: string) => `${BASE}/manage/${token}`;
export const manageUrl = (origin: string, token: string) => `${origin}${managePath(token)}`;

export const parseAnswers = (row: RegistrationRow): Answers => {
  try {
    return JSON.parse(row.answers) as Answers;
  } catch {
    return {};
  }
};

export function okResponse(row: RegistrationRow) {
  return {
    status: "ok" as const,
    reference: row.reference,
    audience: row.audience,
    updates: row.consent_updates === 1,
    firstName: String(parseAnswers(row).firstName ?? ""),
    manageUrl: managePath(row.manage_token),
  };
}

export const findByIdem = (db: D1Database, key: string) =>
  db.prepare("SELECT * FROM registrations WHERE idem_key = ?").bind(key).first<RegistrationRow>();

export const findByEmailAudience = (db: D1Database, email: string, audience: Audience) =>
  db.prepare("SELECT * FROM registrations WHERE email_norm = ? AND audience = ?").bind(email, audience).first<RegistrationRow>();

export const findByToken = (db: D1Database, token: string) =>
  db.prepare("SELECT * FROM registrations WHERE manage_token = ?").bind(token).first<RegistrationRow>();

export function isUniqueViolation(e: unknown) {
  return /UNIQUE constraint failed/i.test(String((e as any)?.message ?? e));
}

function crmPayload(row: RegistrationRow): CrmPayload {
  const a = parseAnswers(row);
  const s = (k: string) => (typeof a[k] === "string" && a[k] ? String(a[k]) : null);
  return {
    source: "kindtill-concept",
    reference: row.reference,
    audience: row.audience,
    email: row.email_norm,
    firstName: String(a.firstName ?? ""),
    lastName: String(a.lastName ?? ""),
    organisation: s("businessName") ?? s("orgName"),
    mobile: s("mobile"),
    postcode: s("postcode"),
    followUp: s("followUp"),
    subscribeToUpdates: row.consent_updates === 1,
    consent: {
      contact: { granted: true, wording: row.consent_contact_text, at: row.consent_contact_at },
      updates: {
        granted: row.consent_updates === 1,
        wording: row.consent_updates === 1 ? row.consent_updates_text : null,
        at: row.consent_updates === 1 ? row.consent_updates_at : null,
      },
    },
    submittedAt: row.created_at,
  };
}

function outboxCrm(db: D1Database, row: RegistrationRow, at: string) {
  return db
    .prepare(
      "INSERT INTO outbox (id, registration_id, kind, status, payload, created_at, updated_at) VALUES (?, ?, 'crm_sync', 'pending', ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), row.id, JSON.stringify(crmPayload(row)), at, at);
}

/**
 * Saves the registration, its consent log and its pending side effects in ONE transaction (a D1 batch).
 * Throws a UNIQUE violation when the idempotency key or the email + path pair already exists.
 */
export async function createRegistration(db: D1Database, v: ValidInput, origin: string): Promise<RegistrationRow> {
  const at = nowIso();
  const row: RegistrationRow = {
    id: crypto.randomUUID(),
    reference: makeReference(),
    idem_key: v.idemKey,
    email_norm: v.emailNorm,
    audience: v.audience,
    answers: JSON.stringify(v.answers),
    consent_contact: 1,
    consent_contact_text: CONSENT_TEXT.contact,
    consent_contact_at: at,
    consent_updates: v.consentUpdates ? 1 : 0,
    consent_updates_text: v.consentUpdates ? CONSENT_TEXT.updates : null,
    consent_updates_at: v.consentUpdates ? at : null,
    notice_version: NOTICE_VERSION,
    manage_token: randomToken(),
    origin,
    created_at: at,
    updated_at: at,
  };
  const email = confirmationEmail({
    firstName: String(v.answers.firstName ?? ""),
    audience: v.audience,
    reference: row.reference,
    updates: v.consentUpdates,
    manageUrl: manageUrl(origin, row.manage_token),
  });

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO registrations (id, reference, idem_key, email_norm, audience, answers,
          consent_contact, consent_contact_text, consent_contact_at,
          consent_updates, consent_updates_text, consent_updates_at,
          notice_version, manage_token, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id, row.reference, row.idem_key, row.email_norm, row.audience, row.answers,
        row.consent_contact_text, row.consent_contact_at,
        row.consent_updates, row.consent_updates_text, row.consent_updates_at,
        row.notice_version, row.manage_token, row.origin, row.created_at, row.updated_at,
      ),
    db
      .prepare("INSERT INTO consent_events (registration_id, kind, action, wording, source, at) VALUES (?, 'contact', 'grant', ?, 'registration form', ?)")
      .bind(row.id, row.consent_contact_text, at),
  ];
  if (v.consentUpdates) {
    stmts.push(
      db
        .prepare("INSERT INTO consent_events (registration_id, kind, action, wording, source, at) VALUES (?, 'updates', 'grant', ?, 'registration form', ?)")
        .bind(row.id, row.consent_updates_text, at),
    );
  }
  stmts.push(
    db
      .prepare(
        `INSERT INTO outbox (id, registration_id, kind, status, recipient, subject, body_html, body_text, created_at, updated_at)
         VALUES (?, ?, 'confirmation', 'pending', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), row.id, row.email_norm, email.subject, email.html, email.text, at, at),
    outboxCrm(db, row, at),
  );

  await db.batch(stmts);
  return row;
}

/** Tells the address on file that it was used again. At most one such email per registration every 10 minutes. */
export async function queueManageLink(db: D1Database, row: RegistrationRow, origin: string) {
  const recent = await db
    .prepare("SELECT id FROM outbox WHERE registration_id = ? AND kind = 'manage_link' AND created_at > ? LIMIT 1")
    .bind(row.id, minutesAgoIso(10))
    .first();
  if (recent) return false;
  const at = nowIso();
  const mail = manageLinkEmail({ audience: row.audience, manageUrl: manageUrl(row.origin || origin, row.manage_token) });
  await db
    .prepare(
      `INSERT INTO outbox (id, registration_id, kind, status, recipient, subject, body_html, body_text, created_at, updated_at)
       VALUES (?, ?, 'manage_link', 'pending', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), row.id, row.email_norm, mail.subject, mail.html, mail.text, at, at)
    .run();
  return true;
}

/** Turns news-and-updates on or off, logs it, and queues a CRM update so the mailing list follows. */
export async function setUpdates(db: D1Database, row: RegistrationRow, on: boolean, source: string) {
  if ((row.consent_updates === 1) === on) return row;
  const at = nowIso();
  const next: RegistrationRow = {
    ...row,
    consent_updates: on ? 1 : 0,
    consent_updates_text: on ? CONSENT_TEXT.updates : null,
    consent_updates_at: on ? at : null,
    updated_at: at,
  };
  await db.batch([
    db
      .prepare("UPDATE registrations SET consent_updates = ?, consent_updates_text = ?, consent_updates_at = ?, updated_at = ? WHERE id = ?")
      .bind(next.consent_updates, next.consent_updates_text, next.consent_updates_at, at, row.id),
    db
      .prepare("INSERT INTO consent_events (registration_id, kind, action, wording, source, at) VALUES (?, 'updates', ?, ?, ?, ?)")
      .bind(row.id, on ? "grant" : "withdraw", on ? CONSENT_TEXT.updates : row.consent_updates_text, source, at),
    outboxCrm(db, next, at),
  ]);
  return next;
}

/** Removes the registration and everything holding its personal details. */
export async function deleteRegistration(db: D1Database, row: RegistrationRow) {
  await db.batch([
    db.prepare("DELETE FROM outbox WHERE registration_id = ?").bind(row.id),
    db.prepare("DELETE FROM consent_events WHERE registration_id = ?").bind(row.id),
    db.prepare("DELETE FROM registrations WHERE id = ?").bind(row.id),
  ]);
}

export async function emailsFor(db: D1Database, row: RegistrationRow) {
  const { results } = await db
    .prepare("SELECT id, kind, status, subject, body_html, created_at, attempts, last_error FROM outbox WHERE registration_id = ? AND kind IN ('confirmation', 'manage_link') ORDER BY created_at")
    .bind(row.id)
    .all<{ id: string; kind: string; status: string; subject: string; body_html: string; created_at: string; attempts: number; last_error: string | null }>();
  return results;
}

export async function consentLogFor(db: D1Database, row: RegistrationRow) {
  const { results } = await db
    .prepare("SELECT kind, action, wording, source, at FROM consent_events WHERE registration_id = ? ORDER BY id")
    .bind(row.id)
    .all<{ kind: string; action: string; wording: string | null; source: string; at: string }>();
  return results;
}
