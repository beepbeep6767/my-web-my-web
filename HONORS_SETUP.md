# Mnchat Honors

## Member flow

Verified members have two navigation entries: **เกียรติยศ** (top 50) and **ส่งผลงาน**. Submission includes a JPG/PNG/WEBP/GIF up to 12 MB and a 3–2000-character description of helping a friend. Members can see their own submissions. The submission page has **ส่งรูปผลงาน** and **อนุมัติผลงาน** tabs.

The approval tab asks for a shared administrator code. Supabase Edge Function `mnchat-honor-unlock` validates the signed-in user, school verification and the code on the server. It grants review access for 15 minutes to that specific login session. Five attempts per user and twenty per IP are allowed per 15-minute window. The code is held only in an Edge Function secret, never in Vite variables, source, localStorage, documentation or administrator member data. No specific username is assigned the reviewer role.

Review access permits viewing submitted evidence and approving it; it does not grant the separate admin member-directory role. The reviewer can lock the approval section early. Previously issued image URLs can remain valid for their ten-minute lifetime.

## Scores

- Clicking ✓ approves a submission and awards exactly 1P to its author in a single database transaction.
- Repeated or concurrent approval calls cannot award that submission twice. Browser writes to score/approval tables are denied.
- Network retries retain the uploaded path and request ID. Re-uploading the same photo as a new object is still a separate submission; reviewers must check for duplicate or misleading evidence.
- Scores are cumulative. There are no competition rounds or automatic final prize awards in this release. Highest score is the current leader; tied scores share rank. Tied entries are ordered by time they reached their score, then account ID, with at most 50 entries shown.
- A separate Realtime score table updates rankings without broadcasting private pictures. Visible pages also refresh every 15 seconds. Pagination pauses automatic list refresh until manually refreshed.
- Submissions and scores are separate from two-hour feed retention. Nothing in this migration deletes existing content.

## Deployment prerequisites

1. Finish the verified-school-email rollout in `SCHOOL_ACCESS_SETUP.md`. Production SMTP delivery and the new school migration are still pending verification; do not promote the new frontend early.
2. Apply `supabase/migrations/202610090002_honors.sql` after all earlier migrations, including the username rate limiter and school access migration. It creates scoped review grants, submissions, scores, RLS, protected functions and Realtime publication entries.
3. In the existing Supabase project `wahiwgzvhwlahfevcimh`, add **MNCHAT_HONOR_REVIEW_CODE** under **Edge Functions → Secrets**, using the code chosen by the owner. Do not use `VITE_` or put this value in GitHub. The real code has not been committed or embedded in this package.
4. Deploy `mnchat-honor-unlock` with `supabase functions deploy mnchat-honor-unlock --project-ref wahiwgzvhwlahfevcimh`. `supabase/config.toml` disables gateway JWT checking only because this function explicitly validates the bearer token through Auth `/user` before granting anything.
5. Verify with owner-controlled accounts: upload → restricted evidence → wrong code denied → correct code → approve → 1P → repeated approval remains 1P → second member sees updated ranking → expired/locked session cannot review. Do not create test content in production without owner authorization.
6. Deploy to the existing Vercel **my-web-my-web** project, ID `prj_idKk48IzWgg2JG4ZdVynq7qB7f68`. Promote only after backend setup and the real flow pass.

Rotate the code by updating the secret. To immediately revoke outstanding grants, an authorized database operator can expire `honor_review_access` rows; changing the secret alone affects future unlocks, while existing grants last at most 15 minutes.

## Validation performed

- Production build and 24 JavaScript tests passed, including server code checks, authentication, email OTP and existing messaging/feed checks.
- `node supabase/honors-database.test.mjs`: isolated PostgreSQL checks ownership, image privacy, unverified access, direct-write denial, idempotent awards, top 50/ties, session binding and expiration/locking. It does not test concurrent cloud connections.
- Browser fixture checked approval updating the leaderboard to 1P. The revised code gate has separate server tests. Fixtures are excluded from GitHub, deployments and ZIP exports.
- Live Supabase migration, secret setup, cloud Realtime, real image delivery and live code validation remain unverified.

No passwords, shared codes or SMTP credentials belong in this file.
