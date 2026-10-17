// Cloudflare's published test keys: the widget always passes and the secret accepts its dummy token.
// Real keys replace these at launch through environment variables.
export const TEST_SITE_KEY = "1x00000000000000000000AA";
export const TEST_SECRET = "1x0000000000000000000000000000000AA";

export const turnstileEnabled = (env: Env) => (env.TURNSTILE_MODE ?? "on") !== "off";
export const turnstileSiteKey = (env: Env) => env.TURNSTILE_SITE_KEY || TEST_SITE_KEY;

export async function verifyTurnstile(env: Env, token: unknown, ip: string | null): Promise<boolean> {
  if (!turnstileEnabled(env)) return true;
  if (typeof token !== "string" || !token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET || TEST_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
