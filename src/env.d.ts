/// <reference types="astro/client" />
/* eslint-disable @typescript-eslint/no-empty-interface */

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** "0" turns off reviewer tools such as simulated failures. Anything else (default) = spec mode. */
  SPEC_MODE?: string;
  /** "off" skips Turnstile verification (local tests only). */
  TURNSTILE_MODE?: string;
  /** Defaults to Cloudflare's published always-pass test keys. */
  TURNSTILE_SITE_KEY?: string;
  /** Secret. Defaults to Cloudflare's published always-pass test secret. */
  TURNSTILE_SECRET?: string;
  /** Secret. With MAIL_FROM set, emails are sent through Resend; otherwise they are stored as previews. */
  RESEND_API_KEY?: string;
  /** e.g. "Buying for Good concept <hello@yourdomain>" — a domain verified in Resend. */
  MAIL_FROM?: string;
  /** Secret. When set, each registration is POSTed here as JSON for the client's CRM or email tool. */
  CRM_WEBHOOK_URL?: string;
}

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
