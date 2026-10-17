type Aud = "supporter" | "business" | "charity";
type FieldError = { name: string; msg: string };

const cfgEl = document.getElementById("eoi-cfg");
const cfg = JSON.parse(cfgEl?.textContent || "{}") as {
  base: string;
  labels: Record<Aud, string>;
  ts: { enabled: boolean; siteKey: string };
  mailMode: "send" | "preview";
};
const form = document.getElementById("eoi") as HTMLFormElement | null;
if (form) init(form);

function init(form: HTMLFormElement) {
  const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T | null;
  const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => Array.from(root.querySelectorAll(s)) as T[];
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const icon = (id: string) => `<svg class="ic" aria-hidden="true"><use href="#${id}"></use></svg>`;

  const DRAFT_KEY = "kindtill-register-draft-v1";
  const ARTICLE: Record<Aud, string> = { supporter: "a supporter", business: "a business", charity: "a charity" };
  const NEXT: Record<Aud, string> = {
    supporter: "A person will reply by email about how supporters can take part.",
    business: "A person will reply by email to talk through what taking part could look like for your business.",
    charity: "A person will reply by email about how charities can take part and what would be needed from you.",
  };

  const submitBtn = $<HTMLButtonElement>("#eoi-submit")!;
  const summary = $("#eoi-summary")!;
  const dup = $("#eoi-dup")!;
  const fail = $("#eoi-fail")!;
  const done = $("#eoi-done")!;
  const live = $("#eoi-live")!;
  const restored = $("#eoi-restored")!;
  const renderedAt = Number(form.dataset.renderedAt) || Date.now();
  const urlPath = new URLSearchParams(location.search).get("path");

  let idemKey = newKey();
  let inFlight = false;
  let failNext = false;
  let tsToken = "";
  let tsWidget: string | null = null;

  function newKey() {
    const raw = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
    return raw.replace(/[^A-Za-z0-9_-]/g, "");
  }
  const announce = (msg: string) => {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = msg), 30);
  };
  const audience = () => ($<HTMLInputElement>('input[name="audience"]:checked')?.value as Aud | undefined) ?? null;

  /* ---------- path-specific questions ---------- */
  function applyAudience() {
    const a = audience();
    $$("[data-show-for]").forEach((block) => {
      const on = !!a && (block.dataset.showFor || "").split(" ").includes(a);
      block.hidden = !on;
      $$<HTMLInputElement>("input, select, textarea", block).forEach((el) => (el.disabled = !on));
      if (!on) {
        $$(".err", block).forEach((e) => {
          e.hidden = true;
          e.textContent = "";
        });
        $$("[aria-invalid]", block).forEach((e) => e.removeAttribute("aria-invalid"));
      }
    });
    const pick = $("#eoi-pick");
    if (pick) pick.hidden = !!a;
  }

  /* ---------- labels and summaries ---------- */
  function labelFor(name: string) {
    const box = $(`[data-field="${name}"]`, form);
    return box?.dataset.label || name;
  }
  function valuesForSummary() {
    const lines: string[] = [];
    const a = audience();
    if (a) lines.push(`Registering as: ${cfg.labels[a]}`);
    $$("[data-field]", form).forEach((box) => {
      const name = box.dataset.field!;
      if (name === "audience" || box.closest("[hidden]")) return;
      if (name === "consentContact") {
        lines.push(`Contact me about this registration: ${$<HTMLInputElement>("#consentContact")!.checked ? "yes" : "no"}`);
        return;
      }
      const els = $$<HTMLInputElement>("input, select, textarea", box);
      let value = "";
      if (els[0]?.type === "radio") value = els.find((e) => e.checked)?.value || "";
      else if (els[0]?.type === "checkbox") value = els.filter((e) => e.checked).map((e) => e.value).join(", ");
      else value = (els[0] as HTMLInputElement | undefined)?.value.trim() || "";
      if (value) lines.push(`${labelFor(name)}: ${value}`);
    });
    lines.push(`Send me news and updates: ${$<HTMLInputElement>("#consentUpdates")!.checked ? "yes" : "no"}`);
    return lines.join("\n");
  }

  /* ---------- draft kept on this device ---------- */
  function draftValues() {
    const values: Record<string, unknown> = {};
    $$<HTMLInputElement>("input[name], select[name], textarea[name]", form).forEach((el) => {
      if (el.name === "hp" || el.name.startsWith("cf-")) return;
      if (el.type === "radio") {
        if (el.checked) values[el.name] = el.value;
      } else if (el.type === "checkbox") {
        if (el.name === "causes") {
          const arr = (values.causes as string[]) || (values.causes = []);
          if (el.checked) arr.push(el.value);
        } else values[el.name] = el.checked;
      } else values[el.name] = el.value;
    });
    return values;
  }
  let saveTimer = 0;
  function saveDraft() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), idemKey, values: draftValues() }));
      } catch {
        /* private mode: nothing to do */
      }
    }, 250);
  }
  function clearDraft() {
    window.clearTimeout(saveTimer);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }
  function restoreDraft() {
    let d: any = null;
    try {
      d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      d = null;
    }
    if (!d?.values || Date.now() - Number(d.savedAt) > 7 * 864e5) return false;
    const v = d.values as Record<string, any>;
    let meaningful = false;
    $$<HTMLInputElement>("input[name], select[name], textarea[name]", form).forEach((el) => {
      if (!(el.name in v)) return;
      if (el.type === "radio") el.checked = v[el.name] === el.value;
      else if (el.type === "checkbox") el.checked = el.name === "causes" ? (v.causes || []).includes(el.value) : !!v[el.name];
      else el.value = v[el.name] ?? "";
      if (el.type !== "radio" && el.type !== "checkbox" && el.value.trim()) meaningful = true;
    });
    if (urlPath && ["supporter", "business", "charity"].includes(urlPath)) {
      const r = $<HTMLInputElement>(`#aud-${urlPath}`);
      if (r) r.checked = true;
    }
    if (typeof d.idemKey === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(d.idemKey)) idemKey = d.idemKey;
    return meaningful;
  }

  /* ---------- validation ---------- */
  function clearErrors() {
    $$(".err", form).forEach((e) => {
      e.hidden = true;
      e.textContent = "";
    });
    $$("[aria-invalid]", form).forEach((e) => e.removeAttribute("aria-invalid"));
    summary.hidden = true;
    summary.innerHTML = "";
  }
  function setFieldError(name: string, msg: string) {
    const err = document.getElementById(`${name}-err`);
    if (err) {
      err.innerHTML = `${icon("i-alert")}<span>${esc(msg)}</span>`;
      err.hidden = false;
    }
    $$(`[data-field="${name}"] input, [data-field="${name}"] select, [data-field="${name}"] textarea`, form).forEach((el) =>
      el.setAttribute("aria-invalid", "true"),
    );
  }
  function focusTarget(name: string) {
    const box = $(`[data-field="${name}"]`, form);
    const el = (box?.querySelector("input:checked") || box?.querySelector("input, select, textarea")) as HTMLElement | null;
    return el;
  }
  function validate(): FieldError[] {
    clearErrors();
    const errs: FieldError[] = [];
    if (!audience()) errs.push({ name: "audience", msg: "Choose whether you're registering as a supporter, a business or a charity." });
    $$("[data-field]", form).forEach((box) => {
      const name = box.dataset.field!;
      if (name === "audience" || box.closest("[hidden]") || box.dataset.required !== "1") return;
      const type = box.dataset.type;
      const label = box.dataset.label || name;
      const els = $$<HTMLInputElement>("input, select, textarea", box).filter((e) => !e.disabled);
      if (!els.length) return;
      if (name === "consentContact") {
        if (!els[0].checked) errs.push({ name, msg: `Tick “${label}” so we can reply to you.` });
        return;
      }
      if (type === "radio") {
        if (!els.some((e) => e.checked)) errs.push({ name, msg: `Choose an option for “${label}”.` });
        return;
      }
      if (type === "checkboxes") {
        if (!els.some((e) => e.checked)) errs.push({ name, msg: `Choose at least one option for “${label}”.` });
        return;
      }
      const value = (els[0].value || "").trim();
      if (!value) errs.push({ name, msg: type === "select" ? `Choose an option for “${label}”.` : `Enter your ${label.toLowerCase()}.` });
    });
    const email = $<HTMLInputElement>("#email");
    if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()) && !errs.some((e) => e.name === "email")) {
      errs.push({ name: "email", msg: "Enter an email address like name@example.com." });
    }
    return errs;
  }
  function showErrors(errs: FieldError[]) {
    hidePanels();
    clearErrors();
    errs.forEach((e) => setFieldError(e.name, e.msg));
    const n = errs.length;
    summary.innerHTML =
      `<h2>${icon("i-alert")}<span>${n === 1 ? "There's 1 thing to fix" : `There are ${n} things to fix`}</span></h2>` +
      `<ul>${errs
        .map((e) => (focusTarget(e.name) ? `<li><a href="#" data-goto="${esc(e.name)}">${esc(e.msg)}</a></li>` : `<li>${esc(e.msg)}</li>`))
        .join("")}</ul>`;
    summary.hidden = false;
    summary.focus();
  }
  summary.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).closest("a[data-goto]") as HTMLAnchorElement | null;
    if (!a) return;
    ev.preventDefault();
    const el = focusTarget(a.dataset.goto!);
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  });

  /* ---------- panels ---------- */
  function hidePanels() {
    for (const p of [dup, fail]) {
      p.hidden = true;
      p.innerHTML = "";
    }
  }
  function setBusy(on: boolean) {
    submitBtn.disabled = on;
    form.setAttribute("aria-busy", on ? "true" : "false");
    submitBtn.innerHTML = on ? `<span class="spin" aria-hidden="true"></span><span class="lbl">Sending…</span>` : `<span class="lbl">Register my interest</span>`;
  }
  function mailtoHref() {
    const subject = "My registration (Kindtill concept)";
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(valuesForSummary())}`;
  }
  function showFailure(kind: "offline" | "timeout" | "network" | "server" | "verification", message?: string) {
    const copy: Record<typeof kind, [string, string]> = {
      offline: ["You seem to be offline", "Nothing was sent. Your answers are saved on this device, so you won't lose them. Send again when you're back online."],
      timeout: ["That took too long", "We didn't hear back in time, so we can't be sure it arrived. Sending again is safe: you won't be registered twice."],
      network: ["We couldn't reach the server", "Your answers are still here and saved on this device. Sending again is safe: you won't be registered twice."],
      server: ["Something went wrong on our side", message || "Your answers are still here. Try again in a moment."],
      verification: ["The security check didn't go through", message || "Try again, or email your answers instead."],
    };
    const [title, body] = copy[kind];
    hidePanels();
    fail.innerHTML =
      `<h2>${icon("i-alert")}<span>${esc(title)}</span></h2><p data-role="body">${esc(body)}</p>` +
      `<div class="panel__row"><button class="btn btn--teal" type="button" data-act="retry">Try again</button>` +
      `<button class="btn btn--line" type="button" data-act="copy">Copy my answers</button>` +
      `<a class="btn btn--line" data-act="email" href="${esc(mailtoHref())}">Email them instead</a></div>` +
      `<p class="hint">Emailing works even when this form doesn't. On a real site it goes to the organisation's inbox.</p>` +
      `<textarea class="copyout" readonly hidden aria-label="Your answers, ready to copy"></textarea>`;
    fail.hidden = false;
    fail.focus();
    announce(title);
  }
  function showNotice(title: string, body: string, actions = "") {
    hidePanels();
    dup.innerHTML = `<h2>${icon("i-mail")}<span>${esc(title)}</span></h2><p>${esc(body)}</p>${actions}`;
    dup.hidden = false;
    dup.focus();
    announce(title);
  }
  function showDuplicate(message: string) {
    showNotice(
      "You're already registered for this path",
      message,
      `<div class="panel__row"><button class="btn btn--line" type="button" data-act="other-email">Use a different email</button><a class="btn btn--line" href="/">Back to the story</a></div>`,
    );
  }
  function showDone(data: { reference: string; audience: Aud; updates: boolean; firstName?: string; manageUrl: string | null }) {
    clearDraft();
    hidePanels();
    const a = data.audience;
    const items = [
      `We've saved your registration.${cfg.mailMode === "preview" ? " (In this concept, the confirmation email is kept as a preview on your private page instead of being sent.)" : " A confirmation email is on its way."}`,
      `${NEXT[a]} Nothing is booked automatically.`,
      data.updates
        ? "You'll get occasional news and updates. Every update email has a link to stop them."
        : "You haven't been added to news and updates.",
    ];
    done.innerHTML =
      `<div class="done__ring">${icon("i-check")}</div>` +
      `<p class="eyebrow">Registered as ${esc(ARTICLE[a])}</p>` +
      `<h2>Thanks${data.firstName ? `, ${esc(data.firstName)}` : ""}. <em>You're in.</em></h2>` +
      `<p class="done__ref">Reference ${esc(data.reference)}</p>` +
      `<ul>${items.map((t) => `<li>${icon("i-check")}<span>${esc(t)}</span></li>`).join("")}</ul>` +
      `<div class="actions">${data.manageUrl ? `<a class="btn btn--teal" href="${esc(data.manageUrl)}">View, change or delete what you sent</a>` : ""}<a class="btn btn--line" href="/">Back to the story</a></div>`;
    form.hidden = true;
    restored.hidden = true;
    done.hidden = false;
    done.focus();
    done.scrollIntoView({ block: "start" });
    announce("Registration saved.");
  }

  fail.addEventListener("click", async (ev) => {
    const btn = (ev.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
    if (!btn) return;
    if (btn.dataset.act === "retry") {
      ev.preventDefault();
      const errs = validate();
      if (errs.length) return showErrors(errs);
      return send();
    }
    if (btn.dataset.act === "copy") {
      ev.preventDefault();
      const text = valuesForSummary();
      try {
        await navigator.clipboard.writeText(text);
        announce("Your answers are copied.");
        btn.textContent = "Copied";
      } catch {
        const ta = $<HTMLTextAreaElement>(".copyout", fail)!;
        ta.value = text;
        ta.hidden = false;
        ta.focus();
        ta.select();
      }
    }
    if (btn.dataset.act === "email") (btn as HTMLAnchorElement).href = mailtoHref();
  });
  dup.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest("[data-act='other-email']");
    if (!btn) return;
    const email = $<HTMLInputElement>("#email")!;
    email.focus();
    email.select();
  });

  /* ---------- sending ---------- */
  function payload() {
    const data: Record<string, unknown> = {};
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) {
      if (k === "consentContact" || k === "consentUpdates" || k.startsWith("cf-")) continue;
      if (k === "causes") {
        ((data.causes as string[]) ||= []).push(String(v));
        continue;
      }
      data[k] = String(v);
    }
    data.consentContact = $<HTMLInputElement>("#consentContact")!.checked;
    data.consentUpdates = $<HTMLInputElement>("#consentUpdates")!.checked;
    data.renderedAt = renderedAt;
    data.idemKey = idemKey;
    if (tsToken) data.turnstileToken = tsToken;
    return data;
  }

  async function send() {
    if (inFlight) return;
    inFlight = true;
    setBusy(true);
    hidePanels();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (failNext) {
      headers["x-spec-fail"] = "1";
      failNext = false;
      const t = $<HTMLInputElement>("#rt-fail");
      if (t) t.checked = false;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 20000);
    let res: Response | null = null;
    let data: any = null;
    let problem: "offline" | "timeout" | "network" | null = null;
    try {
      if (navigator.onLine === false) throw new Error("offline");
      res = await fetch(`${cfg.base}/api/register`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload()),
        signal: ctrl.signal,
        credentials: "same-origin",
      });
      data = await res.json().catch(() => null);
    } catch (e: any) {
      problem = navigator.onLine === false || e?.message === "offline" ? "offline" : e?.name === "AbortError" ? "timeout" : "network";
    } finally {
      window.clearTimeout(timer);
      inFlight = false;
      setBusy(false);
    }

    if (problem) return showFailure(problem);
    if (res!.ok && data?.status === "ok") return showDone(data);
    resetTurnstile();
    if (res!.status === 409) {
      idemKey = newKey();
      saveDraft();
      return showDuplicate(data?.message || "This email is already registered for this path.");
    }
    if (res!.status === 422 && data?.errors) {
      idemKey = newKey();
      saveDraft();
      return showErrors(Object.entries(data.errors).map(([name, msg]) => ({ name, msg: String(msg) })));
    }
    if (res!.status === 400 && data?.code === "too_fast") return showNotice("Almost there", data.message);
    if (res!.status === 400 && data?.code === "verification") return showFailure("verification", data.message);
    return showFailure("server", data?.message);
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (inFlight) return;
    const errs = validate();
    if (errs.length) return showErrors(errs);
    send();
  });

  /* ---------- live edits ---------- */
  form.addEventListener("input", (ev) => {
    const box = (ev.target as HTMLElement).closest("[data-field]") as HTMLElement | null;
    if (box) {
      const err = document.getElementById(`${box.dataset.field}-err`);
      if (err && !err.hidden) {
        err.hidden = true;
        err.textContent = "";
        $$("[aria-invalid]", box).forEach((e) => e.removeAttribute("aria-invalid"));
      }
    }
    saveDraft();
  });
  form.addEventListener("change", (ev) => {
    if ((ev.target as HTMLInputElement).name === "audience") applyAudience();
    form.dispatchEvent(new Event("input"));
  });
  $("#eoi-reset")?.addEventListener("click", () => {
    clearDraft();
    form.reset();
    idemKey = newKey();
    restored.hidden = true;
    applyAudience();
    clearErrors();
    hidePanels();
    $<HTMLInputElement>("#firstName")?.focus();
  });
  window.addEventListener("online", () => {
    if (fail.hidden) return;
    const p = $('[data-role="body"]', fail);
    if (p) p.textContent = "You're back online. Send again when you're ready: you won't be registered twice.";
    announce("You're back online. You can send your registration now.");
  });

  /* ---------- reviewer tools ---------- */
  const rtBtn = $<HTMLButtonElement>("#rt-btn");
  const rtPanel = $("#rt-panel");
  rtBtn?.addEventListener("click", () => {
    const open = rtPanel!.hidden;
    rtPanel!.hidden = !open;
    rtBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && rtPanel && !rtPanel.hidden) {
      rtPanel.hidden = true;
      rtBtn?.setAttribute("aria-expanded", "false");
      rtBtn?.focus();
    }
  });
  $<HTMLInputElement>("#rt-fail")?.addEventListener("change", (ev) => (failNext = (ev.target as HTMLInputElement).checked));

  /* ---------- security check (Cloudflare Turnstile) ---------- */
  function showTsNote() {
    const n = $("#ts-note");
    if (n && n.hidden) {
      n.textContent = "The security check couldn't load (a network or browser extension may be blocking it). You can still try to send, or email your answers instead.";
      n.hidden = false;
    }
  }
  function resetTurnstile() {
    try {
      const t = (window as any).turnstile;
      if (tsWidget && t) {
        t.reset(tsWidget);
        tsToken = "";
      }
    } catch {
      /* ignore */
    }
  }
  const tsBox = $("#ts");
  if (tsBox && cfg.ts?.enabled) {
    (window as any).__ktTurnstileReady = () => {
      try {
        tsWidget = (window as any).turnstile.render(tsBox, {
          sitekey: tsBox.dataset.sitekey,
          appearance: "interaction-only",
          callback: (t: string) => (tsToken = t),
          "expired-callback": () => (tsToken = ""),
          "error-callback": () => showTsNote(),
        });
      } catch {
        showTsNote();
      }
    };
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__ktTurnstileReady";
    s.async = true;
    s.defer = true;
    s.onerror = showTsNote;
    document.head.appendChild(s);
    window.setTimeout(() => {
      if (!(window as any).turnstile) showTsNote();
    }, 12000);
  }

  /* ---------- start ---------- */
  if (restoreDraft()) restored.hidden = false;
  applyAudience();
}
