export const AUDIENCES = ["supporter", "business", "charity"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<Audience, string> = {
  supporter: "Supporter",
  business: "Business",
  charity: "Charity",
};

export const AUDIENCE_ARTICLE: Record<Audience, string> = {
  supporter: "a supporter",
  business: "a business",
  charity: "a charity",
};

export function isAudience(v: unknown): v is Audience {
  return typeof v === "string" && (AUDIENCES as readonly string[]).includes(v);
}

export const nowIso = () => new Date().toISOString();

export function minutesAgoIso(min: number) {
  return new Date(Date.now() - min * 60_000).toISOString();
}

/** Trim, lower-case and NFC-normalise an email so "  Test@Example.COM " and "test@example.com" match. */
export function normEmail(s: string) {
  return s.normalize("NFC").trim().toLowerCase();
}

export function base64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Unguessable capability token (192 bits by default). */
export function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return base64url(a);
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-friendly reference, e.g. BFG-7KQ2-M9XD. */
export function makeReference() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  const c = Array.from(a, (b) => REF_ALPHABET[b % 32]).join("");
  return `BFG-${c.slice(0, 4)}-${c.slice(4)}`;
}

export function esc(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** App base path without a trailing slash, e.g. "/register". */
export const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Australia/Adelaide",
    }).format(new Date(iso)) + " (Adelaide time)";
  } catch {
    return iso;
  }
}
