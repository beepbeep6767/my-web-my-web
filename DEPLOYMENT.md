# Deployment and operations

## Runtime layout

Use a long-running Node service for Express/Socket.io, a separate supervised Node process for scheduled jobs, persistent PostgreSQL, and a persistent uploads directory shared by API and jobs. The included Docker Compose topology supplies all four for local use.

Serve the built React assets through Express under one HTTPS origin in production. Proxy both ordinary requests and `/socket.io` upgrades to the same API instance. The repository is a runnable Node application; it has not been deployed to a public service.

The local Compose file intentionally uses HTTP on loopback and `NODE_ENV=development`. For production, configure HTTPS in your reverse proxy, change `NODE_ENV=production`, set the exact HTTPS `CLIENT_ORIGIN`, preserve the random JWT secret, configure PostgreSQL credentials, and set `TRUST_PROXY` to your actual trusted proxy-hop count. Do not copy the local HTTP settings to a public host.

A Vercel adaptation would need an appropriate function entrypoint, external media storage, and a durable external scheduler or worker for these node-cron tasks. This archive is not a ready-made Vercel deployment. Vercel's current WebSocket behavior and connection-duration constraints are documented in its [WebSocket guide](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections); evaluate those constraints before adapting this long-running server.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`. Production enables Secure `__Host-` cookies and requires an HTTPS origin. |
| `PORT` | Express port; default 3001. |
| `CLIENT_ORIGIN` | Exact browser origin, without trailing slash; default `http://localhost:5173`. |
| `DATABASE_URL` | Prisma PostgreSQL URL. Use your managed provider's required TLS parameters for external hosting. |
| `POSTGRES_PASSWORD` | Local Compose database password. `setup` generates it and the matching DATABASE_URL together. |
| `JWT_SECRET` | At least 64 characters; `setup` generates a 48-byte random secret encoded as hex. Keep it stable across restarts. |
| `SESSION_DAYS` | Session duration from 1–30 days, default 7. Sessions are persistent but not sliding. |
| `UPLOAD_DIR` | Durable file directory, relative to project root or absolute; default `./server/uploads`. |
| `TRUST_PROXY` | Trusted proxy-hop count; 0 locally. Set it only for your known reverse-proxy topology. |
| `CLEANUP_CRON` | Cleanup schedule, default `*/10 * * * *`, in UTC. |
| `MODERATION_AUDIT_CRON` | Versioned content-audit schedule, default `*/5 * * * *`, in UTC. |
| `TEST_DATABASE_URL` | Optional separate integration-test database URL; selected by the root test runner only. |

Changing `POSTGRES_PASSWORD` after a PostgreSQL volume has been initialized does not rotate the password inside that existing database. Rotate the database user's password intentionally and update the URL together. `setup` avoids this mismatch by leaving existing configuration alone.

## Run a production build

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run build
npm start
```

Run `npm run jobs` as its own supervised process. Docker uses `restart: unless-stopped`. Equivalent systemd/container supervision can restart workers after crashes. Monitor worker logs for its JSON summaries and errors, and monitor `/api/health` for database connectivity. An API health check does not prove the independent jobs process is healthy; monitor both services.

Cleanup starts immediately on worker startup. The default schedule means a message becomes eligible at 48 hours, with physical deletion normally by the next 10-minute pass. The API stops listing expired unread messages at 48 hours. Worker outages or a backlog can delay physical deletion. Audit changes appear in clients when their data is refreshed.

## Persistence and backups

`postgres_data` stores PostgreSQL data; `uploads_data` stores file bytes. Database records and files must both be backed up. Avoid deleting volumes when restarting or upgrading the application.

Create a PostgreSQL backup from the local Compose database:

```bash
docker compose exec -T db pg_dump -U mnchat -d mnchat -Fc > mnchat-backup.dump
```

Store that dump securely outside the server. The database contains password hashes and private messages. Also back up the uploads volume to a location outside the host. For a consistent full snapshot, temporarily stop writes and the jobs process while capturing the database and uploads. A volume alone does not protect against host loss or accidental deletion.

Restore into a new database first and verify before changing the active connection:

```bash
docker compose exec db createdb -U mnchat mnchat_restore
docker compose exec -T db pg_restore -U mnchat -d mnchat_restore --no-owner < mnchat-backup.dump
```

Restore the matching uploads backup too. Test a recovery periodically. No automatic off-site backup service is configured by this project.

## Scaling and scope

The shipped architecture targets one API instance and one school/community instance. Friendship and history listing is capped at 500 connections per user; search is capped at 20. Message, feed and comment histories are paginated.

For multiple API replicas, replace local storage with a shared cloud bucket, introduce a shared Socket.io adapter and rate-limit store, and ensure session revocation disconnects sockets across replicas. Configure sticky sessions if retaining Socket.io HTTP polling. Keep PostgreSQL as the authoritative store. These changes are not silently simulated in this bundle.

Signup does not verify school enrollment or email ownership. Add your school's enrollment/invitation or identity policy before restricting access to a particular school. An editable word list is a baseline text filter; visual/audio classification and human reports/appeals are separate extensions.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Prisma cannot connect | Database is healthy; URL hostname/port/password match. Inside Compose use `db`, outside Compose use `localhost`. |
| Origin error or repeated socket connection errors | Open the exact `CLIENT_ORIGIN`, with the correct port. Do not mix localhost and 127.0.0.1 in browser URLs. |
| Build opens but login fails | For a built app served by Express on 3001, set `CLIENT_ORIGIN=http://localhost:3001`. For Vite use 5173. |
| Login does not persist in production | HTTPS is active, browser accepts cookies, and JWT_SECRET stays unchanged. Verify session rows are retained. |
| Message fails content checks | Edit the typed text. Policy files are under `server/src/moderation/`; restart after changing the list/version. |
| Microphone unavailable | Browser supports MediaRecorder, microphone permission is granted, and context is HTTPS or localhost. Attach an audio file as an alternative. |
| Unread rows remain past 48 hours | Confirm the jobs process is running and check its logs/backlog. `npm run jobs:once` performs an immediate pass. |
| Uploaded files disappear after redeployment | The uploads path must be on durable storage and shared with jobs. |
| Two tabs show the same account | Cookies are shared. Use separate browser profiles or a private session to test two students. |
