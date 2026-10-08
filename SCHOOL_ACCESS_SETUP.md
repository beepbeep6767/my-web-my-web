# School email verification and administration

This release extends the existing MNChat backend and OCHAT interface. It preserves account IDs, usernames/passwords, friendships, messages, media and two-hour post retention.

## Mailbox rule

Accept 1–5 ASCII digits followed by `@mh.ac.th`, with numeric value 0–30000 inclusive. Leading zeroes are preserved because different spellings may identify different mailboxes. Examples: `0@mh.ac.th`, `01234@mh.ac.th`, `30000@mh.ac.th`. Gmail addresses, aliases, subdomains and larger numbers are rejected.

Users first enter their school address, then use the existing username/password login or signup. Signed-in users request a Supabase email-change confirmation link. Confirming the new mailbox preserves their existing account and password. The database checks the current confirmed email, never localStorage or user-editable metadata. A verified account can return without repeating email verification. A pending change does not change the confirmed address until the link succeeds.

## Required deployment order

Do not promote this frontend before the database and mail sender are ready: old sessions would otherwise be unable to finish onboarding.

1. Sign in to the existing Supabase project `wahiwgzvhwlahfevcimh`.
2. Configure and test a **custom SMTP sender**. The default Supabase sender is restricted and is not a production school-mail sender. Keep SMTP passwords in the Dashboard; never in Vite variables or source control.
3. Enable **Confirm email**. This is essential: otherwise direct Auth signup may automatically confirm an arbitrary school address.
4. Existing username accounts have internal `@mnchat.invalid` addresses without inboxes. To confirm only the real new school address, **Secure email change must be OFF**. This changes the email-change policy for the project; the owner must approve that setting. Real email ownership is still confirmed at the new mailbox. Do not disable email confirmation.
5. Set the Supabase Site URL to the live frontend and allow the exact redirect URLs for the frontend `/` and the separately deployed admin `/admin.html`. Add an exact staged deployment URL when testing there. Avoid broad wildcard redirects in production.
6. Apply `supabase/migrations/202610090001_school_access.sql` once, after the existing migrations, with an account allowed to manage SQL. It adds restrictive RLS, protected RPCs and inbox indexes. Existing accounts must verify before accessing community data.
7. Deploy the frontend using the existing Supabase URL and public key. Deploy the separate admin entry to another Vercel project using `vercel.admin.json` as its local config, with the same two public Supabase variables. Alternatively, `/admin.html` is available in the main build.
8. The owner grants exactly the chosen verified account admin access in SQL Editor: `insert into public.mnchat_admins(user_id) values ('REPLACE_WITH_VERIFIED_USER_UUID') on conflict do nothing;`. Never grant by a client-supplied flag. This release does not assign an administrator automatically.
9. Test with an owner-controlled school mailbox: send, receive, click, return, reload, sign out/in, and open a second browser. Test expired links, retries, duplicate addresses and rejection of unverified direct API access. Verify the admin URL using both an admin and a regular member before promoting.

## API and data

- `POST /auth/v1/user` is **not** used. The Supabase SDK sends its supported authenticated `PUT /auth/v1/user` email update with an allowlisted redirect.
- `POST /rest/v1/rpc/mnchat_school_status`: own profile, verified boolean and admin boolean.
- `POST /rest/v1/rpc/mnchat_admin_members`: 50 records per page, UUID cursor in `after_id`; only verified administrators may call it.
- Admin fields: username, confirmed school email, confirmation timestamp and last Auth sign-in timestamp. No passwords, tokens or message contents.
- The two websites read the same protected Supabase API. No browser webhook sends private account data to an unapproved external destination.
- Admin list is deliberately not broadcast over public realtime channels. Refresh retrieves current data.
- Source files and JavaScript remain downloadable as with any public SPA. Security is enforced in database policies and privileged RPCs. The community interface is lazy-loaded after verification.
- Existing signed media links remain valid until their original expiry. New media access requires verification.

## Load improvements and limits

`mnchat_inbox` replaces per-friend HTTP fan-out with one request. Partial unread indexes and friendship indexes support these queries. Realtime bursts coalesce sidebar/feed refreshes, preserving a trailing refresh if events arrive during a fetch. Background tabs skip scheduled refreshes; fallback timers have jitter. Incoming chat messages still render directly from realtime events.

These changes reduce redundant work; they do **not** establish a concurrent-user capacity. Realtime, email and database quotas still apply. Run a realistic load test on an isolated staging database before advertising a user count.

## Verification

`node --test supabase/school-access.test.mjs supabase/message-history.test.mjs supabase/username-auth.test.mjs supabase/feed-retention.test.mjs`

Database tests use a fresh in-memory PostgreSQL environment:

`npm install --prefix .preview/sql-qa --no-save --package-lock=false @electric-sql/pglite@0.3.14`

`node supabase/school-database.test.mjs`

The test simulates Supabase Auth/Storage schemas and checks real SQL/RLS/RPC behavior. It does not verify SMTP delivery, Supabase Auth configuration or cloud realtime behavior.

Official references: [email update](https://supabase.com/docs/reference/javascript/auth-updateuser), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
