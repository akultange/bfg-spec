"""Shared helpers for the registration break tests.

The app runs locally (`wrangler dev` on the built worker) against a fresh local D1 database.
Assertions check the database file itself, not only what the page shows.
"""
import datetime
import glob
import json
import os
import platform
import sqlite3
import time
import urllib.error
import urllib.request
import uuid

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get("BFG_BASE", "http://127.0.0.1:8799/register")
SHOTS = os.environ.get("BFG_SHOTS", os.path.join(ROOT, "test-results", "screens"))
RESULTS_MD = os.path.join(ROOT, "docs", "TEST-RESULTS.md")
EXTRA = {}  # filled by tests that measure things (page weight, axe counts)


# ---------- database ----------
def db_path():
    files = glob.glob(os.path.join(ROOT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite"))
    assert files, "local D1 database not found; run tests/run.sh"
    return max(files, key=os.path.getmtime)


def q(sql, *args):
    c = sqlite3.connect(f"file:{db_path()}?mode=ro", uri=True, timeout=5)
    c.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in c.execute(sql, args)]
    finally:
        c.close()


def wait_for(fn, timeout=6.0, interval=0.2):
    end = time.time() + timeout
    value = fn()
    while not value and time.time() < end:
        time.sleep(interval)
        value = fn()
    return value


# ---------- API ----------
def api(payload, headers=None, path="/api/register"):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body or b"null")
        except ValueError:
            return e.code, None


def unique_email(tag="person"):
    return f"{tag}-{uuid.uuid4().hex[:10]}@example.com"


def new_key():
    return uuid.uuid4().hex + "k"


def payload(audience="supporter", **kw):
    p = {
        "audience": audience,
        "idemKey": new_key(),
        "firstName": "Test",
        "lastName": "Person",
        "email": unique_email(audience),
        "followUp": "email",
        "consentContact": True,
        "consentUpdates": False,
        "renderedAt": int(time.time() * 1000) - 10_000,
        "hp": "",
    }
    if audience == "business":
        p.update(businessName="Harbour Café", businessType="Café or restaurant")
    if audience == "charity":
        p.update(orgName="Coastal Wildlife Rescue", causeArea="Animal welfare")
    p.update(kw)
    return p


# ---------- browser ----------
@pytest.fixture(scope="session")
def browser():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        b = p.chromium.launch()
        EXTRA["browser"] = f"Chromium {b.version} (headless, Playwright)"
        yield b
        b.close()


def _context(browser, phone=True, **kw):
    if phone:
        return browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, **kw)
    return browser.new_context(viewport={"width": 1440, "height": 900}, **kw)


@pytest.fixture
def page(browser):
    ctx = _context(browser, phone=True)
    pg = ctx.new_page()
    yield pg
    ctx.close()


@pytest.fixture
def desktop(browser):
    ctx = _context(browser, phone=False)
    pg = ctx.new_page()
    yield pg
    ctx.close()


def open_form(page, path=None, keep_draft=False):
    url = f"{BASE}/" + (f"?path={path}" if path else "")
    page.goto(url)
    if not keep_draft:
        page.evaluate("localStorage.clear()")
        page.goto(url)
    page.wait_for_selector("#eoi")
    page._opened_at = time.time()  # the server refuses sends faster than a person could fill the form
    return page


def wait_human(page, seconds=1.7):
    elapsed = time.time() - getattr(page, "_opened_at", 0)
    if elapsed < seconds:
        time.sleep(seconds - elapsed)


def fill_common(page, email, first="Alex", last="Taylor"):
    page.fill("#firstName", first)
    page.fill("#lastName", last)
    page.fill("#email", email)


def fill_path(page, audience):
    if audience == "supporter":
        page.check("#causes-2")
    if audience == "business":
        page.fill("#businessName", "Harbour Café")
        page.select_option("#businessType", "Café or restaurant")
    if audience == "charity":
        page.fill("#orgName", "Coastal Wildlife Rescue")
        page.select_option("#causeArea", "Animal welfare")


def submit(page):
    wait_human(page)
    page.click("#eoi-submit")


def shot(page, name):
    os.makedirs(SHOTS, exist_ok=True)
    page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)


def run_axe(page):
    axe = os.path.join(ROOT, "node_modules", "axe-core", "axe.min.js")
    page.add_script_tag(path=axe)
    return page.evaluate(
        """async () => {
          const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } });
          return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
        }"""
    )


# ---------- results table ----------
DOCS = {}
RESULTS = []


def pytest_collection_modifyitems(items):
    for it in items:
        doc = (getattr(it.function, "__doc__", None) or "").strip()
        DOCS[it.nodeid] = " ".join(doc.split())


def pytest_runtest_logreport(report):
    if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
        detail = ""
        if report.outcome != "passed":
            detail = (report.longreprtext or "").strip().splitlines()[-1][:220] if report.longreprtext else ""
        RESULTS.append((report.nodeid, report.outcome, detail))


def pytest_sessionfinish(session, exitstatus):
    if not RESULTS:
        return
    os.makedirs(os.path.dirname(RESULTS_MD), exist_ok=True)
    passed = sum(1 for _, o, _ in RESULTS if o == "passed")
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Registration form: break-test results",
        "",
        f"Run {now}. {passed} of {len(RESULTS)} passed.",
        "",
        f"Environment: the built Webflow Cloud worker running locally under `wrangler dev` with a fresh local D1 (SQLite) database; "
        f"{EXTRA.get('browser', 'Chromium')}; Python {platform.python_version()}. Turnstile is switched off for local runs "
        "(Cloudflare isn't reachable from the test machine); the deployed app uses Cloudflare's test keys. "
        "Every check reads the database file directly, not only the page.",
        "",
        "| # | What we tried, and what should happen | Result |",
        "|---|---|---|",
    ]
    for i, (nodeid, outcome, detail) in enumerate(RESULTS, 1):
        name = nodeid.split("::")[-1]
        what = DOCS.get(nodeid, name)
        res = "Pass" if outcome == "passed" else f"**{outcome.upper()}**" + (f": {detail}" if detail else "")
        lines.append(f"| {i} | {what} `{name}` | {res} |")
    if "weight" in EXTRA:
        w = EXTRA["weight"]
        lines += ["", "## Page weight: first load of `/register/` (bytes over the wire, uncompressed bodies)", "", "| Type | Bytes |", "|---|---|"]
        for k, v in w.items():
            lines.append(f"| {k} | {v:,} |")
    if "axe" in EXTRA:
        lines += ["", "## Accessibility (axe-core, WCAG 2.0–2.2 A/AA rules)", "", "| State | Violations (all impacts) |", "|---|---|"]
        for state, v in EXTRA["axe"].items():
            found = ", ".join("{} ({})".format(x["id"], x["impact"]) for x in v) or "none"
            lines.append(f"| {state} | {found} |")
    lines += [
        "",
        "## Only a real device or the live deploy can confirm",
        "",
        "- Turnstile's widget on real phones (the deployed app uses Cloudflare's always-pass test keys).",
        "- Real email delivery and spam placement (emails are previews until a sending domain is configured).",
        "- VoiceOver (iOS) and TalkBack (Android) reading order and announcements.",
        "- Safari's address bar and keyboard covering fields on a real iPhone.",
        "- Network loss mid-request on a real mobile connection.",
    ]
    with open(RESULTS_MD, "w") as f:
        f.write("\n".join(lines) + "\n")
