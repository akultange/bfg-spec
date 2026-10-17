import type { Audience } from "./util";

/**
 * One source of truth for the form: the page renders from this list and the server validates against it,
 * so the questions a visitor sees and the questions the server accepts can never drift apart.
 */
export type FieldType = "text" | "email" | "tel" | "textarea" | "select" | "radio" | "checkboxes";

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  /** Which paths see this question. */
  audiences: Audience[] | "all";
  required?: boolean;
  options?: { value: string; label?: string }[];
  max?: number;
  autocomplete?: string;
  inputmode?: string;
  hint?: string;
  placeholder?: string;
  defaultValue?: string;
  /** Extra check on a non-empty value; returns an error message or null. */
  check?: (v: string) => string | null;
  /** Normalise before storing. */
  clean?: (v: string) => string;
}

const opts = (...xs: string[]) => xs.map((value) => ({ value }));

export const CAUSES = [
  "Animal welfare",
  "Environment",
  "Health",
  "Children and young people",
  "Community support",
  "Education",
];

function validAbn(raw: string) {
  const d = raw.replace(/\s+/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const n = d.split("").map(Number);
  n[0] -= 1;
  return n.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}

export const FIELDS: Field[] = [
  { name: "firstName", label: "First name", type: "text", audiences: "all", required: true, max: 80, autocomplete: "given-name" },
  { name: "lastName", label: "Last name", type: "text", audiences: "all", required: true, max: 80, autocomplete: "family-name" },
  {
    name: "email", label: "Email", type: "email", audiences: "all", required: true, max: 254, autocomplete: "email", inputmode: "email",
    check: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : "Enter an email address like name@example.com."),
  },
  {
    name: "mobile", label: "Mobile", type: "tel", audiences: "all", max: 20, autocomplete: "tel", inputmode: "tel", placeholder: "04",
    check: (v) => (/^(\+?61|0)4\d{8}$/.test(v.replace(/[\s()-]/g, "")) ? null : "Enter an Australian mobile, like 0412 345 678."),
    clean: (v) => v.replace(/[\s()-]/g, ""),
  },
  {
    name: "postcode", label: "Postcode", type: "text", audiences: "all", max: 4, autocomplete: "postal-code", inputmode: "numeric",
    check: (v) => (/^\d{4}$/.test(v.trim()) ? null : "Australian postcodes have 4 digits."),
  },

  // Supporters
  {
    name: "causes", label: "Which causes matter most to you?", type: "checkboxes", audiences: ["supporter"],
    options: opts(...CAUSES), hint: "Pick any, or none.",
  },

  // Businesses
  { name: "businessName", label: "Business name", type: "text", audiences: ["business"], required: true, max: 120, autocomplete: "organization" },
  {
    name: "businessType", label: "Type of business", type: "select", audiences: ["business"], required: true,
    options: opts("Café or restaurant", "Grocery or food store", "Retail shop", "Health and beauty", "Trades and services", "Online store", "Something else"),
  },
  { name: "locations", label: "Locations", type: "select", audiences: ["business"], options: opts("1", "2 to 5", "6 or more") },
  {
    name: "website", label: "Website", type: "text", audiences: ["business"], max: 200, autocomplete: "url", inputmode: "url",
    check: (v) => (/^\S+\.\S{2,}$/.test(v.trim()) ? null : "Enter a web address, like yourshop.com.au."),
  },
  {
    name: "abn", label: "ABN", type: "text", audiences: ["business"], max: 14, inputmode: "numeric", placeholder: "11 digits",
    hint: "We only check an ABN if you enter one.",
    check: (v) => (validAbn(v) ? null : "That ABN doesn't add up. Check the 11 digits, or leave it blank."),
    clean: (v) => v.replace(/\s+/g, ""),
  },

  // Charities
  { name: "orgName", label: "Organisation name", type: "text", audiences: ["charity"], required: true, max: 120, autocomplete: "organization" },
  {
    name: "causeArea", label: "Main cause area", type: "select", audiences: ["charity"], required: true,
    options: opts(...CAUSES, "Something else"),
  },
  { name: "role", label: "Your role", type: "text", audiences: ["charity"], max: 80, autocomplete: "organization-title" },
  { name: "acnc", label: "Is your organisation registered with the ACNC?", type: "radio", audiences: ["charity"], options: opts("Yes", "Not yet", "Not sure") },

  // Everyone
  {
    name: "followUp", label: "How would you like us to follow up?", type: "radio", audiences: "all", required: true, defaultValue: "email",
    options: [
      { value: "email", label: "Email is fine" },
      { value: "phone", label: "A phone call" },
      { value: "video", label: "A video call" },
    ],
    hint: "We'll reply by email first, either way.",
  },
  { name: "message", label: "Anything you'd like us to know?", type: "textarea", audiences: "all", max: 2000 },
];

export const COMMON_FIELDS = FIELDS.filter((f) => f.audiences === "all" && f.name !== "followUp" && f.name !== "message");
export const AUDIENCE_FIELDS = (a: Audience) => FIELDS.filter((f) => f.audiences !== "all" && f.audiences.includes(a));
export const fieldByName = (name: string) => FIELDS.find((f) => f.name === name);

export function fieldsFor(a: Audience) {
  return FIELDS.filter((f) => f.audiences === "all" || f.audiences.includes(a));
}

/** The consent wording is stored verbatim with each registration, so what was agreed to can be shown later. */
export const CONSENT = {
  contact: {
    label: "Yes, contact me about this registration.",
    small: "We'll only use these details to reply to you about it.",
  },
  updates: {
    label: "Also send me occasional news and updates.",
    small: "Unsubscribe any time — every email has a link.",
  },
};
export const CONSENT_TEXT = {
  contact: `${CONSENT.contact.label} ${CONSENT.contact.small}`,
  updates: `${CONSENT.updates.label} ${CONSENT.updates.small}`,
};

/** Version of the collection notice shown above the submit button. Bump whenever its wording changes. */
export const NOTICE_VERSION = "2026-10-17 draft (spec)";
