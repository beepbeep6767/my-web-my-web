# MNChat

A full-stack school messaging app built with React, Express, PostgreSQL, Prisma, Socket.io, bcrypt, JWT, and node-cron.

MNChat includes account registration with an optional profile picture, persistent login, friend requests, one-to-one text/image/voice messaging, read receipts, a school feed with comments, English/Thai text moderation, and an independent cleanup worker. The pink-blue cover is original AI-generated artwork included in the project; running the app does not need an image-generation API key.

## Run locally

Prerequisites: Node.js 22 or newer, npm, and Docker Desktop with Docker Compose v2. A separately installed PostgreSQL server also works; point `DATABASE_URL` at it instead of starting the Docker database.

From the extracted `mnchat` folder:

```bash
npm ci
npm run setup
docker compose up -d --wait db
npm run db:generate
npm run db:deploy
npm run dev
```

Open [MNChat locally](http://localhost:5173). `npm run dev` starts three separate processes: Express on port 3001, Vite on port 5173, and the scheduled jobs worker. Vite proxies `/api` and `/socket.io` so the browser uses one origin.

`npm run setup` creates a root `.env` with fresh random credentials. It does not overwrite an existing `.env`. Never commit this file. Keep `CLIENT_ORIGIN=http://localhost:5173` for the development setup, including its exact hostname and no trailing slash.

To stop development, press Ctrl+C. `docker compose stop db` stops PostgreSQL while keeping its named data volume.

## Run everything in Docker

This is a local HTTP configuration. It serves the built React app through Express.

```bash
node scripts/setup.mjs
docker compose up --build -d
```

Open [the Docker app](http://localhost:3001). The `migrate` service waits for PostgreSQL, applies the checked-in migration, and exits. The API and jobs services then start independently. All services use the same database, and API/jobs share the uploads volume.

```bash
docker compose logs -f api jobs
docker compose down
```

`docker compose down` preserves data. Adding `-v` deletes the database and upload volumes; do that only when intentionally resetting your local data.

## Try the main flow

1. Create an account, optionally selecting a profile picture.
2. Open a second browser profile or private window and create another account. Ordinary tabs share one login cookie.
3. Find the second username under **Friends**, send a request, and accept it from the second account.
4. Open **Messages** and send text, an image, or a recorded voice note. You can preview attachments before sending.
5. Observe the outgoing read receipt when the recipient opens the conversation and the message enters the visible chat area.
6. Post a question in **School feed**, then reply from the other account.
7. Reload the page or restart Express: the account, session, friends, posts, and messages remain in PostgreSQL.

Microphone recording works on localhost or HTTPS with permission in a browser supporting MediaRecorder. Recording stops at 60 seconds; attaching an existing audio file is also supported. Uploads are limited to 12 MB and images are converted to WebP, resized, and stripped of metadata. Animated images use their first frame.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Create local environment configuration with random credentials. |
| `npm run db:generate` | Generate Prisma Client from the schema. |
| `npm run db:deploy` | Apply checked-in SQL migrations. |
| `npm run db:migrate` | Create a migration during schema development; requires a dev database/shadow DB permissions. |
| `npm run db:studio` | Open Prisma Studio locally. |
| `npm run dev` | Run API, React dev server, and jobs as separate processes. |
| `npm run dev:server` | Run only Express/Socket.io with file watching. |
| `npm run dev:client` | Run only the React dev server. |
| `npm run jobs` | Start the independent node-cron worker. |
| `npm run jobs:once` | Run cleanup and moderation audit once, then exit. |
| `npm run build` | Generate Prisma Client and build the React production assets. |
| `npm start` | Run Express, serving `client/dist` if it exists. |
| `npm test` | Run the moderation and worker-thread tests. |
| `npm run test:integration` | Run the integration suite against a separate `_test` database. |

For `npm start` with the built frontend on port 3001, set `CLIENT_ORIGIN=http://localhost:3001` in `.env`. The default origin 5173 is for Vite development. Keep `npm run jobs` running in another terminal.

## What is enforced

- Passwords use bcrypt with cost 12; password inputs require at least 10 characters and at most 72 UTF-8 bytes.
- JWTs stay in HttpOnly, SameSite=Strict cookies. Production cookies are Secure and use a `__Host-` name. No token is stored in localStorage.
- Every authenticated HTTP request and Socket.io event checks a persisted, unexpired session. Logout revokes that session and disconnects its sockets.
- Mutating HTTP requests and Socket.io handshakes require the configured Origin. Rate limits apply to authentication, HTTP writes, uploads, and socket events.
- Friend requests must be accepted by the recipient before direct messaging. Conversation access and attachment ownership are checked on the server.
- Uploaded message files are served through authorized routes. Own uploads are private until shared; profile pictures are visible to signed-in users. `/uploads` is not a public static directory.
- Typed message, post, and comment text passes the same worker-thread filter before database storage or broadcast. If checking fails, the write is rejected.
- Unread messages become eligible for deletion at exactly 48 hours. The default cleanup schedule runs every 10 minutes and on worker startup; read messages are retained. API results omit expired unread messages immediately, and the open UI refreshes every 30 seconds.

## Scope and operating limits

The filter is an editable English/Thai word list with basic normalization. It can miss euphemisms and novel obfuscations or produce false positives. It does **not** classify images, listen to audio, or provide human moderation. School subjects with sensitive vocabulary need a thoughtfully maintained list.

This instance has one shared school feed for every registered account. Registration is open; it does not verify school membership or email ownership, and no password-reset email flow is included. Direct messages are access controlled but are not end-to-end encrypted.

Use one API instance with local disk storage. Multi-instance hosting needs shared object storage and a shared Socket.io adapter/rate-limit store. PostgreSQL is durable across app restarts; a persistent volume is not a backup. See the deployment guide for backup instructions.

The cron worker is a separate OS process. It must remain running under Docker's restart policy or another process supervisor. Work resumes with an immediate pass after a restart. A large cleanup backlog is processed in bounded batches over successive runs, so a stopped worker or a large backlog can delay physical deletion.

## Documentation

- [Step-by-step implementation and every file](docs/WALKTHROUGH.md)
- [HTTP and Socket.io API](docs/API.md)
- [Hosting, backups, and environment settings](docs/DEPLOYMENT.md)
- [Verification results and remaining checks](docs/VERIFICATION.md)
