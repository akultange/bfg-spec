"""Break tests for the three-path registration form (Webflow Cloud app + D1)."""
import json
import threading
import time

import pytest
from conftest import (
    BASE, EXTRA, api, fill_common, fill_path, new_key, open_form, payload, q, run_axe, shot, submit,
    unique_email, wait_for, wait_human,
)

ALLOWED = {
    "supporter": {"firstName", "lastName", "email", "mobile", "postcode", "causes", "followUp", "message"},
    "business": {"firstName", "lastName", "email", "mobile", "postcode", "businessName", "businessType", "locations", "website", "abn", "followUp", "message"},
    "charity": {"firstName", "lastName", "email", "mobile", "postcode", "orgName", "causeArea", "role", "acnc", "followUp", "message"},
}


def rows_for(email):
    return q("SELECT * FROM registrations WHERE email_norm = ?", email.strip().lower())


# 1 ---------------------------------------------------------------------------
@pytest.mark.parametrize("audience", ["supporter", "business", "charity"])
def test_each_path_end_to_end(page, audience):
    """Each path end to end on a phone: only that path's questions are shown and stored, optional ones left empty, the confirmation names the path, and the confirmation email and CRM hand-off are queued and processed."""
    open_form(page, audience)
    for other in {"supporter", "business", "charity"} - {audience}:
        assert page.is_hidden(f'[data-show-for="{other}"]')
        assert page.eval_on_selector_all(f'[data-show-for="{other}"] input, [data-show-for="{other}"] select', "els => els.every(e => e.disabled)")
    assert page.is_visible(f'[data-show-for="{audience}"]')
    email = unique_email(audience)
    fill_common(page, email)
    fill_path(page, audience)
    page.check("#consentContact")
    submit(page)
    page.wait_for_selector("#eoi-done:not([hidden])")
    assert f"registered as a {audience}" in page.inner_text("#eoi-done").lower()
    rows = rows_for(email)
    assert len(rows) == 1 and rows[0]["audience"] == audience
    answers = json.loads(rows[0]["answers"])
    assert set(answers) <= ALLOWED[audience], set(answers) - ALLOWED[audience]
    rid = rows[0]["id"]
    assert wait_for(lambda: len(q("SELECT 1 FROM outbox WHERE registration_id = ? AND status IN ('preview','noop','sent')", rid)) == 2)
    out = q("SELECT kind, status FROM outbox WHERE registration_id = ? ORDER BY kind", rid)
    assert [(r["kind"], r["status"]) for r in out] == [("confirmation", "preview"), ("crm_sync", "noop")]


# 2 ---------------------------------------------------------------------------
def test_switching_path_drops_other_answers(page):
    """Fill business questions, then switch to Supporter and send: the business answers are neither sent nor stored."""
    open_form(page, "business")
    email = unique_email("switch")
    fill_common(page, email)
    fill_path(page, "business")
    page.check("#aud-supporter")
    page.check("#consentContact")
    submit(page)
    page.wait_for_selector("#eoi-done:not([hidden])")
    answers = json.loads(rows_for(email)[0]["answers"])
    assert "businessName" not in answers and "businessType" not in answers


# 3 ---------------------------------------------------------------------------
def test_double_click_submit_one_row(page):
    """Double-clicking the submit button saves one registration and queues one confirmation email."""
    open_form(page, "charity")
    email = unique_email("dbl")
    fill_common(page, email)
    fill_path(page, "charity")
    page.check("#consentContact")
    wait_human(page)
    page.dblclick("#eoi-submit")
    page.wait_for_selector("#eoi-done:not([hidden])")
    time.sleep(0.5)
    rows = rows_for(email)
    assert len(rows) == 1
    assert len(q("SELECT 1 FROM outbox WHERE registration_id = ? AND kind = 'confirmation'", rows[0]["id"])) == 1


# 4 ---------------------------------------------------------------------------
def test_concurrent_same_key(page):
    """Two requests with the same idempotency key sent at the same moment (bypassing the browser): both get the same reference, and the database keeps one row."""
    p = payload("business")
    results = []
    threads = [threading.Thread(target=lambda: results.append(api(p))) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert [s for s, _ in results] == [200, 200], results
    assert results[0][1]["reference"] == results[1][1]["reference"]
    assert len(rows_for(p["email"])) == 1


# 5 ---------------------------------------------------------------------------
def test_retry_after_lost_response():
    """A retry after a lost response (same key sent again later): the same reference comes back and no second row is created."""
    p = payload("supporter")
    s1, r1 = api(p)
    s2, r2 = api(p)
    assert (s1, s2) == (200, 200) and r1["reference"] == r2["reference"]
    assert len(rows_for(p["email"])) == 1


# 6 ---------------------------------------------------------------------------
def test_outage_then_retry(page):
    """Reviewer tools → 'Fail the next submission': the failure panel offers Try again, Copy my answers and Email them instead; every answer stays on screen; Try again saves exactly once."""
    open_form(page, "business")
    email = unique_email("outage")
    fill_common(page, email)
    fill_path(page, "business")
    page.check("#consentContact")
    page.click("#rt-btn")
    page.check("#rt-fail")
    page.click("#rt-btn")
    submit(page)
    page.wait_for_selector("#eoi-fail:not([hidden])")
    panel = page.inner_text("#eoi-fail")
    assert "Something went wrong" in panel and "Copy my answers" in panel and "Email them instead" in panel
    assert page.input_value("#email") == email and page.input_value("#businessName") == "Harbour Café"
    assert rows_for(email) == []
    page.click('#eoi-fail [data-act="retry"]')
    page.wait_for_selector("#eoi-done:not([hidden])")
    assert len(rows_for(email)) == 1


# 7 ---------------------------------------------------------------------------
def test_offline_then_retry(page):
    """Sending while offline: an offline message, nothing lost, nothing saved; back online, Try again saves exactly once."""
    open_form(page, "supporter")
    email = unique_email("offline")
    fill_common(page, email)
    page.check("#consentContact")
    page.context.set_offline(True)
    submit(page)
    page.wait_for_selector("#eoi-fail:not([hidden])")
    assert "offline" in page.inner_text("#eoi-fail").lower()
    assert page.input_value("#email") == email
    assert rows_for(email) == []
    page.context.set_offline(False)
    page.click('#eoi-fail [data-act="retry"]')
    page.wait_for_selector("#eoi-done:not([hidden])")
    assert len(rows_for(email)) == 1


# 8 ---------------------------------------------------------------------------
def test_draft_survives_reload(page):
    """Answers typed but not yet sent survive a reload (kept on the device), the path is remembered, and sending afterwards works once."""
    open_form(page, "charity")
    email = unique_email("draft")
    fill_common(page, email, first="Mia")
    fill_path(page, "charity")
    page.wait_for_timeout(500)  # autosave is debounced
    page.reload()
    page._opened_at = time.time()
    page.wait_for_selector("#eoi-restored:not([hidden])")
    assert page.input_value("#firstName") == "Mia" and page.input_value("#orgName") == "Coastal Wildlife Rescue"
    assert page.is_checked("#aud-charity")
    page.check("#consentContact")
    submit(page)
    page.wait_for_selector("#eoi-done:not([hidden])")
    assert len(rows_for(email)) == 1
    assert page.evaluate("localStorage.getItem('kindtill-register-draft-v1')") is None


# 9 ---------------------------------------------------------------------------
def test_duplicate_same_path(page):
    """The same email on the same path again (new attempt): a friendly 'already registered' message that reveals nothing stored; still one row; a 'manage your registration' email is queued to the address on file."""
    first = payload("business", firstName="Priya")
    assert api(first)[0] == 200
    status, body = api(payload("business", email=first["email"], firstName="Someone"))
    assert status == 409 and set(body) == {"status", "message"}
    open_form(page, "business")
    fill_common(page, first["email"], first="Someone")
    fill_path(page, "business")
    page.check("#consentContact")
    submit(page)
    page.wait_for_selector("#eoi-dup:not([hidden])")
    text = page.inner_text("#eoi-dup")
    assert "already registered" in text and "Priya" not in text
    rows = rows_for(first["email"])
    assert len(rows) == 1
    assert wait_for(lambda: q("SELECT 1 FROM outbox WHERE registration_id = ? AND kind = 'manage_link'", rows[0]["id"]))


# 10 --------------------------------------------------------------------------
def test_email_normalisation_and_other_path():
    """'  Test@Example.COM ' and 'test@example.com' count as the same person on the same path; the same email on a different path is allowed."""
    local = unique_email("norm").split("@")[0]
    messy = f"  {local.upper()}@Example.COM "
    clean = f"{local}@example.com"
    assert api(payload("supporter", email=messy))[0] == 200
    assert api(payload("supporter", email=clean))[0] == 409
    assert api(payload("charity", email=clean))[0] == 200
    assert sorted(r["audience"] for r in rows_for(clean)) == ["charity", "supporter"]


# 11 --------------------------------------------------------------------------
def test_consents_stored_separately():
    """Updates unticked → stored as 'no' and the CRM payload is not subscribed; ticked → stored with its exact wording and time; missing contact consent → rejected with a field error and nothing stored."""
    no = payload("supporter", consentUpdates=False)
    yes = payload("supporter", consentUpdates=True)
    assert api(no)[0] == 200 and api(yes)[0] == 200
    r_no, r_yes = rows_for(no["email"])[0], rows_for(yes["email"])[0]
    assert r_no["consent_updates"] == 0 and r_no["consent_updates_text"] is None
    assert r_yes["consent_updates"] == 1 and "news and updates" in r_yes["consent_updates_text"] and r_yes["consent_updates_at"]
    assert r_no["consent_contact"] == 1 and "contact me about this registration" in r_no["consent_contact_text"]
    crm_no = json.loads(q("SELECT payload FROM outbox WHERE registration_id = ? AND kind = 'crm_sync'", r_no["id"])[0]["payload"])
    crm_yes = json.loads(q("SELECT payload FROM outbox WHERE registration_id = ? AND kind = 'crm_sync'", r_yes["id"])[0]["payload"])
    assert crm_no["subscribeToUpdates"] is False and crm_no["consent"]["updates"]["granted"] is False
    assert crm_yes["subscribeToUpdates"] is True and crm_yes["consent"]["updates"]["wording"]
    missing = payload("supporter", consentContact=False)
    status, body = api(missing)
    assert status == 422 and "consentContact" in body["errors"]
    assert rows_for(missing["email"]) == []


# 12 --------------------------------------------------------------------------
def test_consent_defaults_and_required(page):
    """Both consent boxes start unticked; sending without the contact box shows a clear, linked error and sends nothing."""
    open_form(page, "supporter")
    assert not page.is_checked("#consentContact") and not page.is_checked("#consentUpdates")
    email = unique_email("noconsent")
    fill_common(page, email)
    submit(page)
    page.wait_for_selector("#eoi-summary:not([hidden])")
    assert "contact me about this registration" in page.inner_text("#eoi-summary")
    assert page.get_attribute("#consentContact", "aria-invalid") == "true"
    assert rows_for(email) == []


# 13 --------------------------------------------------------------------------
def test_spam_guards():
    """Honeypot filled → a normal-looking success and nothing stored. Sent faster than a person could fill the form → asked to send again, nothing stored."""
    bot = payload("business", hp="https://spam.example")
    status, body = api(bot)
    assert status == 200 and body["status"] == "ok" and rows_for(bot["email"]) == []
    fast = payload("business", renderedAt=int(time.time() * 1000))
    status, body = api(fast)
    assert status == 400 and body["code"] == "too_fast" and rows_for(fast["email"]) == []


# 14 --------------------------------------------------------------------------
def test_manage_page(page):
    """The private manage link shows what was stored and both permissions with their wording; 'Stop news and updates' updates the row and logs it; delete removes the row, its emails and its log; the old link then says it was deleted."""
    p = payload("charity", consentUpdates=True, firstName="Noah")
    status, body = api(p)
    assert status == 200
    page.goto(f"{BASE.rsplit('/register', 1)[0]}{body['manageUrl']}")
    text = page.inner_text("main")
    assert "Coastal Wildlife Rescue" in text and "contact me about this registration" in text and "news and updates" in text
    page.click("button[value='updates_off']")
    page.wait_for_selector("text=You won't get news and updates any more")
    row = rows_for(p["email"])[0]
    assert row["consent_updates"] == 0
    assert q("SELECT action FROM consent_events WHERE registration_id = ? AND kind = 'updates' ORDER BY id", row["id"]) == [{"action": "grant"}, {"action": "withdraw"}]
    page.click("text=Delete my registration")
    page.click("button[value='delete']")
    page.wait_for_selector("text=Deleted.")
    assert rows_for(p["email"]) == []
    assert q("SELECT 1 FROM outbox WHERE registration_id = ?", row["id"]) == []
    assert q("SELECT 1 FROM consent_events WHERE registration_id = ?", row["id"]) == []


# 15 --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "change,field",
    [
        ({"firstName": ""}, "firstName"),
        ({"email": "not-an-email"}, "email"),
        ({"abn": "12 345 678 901"}, "abn"),
        ({"businessType": "Casino"}, "businessType"),
        ({"audience": "investor"}, "audience"),
    ],
)
def test_server_validation(change, field):
    """The server checks everything itself, bypassing the browser: a missing required answer, a bad email, an ABN that fails the checksum, an option that isn't on the list, an unknown path → 422 with that field's error, nothing stored."""
    p = payload("business")
    p.update(change)
    status, body = api(p)
    assert status == 422 and field in body["errors"], body
    assert rows_for(p["email"]) == [] if "@" in p["email"] else True


# 16 --------------------------------------------------------------------------
def test_accessibility_axe(page):
    """axe-core with the WCAG 2.0–2.2 A/AA rules on the empty form, the form with errors, the failure panel, the confirmation and the manage page: zero serious or critical issues."""
    found = {}
    open_form(page, "business")
    found["Empty form"] = run_axe(page)
    submit(page)
    page.wait_for_selector("#eoi-summary:not([hidden])")
    found["Form with errors"] = run_axe(page)
    email = unique_email("axe")
    fill_common(page, email)
    fill_path(page, "business")
    page.check("#consentContact")
    page.click("#rt-btn")
    page.check("#rt-fail")
    page.click("#rt-btn")
    page.click("#eoi-submit")
    page.wait_for_selector("#eoi-fail:not([hidden])")
    found["Failure panel"] = run_axe(page)
    page.click('#eoi-fail [data-act="retry"]')
    page.wait_for_selector("#eoi-done:not([hidden])")
    found["Confirmation"] = run_axe(page)
    page.click("text=View, change or delete what you sent")
    page.wait_for_selector("text=What you sent")
    found["Manage page"] = run_axe(page)
    EXTRA["axe"] = found
    serious = {k: [v for v in vs if v["impact"] in ("serious", "critical")] for k, vs in found.items()}
    assert not any(serious.values()), serious


# 17 --------------------------------------------------------------------------
def test_keyboard_only(page):
    """Keyboard only (Tab, Shift+Tab, arrow keys, Space, Enter and typing): complete the Business path and land on the confirmation, with focus moved to it."""
    open_form(page)
    email = unique_email("keys")

    def tab_to(selector, limit=60):
        for _ in range(limit):
            if page.evaluate(f"document.activeElement && document.activeElement.matches({json.dumps(selector)})"):
                return
            page.keyboard.press("Tab")
        raise AssertionError(f"could not reach {selector} with Tab")

    tab_to("#aud-supporter")
    page.keyboard.press("ArrowRight")  # radio group: arrows move and select
    assert page.is_checked("#aud-business")
    tab_to("#firstName"); page.keyboard.type("Kai")
    tab_to("#lastName"); page.keyboard.type("Nguyen")
    tab_to("#email"); page.keyboard.type(email)
    tab_to("#businessName"); page.keyboard.type("Corner Bakery")
    tab_to("#businessType"); page.keyboard.press("ArrowDown")
    assert page.input_value("#businessType") != ""
    tab_to("#consentContact"); page.keyboard.press("Space")
    assert page.is_checked("#consentContact")
    tab_to("#eoi-submit")
    wait_human(page)
    page.keyboard.press("Enter")
    page.wait_for_selector("#eoi-done:not([hidden])")
    assert page.evaluate("document.activeElement.id") == "eoi-done"
    assert len(rows_for(email)) == 1


# 18 --------------------------------------------------------------------------
def test_reduced_motion(page):
    """With the device set to reduce motion, transitions and animations are switched off (buttons, inputs, the sending spinner)."""
    page.emulate_media(reduced_motion="reduce")
    open_form(page, "supporter")
    durations = page.evaluate("[...document.querySelectorAll('.btn, input, .opt__box')].map(e => getComputedStyle(e).transitionDuration)")
    assert durations and all(d in ("0s", "0ms") for d in durations), set(durations)


# 19 --------------------------------------------------------------------------
@pytest.mark.parametrize("device", ["phone", "desktop"])
def test_screens(page, desktop, device):
    """Screenshots of every state (each path, errors, failure, duplicate, confirmation, manage page) at 390×844 and 1440×900, for visual review."""
    pg = page if device == "phone" else desktop
    for a in ("supporter", "business", "charity"):
        open_form(pg, a)
        shot(pg, f"{device}-01-form-{a}")
    open_form(pg, "business")
    submit(pg)
    pg.wait_for_selector("#eoi-summary:not([hidden])")
    shot(pg, f"{device}-02-errors")
    dup = payload("business")
    api(dup)
    email = unique_email(f"shots{device}")
    fill_common(pg, email)
    fill_path(pg, "business")
    pg.check("#consentContact")
    pg.check("#consentUpdates")
    pg.click("#rt-btn"); pg.check("#rt-fail"); pg.click("#rt-btn")
    pg.click("#eoi-submit")
    pg.wait_for_selector("#eoi-fail:not([hidden])")
    shot(pg, f"{device}-03-failure")
    pg.fill("#email", dup["email"])
    pg.click('#eoi-fail [data-act="retry"]')
    pg.wait_for_selector("#eoi-dup:not([hidden])")
    shot(pg, f"{device}-04-duplicate")
    pg.fill("#email", email)
    pg.click("#eoi-submit")
    pg.wait_for_selector("#eoi-done:not([hidden])")
    shot(pg, f"{device}-05-confirmation")
    pg.click("text=View, change or delete what you sent")
    pg.wait_for_selector("text=What you sent")
    pg.wait_for_timeout(400)
    shot(pg, f"{device}-06-manage")


# 20 --------------------------------------------------------------------------
def test_page_weight(browser):
    """Transfer weight of a first visit to /register/, by type (HTML, CSS, JavaScript, fonts)."""
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    sizes = {"HTML": 0, "CSS": 0, "JavaScript": 0, "Fonts": 0, "Other": 0}

    def on_response(r):
        try:
            n = len(r.body())
        except Exception:
            return
        t = r.request.resource_type
        key = {"document": "HTML", "stylesheet": "CSS", "script": "JavaScript", "font": "Fonts"}.get(t, "Other")
        sizes[key] += n

    pg.on("response", on_response)
    pg.goto(f"{BASE}/?path=business", wait_until="networkidle")
    ctx.close()
    sizes["Total"] = sum(v for k, v in sizes.items())
    EXTRA["weight"] = sizes
    assert sizes["HTML"] + sizes["CSS"] + sizes["JavaScript"] < 150_000, sizes
