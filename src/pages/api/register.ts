import type { APIRoute } from "astro";
import { afterResponse, getEnv, isSpecMode } from "../../lib/env";
import { json } from "../../lib/http";
import { processOutbox } from "../../lib/outbox";
import {
  createRegistration,
  findByEmailAudience,
  findByIdem,
  isUniqueViolation,
  okResponse,
  queueManageLink,
} from "../../lib/registrations";
import { verifyTurnstile } from "../../lib/turnstile";
import { isAudience, makeReference } from "../../lib/util";
import { validateSubmission } from "../../lib/validate";

export const prerender = false;

const MIN_FILL_MS = 1500;
const DUPLICATE_MESSAGE =
  "This email is already registered for this path. We've sent that inbox a link to view or change it.";
const SERVER_MESSAGE = "Something went wrong on our side. Your answers are still here, so try again in a moment.";

export const POST: APIRoute = async ({ request, locals, url }) => {
  let env: Env;
  try {
    env = getEnv(locals);
  } catch {
    return json(503, { status: "error", code: "unavailable", message: SERVER_MESSAGE });
  }
  const db = env.DB;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(400, { status: "error", code: "bad_request", message: "We couldn't read that. Reload the page and try again." });
  }

  // A filled honeypot means a bot: it gets an ordinary-looking success and nothing is stored.
  if (typeof body?.hp === "string" && body.hp.trim()) {
    return json(200, {
      status: "ok",
      reference: makeReference(),
      audience: isAudience(body.audience) ? body.audience : "supporter",
      updates: false,
      firstName: "",
      manageUrl: null,
    });
  }

  // Faster than a person can fill the form: ask to send again rather than silently dropping a real person.
  const renderedAt = Number(body?.renderedAt);
  if (!Number.isFinite(renderedAt) || Date.now() - renderedAt < MIN_FILL_MS) {
    return json(400, { status: "error", code: "too_fast", message: "That was quick. Check your answers, then send again." });
  }

  // Reviewer tools: a simulated outage, before anything is written.
  if (isSpecMode(env) && request.headers.get("x-spec-fail") === "1") {
    return json(503, { status: "error", code: "simulated_outage", message: "Simulated outage from the reviewer tools. Nothing was saved." });
  }

  const v = validateSubmission(body);
  if (!v.ok) return json(422, { status: "invalid", errors: v.errors });
  const input = v.value;

  try {
    // A retry of an attempt that already succeeded (lost response, double tap) gets the original answer.
    const replay = await findByIdem(db, input.idemKey);
    if (replay) return json(200, okResponse(replay));

    const ip = request.headers.get("cf-connecting-ip");
    if (!(await verifyTurnstile(env, body.turnstileToken, ip))) {
      return json(400, {
        status: "error",
        code: "verification",
        message: "We couldn't confirm the security check. Try again, or email your answers instead.",
      });
    }

    const row = await createRegistration(db, input, url.origin);
    afterResponse(locals, processOutbox(db, env));
    return json(200, okResponse(row));
  } catch (e) {
    if (!isUniqueViolation(e)) {
      console.error("register failed", e);
      return json(500, { status: "error", code: "server", message: SERVER_MESSAGE });
    }
    // Two requests with the same key raced: the database kept one, both get its answer.
    const replay = await findByIdem(db, input.idemKey);
    if (replay) return json(200, okResponse(replay));

    // Same email on the same path: block it, reveal nothing, and tell the address on file.
    const existing = await findByEmailAudience(db, input.emailNorm, input.audience);
    if (existing) {
      await queueManageLink(db, existing, url.origin);
      afterResponse(locals, processOutbox(db, env));
      return json(409, { status: "duplicate", message: DUPLICATE_MESSAGE });
    }
    return json(500, { status: "error", code: "server", message: SERVER_MESSAGE });
  }
};

export const ALL: APIRoute = () =>
  json(405, { status: "error", code: "method", message: "Use POST." }, { Allow: "POST" });
