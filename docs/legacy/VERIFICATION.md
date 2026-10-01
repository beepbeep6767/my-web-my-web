# Verification

Verification performed on 2026-09-08.

## Completed

| Check | Result |
| --- | --- |
| Prisma schema generation | Passed using Prisma Client 6.19.0. |
| Initial SQL migration | Applied successfully through `prisma migrate deploy` to a fresh test database; repeat deployment correctly found no pending migrations. |
| Production frontend build | Passed with React/Vite; cover image is included in the output. |
| Production dependency audit | `npm audit --omit=dev --audit-level=high` reported zero known vulnerabilities after updating Sharp and overriding Prisma configuration helpers. This is a point-in-time dependency check, not a security certification. |
| Server/script syntax | 27 JavaScript modules/scripts checked successfully. |
| Moderation tests | 3 passed: permitted school vocabulary, blocked English/Thai and obfuscations, worker rejection/recovery. |
| Integration scenarios | 15 passed, using HTTP requests, Socket.io clients, Prisma and a persistent test database. Node reports 16 including the parent test. |
| Independent jobs process | Startup cleanup and moderation audit both completed successfully in `--once` mode. |
| Source documentation | Every source/archive file has a corresponding explanation in the walkthrough. |

The integration scenarios cover unauthenticated/origin rejection; signup/login/bcrypt/cookies; recipient-only friendship acceptance; actual Socket.io delivery and duplicate retry handling; text moderation on HTTP and sockets; incoming-only read receipts; image validation and private media access; audio upload and HTTP range playback; profile pictures and public-profile fields; posts/comments; ORM reconnection; API restart with saved accounts/messages/sessions; unread deletion at the exact 48-hour boundary; legacy-content auditing and referenced-file preservation; and logout/session revocation with socket disconnection.

## Test environment and limits

Docker and a usable native PostgreSQL service were unavailable in the build environment. Integration and migration checks used a disk-backed PGlite PostgreSQL engine exposed through its PostgreSQL socket protocol, with a single Prisma connection. This is an integration check of real SQL/HTTP/socket behavior, not a native PostgreSQL concurrency or load test. PGlite's connection multiplexer differs from a normal PostgreSQL installation; see [PGlite Socket documentation](https://pglite.dev/docs/pglite-socket).

The delivered application uses ordinary PostgreSQL through Prisma and Docker's `postgres:16-alpine`; PGlite is not included in its dependencies or runtime. Repeat the suite against PostgreSQL using the commands below before production rollout.

Browser visual automation, a physical microphone, mobile-device playback, a Docker image build, a long-running production scheduler, high-load/multi-replica behavior, and an external deployment were not tested. Voice recording is implemented, and audio upload/download/range playback were tested at the API level.

## Reproduce on local PostgreSQL

Use a dedicated test database; the test refuses databases whose name does not end in `_test`. Fixtures are uniquely named and cleaned up, but cleanup tests intentionally run retention jobs against the test database. Never point these tests at production or a database holding real student data.

First start the database using the README, then create and initialize `mnchat_test` once:

```bash
docker compose exec db createdb -U mnchat mnchat_test
docker compose exec -T db psql -U mnchat -d mnchat_test < server/prisma/migrations/20260908000000_init/migration.sql
npm test
npm run test:integration
```

The root integration script derives a `_test` database name from `.env` while keeping its host/password. To use another isolated database, set `TEST_DATABASE_URL` to its PostgreSQL URL with a name ending in `_test`, and apply the migration there first.

PowerShell can apply the SQL using a pipe instead of `<`:

```powershell
Get-Content -Raw server/prisma/migrations/20260908000000_init/migration.sql | docker compose exec -T db psql -U mnchat -d mnchat_test
npm test
npm run test:integration
```

For a manual browser check, use two browser profiles, register two accounts, exchange/accept a request, send a text/image/voice message, read it from the recipient, publish/comment on a post, reload, and sign out. Use HTTPS or localhost for microphone recording.
