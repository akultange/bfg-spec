/**
 * CRM / email-list adapter. The client hasn't named their contact system yet, so registrations are
 * handed over as one clean JSON payload: to a webhook when CRM_WEBHOOK_URL is set (Zapier, Make,
 * HubSpot workflows and most email tools accept this), otherwise recorded as "noop".
 * Only people who ticked the updates box are flagged for the mailing list.
 */
export interface CrmPayload {
  source: "kindtill-concept";
  reference: string;
  audience: string;
  email: string;
  firstName: string;
  lastName: string;
  organisation: string | null;
  mobile: string | null;
  postcode: string | null;
  followUp: string | null;
  subscribeToUpdates: boolean;
  consent: {
    contact: { granted: true; wording: string; at: string };
    updates: { granted: boolean; wording: string | null; at: string | null };
  };
  submittedAt: string;
}

export type CrmResult = "sent" | "noop";

export async function syncToCrm(env: Env, payload: CrmPayload): Promise<CrmResult> {
  if (!env.CRM_WEBHOOK_URL) return "noop";
  const res = await fetch(env.CRM_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`CRM webhook returned ${res.status}`);
  return "sent";
}
