# MNChat honors deployment

Target: existing Vercel **my-web-my-web** project and its MNChat Supabase project. No second website is required.

## Install

1. On an existing MNChat project, verify the initial schema, username-auth migration and feed-retention migration are already installed. Apply only `202610090002_honors.sql` once, through Supabase SQL Editor or your migration process. It must not be reapplied if the honor tables already exist.
2. Configure the private Supabase Edge Function secret `MNCHAT_HONOR_REVIEW_CODE` in the dashboard. Enter the chosen code directly there. Never use a Gmail password, put it in this repository, or prefix it with VITE.
3. Deploy `supabase functions deploy mnchat-honor-unlock --project-ref YOUR_PROJECT_REF`. The included config disables gateway JWT verification; the handler explicitly validates the bearer token with Supabase Auth before accepting its user ID and session ID. Default server secrets provide URL, anon key and service-role key.
4. Build and stage the frontend in the existing Vercel project. Frontend environment variables remain `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Verify the live flow using designated test accounts: submit a photo, confirm a different ordinary member cannot read it, unlock approval with the code, approve once, retry, and observe exactly 1P in another browser. Check locking, expiry and a new login session. Then release the staged frontend.

The code grants review access only to a signed-in MNChat member. No specific username is hardcoded. A reviewer can view submitted proof images and award points, but this grants no account-directory or credential access.

## Local checks

```sh
npm ci
node --test supabase/username-auth.test.mjs supabase/honor-unlock.test.mjs
npm install --prefix .preview/sql-qa --no-save @electric-sql/pglite@0.3.14
node supabase/honors-database.test.mjs
npm run build
```

SQL tests use only an in-memory database. The .preview folder is ignored and excluded from deployment.

## Behavior

- Review-code attempts: 5 per authenticated user and 20 per hashed IP bucket per 15 minutes. The endpoint fails closed when its configuration or limiter is unavailable.
- Review grants expire after 15 minutes and are scoped to the login session. Locking immediately denies new queries/approvals. Already issued media URLs can remain valid for their remaining 10-minute lifetime.
- A repeated request ID returns the same submission; repeated approval cannot add points. Uploads use distinct paths and remain private unless the owner separately shares that same image through an existing profile/chat feature.
- A submission is limited to one uploaded image. The system does not identify visually identical photos uploaded separately; reviewers assess duplicate activities.
- Scores accumulate until a future, explicitly authorized season/reset feature is added. The feed cleanup job does not delete honor data.
- This release retains the original MNChat account system; it does not deploy school-email OTP changes from the unrelated rebranding branch.
