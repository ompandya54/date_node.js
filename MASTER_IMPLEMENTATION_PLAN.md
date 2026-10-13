# App - Backend Implementation Master Plan (B1 to B9)

This document serves as the authoritative, step-by-step master plan for implementing the **Gandhinagar Dating App** backend system according to the specs provided in Document 0 and steps B1 through B9.

---

## 🎯 Shared Contract & Global Rules (Document 0)

1. **Standardized Response Envelopes**:
   - **Success**: `{ "success": true, "data": { ... } }`
   - **Error**: `{ "success": false, "code": "ERROR_CODE", "message": "Human readable message", "errors": { "field": "error message" } }` (*`errors` included only for validation failures*)

2. **HTTP Status Codes**:
   - `200 OK` / `201 Created`
   - `400 Bad Request` / `422 Unprocessable Entity` (validation errors with `errors` field)
   - `401 Unauthorized` (`UNAUTHORIZED` or `TOKEN_EXPIRED` for missing/invalid token; `INVALID_CREDENTIALS` for wrong password)
   - `403 Forbidden` (`LOCATION_DISCOVERY_DISABLED`)
   - `404 Not Found` (`NOT_FOUND`, `PROFILE_NOT_FOUND`)
   - `409 Conflict` (`ALREADY_ONBOARDED`, `ALREADY_ANSWERED`)
   - `429 Too Many Requests` (Rate limit with `Retry-After` header)
   - `500 Internal Server Error`

3. **Strict Enums**:
   - `gender`: `"man"` | `"woman"` | `"nonBinary"`
   - `datingIntent`: `"longTermRelationship"` | `"shortTermFun"` | `"friendship"` | `"stillFiguring"`
   - `drinking`, `smoking`: `"never"` | `"socially"` | `"regularly"`
   - `reportReason`: `"fakeProfile"` | `"inappropriatePhotos"` | `"harassment"` | `"spam"` | `"underage"` | `"other"`
   - `notificationType`: `"newLike"` | `"newMatch"` | `"newMessage"` | `"icebreakerAnswered"`
   - `session durations (minutes)`: `30` | `60` | `120`
   - `placeCategory`: `"cafe"` | `"restaurant"` | `"park"` | `"cinema"` | `"mall"` | `"other"`

4. **Privacy & Security Constraints**:
   - Server NEVER returns distance, coordinates, or direction for users.
   - Raw coordinates are NEVER stored in DB or logged in access logs (POST bodies only).
   - Global visibility function `canSee(viewer, candidate)` must be strictly enforced.

---

## 📅 Roadmap & Execution Steps

### 🟢 Phase B1: Decisions, Conventions, Auth, Interests
- [x] Standard response helper and error handler middleware enforcing Document 0 envelopes.
- [x] Email & password auth (`/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`).
- [x] Password reset endpoints (`/api/auth/forgot-password`, `/api/auth/reset-password`).
- [x] Account deletion endpoint (`DELETE /api/users/account`).
- [x] Public interests catalog (`GET /api/meta/interests`) with exact 12 seeded items.
- [x] No-op location endpoint (`PUT /api/users/location`).
- [x] Fast health check (`GET /api/health`).
- [x] Automated B1 acceptance test suite.

### 🟡 Phase B2: Photos, Onboarding, Profile, Privacy Settings
- [ ] Photo upload (`POST /api/photos`): MIME magic bytes check, EXIF/GPS stripping, 1080px resize, Cloudinary/Storage integration, pending photo TTL cleanup.
- [ ] Onboarding completion (`POST /api/onboarding/complete`): validate 18+ age gate, 2-6 photos, 3-10 interests, return `MyProfile`.
- [ ] User profile management (`GET /api/profile/me`, `PATCH /api/profile/me` with immutable `gender` and `dateOfBirth`).
- [ ] Privacy settings (`GET /api/settings/privacy`, `PUT /api/settings/privacy` managing `hideProfile` and `locationDiscoveryEnabled`).
- [ ] `onLocationAllowedChanged(userId)` hook stub.
- [ ] Automated B2 acceptance test suite.

### 🔵 Phase B3: Discover, Likes-You, Matches, Block & Report
- [ ] Shared `canSee(viewer, candidate)` filter function with DB index optimization.
- [ ] Discover feed (`GET /api/discover/profiles` with cursor pagination & mutual gender matching, `GET /api/discover/profiles/:id`).
- [ ] Likes & Passes (`POST /api/discover/likes`, `POST /api/discover/passes`).
- [ ] Likes You list (`GET /api/likes-you`).
- [ ] Matches endpoints (`GET /api/matches`, `POST /api/matches/:matchId/seen`, `DELETE /api/matches/:matchId`).
- [ ] Safety & Moderation (`POST /api/safety/blocks`, `DELETE /api/safety/blocks/:profileId`, `GET /api/safety/blocks`, `POST /api/safety/reports` with evidence snapshot & underage auto-hide).
- [ ] Extended `deleteUserData(userId)` covering swipes, matches, blocks, reports.
- [ ] Automated B3 acceptance test suite.

### 🟣 Phase B4: Chat, Realtime, Icebreakers
- [ ] Chat REST endpoints (`GET /api/chat/conversations`, `GET /api/chat/:matchId/messages`, `POST /api/chat/:matchId/messages` with `clientMessageId` deduplication, `POST /api/chat/:matchId/read`).
- [ ] Deterministic Icebreakers (`GET /api/chat/:matchId/icebreaker`, `POST /api/chat/:matchId/icebreaker`).
- [ ] Socket.IO server setup (JWT auth, `join_chat`, `leave_chat`, `typing`, `message_received`, `partner_typing`, `messages_read`, `icebreaker_answered`, `match_removed`).
- [ ] Track active chat thread participation per socket connection.
- [ ] Automated B4 acceptance test suite.

### 🔴 Phase B5: Notifications and Push (FCM)
- [ ] AppNotification model & persistence (types: `newLike`, `newMatch`, `newMessage`, `icebreakerAnswered`).
- [ ] Notification endpoints (`GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`, `DELETE /api/notifications/:id`, `DELETE /api/notifications`).
- [ ] Notification preferences (`GET /api/notifications/preferences`, `PUT /api/notifications/preferences`).
- [ ] Device token registration (`POST /api/devices`, `DELETE /api/devices/:token`).
- [ ] Firebase Admin FCM push integration (generic non-sensitive payloads).
- [ ] Wire hooks from B3/B4 (skip message notification if recipient is joined in chat room).
- [ ] Automated B5 acceptance test suite.

### 🟤 Phase B6: Nearby Sessions
- [ ] In-memory coarse geohash cell conversion (precision 6, ~1km grid; raw coordinates never stored).
- [ ] Nearby Session model & TTL expiry index.
- [ ] Nearby endpoints (`POST /api/nearby/sessions`, `GET /api/nearby/sessions/current`, `DELETE /api/nearby/sessions/current`, `GET /api/nearby/people`).
- [ ] Anti-trilateration rule (returns `notEnoughPeople` with empty list if < 3 eligible users).
- [ ] Consent enforcement (`CONSENT_REQUIRED` 422 if consent not acknowledged).
- [ ] Hook `onLocationAllowedChanged` to auto-terminate session when privacy toggled.
- [ ] Automated B6 acceptance test suite.

### 🟠 Phase B7: Place Mode
- [ ] Curated Gandhinagar Venues model & seed data (30+ real venues across cafe, restaurant, park, cinema, mall).
- [ ] Nearby venue search (`POST /api/places/nearby-search` returning rounded distance & signed HMAC claim).
- [ ] Popular venues fallback (`GET /api/places/popular`).
- [ ] Place Session model & endpoints (`POST /api/places/sessions`, `GET /api/places/sessions/current`, `DELETE /api/places/sessions/current`, `GET /api/places/people`).
- [ ] Verification handling (valid claim = verified session; max 3 unverified starts/day).
- [ ] Anti-trilateration rule (returns `nobodyToShow` if < 2 users at venue).
- [ ] Automated B7 acceptance test suite.

### ⚪ Phase B8: Crossed Paths
- [ ] Encounter model & server-side trigger `recordEncounters(userId, session)` on Nearby/Place session start.
- [ ] Strict privacy enforcement (stores only `id`, `ownerUserId`, `otherUserId`, `crossedAt` rounded down to hour, `expiresAt`, `seen`, `interestExpressed`; NO coordinates/location).
- [ ] Crossed paths endpoints (`GET /api/crossed-paths`, `POST /api/crossed-paths/seen`, `POST /api/crossed-paths/:id/interest`, `POST /api/crossed-paths/:id/dismiss`, `GET /api/crossed-paths/settings`, `PUT /api/crossed-paths/settings`, `DELETE /api/crossed-paths`).
- [ ] Automated B8 acceptance test suite.

### 🖤 Phase B9: Hardening & Release Readiness
- [ ] Complete rate limit auditing across all areas with 429 response.
- [ ] Automated privacy audit CI test (verifying no coordinates/distance leak in responses or DB).
- [ ] Comprehensive `deleteUserData(userId)` testing covering all collections.
- [ ] App config endpoint (`GET /api/meta/config`) & ready probe (`GET /api/health/ready`).
- [ ] Legacy endpoint cleanup audit & Postman collection update.
- [ ] Release readiness documentation.
