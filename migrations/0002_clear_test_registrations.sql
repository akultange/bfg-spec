-- The concept is now a fictional-brand portfolio piece. Clear every registration made while it
-- was a proposal demo (test entries and anything reviewers typed in), as the proposal promised.
DELETE FROM consent_events;
DELETE FROM outbox;
DELETE FROM registrations;
