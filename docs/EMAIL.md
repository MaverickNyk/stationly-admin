# Email studio and the password re-check

## Email (`/email`)

Write an email, pick exactly who gets it, see it the way an inbox shows it,
send yourself a test, then send. Backend half: stationly-backend
`src/admin/email/README.md` (how direct vs broadcast is chosen, quotas, Firestore cost).

| Piece | File |
|---|---|
| Page | `app/(dash)/email/page.tsx` |
| Studio (list, autosave, live preview, tabs) | `components/email/EmailStudio.tsx` |
| Content editor (envelope, blocks, image upload + library) | `components/email/BlockEditor.tsx` |
| Inbox-style preview (desktop/phone, plain text, preview as a recipient) | `components/email/EmailPreview.tsx` |
| Audience builder (filters, custom/excluded addresses, recipient list, exclusions) | `components/email/AudienceBuilder.tsx` |
| Test & send (allowance meters, direct vs broadcast, typed count, progress, delivery record) | `components/email/SendPanel.tsx` |
| Types (mirror of the backend's) and starter templates | `lib/emailTypes.ts`, `lib/emailTemplates.ts` |
| Proxy | `app/api/admin/email/[...path]/route.ts` → backend `/api/v1/admin/email/*`, allow-list in `lib/backend.ts` (`EMAIL_PATHS`) |

Blocks: heading, text (`**bold**`, `*italic*`, `[link](https://…)`), image,
button, store badges, icons (logo and mode icons), callout, quote with source,
list, references, sign-off, divider, spacer. Personalise with `{{first_name}}`,
`{{first_name|fallback}}`, `{{email}}`, and `{{station}}` (direct sends only).

Drafts save themselves. Sent emails are read-only records; Duplicate to reuse.

## Password re-check (step-up)

Every action that changes something asks for the admin password again:

| Action | Where enforced |
|---|---|
| Send a push | `app/api/admin/notifications/route.ts` |
| Save feature flags, notification policy; refresh push; import activity (any non-GET through `/api/admin/x/*`) | `app/api/admin/x/[...path]/route.ts` |
| Send an email, send a test, delete a draft | `app/api/admin/email/[...path]/route.ts` (`NEEDS_STEP_UP`) |

The browser sends the password in `X-Admin-Confirm` for that one request
(`components/StepUp.tsx`, `useConfirmedFetch`); the server checks it in
`lib/stepUp.ts` against `ADMIN_PASSWORD` (constant time), never forwards or
stores it. Five wrong tries in 10 minutes lock step-up for 10 minutes (the
session can still read). Reading, saving email drafts and uploading images
don't ask. A new state-changing route MUST call `requireStepUp(req)` and its
client MUST use `useConfirmedFetch`.
