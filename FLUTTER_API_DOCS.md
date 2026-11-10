# 📱 Gandhinagar Dating App - Complete Flutter API Documentation (B1 to B9)

This document provides complete, production-ready REST API & Socket.IO specifications, payload contracts, and error handling for the Gandhinagar Dating Flutter App. It covers all steps from **B1 to B9**, strictly complying with **Document 0** and the production architecture.

---

## 🌐 Base URLs & Environment

- **Local Development**: `http://localhost:5000/api` (Android Emulator: `http://10.0.2.2:5000/api`, iOS Simulator: `http://127.0.0.1:5000/api`)
- **Staging / Production Base URL**: `https://date-node-js.onrender.com/api`
- **Real-Time WebSocket (Socket.IO)**: `ws://localhost:5000` (Production SSL: `wss://date-node-js.onrender.com`)
- **Fast Health Check**: `GET /api/health` (< 1 second)
- **Deep Load Balancer Ready Check**: `GET /api/health/ready`
- **App Support / Feature Config**: `GET /api/meta/config`

---

## 🔒 Global Rules & Architecture

1. **Standard Response Envelopes**:
   - **Success**:
     ```json
     {
       "success": true,
       "data": { ... }
     }
     ```
   - **Error**:
     ```json
     {
       "success": false,
       "code": "SOME_CODE",
       "message": "Human readable message",
       "errors": { "field": "Field specific message" }
     }
     ```
     *(The `errors` object is returned only for field validation errors).*

2. **Location Privacy**:
   - The server **NEVER** stores raw GPS coordinates in database user documents.
   - The server **NEVER** returns another user's coordinates, distance, distanceKm, direction, city, or nearby headcount.
   - Coordinates are only sent via `POST` body (never query params or URLs) for in-memory grid conversion or venue distance calculation, then immediately discarded.

3. **Authentication**:
   - **Access Token**: Short-lived JWT (1 hour / 3600s). Include in headers: `Authorization: Bearer <accessToken>`.
   - **Refresh Token**: Rotating Refresh Token (30 days validity). Stored hashed server-side.
   - Expired access tokens return `401 TOKEN_EXPIRED`.
   - Invalid or revoked refresh tokens return `401 UNAUTHORIZED`.

4. **Shared Enums (Exact strings)**:
   - `gender`: `"man"` | `"woman"` | `"nonBinary"`
   - `datingIntent`: `"longTermRelationship"` | `"shortTermFun"` | `"friendship"` | `"stillFiguring"`
   - `drinking`, `smoking`: `"never"` | `"socially"` | `"regularly"`
   - `reportReason`: `"fakeProfile"` | `"inappropriatePhotos"` | `"harassment"` | `"spam"` | `"underage"` | `"other"`
   - `notificationType`: `"newLike"` | `"newMatch"` | `"newMessage"` | `"icebreakerAnswered"`
   - `session durations`: `30` | `60` | `120` (minutes)
   - `placeCategory`: `"cafe"` | `"restaurant"` | `"park"` | `"cinema"` | `"mall"` | `"other"`

5. **Shared Schemas**:
   - **Photo**:
     ```json
     { "id": "ph_1", "url": "https://res.cloudinary.com/..." }
     ```
   - **PublicProfile** (What other users see in Discover/Nearby/Place/Crossed Paths):
     ```json
     {
       "id": "651a2b...",
       "name": "Ananya",
       "age": 23,
       "photoUrls": ["https://..."],
       "bio": "Loves coffee and music",
       "interests": [{ "id": "coffee", "label": "Coffee" }, { "id": "music", "label": "Music" }],
       "datingIntent": "longTermRelationship",
       "commonInterestIds": ["coffee"]
     }
     ```
   - **MyProfile** (Current logged in user's full profile):
     ```json
     {
       "id": "651a2b...",
       "name": "Ananya",
       "dateOfBirth": "2001-05-15",
       "age": 23,
       "gender": "woman",
       "interestedIn": ["man"],
       "photos": [{ "id": "ph_1", "url": "https://..." }],
       "bio": "Loves coffee and music",
       "interestIds": ["coffee", "music", "travel"],
       "datingIntent": "longTermRelationship",
       "drinking": "socially",
       "smoking": "never"
     }
     ```

---

## 📑 B1: Authentication, Session & Interests Catalog

### 1. Register User (Minimal)
- **`POST /api/auth/register`** (Rate Limit: 10/min/IP)
- Accepts ONLY `{ email, password }`.
- Request:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123"
  }
  ```
- Success Response (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "651a2b3c4d5e6f7a8b9c0d11",
        "email": "user@example.com",
        "onboardingCompleted": false
      },
      "accessToken": "eyJhbGciOiJIUzI1Ni...",
      "refreshToken": "7f8b9c0d1e2f3a4b...",
      "expiresIn": 3600
    }
  }
  ```
- Duplicate Email Error (`422 Unprocessable Entity`):
  ```json
  {
    "success": false,
    "code": "DUPLICATE_KEY",
    "message": "Email already exists",
    "errors": { "email": "This email is already registered." }
  }
  ```

### 2. Login User
- **`POST /api/auth/login`** (Rate Limit: 10/min/IP)
- Request:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123"
  }
  ```
- Invalid Credentials Error (`401 Unauthorized`):
  ```json
  {
    "success": false,
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
  ```
- Success: Same response shape as register (`200 OK`).

### 3. Google Sign-In
- **`POST /api/auth/google`** (Rate Limit: 10/min/IP)
- Request:
  ```json
  {
    "idToken": "google_id_token_from_google_sign_in_package",
    "email": "user@gmail.com",
    "googleId": "10982374982374",
    "name": "Optional Name",
    "photoUrl": "https://..."
  }
  ```
- Returns same shape as Login/Register (`200` or `201`).

### 4. Send Email OTP
- **`POST /api/auth/send-otp`** (Rate Limit: 10/min/IP)
- Request:
  ```json
  {
    "email": "user@example.com"
  }
  ```
- Success Response (`200 OK`):
  ```json
  {
    "success": true,
    "message": "OTP sent to your email address."
  }
  ```

### 5. Verify Email OTP
- **`POST /api/auth/verify-otp`** (Rate Limit: 10/min/IP)
- Request:
  ```json
  {
    "email": "user@example.com",
    "otp": "123456"
  }
  ```
- Success Response (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Email OTP verified successfully."
  }
  ```

### 6. Refresh Access Token (Rotating Token)
- **`POST /api/auth/refresh`** (Rate Limit: 30/min/user)
- Request:
  ```json
  {
    "refreshToken": "7f8b9c0d1e2f3a4b..."
  }
  ```
- Success Response (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1Ni...",
      "refreshToken": "new_rotated_refresh_token...",
      "expiresIn": 3600
    }
  }
  ```
- Reused / Revoked Token (`401 Unauthorized`):
  ```json
  {
    "success": false,
    "code": "UNAUTHORIZED",
    "message": "Invalid or revoked refresh token"
  }
  ```

### 7. Current Authenticated User & Profile
- **`GET /api/auth/me`**
- Headers: `Authorization: Bearer <accessToken>`
- Success Response (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "651a2b3c4d5e6f7a8b9c0d11",
        "email": "user@example.com",
        "onboardingCompleted": true,
        "profile": { ... }
      }
    }
  }
  ```
  *(Note: `profile` is `null` if onboarding is not yet completed).*

### 8. Forgot Password
- **`POST /api/auth/forgot-password`** (Rate Limit: 10/min/IP)
- Request:
  ```json
  {
    "email": "user@example.com"
  }
  ```
- Generic Response (`200 OK` - prevents user enumeration):
  ```json
  {
    "success": true,
    "message": "If an account exists with that email, an OTP link/code has been sent."
  }
  ```

### 9. Reset Password
- **`POST /api/auth/reset-password`** (Rate Limit: 10/min/IP)
- Request (using email + 6-digit OTP OR single-use reset token):
  ```json
  {
    "email": "user@example.com",
    "otp": "123456",
    "newPassword": "NewPassword123"
  }
  ```
- Success Response (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Password reset successfully. You can now login with your new password."
  }
  ```

### 10. Logout User
- **`POST /api/auth/logout`**
- Headers: `Authorization: Bearer <accessToken>`
- Request:
  ```json
  {
    "refreshToken": "7f8b9c0d1e2f3a4b...",
    "deviceToken": "optional_fcm_token"
  }
  ```
- Success Response (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

### 11. Delete Account (Complete Cascade Purge)
- **`DELETE /api/users/account`**
- Headers: `Authorization: Bearer <accessToken>`
- Request:
  ```json
  {
    "password": "Password123"
  }
  ```
- Wrong Password (`401 INVALID_CREDENTIALS`).
- Success: Purges profile, Cloudinary photos, swipes, matches, messages, sessions, encounters, notifications, device tokens.

### 12. Interests Catalog
- **`GET /api/meta/interests`** (Public)
- Returns exact 12 system interest objects:
  ```json
  {
    "success": true,
    "data": {
      "interests": [
        { "id": "coffee", "label": "Coffee" },
        { "id": "chai", "label": "Chai" },
        { "id": "music", "label": "Music" },
        { "id": "travel", "label": "Travel" },
        { "id": "movies", "label": "Movies" },
        { "id": "fitness", "label": "Fitness" },
        { "id": "books", "label": "Books" },
        { "id": "cooking", "label": "Cooking" },
        { "id": "photography", "label": "Photography" },
        { "id": "gaming", "label": "Gaming" },
        { "id": "hiking", "label": "Hiking" },
        { "id": "art", "label": "Art" }
      ]
    }
  }
  ```

### 13. Location No-Op (Deprecated)
- **`PUT /api/users/location`**
- Deprecated no-op endpoint. Returns `{ "success": true, "data": { "stored": false } }`. Does not store GPS.

---

## 📸 B2: Photos, Onboarding, Profile & Privacy Settings

### 1. Upload Photo
- **`POST /api/photos`** (Rate Limit: 20/hour/user)
- Headers: `Authorization: Bearer <accessToken>`, `Content-Type: multipart/form-data`
- Body: `file: <binary image>` (JPEG, PNG, WebP up to 10MB)
- Re-encodes server-side: Strips EXIF & GPS, resizes max dimension to 1080px, stores on Cloudinary CDN.
- Success Response (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "photo": {
        "id": "ph_651a2b...",
        "url": "https://res.cloudinary.com/..."
      }
    }
  }
  ```

### 2. Complete Onboarding
- **`POST /api/onboarding/complete`**
- Headers: `Authorization: Bearer <accessToken>`
- Request Body:
  ```json
  {
    "name": "Ananya",
    "dateOfBirth": "2001-05-15",
    "gender": "woman",
    "interestedIn": ["man"],
    "photoIds": ["ph_1", "ph_2"],
    "bio": "Software developer in Gandhinagar Infocity",
    "interestIds": ["coffee", "music", "travel"],
    "datingIntent": "longTermRelationship",
    "drinking": "socially",
    "smoking": "never"
  }
  ```
- Validation Rules:
  - `name`: max 50 chars.
  - `dateOfBirth`: Age computed server-side must be >= 18 (otherwise `422 errors.dateOfBirth`).
  - `photoIds`: 2 to 6 verified pending photos (first photo becomes main photo).
  - `interestIds`: 3 to 10 unique IDs from catalog.
- Already Onboarded (`409 ALREADY_ONBOARDED`).
- Success Response (`200 OK`): Returns `{ "success": true, "data": { "profile": MyProfile } }`.

### 3. Own Profile Management
- **`GET /api/profile/me`** -> Returns `{ "profile": MyProfile }` (404 `PROFILE_NOT_FOUND` if not onboarded).
- **`PATCH /api/profile/me`** -> Partial updates (`name`, `bio`, `interestIds`, `interestedIn`, `datingIntent`, `drinking`, `smoking`, `photoIds`).
- Sending `dateOfBirth` or `gender` returns `422 FIELD_NOT_EDITABLE`.

### 4. Privacy Settings
- **`GET /api/settings/privacy`**
  ```json
  {
    "success": true,
    "data": {
      "settings": {
        "hideProfile": false,
        "locationDiscoveryEnabled": true,
        "locationAllowed": true
      }
    }
  }
  ```
- **`PUT /api/settings/privacy`**
  - Body: `{ "hideProfile": true, "locationDiscoveryEnabled": false }`
  - When `locationAllowed` becomes `false`, active Nearby and Place sessions are ended automatically.

---

## 🔍 B3: Discover, Likes-You, Matches & Safety

### 1. Discover Profiles Feed
- **`GET /api/discover/profiles?cursor=&pageSize=10`**
- Query params: `cursor` (opaque keyset string), `pageSize` (default 10, max 30).
- Applies mutual gender preference matching. Excludes self, blocked, acted-on, matched, hidden.
- Success Response (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "items": [PublicProfile],
      "nextCursor": "eyJzZW50QXQiOi...",
      "hasMore": true
    }
  }
  ```

### 2. View Profile by ID
- **`GET /api/discover/profiles/:id`**
- Returns `{ "success": true, "data": { "profile": PublicProfile } }`.
- Allowed if visible in discover OR existing match / legitimate relationship.

### 3. Like Profile (Right Swipe)
- **`POST /api/discover/likes`** (Rate Limit: 200/hour/user)
- Request: `{ "profileId": "651a2b..." }`
- Single Like Response (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "outcome": "liked"
    }
  }
  ```
- Mutual Match Response (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "outcome": "matched",
      "matchId": "match_651a2b..."
    }
  }
  ```

### 4. Pass Profile (Left Swipe)
- **`POST /api/discover/passes`** (Rate Limit: 200/hour/user)
- Request: `{ "profileId": "651a2b..." }`
- Returns `200 OK`.

### 5. Likes-You Screen
- **`GET /api/likes-you`**
- Returns users who liked the current user (newest first, capped at 100):
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "profileId": "651a2b...",
          "name": "Rohan",
          "age": 25,
          "photoUrl": "https://...",
          "likedAt": "2026-10-14T10:00:00.000Z"
        }
      ]
    }
  }
  ```

### 6. Matches
- **`GET /api/matches`**
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "matchId": "match_123",
          "profileId": "651a2b...",
          "name": "Rohan",
          "age": 25,
          "photoUrl": "https://...",
          "matchedAt": "2026-10-14T10:00:00.000Z",
          "isNew": true
        }
      ]
    }
  }
  ```
- **`POST /api/matches/:matchId/seen`** -> Returns `200 OK` (marks `isNew` as `false` for caller).
- **`DELETE /api/matches/:matchId`** -> Returns `200 OK` (unmatch, deletes chat thread, records acted-on).

### 7. Safety (Block & Report)
- **`POST /api/safety/blocks`** `{ "profileId": "651a2b..." }` -> 200 (atomically drops matches, messages, encounters, notifications).
- **`DELETE /api/safety/blocks/:profileId`** -> 200 (unblocks user).
- **`GET /api/safety/blocks`** -> `{ "items": [{ "profileId": "...", "name": "...", "photoUrl": "..." }] }`.
- **`POST /api/safety/reports`**
  - Body: `{ "profileId": "...", "reason": "fakeProfile", "details": "Optional details up to 500 chars" }`
  - Underage reports (`reason: "underage"`) automatically hide the reported profile from discovery pending admin review.

---

## 💬 B4: Chat, Realtime & Icebreakers

### 1. Conversations List
- **`GET /api/chat/conversations`**
- Returns all active match threads sorted by newest activity (cap 200):
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "matchId": "match_123",
          "partnerName": "Rohan",
          "partnerPhotoUrl": "https://...",
          "lastMessagePreview": "Hey, how are you?",
          "lastMessageAt": "2026-10-14T10:15:00.000Z",
          "unreadCount": 1
        }
      ]
    }
  }
  ```

### 2. Message History
- **`GET /api/chat/:matchId/messages?limit=50&before=<cursor>`**
- Returns messages formatted oldest-first in batch with `nextCursor` for pagination:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "msg_123",
          "matchId": "match_123",
          "senderId": "usr_123",
          "senderIsMe": true,
          "text": "Hello!",
          "sentAt": "2026-10-14T10:15:00.000Z",
          "readByPartner": false
        }
      ],
      "nextCursor": "base64_timestamp..."
    }
  }
  ```

### 3. Send Message (REST Optimistic Send)
- **`POST /api/chat/:matchId/messages`** (Rate Limit: 30/min/user)
- Request:
  ```json
  {
    "text": "Hello there!",
    "clientMessageId": "uuid_v4_generated_by_flutter"
  }
  ```
- Retries with the same `clientMessageId` are idempotent and return the original message (`200 OK`).

### 4. Mark Chat as Read
- **`POST /api/chat/:matchId/read`** -> Returns `200 OK` (marks partner's messages as read).

### 5. Deterministic Icebreakers
- 5 Fixed questions: `coffee_chai`, `mountains_beach`, `morning_night`, `cats_dogs`, `movies_books`. Each has options `"a"` and `"b"`.
- **`GET /api/chat/:matchId/icebreaker`**
  ```json
  {
    "success": true,
    "data": {
      "icebreaker": {
        "questionId": "coffee_chai",
        "myAnswer": "a",
        "partnerAnswer": null,
        "revealed": false
      }
    }
  }
  ```
  *(Important: `partnerAnswer` is strictly `null` until BOTH have answered. `revealed` is `true` only when both answered).*
- **`POST /api/chat/:matchId/icebreaker`**
  - Body: `{ "questionId": "coffee_chai", "optionId": "a" }`
  - Re-answering returns `409 ALREADY_ANSWERED`.

### 6. Socket.IO Events Reference
- **Handshake Authentication**: Send access token in `auth: { token: "<accessToken>" }`.
- **Client to Server**:
  - `join_chat`: `{ "matchId": "match_123" }`
  - `leave_chat`: `{ "matchId": "match_123" }`
  - `typing`: `{ "matchId": "match_123", "isTyping": true }` (auto-expires after 5 seconds)
- **Server to Client**:
  - `message_received`: `{ "message": Message }`
  - `partner_typing`: `{ "matchId": "match_123", "isTyping": true|false }`
  - `messages_read`: `{ "matchId": "match_123" }`
  - `icebreaker_answered`: `{ "matchId": "match_123" }`
  - `match_removed`: `{ "matchId": "match_123" }` (drops thread on unmatch/block)
  - `auth_error`: `{ "code": "TOKEN_EXPIRED"|"UNAUTHORIZED" }`

---

## 🔔 B5: Notifications & Device Push

### 1. In-App Notification Center
- **`GET /api/notifications`** -> Returns newest first (capped at 100):
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "notif_123",
          "type": "newLike",
          "createdAt": "2026-10-14T10:00:00.000Z",
          "isRead": false,
          "profileId": null,
          "matchId": null,
          "name": null
        }
      ]
    }
  }
  ```
  *(Privacy: `newLike` notifications never reveal name or photo).*
- **`POST /api/notifications/:id/read`** -> 200 OK.
- **`POST /api/notifications/read-all`** -> 200 OK.
- **`DELETE /api/notifications/:id`** -> 200 OK.
- **`DELETE /api/notifications`** -> 200 OK (clear all).

### 2. Notification Preferences
- **`GET /api/notifications/preferences`**
- **`PUT /api/notifications/preferences`** `{ "likes": true, "matches": true, "messages": true, "icebreakers": true }`

### 3. FCM Device Push Tokens
- **`POST /api/devices`** `{ "token": "fcm_token...", "platform": "android"|"ios" }` (upsert; automatically moves token if new user logs in on same device).
- **`DELETE /api/devices/:token`** -> 200 OK.

---

## 📍 B6: Nearby Sessions

### 1. Start Nearby Session
- **`POST /api/nearby/sessions`** (Rate Limit: 6/hour/user)
- Request:
  ```json
  {
    "durationMinutes": 60,
    "latitude": 23.2185,
    "longitude": 72.6450,
    "consentAcknowledged": true
  }
  ```
  *(Returns 422 `CONSENT_REQUIRED` if first time without `consentAcknowledged: true`).*
- Success Response (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "session": {
        "id": "ses_123",
        "startedAt": "2026-10-14T10:00:00.000Z",
        "expiresAt": "2026-10-14T11:00:00.000Z",
        "durationMinutes": 60
      }
    }
  }
  ```

### 2. Current Session & Stop
- **`GET /api/nearby/sessions/current`** -> `{ "session": session|null }`.
- **`DELETE /api/nearby/sessions/current`** -> 200 OK (ends session immediately).

### 3. Nearby People (Anti-Trilateration)
- **`GET /api/nearby/people`** (15-second refresh cache)
  - If fewer than 3 eligible users exist:
    ```json
    {
      "success": true,
      "data": {
        "status": "notEnoughPeople",
        "items": []
      }
    }
    ```
  - If 3 or more eligible users exist:
    ```json
    {
      "success": true,
      "data": {
        "status": "people",
        "items": [
          {
            "profileId": "usr_123",
            "name": "Rohan",
            "age": 25,
            "photoUrl": "https://...",
            "datingIntent": "longTermRelationship"
          }
        ]
      }
    }
    ```

---

## 🏛️ B7: Place Mode

### 1. Venue Nearby Search
- **`POST /api/places/nearby-search`** (Rate Limit: 20/hour/user)
- Request: `{ "latitude": 23.2185, "longitude": 72.6450 }`
- Success Response (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "pl_blue_oven",
          "name": "The Blue Oven Cafe",
          "category": "cafe",
          "approxDistanceMeters": 140,
          "claim": "opaque_signed_claim_token..."
        }
      ]
    }
  }
  ```
  *(Distance rounded to nearest 10m. Claim token valid for 10 minutes).*

### 2. Popular Venues (Fallback)
- **`GET /api/places/popular`** -> `{ "items": [{ "id": "pl_blue_oven", "name": "The Blue Oven Cafe", "category": "cafe" }] }`.

### 3. Start Place Session
- **`POST /api/places/sessions`**
- Request:
  ```json
  {
    "placeId": "pl_blue_oven",
    "durationMinutes": 60,
    "claim": "opaque_claim_token...",
    "consentAcknowledged": true
  }
  ```
  *(With valid claim: `verified: true`. Without claim: allowed max 3 times per day per user, 4th gets 429).*

### 4. People at the Same Place (Anti-Trilateration)
- **`GET /api/places/people`**
  - Fewer than 2 eligible users returns: `{ "status": "nobodyToShow", "items": [] }`.
  - 2 or more eligible users returns: `{ "status": "peopleHere", "items": [ ... ] }`.

---

## 🚶 B8: Crossed Paths

### 1. Encounters List
- **`GET /api/crossed-paths`**
- Returns encounters sorted by newest crossing (purges expired >24h):
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "enc_123",
          "profileId": "usr_123",
          "name": "Rohan",
          "age": 25,
          "photoUrl": "https://...",
          "datingIntent": "longTermRelationship",
          "crossedAt": "2026-10-14T10:00:00.000Z",
          "expiresAt": "2026-10-15T10:00:00.000Z",
          "isNew": true,
          "interestExpressed": false
        }
      ]
    }
  }
  ```
  *(Note: `crossedAt` is hour-rounded ISO time. Zero location/venue details).*

### 2. Actions on Encounters
- **`POST /api/crossed-paths/seen`** `{ "ids": ["enc_123"] }` -> 200 OK.
- **`POST /api/crossed-paths/:id/interest`** -> Returns `{ "outcome": "waiting" }` or `{ "outcome": "matched", "matchId": "..." }`.
- **`POST /api/crossed-paths/:id/dismiss`** -> 200 OK (deletes encounter and records pass).
- **`GET /api/crossed-paths/settings`** & **`PUT /api/crossed-paths/settings`** `{ "recordingEnabled": true|false }`.
- **`DELETE /api/crossed-paths`** -> 200 OK (clears caller's encounters).

---

## 🛡️ B9: Security, Rate Limits & Status Codes

### Rate Limits:
| Area | Limit | HTTP Code | Header |
|---|---|---|---|
| `/auth/login`, `/register`, `/forgot-password`, `/reset-password` | 10 / min / IP | 429 | `Retry-After: 60` |
| `/auth/refresh` | 30 / min / user | 429 | `Retry-After: 60` |
| `/photos` (upload) | 20 / hour / user | 429 | `Retry-After: 3600` |
| Chat messages (REST & Socket) | 30 / min / user | 429 | `Retry-After: 60` |
| Swipes (`/discover/likes`, `/passes`) | 200 / hour / user | 429 | `Retry-After: 3600` |
| Safety (`/safety/blocks`, `/reports`) | 20 / hour / user | 429 | `Retry-After: 3600` |
| Nearby Session starts | 6 / hour / user | 429 | `Retry-After: 3600` |
| Unverified Place Session starts | 3 / day / user | 429 | `Retry-After: 86400` |
| Nearby & Place people refresh | 1 per 15s / user | Cached Result | N/A |

### App Support Endpoints:
- **`GET /api/meta/config`**:
  ```json
  {
    "success": true,
    "data": {
      "minAppVersion": "1.0.0",
      "latestAppVersion": "1.0.0",
      "features": {
        "premiumEnforced": false
      }
    }
  }
  ```
- **`GET /api/health/ready`**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ready",
      "uptime": 12450,
      "timestamp": "2026-10-14T10:00:00.000Z"
    }
  }
  ```
