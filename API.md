# MNChat API

HTTP endpoints begin with `/api`. Authentication uses the session cookie. Browser requests include credentials. Every POST/PATCH/DELETE request must send `Origin` equal to `CLIENT_ORIGIN`; CORS alone is not treated as CSRF protection. Reads, except the health endpoint, require authentication.

## HTTP routes

| Method | Path | Body / behavior |
| --- | --- | --- |
| GET | `/health` | Executes a database health query. |
| POST | `/auth/signup` | `{ "username": "porsche", "email": "porsche@example.com", "password": "a-long-unique-password" }`; sets cookie, returns public user. |
| POST | `/auth/login` | `{ "email": "...", "password": "..." }`; sets cookie. |
| POST | `/auth/logout` | Revokes this session and disconnects its sockets. |
| GET | `/auth/me` | Returns the currently authenticated public user. |
| PATCH | `/auth/profile` | `{ "avatarId": "owned-image-uuid" }`; `null` removes the picture. |
| GET | `/friends/search?q=name` | Username search; query must be 2–30 characters; up to 20 results. |
| GET | `/friends` | Pending/accepted connections, other user's public profile, and conversation ID. Up to 500. |
| POST | `/friends` | `{ "userId": "uuid" }`; creates a pending request. |
| POST | `/friends/:id/accept` | Only the receiving student can accept; returns conversation ID. |
| DELETE | `/friends/:id` | Sender cancels or recipient declines a pending request. |
| GET | `/conversations` | Up to 500 conversations, latest visible message, unread count and friend. |
| GET | `/conversations/:id/messages?cursor=uuid` | Latest 50 messages returned chronologically, plus `nextCursor` for older history. |
| POST | `/conversations/:id/messages` | `{ "clientId": "uuid", "text": "hello", "mediaId": "optional-uuid" }`; same authorization/moderation as Socket.io. |
| POST | `/conversations/:id/read` | `{ "messageIds": ["uuid"] }`, at most 100. Only incoming unread, unexpired messages can change. |
| POST | `/media` | Multipart field `file`; one file, up to 12 MB; returns `{ media: { id, kind, mimeType, size } }`. |
| GET | `/media/:id` | Authorized image/audio response; supports Range requests. |
| GET | `/posts?cursor=uuid` | 20 newest posts, first 3 comments on each, comment counts and `nextCursor`. |
| POST | `/posts` | `{ "text": "A study question" }`; maximum 4,000 characters. |
| GET | `/posts/:id/comments?cursor=uuid` | Up to 50 comments in ascending chronological order and `nextCursor`. |
| POST | `/posts/:id/comments` | `{ "text": "A helpful answer" }`; maximum 2,000 characters. |

Passwords are 10 or more characters, with an explicit 72 UTF-8-byte maximum to avoid bcrypt truncation. Message text is limited to 4,000 characters and must be nonempty unless a media ID is attached. The backend checks file signatures rather than trusting the filename or browser MIME type. Audio containers are validated; audio stream content is not transcribed or semantically classified.

## Socket.io

The client connects to the same origin with `withCredentials: true`. The server requires the configured Origin even for direct WebSocket upgrades. JWT/session validation runs at connection and for each supported event. Binary media is uploaded over HTTP first, never directly as a socket packet.

| Direction | Event | Payload |
| --- | --- | --- |
| Client → server | `message:send` | `{ conversationId, clientId, text?, mediaId? }` |
| Client → server | `messages:read` | `{ conversationId, messageIds }` |
| Server → participants | `message:new` | Persisted message with ID, text, sender, timestamps, clientId and optional media summary. |
| Server → participants | `messages:read` | `{ conversationId, messageIds, readAt }` for rows actually updated. |
| Server → affected users | `friends:updated` | Refetch the friend/conversation lists. |
| Server → signed-in sockets | `feed:updated` | Refetch the school feed. |

Client events acknowledge `{ ok: true, data }` or `{ ok: false, error, code }`. A timeout does not prove a message failed: it may have committed before the acknowledgment was lost. Reuse the same `clientId` and attachment for an unchanged retry. Editing a failed draft creates a new client identifier.

Only small text/control payloads travel on Socket.io; `maxHttpBufferSize` is 32 KB. User-level socket budgets allow 120 supported events per minute on one API instance. HTTP has separate IP/authentication and user write/upload budgets.

## Error format

Errors normally use `{ "error": "Human-readable message", "code": "MACHINE_CODE" }`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid fields, expired/unavailable upload, unsupported file or cursor. |
| 401 | Missing, expired or revoked session; sign in again. |
| 403 | Incorrect request origin. |
| 404 | Missing resource or user lacks access. |
| 409 | Duplicate identifier/username/email/request. |
| 413 | Oversized upload or request body. |
| 422 | `CONTENT_BLOCKED`; edit text before retrying. |
| 429 | Rate limit reached; wait and retry. |
| 503 | Moderation could not complete; no content is saved. |

Data is sent only after the write commits. Clients refetch on reconnect and periodically; there is no guarantee of replaying every socket event while disconnected. Database history is the source of truth.
