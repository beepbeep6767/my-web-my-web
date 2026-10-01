# MNChat — Vercel + Supabase

The deployable application lives in `src/`, with images in `public/`.
This repository was uploaded with its original folders flattened. The corrected client now uses Supabase Auth, PostgreSQL, private Storage, and Realtime instead of the original Express/Socket.io server.

## Run

Use Node 22 or newer. Copy `.env.example` to `.env.local`, set the project URL and publishable key, then run:

```sh
npm ci
npm run dev
npm run build
```

## Database

On a **new, empty** Supabase project, run `supabase/migrations/202609150001_mnchat.sql` once in the SQL Editor. It creates profiles, friendship requests, messages, posts, comments, private media storage, access policies and Realtime publication membership. Do not rerun this initial migration on an existing installation. The deployed MNChat database already has it applied.

Run `supabase/tests.sql` to verify request acceptance, duplicate-message protection, read receipts and outsider isolation. All fixtures are rolled back.

## Vercel

Live deployment (2026-09-30): https://my-web-my-web.vercel.app. This release was deployed from locally built static files using Vercel CLI. GitHub changes are proposed through a fork because the connected account lacks upstream write access. Supabase Site URL and redirect configuration point to this production domain.

Import this repository, choose Vite, root `./`, build `npm run build`, output `dist`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the Supabase publishable key works despite the historical variable name). Redeploy after changing build-time variables. Never put a service-role key or database password in VITE variables.

## Username authentication

The form now uses a username and password, without asking for an email address. New passwords need at least 6 characters, not 10, and at most 72 UTF-8 bytes. Existing accounts retain their IDs, passwords, friends, messages and media. Existing confirmed email accounts can sign in using their profile username. Previously unconfirmed accounts still require administrator support; this release does not bulk-confirm or alter existing accounts.

Apply `supabase/migrations/202609280001_username_auth.sql`, then deploy `supabase/functions/mnchat-auth/index.ts` as `mnchat-auth`. The function must accept unauthenticated login requests (`verify_jwt = false` in `supabase/config.toml`). It checks the supplied password through Supabase Auth and uses server-only admin access to resolve usernames. Built-in Edge Function secrets supply `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`; never copy the admin key to the client or Vercel VITE variables.

New users receive a random internal `@mnchat.invalid` routing address and are confirmed by the signup function. No mailbox or email verification is involved. Passwords remain hashed by Supabase Auth; this application does not store them. Username lookup is case-insensitive. Fixed 15-minute limits allow 5 signup attempts per IP/name, 60 login attempts per IP and 12 per username. Requests fail closed if the limiter is unavailable. Forgotten-password email recovery is not available for these new username-only accounts.

Run `node --test supabase/username-auth.test.mjs` for isolated tests. `supabase/live-smoke.mjs` is explicitly opt-in (`MNCHAT_RUN_LIVE=1`) and creates QA accounts, friendship and media data; it stores fixture credentials only in the OS temporary folder for reruns. Do not run it casually against production.

## Features and limits

- Authenticated users can find classmates and request friendship; only the recipient may accept.
- Accepted friends can send persistent text, image and audio messages, with read receipts.
- Message retries reuse a client identifier. Realtime delivers database changes; reconnect reloads persisted data and a 30-second reconciliation catches missed events.
- Profile pictures persist in private Storage. Authorized clients receive short-lived signed URLs; these refresh while the page remains open.
- Media is limited to 12 MB. This version does not perform the original Express image re-encoding or text-moderation worker.
- Messages are retained. No automatic deletion job is installed.
- Authentication uses the Supabase browser session. This differs from the old HttpOnly Express cookie system.
- School feed is visible to all signed-in accounts. School membership is not verified. Private messages are access-controlled, not end-to-end encrypted.

Original flattened files are preserved for reference and are not application entrypoints. Historical documentation is preserved in `docs/legacy/`; its Express/Docker instructions do not describe this deployment.


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
