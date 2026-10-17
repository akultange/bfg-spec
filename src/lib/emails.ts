import { AUDIENCE_ARTICLE, esc, type Audience } from "./util";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const SENDER_NOTE =
  "Sent by the Buying for Good website concept, a proposal demo by Luka Skhiladze. This is not Buying for Good. " +
  "You received it because this address was entered in the concept's registration form.";

const NEXT: Record<Audience, string> = {
  supporter: "A person will reply by email about how supporters can take part. Nothing is booked automatically.",
  business: "A person will reply by email to talk through what taking part could look like for your business. Nothing is booked automatically.",
  charity: "A person will reply by email about how charities can take part and what would be needed from you. Nothing is booked automatically.",
};

function shell(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#EDF6F5;font-family:Helvetica,Arial,sans-serif;color:#0B2540">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<p style="margin:0 0 14px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#08706D;font-weight:700">Spec · concept demo</p>
<div style="background:#ffffff;border-radius:16px;padding:26px 24px;line-height:1.55;font-size:16px">${bodyHtml}</div>
<p style="margin:18px 4px 0;font-size:12px;line-height:1.5;color:#3A5066">${esc(SENDER_NOTE)}</p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:22px 0 6px"><a href="${esc(href)}" style="display:inline-block;background:#08706D;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:999px">${esc(label)}</a></p>`;

/** Transactional confirmation: what they registered for and what happens next. No promotional content. */
export function confirmationEmail(o: {
  firstName: string;
  audience: Audience;
  reference: string;
  updates: boolean;
  manageUrl: string;
}): RenderedEmail {
  const subject = `Your registration as ${AUDIENCE_ARTICLE[o.audience]} (concept demo, ref ${o.reference})`;
  const updatesLine = o.updates
    ? "You asked for occasional news and updates. Every update email will include a link to stop them, and you can switch them off now from the link below."
    : "You didn't ask for news and updates, so you won't get any.";
  const html = shell(
    subject,
    `<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.15">Thanks, ${esc(o.firstName)}.</h1>
<p style="margin:0 0 12px">We've saved your registration as ${esc(AUDIENCE_ARTICLE[o.audience])}. Your reference is <strong>${esc(o.reference)}</strong>.</p>
<p style="margin:0 0 12px">${esc(NEXT[o.audience])}</p>
<p style="margin:0 0 4px">${esc(updatesLine)}</p>
${button(o.manageUrl, "View, change or delete your registration")}
<p style="margin:10px 0 0;font-size:14px;color:#3A5066">The link is private to you. Anyone with it can see what you sent, so don't forward this email.</p>`,
  );
  const text = [
    `Thanks, ${o.firstName}.`,
    "",
    `We've saved your registration as ${AUDIENCE_ARTICLE[o.audience]}. Your reference is ${o.reference}.`,
    NEXT[o.audience],
    updatesLine,
    "",
    `View, change or delete your registration: ${o.manageUrl}`,
    "The link is private to you. Anyone with it can see what you sent, so don't forward this email.",
    "",
    SENDER_NOTE,
  ].join("\n");
  return { subject, html, text };
}

/** Sent to the address already on file when someone registers it again for the same path. Reveals nothing new. */
export function manageLinkEmail(o: { audience: Audience; manageUrl: string }): RenderedEmail {
  const subject = "This email was used to register again (concept demo)";
  const intro = `Someone used this email address to register as ${AUDIENCE_ARTICLE[o.audience]} again. It's already registered for that path, so nothing was changed and nothing new was saved.`;
  const html = shell(
    subject,
    `<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:500;font-size:24px;line-height:1.2">You're already registered</h1>
<p style="margin:0 0 12px">${esc(intro)}</p>
<p style="margin:0 0 4px">If it was you, you can view or change what you sent here. If it wasn't, you can ignore this email.</p>
${button(o.manageUrl, "View or change your registration")}`,
  );
  const text = [
    "You're already registered",
    "",
    intro,
    "If it was you, you can view or change what you sent here. If it wasn't, you can ignore this email.",
    "",
    `View or change your registration: ${o.manageUrl}`,
    "",
    SENDER_NOTE,
  ].join("\n");
  return { subject, html, text };
}
