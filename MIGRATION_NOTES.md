# Migration notes — 2026-09-15

## Username login update — 2026-09-30

- Removed the email field from signup/login and replaced the 10-character requirement with a 6-character signup minimum. Login accepts existing passwords without a new length restriction.
- Added the `mnchat-auth` Supabase Edge Function and service-only atomic rate limiting. New accounts need no email confirmation; existing account IDs and content remain unchanged.
- Installed the rate-limit migration and deployed the Edge Function to the existing Supabase project. The function uses Supabase's server-side built-in secrets; no service-role key is shipped with the website.
- Isolated tests: 8 passed. Production build passed.
- Live API checks passed for username signup, six-character passwords, case-insensitive login, wrong-password rejection, duplicate signup rejection, friendship acceptance, profile upload/persistence, image access and read receipts.
- Realtime test with a filtered subscription timed out. Repeating with the unfiltered subscription used by the app and an explicit session token passed: a second account received the image message in 278 ms. This is an API/transport test, not a guarantee of all network latency or a full browser interaction test.
- Four clearly named QA accounts were created (`qa_munq2wou_a/b` and `qa_munq4oqm_a/b`); no existing records were deleted.
- Vercel production deployment completed: `dpl_47RL1h51nwJBANezGpqQd2FyMbbk`, aliased to https://my-web-my-web.vercel.app. The live signup/login form was checked in the browser and has no email field.
- GitHub changes are submitted from the writable `beepbeep6767/my-web-my-web` fork to `22234-hue/my-web-my-web`; the connected account cannot write or merge into the upstream main branch directly.

## Source

Repository: 22234-hue/my-web-my-web. Original root files are preserved; no original project or database was deleted.

## Changes

- Restored src/components and public asset paths so the Vite entrypoint resolves.
- Added Supabase Auth/profile adapter, private media upload and signed media component.
- Replaced Socket.io connection with Supabase Postgres Changes, including subscription cleanup and reconnect refresh.
- Added PostgreSQL RPCs for accepted-friend messaging, stable retry IDs and recipient-only read receipts.
- Enabled RLS and least-privilege column grants; client users cannot directly change message ownership or friendship status.
- Added initial migration and rollback-only SQL verification.
- Preserved the bundled pink/blue MNChat cover.
- Added Vercel build settings and environment examples. The project is React/Vite, not Next.js.

## Verification

- Production build passed locally with the configured Supabase URL and publishable key.
- Database SQL test passed: friend request/accept, send, duplicate retry, read receipt, outsider isolation.
- Full two-account browser delivery and profile upload verification still requires confirmed email accounts.

## Compatibility changes

Existing Express users/data are not migrated to Supabase. New users register using email confirmation. The original cookie auth, moderation worker, image conversion and 48-hour cleanup are not active in this Supabase deployment. Original code and historical docs remain available for a future migration if needed.

## Verification update — 2026-09-17

- Built client opens its sign-in page successfully in the browser.
- Live Supabase Auth settings endpoint returns HTTP 200; email authentication and confirmation are enabled.
- Anonymous access to profiles returns HTTP 401, as intended.
- GitHub publication is blocked: the connected account is beepbeep6767, while the target repository is 22234-hue/my-web-my-web. GitHub returned 403 for writing the tree; local Git has no authenticated credentials.
- Vercel deployment completed by directly uploading the locally built static client. The dashboard reports Ready / Production; https://my-web-my-web.vercel.app opens the MNChat sign-in page. Deployment ID: dpl_8TwF24WfRPEcjwAnAY7civTU8dcp.
- Supabase Site URL and the exact allowed redirect URL are now https://my-web-my-web.vercel.app; email confirmation remains enabled.
- Public Supabase configuration is embedded in this build. Future source builds must set the two VITE environment variables; GitHub synchronization is still blocked by repository write permissions.
- Two-confirmed-account realtime delivery and profile-upload browser tests remain unverified. SQL verification does not establish end-to-end browser delivery.


## Feed retention — 1 October 2026

โพสต์ในหน้า School feed มีอายุ 2 ชั่วโมงนับจากเวลาสร้าง จากนั้นซ่อนและลบพร้อมความคิดเห็นใต้โพสต์ ไม่กระทบข้อความส่วนตัว เพื่อน บัญชี หรือรูปโปรไฟล์

### เปิดใช้งานบน Supabase
1. ใช้ฐานข้อมูล MNChat เดิมที่ติดตั้ง migrations ก่อนหน้าแล้ว
2. เปิด Supabase SQL Editor ด้วยสิทธิ์ postgres และรันไฟล์ `supabase/migrations/202610010001_feed_retention.sql` ทั้งไฟล์
3. การติดตั้งจะทำให้โพสต์เดิมที่เกิน 2 ชั่วโมงเข้าเงื่อนไขลบด้วย งานชื่อ `mnchat-feed-retention` ตรวจทุกนาทีและลบได้สูงสุด 5,000 โพสต์ต่อรอบ เพื่อให้แต่ละโพสต์มีอายุ 2 ชั่วโมง ไม่ใช่ล้างโพสต์ใหม่ทั้งหมดตามเวลารอบเดียวกัน
4. ตรวจ Cron ใน Dashboard ว่างาน active และการรันสำเร็จ ใช้ `select * from cron.job where jobname = 'mnchat-feed-retention';` และดู `cron.job_run_details`
5. รัน `npm ci` และ `npm run build` จากนั้น deploy เว็บเวอร์ชันนี้ไป Vercel

RLS ซ่อนโพสต์หมดอายุและปิดการเพิ่มความคิดเห็นหลังหมดอายุโดยใช้เวลาฐานข้อมูล หน้าจอที่เปิดค้างตรวจทุกวินาทีและเมื่อกลับมาเปิดแท็บ (เวลาหน้าจอขึ้นกับนาฬิกาอุปกรณ์) งานลบยังทำงานแม้ไม่มีผู้ใช้เปิดเว็บ หาก Supabase ถูกพัก งานจะไม่ทำงานจนกว่าจะกลับมาออนไลน์

สถานะของ ZIP นี้: ยังไม่ได้ติดตั้ง migration ลบโพสต์บนฐานข้อมูลจริง และยังไม่ได้ deploy การเปลี่ยนแปลงนี้ การทดสอบอัตโนมัติครอบคลุมขอบเขตอายุโพสต์และข้อมูลค้างหน้าจอ; SQL ต้องตรวจการรัน Cron หลังติดตั้งจริง

หากต้องการหยุดการลบในอนาคต: `select cron.unschedule('mnchat-feed-retention');` (ไม่กู้คืนข้อมูลที่ถูกลบ และ RLS ยังซ่อนโพสต์หมดอายุ)

อ้างอิงการตั้งงาน: https://supabase.com/docs/guides/cron


## Production verification — 2026-10-01

- Latest export deployed to https://my-web-my-web.vercel.app; Vercel READY deployment dpl_xLzPxbpPy91YDpJMTPtG79YkTfUE.
- Supabase Auth health HTTP 200; five tables published to Realtime.
- With explicit user confirmation, installed 202610010001_feed_retention.sql. Cron active, latest run succeeded; one expired post removed, zero expired posts left. Private messages remained at two.
- Live write smoke tests were not rerun because automatic approval rejected adding production QA data. Read-only checks passed.
- Production status supersedes the earlier export-only installation status above.
## 2026-10-09 — Honors integrated into original MNChat

Based on the original MNChat production design, with no OCHAT rebrand or separate admin website. Added `src/components/Honors.jsx`, `src/honors.js`, `src/honors.css` and a coalesced realtime refresh helper. The existing App contains both new views.

Apply only `supabase/migrations/202610090002_honors.sql` to an existing MNChat database after checking that its honor tables do not already exist. It is additive and transactional: no existing records are deleted, no existing authentication rules are changed, and feed/chat migrations are not rerun. Do not apply the school-access migration from another branch.

Deploy `mnchat-honor-unlock` and configure `MNCHAT_HONOR_REVIEW_CODE` as a Supabase server secret. Review access is bound to a validated Auth user and login session; only the server can issue grants. Browser roles cannot write score tables directly. Existing username authentication supplies the shared request limiter. The code is never included in frontend environment variables or this export.

Updated transitive `source-map-js` to 1.2.2 following the dependency audit.

Local validation: production Vite build, existing username-auth tests, review-code tests and an isolated PostgreSQL-compatible test cover permissions, proof ownership, duplicate submission/approval, score accumulation, top 50/ties and expiring session-bound grants. Local tests do not establish live Supabase deployment or production behavior.
