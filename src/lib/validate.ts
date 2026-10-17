import { CONSENT, fieldsFor, type Field } from "./fields";
import { isAudience, normEmail, type Audience } from "./util";

export type Answers = Record<string, string | string[]>;

export interface ValidInput {
  audience: Audience;
  idemKey: string;
  email: string;
  emailNorm: string;
  answers: Answers;
  consentUpdates: boolean;
}

export type ValidationResult =
  | { ok: true; value: ValidInput }
  | { ok: false; errors: Record<string, string> };

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function checkField(f: Field, raw: unknown, errors: Record<string, string>, out: Answers) {
  if (f.type === "checkboxes") {
    const arr = Array.isArray(raw) ? raw.map(str) : raw ? [str(raw)] : [];
    const allowed = new Set((f.options ?? []).map((o) => o.value));
    const picked = arr.filter((x) => allowed.has(x));
    if (f.required && picked.length === 0) errors[f.name] = `Choose at least one option for “${f.label}”.`;
    if (picked.length) out[f.name] = picked;
    return;
  }
  const v = str(raw).trim();
  if (!v) {
    if (f.required) {
      errors[f.name] =
        f.type === "select" || f.type === "radio" ? `Choose an option for “${f.label}”.` : `Enter your ${f.label.toLowerCase()}.`;
    }
    return;
  }
  if (f.max && v.length > f.max) {
    errors[f.name] = `Keep “${f.label}” under ${f.max} characters.`;
    return;
  }
  if ((f.type === "select" || f.type === "radio") && f.options && !f.options.some((o) => o.value === v)) {
    errors[f.name] = `Choose one of the options for “${f.label}”.`;
    return;
  }
  const msg = f.check?.(v);
  if (msg) {
    errors[f.name] = msg;
    return;
  }
  out[f.name] = f.clean ? f.clean(v) : v;
}

/**
 * Validates a submission for its chosen path. Anything that doesn't belong to that path is dropped,
 * so a supporter can never end up with business fields stored against them.
 */
export function validateSubmission(body: any): ValidationResult {
  const errors: Record<string, string> = {};
  if (!body || typeof body !== "object") return { ok: false, errors: { form: "Something went wrong reading the form. Try again." } };

  const audience = body.audience;
  if (!isAudience(audience)) return { ok: false, errors: { audience: "Choose whether you're registering as a supporter, a business or a charity." } };

  const idemKey = str(body.idemKey).trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(idemKey)) errors.form = "Something went wrong preparing the form. Reload the page and try again.";

  const answers: Answers = {};
  for (const f of fieldsFor(audience)) checkField(f, body[f.name], errors, answers);

  if (body.consentContact !== true) errors.consentContact = `Tick “${CONSENT.contact.label}” so we can reply to you.`;

  if (Object.keys(errors).length) return { ok: false, errors };

  const email = String(answers.email);
  return {
    ok: true,
    value: {
      audience,
      idemKey,
      email: email.trim(),
      emailNorm: normEmail(email),
      answers: { ...answers, email: normEmail(email) },
      consentUpdates: body.consentUpdates === true,
    },
  };
}
