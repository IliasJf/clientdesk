# Verification

Verified locally on Windows with Node 24, October 29, 2026.

- TypeScript strict check passed.
- Eleven Node tests passed: monetary rounding and reconciliation; statuses; reference validation and snapshots; draft validation; issue locks; payment rules and idempotency; stale revisions and owner injection; real SQLite API authentication, origin and persistence checks; PDF content and multi-page pagination.
- Local Rolldown production-mode browser bundle built successfully.
- Browser workflow exercised creating a client, creating a project and completing a task, drafting and issuing an invoice, recording a partial payment, and reopening persisted records.
- Example invoice: two units at USD 750, USD 100 discount, 10% tax; total USD 1,540, payment USD 500, balance USD 1,040. PDF rendered through Poppler and visually checked for clipping and legibility.
- PDF generation creates real PDF bytes; clicking the browser export showed no application error. The browser automation download event did not provide a saved-file path, so browser download delivery remains unverified.
- Responsive layouts inspected in the browser. Screenshots are in `docs/screenshots`.

## Limits

The Worker production build could not finish because the Windows sandbox rejected a subprocess with `spawn EPERM`. The publishing helper's credential-input step was rejected by automatic approval review. No live deployment, hosted identity round trip, or production D1 deployment was verified.

The local authentication shortcut is development-only. This is a portfolio demo with fictional sample data, manual payment tracking and no payment provider, mail service, data export/restore UI or accounting compliance certification.
