# 💖 City-Restricted Dating App Backend (Gandhinagar Exclusive)

A feature-complete, production-ready Node.js REST API & Real-Time Socket.IO backend built for local city dating applications (e.g., **Gandhinagar, Gujarat**).

---

## 📍 Location Check Architecture (One-Time Gatekeeping at Registration)

- **Registration Gate**: User location (City or GPS coordinates) is checked **strictly ONCE during Registration** (`POST /api/auth/register` & `POST /api/auth/check-location`).
- **Registration Restriction**: Only users located in **Gandhinagar** (or within 35 km radius) are allowed to create an account.
- **Fast Request Processing**: Once registered, all subsequent API calls and Auth Middleware checks execute fast JWT authentication without blocking the user if they travel outside later.

---

## 💎 Subscription & Monetization Engine (Free vs ₹39 VIP Plan)

### 1. 🆓 Free Tier Plan
- **Daily Right Swipes**: **15 Likes / Day** (Auto-resets at midnight).
- **Daily Super Likes**: **1 Super Like / Day**.
- **Chat Access**:
  - **Mon - Fri**: Free users can see incoming matches/chats, but messaging is locked.
  - **Sat & Sun (Free Weekend Chat Promo 🎉)**: **100% FREE CHATTING** for all free users on Saturdays & Sundays!

### 2. 👑 Premium VIP Plan (₹39 / Month)
- **Swipes**: High / Unlimited Swipes (**100 Likes / Day**).
- **Super Likes**: **5 Super Likes / Day**.
- **Chat Access**: **24/7 Unlimited Chatting** on all 7 days (Mon - Sun).
- **Upgrade API**: `POST /api/users/upgrade-plan` (`{"durationDays": 30}`)

---

## 📡 Complete List of Built APIs (Total: 18 Endpoints)

### 1. 🔑 Auth & Location Gatekeeping (`/api/auth`)
- `POST /api/auth/check-location` — Check if GPS/City is eligible for Gandhinagar dating before sign-up
- `POST /api/auth/register` — Create dating profile (hashes password, computes age from DOB, validates city)
- `POST /api/auth/login` — Sign in with email & password (verifies bcrypt hash & returns JWT token)
- `GET /api/auth/me` — Fetch current logged-in user profile *(Protected)*

### 2. 🎴 Swipe & Discovery Engine (`/api/swipe`) — *Protected*
- `GET /api/swipe/feed` — Get candidate profiles list in Gandhinagar with `distanceKm`
- `GET /api/swipe/user/:id` — Get full single profile details
- `POST /api/swipe` — Swipe Right (Like), Left (Pass), or Up (SuperLike ⭐). Enforces daily plan limits!
- `GET /api/swipe/requests` — View incoming Hinge-style comment requests inbox
- `POST /api/swipe/respond` — Accept or Decline comment request
- `POST /api/swipe/undo` — Undo 1-step immediate last swipe
- `DELETE /api/swipe/unmatch/:matchId` — Unmatch a user
- `GET /api/swipe/matches` — Get list of user's active mutual matches (includes `unreadCount` badge!)

### 3. 👤 User Profile & Subscriptions (`/api/users`) — *Protected*
- `PUT /api/users/profile` — Update profile (photos + bio + interests + datingIntent in 1 combined call!)
- `POST /api/users/upgrade-plan` — Upgrade to ₹39 Premium Plan
- `PUT /api/users/change-password` — Change password securely
- `POST /api/users/photos` — Upload up to 6 gallery photos (`multipart/form-data`)
- `DELETE /api/users/photos` — Delete gallery photo by URL
- `PUT /api/users/location` — Update GPS coordinates & re-verify city status
- `POST /api/users/block` — Block a user
- `POST /api/users/report` — Report a user for moderation
- `DELETE /api/users/account` — Permanent account deletion

### 4. 💬 Real-Time Chat & History (`/api/chat`) — *Protected*
- `GET /api/chat/:matchId` — Fetch chat message history for a match
- `PUT /api/chat/read/:matchId` — Mark unread messages as read
- `POST /api/chat/send` — Send HTTP message (Enforces Free Weekend & ₹39 Premium rules)

---

## ⚡ Socket.IO Real-Time Chat Specifications

- **WebSocket Endpoint**: `ws://localhost:5000` (or `http://10.0.2.2:5000` on Android Emulator)
- **Auth**: Pass JWT in auth map `{'token': '<JWT_TOKEN>'}`
- **Events**: `join_chat`, `send_message`, `receive_message`, `typing_status`
