# Registration form: break-test results

Run 2026-10-17 02:56 UTC. 27 of 27 passed.

Environment: the built Webflow Cloud worker running locally under `wrangler dev` with a fresh local D1 (SQLite) database; Chromium 141.0.7390.37 (headless, Playwright); Python 3.13.16. Turnstile is switched off for local runs (Cloudflare isn't reachable from the test machine); the deployed app uses Cloudflare's test keys. Every check reads the database file directly, not only the page.

| # | What we tried, and what should happen | Result |
|---|---|---|
| 1 | Each path end to end on a phone: only that path's questions are shown and stored, optional ones left empty, the confirmation names the path, and the confirmation email and CRM hand-off are queued and processed. `test_each_path_end_to_end[supporter]` | Pass |
| 2 | Each path end to end on a phone: only that path's questions are shown and stored, optional ones left empty, the confirmation names the path, and the confirmation email and CRM hand-off are queued and processed. `test_each_path_end_to_end[business]` | Pass |
| 3 | Each path end to end on a phone: only that path's questions are shown and stored, optional ones left empty, the confirmation names the path, and the confirmation email and CRM hand-off are queued and processed. `test_each_path_end_to_end[charity]` | Pass |
| 4 | Fill business questions, then switch to Supporter and send: the business answers are neither sent nor stored. `test_switching_path_drops_other_answers` | Pass |
| 5 | Double-clicking the submit button saves one registration and queues one confirmation email. `test_double_click_submit_one_row` | Pass |
| 6 | Two requests with the same idempotency key sent at the same moment (bypassing the browser): both get the same reference, and the database keeps one row. `test_concurrent_same_key` | Pass |
| 7 | A retry after a lost response (same key sent again later): the same reference comes back and no second row is created. `test_retry_after_lost_response` | Pass |
| 8 | Reviewer tools → 'Fail the next submission': the failure panel offers Try again, Copy my answers and Email them instead; every answer stays on screen; Try again saves exactly once. `test_outage_then_retry` | Pass |
| 9 | Sending while offline: an offline message, nothing lost, nothing saved; back online, Try again saves exactly once. `test_offline_then_retry` | Pass |
| 10 | Answers typed but not yet sent survive a reload (kept on the device), the path is remembered, and sending afterwards works once. `test_draft_survives_reload` | Pass |
| 11 | The same email on the same path again (new attempt): a friendly 'already registered' message that reveals nothing stored; still one row; a 'manage your registration' email is queued to the address on file. `test_duplicate_same_path` | Pass |
| 12 | ' Test@Example.COM ' and 'test@example.com' count as the same person on the same path; the same email on a different path is allowed. `test_email_normalisation_and_other_path` | Pass |
| 13 | Updates unticked → stored as 'no' and the CRM payload is not subscribed; ticked → stored with its exact wording and time; missing contact consent → rejected with a field error and nothing stored. `test_consents_stored_separately` | Pass |
| 14 | Both consent boxes start unticked; sending without the contact box shows a clear, linked error and sends nothing. `test_consent_defaults_and_required` | Pass |
| 15 | Honeypot filled → a normal-looking success and nothing stored. Sent faster than a person could fill the form → asked to send again, nothing stored. `test_spam_guards` | Pass |
| 16 | The private manage link shows what was stored and both permissions with their wording; 'Stop news and updates' updates the row and logs it; delete removes the row, its emails and its log; the old link then says it was deleted. `test_manage_page` | Pass |
| 17 | The server checks everything itself, bypassing the browser: a missing required answer, a bad email, an ABN that fails the checksum, an option that isn't on the list, an unknown path → 422 with that field's error, nothing stored. `test_server_validation[change0-firstName]` | Pass |
| 18 | The server checks everything itself, bypassing the browser: a missing required answer, a bad email, an ABN that fails the checksum, an option that isn't on the list, an unknown path → 422 with that field's error, nothing stored. `test_server_validation[change1-email]` | Pass |
| 19 | The server checks everything itself, bypassing the browser: a missing required answer, a bad email, an ABN that fails the checksum, an option that isn't on the list, an unknown path → 422 with that field's error, nothing stored. `test_server_validation[change2-abn]` | Pass |
| 20 | The server checks everything itself, bypassing the browser: a missing required answer, a bad email, an ABN that fails the checksum, an option that isn't on the list, an unknown path → 422 with that field's error, nothing stored. `test_server_validation[change3-businessType]` | Pass |
| 21 | The server checks everything itself, bypassing the browser: a missing required answer, a bad email, an ABN that fails the checksum, an option that isn't on the list, an unknown path → 422 with that field's error, nothing stored. `test_server_validation[change4-audience]` | Pass |
| 22 | axe-core with the WCAG 2.0–2.2 A/AA rules on the empty form, the form with errors, the failure panel, the confirmation and the manage page: zero serious or critical issues. `test_accessibility_axe` | Pass |
| 23 | Keyboard only (Tab, Shift+Tab, arrow keys, Space, Enter and typing): complete the Business path and land on the confirmation, with focus moved to it. `test_keyboard_only` | Pass |
| 24 | With the device set to reduce motion, transitions and animations are switched off (buttons, inputs, the sending spinner). `test_reduced_motion` | Pass |
| 25 | Screenshots of every state (each path, errors, failure, duplicate, confirmation, manage page) at 390×844 and 1440×900, for visual review. `test_screens[phone]` | Pass |
| 26 | Screenshots of every state (each path, errors, failure, duplicate, confirmation, manage page) at 390×844 and 1440×900, for visual review. `test_screens[desktop]` | Pass |
| 27 | Transfer weight of a first visit to /register/, by type (HTML, CSS, JavaScript, fonts). `test_page_weight` | Pass |

## Page weight: first load of `/register/` (bytes over the wire, uncompressed bodies)

| Type | Bytes |
|---|---|
| HTML | 36,068 |
| CSS | 0 |
| JavaScript | 12,844 |
| Fonts | 85,640 |
| Other | 0 |
| Total | 134,552 |

## Accessibility (axe-core, WCAG 2.0–2.2 A/AA rules)

| State | Violations (all impacts) |
|---|---|
| Empty form | none |
| Form with errors | none |
| Failure panel | none |
| Confirmation | none |
| Manage page | none |

## Only a real device or the live deploy can confirm

- Turnstile's widget on real phones (the deployed app uses Cloudflare's always-pass test keys).
- Real email delivery and spam placement (emails are previews until a sending domain is configured).
- VoiceOver (iOS) and TalkBack (Android) reading order and announcements.
- Safari's address bar and keyboard covering fields on a real iPhone.
- Network loss mid-request on a real mobile connection.
