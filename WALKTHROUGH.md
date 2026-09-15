# Implementation walkthrough

All commands below run from the project root, `mnchat/`, unless a terminal is explicitly kept open. The supplied archive contains the completed stages so each command runs against a coherent application.

## Scaffold first

The root npm workspace contains `server/`, `client/`, `scripts/`, and `docs/`. The server contains `prisma/`, `src/`, `tests/`, and `uploads/`. Server code is separated into routes, middleware, shared services, moderation workers, and scheduled jobs. The client contains component-based React source and public assets.

```bash
npm ci
npm run setup
```

`package-lock.json` pins the resolved dependency tree. Prisma is deliberately pinned to 6.19.0 to use its established schema/client API. The root overrides select patched `deepmerge-ts` and `effect` releases for Prisma's configuration dependencies; schema generation and the app build are verified with them.

## 1. Database schema and models

`server/prisma/schema.prisma` defines eight PostgreSQL models:

| Model | Stored information and purpose |
| --- | --- |
| `User` | Unique username/email, bcrypt password hash, optional profile-image reference, creation time. |
| `Session` | User relation, JWT session identifier, creation time and expiry; enables persistent login and immediate logout revocation. |
| `Friendship` | Canonical pair of users, request sender, pending/accepted state and creation time. SQL checks prevent self-pairs and invalid requester IDs. |
| `Conversation` | One unique conversation per accepted friendship, with creation/activity timestamps. |
| `Message` | Sender, conversation, text, optional media, creation/read timestamps, moderation version and retry identifier. |
| `Media` | Upload owner, random disk filename, verified media category, MIME type, size and upload time. |
| `Post` | Author, text, creation time and moderation version. |
| `Comment` | Post, author, text, creation time and moderation version. |

`FriendshipStatus` and `MediaKind` are enums, not tables. Compound uniqueness prevents duplicate friendships and duplicate retried messages. Retention and conversation-history indexes support targeted cleanup and pagination. All timestamps use PostgreSQL `timestamptz`.

```bash
docker compose up -d --wait db
npm run db:generate
npm run db:deploy
# Optional database inspection:
npm run db:studio
```

The SQL migration is checked in, so a new installation does not need to generate its own migration. Use `npm run db:migrate` only when developing a future schema change.

## 2. Authentication

Signup validates and normalizes identifiers, hashes the password asynchronously with bcrypt cost 12, and creates the account/session in a database transaction. Login compares against a bcrypt hash, including a dummy comparison for unknown emails. A signed JWT references the persisted session. Reloading calls `/api/auth/me` using the cookie. Logout deletes the session row and disconnects its sockets.

Profile pictures are optional during signup: after authentication succeeds, the browser uploads the image and links the returned media ID to the account. If that upload fails, the UI states that the account was created and lets the user retry the picture from the header.

```bash
# Terminal 1:
npm run dev:server
# Terminal 2:
npm run dev:client
```

Open [the local app](http://localhost:5173), create an account and reload. Password hashes remain server-only; user-search and feed responses expose only public profile fields.

## 3. Real-time chat with image/audio uploads

Express and Socket.io share a Node HTTP server, following the [Socket.io server initialization pattern](https://socket.io/docs/v4/server-initialization/). Each socket joins private user/session rooms after authentication. Every write rechecks the session and conversation membership. Messages are committed before broadcasting to the two participants.

Client-generated UUIDs let a sender safely retry after a lost acknowledgment. REST and socket message submission use the same service. Image/audio uploads return protected media IDs; the sender must own a file before attaching it. Image signatures are checked and decoded/re-encoded through Sharp; audio files are checked for supported container signatures. Audio is delivered with HTTP range support.

The React recorder requests microphone access on a click, chooses a supported MediaRecorder format, stops at 60 seconds, releases microphone tracks, and presents playback before upload/send. An IntersectionObserver and page-visibility check trigger receipts for incoming messages visible in the selected chat. Server rules prevent a sender from marking their own message read.

```bash
# Keep the API and client terminals running from step 2.
# Optional single command for the whole finished app:
npm run dev
```

Use two browser profiles, send/accept a friend request, then send text, a picture and a voice note. Do not run `npm run dev` while the individually started API/client already occupy the same ports.

## 4. Feed and comments

All authenticated users share the school feed. Posts are paginated, as are comments and chat history. A post has a reply box, reply count, author, and timestamp. `feed:updated` events refresh the feed after successful writes; reconnects and a periodic refresh recover missed events.

```bash
# If the app is not already running:
npm run dev
```

Open **School feed**, publish a study question, and reply from the other account. Text is rendered as React text content, never inserted as untrusted HTML.

## 5. Explicit-language moderation

`moderation/words.json` is the editable English/Thai policy list. Normalization handles Unicode compatibility forms, invisible formatting characters, selected leetspeak and separated English letters. Thai segmentation helps avoid a short-term false positive in ordinary school vocabulary.

A dedicated Node worker thread performs the pre-save check. The request awaits its answer but does not run the filtering work on the request event loop. A bounded queue and timeout reject writes if checks are unavailable. This is necessary: a scheduled scan by itself cannot block content before initial storage or delivery.

The independent scheduled audit is the second layer. After a policy update, it finds rows whose moderation version is older, masks any newly disallowed text, and marks each checked row with the new version. Each pass checks up to 250 rows per content table. A PostgreSQL advisory lock avoids simultaneous audits by multiple job processes.

```bash
npm test
# After editing words.json AND incrementing FILTER_VERSION in filter.js:
# Restart the API and jobs processes to load the new policy.
npm run jobs:once
```

Only typed text is filtered. Visual or spoken explicit content requires additional classification/transcription services, which are not part of this implementation.

## 6. Independent auto-delete job

The job runner is a separate process and is never started inside the Express entrypoint. It runs immediately at startup, then schedules cleanup every 10 minutes and moderation audits every 5 minutes, in UTC. Each scheduled task uses node-cron's [noOverlap option](https://nodecron.com/scheduling-options) to avoid overlapping itself.

Cleanup removes only messages with `readAt IS NULL` and `createdAt <= now - 48 hours`. Batches are limited to 500 rows, at most 20 batches per pass, with row locking and `SKIP LOCKED`. The final deletion condition preserves messages read concurrently. Expired sessions are also cleaned up.

Unreferenced media older than 24 hours is garbage-collected from the database and disk. Attachment/profile changes lock the media row to coordinate with cleanup. Files left by a crash between disk and metadata writes are recovered on a subsequent pass.

```bash
# Separate terminal, independent of Express:
npm run jobs
# Or a finite verification/manual run:
npm run jobs:once
```

Stopping Express does not stop an independently supervised jobs process. Stopping `npm run dev` stops all its children; Docker provides the independent restart policies for ongoing service operation.

## 7. Frontend and generated cover

The interface uses a cool white working surface, blue message bubbles and controls, pink accents, rounded profiles/cards, and the generated pink-blue cover. Desktop has a persistent conversation sidebar; mobile has bottom navigation and a separate conversation-list view.

The cover is used on both the login screen and the feed. CSS `object-fit: cover` adapts the same artwork to each placement. Image preview, recording preview, loading, reconnecting, empty, validation-error and send-progress states are included.

```bash
npm run build
# For local serving of the built app, set CLIENT_ORIGIN in .env to:
# http://localhost:3001
npm start
# In a separate terminal:
npm run jobs
```

Open [the built app locally](http://localhost:3001). For normal development, retain `CLIENT_ORIGIN=http://localhost:5173` and use `npm run dev` instead.

## Every authored file and why it exists

| File | Responsibility |
| --- | --- |
| `package.json` | Root npm workspace, Prisma CLI, orchestration scripts and patched dependency overrides. |
| `package-lock.json` | Exact dependency versions for reproducible `npm ci` installs. |
| `.env.example` | Documents required configuration with safe placeholders. |
| `.gitignore` | Excludes secrets, installed dependencies, generated builds and private uploads. |
| `.dockerignore` | Excludes local secrets/data/dependencies from the Docker build context. |
| `Dockerfile` | Builds the client and Prisma Client and runs Node as a non-root user. |
| `docker-compose.yml` | Starts PostgreSQL, a one-time migration, API and independent jobs, with persistent volumes. |
| `README.md` | Project overview, quick start, command reference and operating scope. |
| `scripts/setup.mjs` | Writes a fresh `.env` with cryptographically random local credentials without overwriting an existing one. |
| `scripts/prisma.mjs` | Loads the root environment and runs Prisma consistently from the server workspace. |
| `scripts/test-integration.mjs` | Loads configuration, selects an isolated `_test` database and runs the integration suite portably. |
| `server/package.json` | Server dependency manifest and server/database/job/test commands. |
| `server/prisma/schema.prisma` | Database entities, enums, relationships, uniqueness and indexes. |
| `server/prisma/migrations/migration_lock.toml` | Records the PostgreSQL migration provider. |
| `server/prisma/migrations/20260908000000_init/migration.sql` | Reproducible initial SQL tables, indexes, foreign keys and friendship checks. |
| `server/src/config.js` | Root `.env` loading, startup validation, production HTTPS checks and upload path resolution. |
| `server/src/db.js` | Shared Prisma Client and safe public-profile field selection. |
| `server/src/errors.js` | Structured request errors and safe HTTP error responses. |
| `server/src/app.js` | Express assembly: headers, CORS, origin guard, JSON limits, routes and built-client serving. |
| `server/src/index.js` | HTTP/Socket.io startup, database connection, upload-directory setup and graceful shutdown. |
| `server/src/socket.js` | Authorized real-time connections, session rooms, event throttling, expiry and acknowledgments. |
| `server/src/middleware/auth.js` | Restores authenticated HTTP users from persisted sessions. |
| `server/src/middleware/security.js` | Origin protection and API/authentication/write/upload rate limits. |
| `server/src/middleware/moderation.js` | Validates post/comment payloads and awaits moderation before route writes. |
| `server/src/services/auth.js` | JWT signing/verification, secure-cookie handling and session creation/lookup. |
| `server/src/services/chat.js` | Shared conversation authorization, idempotent sends, attachment ownership and read receipts. |
| `server/src/routes/auth.js` | Signup/login/logout/me and profile-picture update endpoints. |
| `server/src/routes/friends.js` | Username search, request creation, recipient-only acceptance and pending-request cancellation. |
| `server/src/routes/chat.js` | Conversation summaries, unread counts, message pagination and HTTP send/read endpoints. |
| `server/src/routes/media.js` | Limited uploads, byte validation, image conversion, metadata persistence and authorized downloads. |
| `server/src/routes/feed.js` | Paginated school posts/comments and moderated creation endpoints. |
| `server/src/moderation/words.json` | English/Thai profanity and explicit-language list. |
| `server/src/moderation/filter.js` | Deterministic normalization, matching and policy-version constant. |
| `server/src/moderation/worker.js` | Runs text checks in a dedicated worker thread. |
| `server/src/moderation/client.js` | Async worker request/reply handling, bounded queue, timeout and fail-closed errors. |
| `server/src/jobs/cleanup.js` | Indexed unread-message cleanup, expired-session cleanup and orphan-media recovery. |
| `server/src/jobs/moderation-audit.js` | Versioned, bounded background rechecks of stored text. |
| `server/src/jobs/runner.js` | Independent node-cron process, startup checks, finite-run mode and shutdown handling. |
| `server/tests/moderation.test.js` | Word-list edge cases and worker rejection/recovery tests. |
| `server/tests/integration.test.js` | HTTP, Socket.io, bcrypt, authorization, media, persistence, moderation and retention checks. |
| `server/uploads/.gitkeep` | Retains the empty upload folder without shipping user media. |
| `client/package.json` | React/Vite/Socket.io client dependencies and frontend scripts. |
| `client/index.html` | Browser entry page, page title, description and favicon link. |
| `client/vite.config.js` | React build integration and same-origin API/WebSocket development proxy. |
| `client/public/favicon.svg` | Small MNChat chat-bubble browser icon. |
| `client/public/mnchat-cover.png` | Original generated pink-blue chat-bubble artwork used inside the app. |
| `client/src/main.jsx` | Mounts React and imports the global stylesheet. |
| `client/src/api.js` | Cookie-based HTTP requests, uploads, socket acknowledgments and date formatting. |
| `client/src/App.jsx` | Session restoration, live connection lifecycle, navigation, profile editing and shared lists. |
| `client/src/styles.css` | Pink-blue visual system, desktop/mobile layouts, focus styles and reduced-motion support. |
| `client/src/components/Shared.jsx` | Reused brand, avatars, empty states and accessible error messages. |
| `client/src/components/AuthScreen.jsx` | Signup/login forms, password visibility and profile-image preview. |
| `client/src/components/Sidebar.jsx` | Conversation search/list, last-message previews and unread badges. |
| `client/src/components/ChatPanel.jsx` | Message history, visible-message receipts, text/media composer, previews and safe retries. |
| `client/src/components/VoiceRecorder.jsx` | Permission-aware recording, duration cap, preview handoff and microphone cleanup. |
| `client/src/components/Friends.jsx` | Student search and friend-request/accept/message interface. |
| `client/src/components/Feed.jsx` | School cover, post composer, paginated feed, comments and friend shortcuts. |
| `docs/WALKTHROUGH.md` | This ordered implementation and file guide. |
| `docs/API.md` | HTTP routes, socket events, payloads and errors. |
| `docs/DEPLOYMENT.md` | Deployment topology, configuration and backup instructions. |
| `docs/VERIFICATION.md` | Completed checks and clearly separated unperformed checks. |

Runtime-created `.env`, `node_modules/`, `client/dist/` and uploaded media are deliberately absent from the source archive. Create them using the commands above.
