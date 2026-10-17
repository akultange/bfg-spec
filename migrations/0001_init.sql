-- Registrations from the three-path expression-of-interest form.
-- Duplicate prevention and idempotency are enforced here, by the database, not by the browser.
CREATE TABLE registrations (
  id                    TEXT PRIMARY KEY,
  reference             TEXT NOT NULL UNIQUE,
  idem_key              TEXT NOT NULL UNIQUE,            -- one per submission attempt chain; replays return the original result
  email_norm            TEXT NOT NULL,                   -- trimmed, lower-cased, NFC
  audience              TEXT NOT NULL CHECK (audience IN ('supporter', 'business', 'charity')),
  answers               TEXT NOT NULL,                   -- JSON: only the fields that belong to this path
  consent_contact       INTEGER NOT NULL CHECK (consent_contact = 1),
  consent_contact_text  TEXT NOT NULL,                   -- exact wording shown
  consent_contact_at    TEXT NOT NULL,
  consent_updates       INTEGER NOT NULL DEFAULT 0 CHECK (consent_updates IN (0, 1)),
  consent_updates_text  TEXT,                            -- exact wording shown, when given
  consent_updates_at    TEXT,
  notice_version        TEXT NOT NULL,                   -- which collection notice was on screen
  manage_token          TEXT NOT NULL UNIQUE,            -- capability link for view / change / delete / unsubscribe
  origin                TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (email_norm, audience)
);

-- Every grant or withdrawal of consent, with the wording that applied.
CREATE TABLE consent_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id  TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('contact', 'updates')),
  action           TEXT NOT NULL CHECK (action IN ('grant', 'withdraw')),
  wording          TEXT,
  source           TEXT NOT NULL,
  at               TEXT NOT NULL
);
CREATE INDEX idx_consent_events_reg ON consent_events (registration_id);

-- Side effects (emails, CRM sync) are written in the same transaction as the registration,
-- then delivered afterwards with retries, so a slow or failing email/CRM never loses a registration.
CREATE TABLE outbox (
  id               TEXT PRIMARY KEY,
  registration_id  TEXT,
  kind             TEXT NOT NULL CHECK (kind IN ('confirmation', 'manage_link', 'crm_sync')),
  status           TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'preview', 'noop', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  recipient        TEXT,
  subject          TEXT,
  body_html        TEXT,
  body_text        TEXT,
  payload          TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_outbox_status ON outbox (status, created_at);
CREATE INDEX idx_outbox_reg ON outbox (registration_id);
