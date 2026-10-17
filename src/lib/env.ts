import * as cf from "cloudflare:workers";

/** Cloudflare bindings and variables for this request. */
export function getEnv(locals?: App.Locals): Env {
  const fromModule = (cf as any).env as Env | undefined;
  if (fromModule && (fromModule as any).DB) return fromModule;
  try {
    const legacy = (locals as any)?.runtime?.env as Env | undefined;
    if (legacy) return legacy;
  } catch {
    /* newer adapters throw when locals.runtime is touched */
  }
  if (fromModule) return fromModule;
  throw new Error("Cloudflare environment is unavailable");
}

/** Run work after the response is sent (emails, CRM sync). Falls back to fire-and-forget. */
export function afterResponse(locals: App.Locals | undefined, work: Promise<unknown>) {
  const guarded = work.catch((e) => console.error("background task failed", e));
  try {
    const ctx = (locals as any)?.cfContext;
    if (ctx?.waitUntil) {
      ctx.waitUntil(guarded);
      return;
    }
  } catch {
    /* ignore */
  }
  const wu = (cf as any).waitUntil;
  if (typeof wu === "function") {
    try {
      wu(guarded);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    const ctx = (locals as any)?.runtime?.ctx;
    if (ctx?.waitUntil) {
      ctx.waitUntil(guarded);
      return;
    }
  } catch {
    /* ignore */
  }
}

export const isSpecMode = (env: Env) => env.SPEC_MODE !== "0";
