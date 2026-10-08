## Mnchat admin and school OTP — 2026-10-09

The admin entry now uses Mnchat branding and a blue/pink interface. School verification uses a six-digit numeric OTP and unlocks membership automatically; administrator approval is not needed. The admin directory shows account IDs, usernames, confirmed emails and last login times with a 15-second first-page refresh. Gmail/app passwords and OTPs are never exposed to administrators. Custom SMTP, six-digit Auth configuration, the email template and the migration still need live setup and a real mailbox test before production rollout. See SCHOOL_ACCESS_SETUP.md.

# Migration notes — 2026-09-15

## School verification and administration — 2026-10-09

- Adds `202610090001_school_access.sql`: confirmed school email gating for community tables, private media and security-definer messaging/friendship functions.
- Adds protected school-status/admin APIs, cursor-paginated member reporting and a private administrator allowlist.
- Existing accounts retain their IDs, usernames, passwords and content. Account email is confirmed through Supabase's email-change link; internal placeholder addresses do not grant school access.
- Adds a separate admin website entry, new-email verification screen and remembered database-backed verification. Profile pictures are selected from the account menu after verification.
- Consolidates inbox queries, adds relevant indexes and coalesces background refreshes. This is an efficiency improvement, not a measured concurrent-user capacity claim.
- Deployment prerequisites and manual owner steps are in `SCHOOL_ACCESS_SETUP.md`. This migration has passed local PostgreSQL tests; it has not been installed on the live database in this update.
- Previous no-email/no-migration notes below are historical and do not apply to this release.

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

สถานะเมื่อส่งออกเวอร์ชันลบโพสต์ครั้งแรก: ยังไม่ได้ติดตั้ง migration หรือ deploy ในขณะนั้น ดูสถานะการติดตั้งจริงวันที่ 2026-10-01 และสถานะ OCHAT ล่าสุดด้านล่าง

หากต้องการหยุดการลบในอนาคต: `select cron.unschedule('mnchat-feed-retention');` (ไม่กู้คืนข้อมูลที่ถูกลบ และ RLS ยังซ่อนโพสต์หมดอายุ)

อ้างอิงการตั้งงาน: https://supabase.com/docs/guides/cron


## Production verification — 2026-10-01

- Latest export deployed to https://my-web-my-web.vercel.app; Vercel READY deployment dpl_xLzPxbpPy91YDpJMTPtG79YkTfUE.
- Supabase Auth health HTTP 200; five tables published to Realtime.
- With explicit user confirmation, installed 202610010001_feed_retention.sql. Cron active, latest run succeeded; one expired post removed, zero expired posts left. Private messages remained at two.
- Live write smoke tests were not rerun because automatic approval rejected adding production QA data. Read-only checks passed.
- Production status supersedes the earlier export-only installation status above.


## OCHAT visual redesign — 2026-10-06

The product is now OCHAT / Open conversations. A new geometric botanical SVG mark, forest/lime/cream palette, graphic entrance, dark navigation, community board, directory and conversation styling replace the previous design. Mobile layouts and keyboard focus states are included.

Authentication, Supabase project/configuration, account IDs, profiles, friendships, storage, realtime messages and two-hour feed retention keep their existing implementation. Database names, internal mnchat RPC/function identifiers and environment keys are retained for compatibility. No migration is required for this visual update. Original files and the earlier cover remain available as historical source; the active interface no longer uses that cover.

This release is an export only; production was not redeployed. Set the existing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before building. Never use the service-role key in Vite.

Redesign verification: production build passed and all 10 existing auth/retention tests passed. Browser checks covered login/signup plus the board, directory and inbox using isolated local fixtures. Desktop and 390px mobile screenshots were reviewed; no horizontal overflow or browser error overlay was detected. No live messages/accounts were created for this visual update.


## Final audit — 2026-10-06

Fixed message ordering when realtime arrivals overlap a history refresh, refreshed expanded comment threads when their count changes, corrected desktop chat height with the connection banner, and prevented Enter from sending while disconnected. No database migration is required.

Validation: production build passed; all 14 auth, retention and message-history tests passed. Local browser fixtures verified incoming expanded comments, disconnected Enter handling, and chat layouts at 320, 768 and 1440 pixels without horizontal overflow. These checks did not write to live Supabase or deploy production.
