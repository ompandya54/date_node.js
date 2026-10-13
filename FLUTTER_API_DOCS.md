# 📱 Gandhinagar Dating App - Complete Flutter API Documentation (B1 to B9)

This document provides complete, production-ready REST API & Socket.IO specifications and Dart integration details for the Gandhinagar Dating Flutter App, strictly adhering to **Document 0** and the B1–B9 implementation specifications.

---

## 🌐 Base URLs & Environment

- **Local Development**: `http://localhost:5000/api` (Flutter Emulator: `http://10.0.2.2:5000/api`)
- **Staging / Production Base URL**: `https://date-node-js.onrender.com/api`
- **Real-Time WebSocket (Socket.IO)**: `ws://localhost:5000` (Production SSL: `wss://date-node-js.onrender.com`)
- **Fast Health Check**: `GET /api/health` (< 1 second)
- **Deep Load Balancer Ready Check**: `GET /api/health/ready`
- **App Support / Feature Config**: `GET /api/meta/config`

---

## 🔒 Global Rules & Architecture

1. **Envelope**:
   - Success: `{ "success": true, "data": { ... } }`
   - Error: `{ "success": false, "code": "SOME_CODE", "message": "Human readable message", "errors": { "field": "message" } }` (*`errors` only present for field validation*).
2. **Location Privacy**: The server **never** stores GPS coordinates in user documents and **never** returns distance, direction, coordinates, or nearby counts for another user.
3. **Authentication**: Email + password backend JWT. Short-lived access token (1 hour) with rotating refresh token (30 days). Send in header: `Authorization: Bearer <accessToken>`.
4. **Timestamps & IDs**: ISO-8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`), IDs are strings.
5. **Enums (Exact)**:
   - `gender`: `"man"` | `"woman"` | `"nonBinary"`
   - `datingIntent`: `"longTermRelationship"` | `"shortTermFun"` | `"friendship"` | `"stillFiguring"`
   - `drinking`, `smoking`: `"never"` | `"socially"` | `"regularly"`
   - `reportReason`: `"fakeProfile"` | `"inappropriatePhotos"` | `"harassment"` | `"spam"` | `"underage"` | `"other"`
   - `notificationType`: `"newLike"` | `"newMatch"` | `"newMessage"` | `"icebreakerAnswered"`
   - `session durations`: `30` | `60` | `120` (minutes)
   - `placeCategory`: `"cafe"` | `"restaurant"` | `"park"` | `"cinema"` | `"mall"` | `"other"`

---

## 📑 B1: Auth, Session, Interests Catalog

### 1. Register User (Minimal)
- **`POST /api/auth/register`** (Rate Limit: 10/min/IP)
- Accepts ONLY `{ email, password }`.
- Duplicate gives 422 with `errors.email`.
- Response (201):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_123",
      "email": "user@example.com",
      "onboardingCompleted": false
    },
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "ref_...",
    "expiresIn": 3600
  }
}
```

### 2. Login User
- **`POST /api/auth/login`** (Rate Limit: 10/min/IP)
- Body: `{ email, password }`.
- Wrong email/password gives 401 `INVALID_CREDENTIALS`.
- Response shape identical to register.

### 3. Refresh Token
- **`POST /api/auth/refresh`** (Rate Limit: 30/min/user)
- Body: `{ refreshToken }`.
- Reused or revoked token gives 401 `UNAUTHORIZED`.
- Returns `{ accessToken, refreshToken, expiresIn }`.

### 4. Logout User
- **`POST /api/auth/logout`** (auth)
- Body: `{ refreshToken, deviceToken? }`.
- Revokes refresh token and unregisters device FCM token. Returns 200.

### 5. Current User & Profile
- **`GET /api/auth/me`** (auth)
- Returns `{ user: { id, email, onboardingCompleted, profile } }`.
- `profile` is `null` until onboarding is complete.
- Expired token gives 401 `TOKEN_EXPIRED`.

### 6. Delete Account
- **`DELETE /api/users/account`** (auth)
- Body: `{ password }`.
- Wrong password gives 401 `INVALID_CREDENTIALS`.
- Purges profile, photos, matches, chats, sessions, and device tokens immediately.

### 7. Interests Catalog
- **`GET /api/meta/interests`** (public)
- Returns exact 12 items: coffee, chai, music, travel, movies, fitness, books, cooking, photography, gaming, hiking, art.

---

## 📸 B2: Photos, Onboarding, Profile & Privacy Settings

### 1. Photo Upload
- **`POST /api/photos`** (auth, multipart `file`) (Rate Limit: 20/hour/user)
- Accepts JPEG, PNG, WebP (max 10MB).
- Strips EXIF/GPS, resizes long edge <= 1080px, returns 201 `{ photo: { id: "ph_...", url: "https://..." } }`.

### 2. Complete Onboarding
- **`POST /api/onboarding/complete`** (auth)
- Body:
```json
{
  "name": "Ananya",
  "dateOfBirth": "2001-05-15",
  "gender": "woman",
  "interestedIn": ["man"],
  "photoIds": ["ph_1", "ph_2"],
  "bio": "Optional bio",
  "interestIds": ["coffee", "music", "travel"],
  "datingIntent": "longTermRelationship",
  "drinking": "socially",
  "smoking": "never"
}
```
- Server computes age: age < 18 returns 422 `errors.dateOfBirth`.
- `photoIds`: 2 to 6 verified pending photos. First photo is main.
- If already completed, returns 409 `ALREADY_ONBOARDED`.

### 3. Own Profile
- **`GET /api/profile/me`** -> `{ profile: MyProfile }` (404 `PROFILE_NOT_FOUND` if not onboarded).
- **`PATCH /api/profile/me`** -> Partial body (`name`, `bio`, `interestIds`, `interestedIn`, `datingIntent`, `drinking`, `smoking`, `photoIds`).
- Changing `dateOfBirth` or `gender` gives 422 `FIELD_NOT_EDITABLE`.

### 4. Privacy Settings
- **`GET /api/settings/privacy`** -> `{ settings: { hideProfile, locationDiscoveryEnabled, locationAllowed } }`.
- **`PUT /api/settings/privacy`** -> `{ hideProfile?, locationDiscoveryEnabled? }`.
- `locationAllowed = !hideProfile && locationDiscoveryEnabled`.
- Setting `locationAllowed = false` immediately terminates active Nearby and Place sessions.

---

## 🔍 B3: Discover, Likes-You, Matches & Safety

### 1. Discover Profiles Feed
- **`GET /api/discover/profiles?cursor=&pageSize=10`** (default 10, max 30)
- Returns `{ items: [PublicProfile], nextCursor: string|null, hasMore: bool }`.
- Applies mutual gender preference, excludes blocked, acted-on, matched, hidden.
- `commonInterestIds` computed server-side. Zero distance or location fields.

### 2. Single Profile
- **`GET /api/discover/profiles/:id`** -> `{ profile: PublicProfile }` (404 if not visible or no relation).

### 3. Like & Pass
- **`POST /api/discover/likes`** `{ profileId }` -> returns `{ outcome: "liked" }` or `{ outcome: "matched", matchId }` (idempotent).
- **`POST /api/discover/passes`** `{ profileId }` -> returns 200.

### 4. Likes You
- **`GET /api/likes-you`** -> `{ items: [ { profileId, name, age, photoUrl, likedAt } ] }` (newest first, cap 100).

### 5. Matches
- **`GET /api/matches`** -> `{ items: [ { matchId, profileId, name, age, photoUrl, matchedAt, isNew } ] }`.
- **`POST /api/matches/:matchId/seen`** -> 200 (clears `isNew` for caller).
- **`DELETE /api/matches/:matchId`** -> 200 (unmatch, deletes conversation, records acted-on).

### 6. Safety (Block & Report)
- **`POST /api/safety/blocks`** `{ profileId }` -> 200 (atomically drops match, chats, encounters, notifications).
- **`DELETE /api/safety/blocks/:profileId`** -> 200 (unblock).
- **`GET /api/safety/blocks`** -> `{ items: [ { profileId, name, photoUrl } ] }`.
- **`POST /api/safety/reports`** `{ profileId, reason, details? }` -> 201 `{ reportId }` (details max 500 chars). Snapshots evidence. Underage reports auto-hide reported profile.

---

## 💬 B4: Chat, Realtime & Icebreakers

### 1. REST Endpoints
- **`GET /api/chat/conversations`** -> `{ items: [ { matchId, partnerName, partnerPhotoUrl, lastMessagePreview, lastMessageAt, unreadCount } ] }`.
- **`GET /api/chat/:matchId/messages?limit=50&before=<cursor>`** -> `{ items: [Message], nextCursor }` (oldest-first in page).
- **`POST /api/chat/:matchId/messages`** `{ text, clientMessageId }` -> 201 `{ message: Message }` (rate limit: 30/min/user; idempotent retry).
- **`POST /api/chat/:matchId/read`** -> 200 (marks read, emits socket event).

### 2. Icebreakers (5 deterministic questions)
- **`GET /api/chat/:matchId/icebreaker`** -> `{ icebreaker: { questionId, myAnswer, partnerAnswer, revealed } }`.
  - `partnerAnswer` is `null` until **both** participants answer. `revealed` is `true` only when both answered.
- **`POST /api/chat/:matchId/icebreaker`** `{ questionId, optionId: "a"|"b" }` -> 200 (re-answering returns 409 `ALREADY_ANSWERED`).

### 3. Socket.IO Events
- **Connect Handshake**: Pass token in `auth.token`. Expired token triggers `auth_error` event immediately and disconnects.
- **Client to Server**:
  - `join_chat { matchId }`
  - `leave_chat { matchId }`
  - `typing { matchId, isTyping }` (auto-expires after 5 seconds)
- **Server to Client**:
  - `message_received { message: Message }`
  - `partner_typing { matchId, isTyping }`
  - `messages_read { matchId }`
  - `icebreaker_answered { matchId }`
  - `match_removed { matchId }`

---

## 🔔 B5: Notifications & Device Push

### 1. In-App Notification Center
- **`GET /api/notifications`** -> `{ items: [AppNotification] }` (cap 100, newest first).
- **`POST /api/notifications/:id/read`** -> 200.
- **`POST /api/notifications/read-all`** -> 200.
- **`DELETE /api/notifications/:id`** -> 200.
- **`DELETE /api/notifications`** -> 200 (clear all).

### 2. Notification Preferences
- **`GET /api/notifications/preferences`** -> `{ preferences: { likes, matches, messages, icebreakers } }`.
- **`PUT /api/notifications/preferences`** -> Partial body, updates preferences.

### 3. Device Tokens (FCM)
- **`POST /api/devices`** `{ token, platform: "android"|"ios" }` -> 200 (upsert, moving token if re-registered).
- **`DELETE /api/devices/:token`** -> 200.

---

## 📍 B6: Nearby Sessions

### 1. Endpoints
- **`POST /api/nearby/sessions`** `{ durationMinutes: 30|60|120, latitude, longitude, consentAcknowledged? }` -> 201 `{ session: { id, startedAt, expiresAt, durationMinutes } }`.
  - 403 `LOCATION_DISCOVERY_DISABLED` if privacy disables location.
  - 422 `CONSENT_REQUIRED` if first time without `consentAcknowledged: true`.
  - Converts coordinates in memory to geohash precision 6 (~1.2km grid) and immediately discards them.
- **`GET /api/nearby/sessions/current`** -> `{ session }` or `{ session: null }`.
- **`DELETE /api/nearby/sessions/current`** -> 200 (ends session).
- **`GET /api/nearby/people`** -> Anti-trilateration:
  - If < 3 eligible people exist: returns `{ status: "notEnoughPeople", items: [] }` with NO hint of count.
  - If >= 3: returns `{ status: "people", items: [ { profileId, name, age, photoUrl, datingIntent } ] }` (deterministic shuffle, cap 20).
  - 15-second refresh cache.

---

## 🏛️ B7: Place Mode

### 1. Endpoints
- **`POST /api/places/nearby-search`** `{ latitude, longitude }` -> `{ items: [ { id, name, category, approxDistanceMeters, claim } ] }`.
  - Distance rounded to nearest 10m (multiple of 10). `claim` is HMAC-signed token (valid 10 mins).
- **`GET /api/places/popular`** -> `{ items: [ { id, name, category } ] }` (no distances).
- **`POST /api/places/sessions`** `{ placeId, durationMinutes: 30|60|120, claim?, consentAcknowledged? }` -> 201.
  - With valid claim: `verified: true`.
  - Without claim: `verified: false` (limited to 3/day per user, 4th gets 429).
- **`GET /api/places/sessions/current`** -> `{ session }` or `{ session: null }`.
- **`DELETE /api/places/sessions/current`** -> 200.
- **`GET /api/places/people`** -> Anti-trilateration:
  - If < 2 eligible people: returns `{ status: "nobodyToShow", items: [] }`.
  - If >= 2: returns `{ status: "peopleHere", items: [ ... ] }`.
  - 15-second refresh cache.

---

## 🚶 B8: Crossed Paths

### 1. Endpoints
- **`GET /api/crossed-paths`** -> `{ items: [Encounter] }` (newest first).
  - Encounter shape: `{ id, profileId, name, age, photoUrl, datingIntent, crossedAt, expiresAt, isNew, interestExpressed }`.
  - `crossedAt` is hour-rounded ISO time (e.g. `2026-10-12T14:00:00.000Z`).
  - Zero location fields!
- **`POST /api/crossed-paths/seen`** `{ ids: [string] }` -> 200.
- **`POST /api/crossed-paths/:id/interest`** -> `{ outcome: "waiting" }` or `{ outcome: "matched", matchId }`.
- **`POST /api/crossed-paths/:id/dismiss`** -> 200 (removes encounter and records pass).
- **`GET /api/crossed-paths/settings`** -> `{ settings: { recordingEnabled } }`.
- **`PUT /api/crossed-paths/settings`** `{ recordingEnabled }` -> same response.
- **`DELETE /api/crossed-paths`** -> 200 (clears all caller's encounters).

---

## 🛡️ B9: Security, Rate Limits & Hardening

### Rate Limits Table:
| Endpoint Group | Limit | Code on Exceeded | Header |
|---|---|---|---|
| Login / Register / Forgot Password | 10 / min / IP | 429 | `Retry-After: 60` |
| Token Refresh | 30 / min / user | 429 | `Retry-After: 60` |
| Photo Upload | 20 / hour / user | 429 | `Retry-After: 3600` |
| Message Send (REST & Socket) | 30 / min / user | 429 | `Retry-After: 60` |
| Swipes (Likes + Passes) | 200 / hour / user | 429 | `Retry-After: 3600` |
| Block & Report | 20 / hour / user | 429 | `Retry-After: 3600` |
| Nearby Session Starts | 6 / hour / user | 429 | `Retry-After: 3600` |
| Unverified Place Starts | 3 / day / user | 429 | `Retry-After: 86400` |
| Nearby / Place People Refresh | 1 per 15s / user | Cached Result | N/A |

### Security Measures:
- Helmet secure HTTP headers enabled.
- NoSQL injection sanitizer strips operator keys (`$gt`, `$or`, etc.).
- Request body limits (10MB).
- Privacy audit automated test in CI confirms 0 leaks of coordinates, distanceKm, or cell to any client.
