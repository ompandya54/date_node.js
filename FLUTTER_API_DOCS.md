# 📱 Gandhinagar Dating App - Complete Flutter API Documentation

This document provides complete, production-ready REST API & Socket.IO specifications and Dart integration code for Flutter developers.

---

## 🌐 Live Production Base URLs (Render.com)

- **Live Production REST API Base URL**: `https://date-node-js.onrender.com/api`
- **Live WebSocket Socket.IO Base URL**: `wss://date-node-js.onrender.com`
- **Live Health Check URL**: `https://date-node-js.onrender.com/api/health`

### 💻 Development / Local Testing URLs:
- **Android Emulator**: `http://10.0.2.2:5000/api`
- **iOS Simulator**: `http://localhost:5000/api`
- **Physical Device**: `http://<YOUR_COMPUTER_LOCAL_IP>:5000/api`

---

## 🔒 Authentication Header Requirement
All protected endpoints require the **Bearer JWT Token** in HTTP Headers:
```text
Authorization: Bearer <YOUR_JWT_TOKEN>
```

---

## 📂 Table of Endpoints

### 1. 🔑 Auth & Location Gatekeeping (`/api/auth`)
1. [`POST /api/auth/check-location`](#1-check-location-eligibility) — Pre-signup location check
2. [`POST /api/auth/register`](#2-register-user) — User registration
3. [`POST /api/auth/login`](#3-user-login) — User login
4. [`GET /api/auth/me`](#4-get-current-user-profile) — Get logged-in user details

### 2. 🎴 Swipe & Discovery Engine (`/api/swipe`)
5. [`GET /api/swipe/feed`](#5-get-discovery-feed-card-stack) — Discovery card stack feed
6. [`GET /api/swipe/user/:id`](#6-get-single-profile-details) — Single candidate detailed view
7. [`POST /api/swipe`](#7-swipe-action-like--pass--superlike--comment) — Swipe Right/Left/Up or Comment
8. [`GET /api/swipe/requests`](#8-get-incoming-pending-comment-requests) — Inbox pending comment requests
9. [`POST /api/swipe/respond`](#9-respond-to-match-request-accept--decline) — Accept or Decline request
10. [`POST /api/swipe/undo`](#10-undo--rewind-last-swipe) — 1-step immediate rewind
11. [`GET /api/swipe/matches`](#11-get-active-mutual-matches) — Mutual matches list (with unread badge)
12. [`DELETE /api/swipe/unmatch/:matchId`](#12-unmatch-user) — Unmatch user

### 3. 👤 Profile & Subscriptions (`/api/users`)
13. [`PUT /api/users/profile`](#13-update-unified-profile) — Update profile (photos + bio + interests)
14. [`POST /api/users/upgrade-plan`](#14-upgrade-to-39-premium-plan) — Upgrade to ₹39 VIP Plan
15. [`POST /api/users/photos`](#15-upload-gallery-photos) — Upload gallery photos
16. [`DELETE /api/users/photos`](#16-delete-gallery-photo) — Remove photo
17. [`PUT /api/users/location`](#17-update-gps-location) — Update GPS coordinates
18. [`PUT /api/users/change-password`](#18-change-password) — Change password
19. [`POST /api/users/block`](#19-block-user) — Block user
20. [`POST /api/users/report`](#20-report-user) — Report user
21. [`DELETE /api/users/account`](#21-delete-account) — Delete account

### 4. 💬 Real-Time Chat (`/api/chat` + Socket.IO)
22. [`GET /api/chat/:matchId`](#22-get-chat-history) — Message history
23. [`PUT /api/chat/read/:matchId`](#23-mark-messages-as-read) — Mark read
24. [`POST /api/chat/send`](#24-send-http-message) — Send HTTP message
25. [`Socket.IO Event Specs`](#25-socketio-real-time-chat) — WebSocket live messaging

---

## 1. Check Location Eligibility
**`POST /api/auth/check-location`**  
Check if a GPS coordinate or city is inside Gandhinagar dating zone before signup.

#### Request Body:
```json
{
  "city": "Gandhinagar",
  "latitude": 23.2156,
  "longitude": 72.6369
}
```

#### Success Response (200 OK):
```json
{
  "success": true,
  "message": "Welcome! Gandhinagar is an active dating zone.",
  "data": {
    "isAllowed": true,
    "distanceKm": 0,
    "targetCity": "Gandhinagar"
  }
}
```

---

## 2. Register User
**`POST /api/auth/register`**  
Create a new dating profile. Auto-calculates age from DOB & hashes password.

#### Request Body:
```json
{
  "name": "Ananya Sharma",
  "email": "ananya@example.com",
  "password": "password123",
  "dateOfBirth": "2001-05-15",
  "gender": "female",
  "genderPreference": "male",
  "city": "Gandhinagar",
  "latitude": 23.2156,
  "longitude": 72.6369,
  "bio": "Coffee addict ☕ | PDPU Architecture student",
  "interests": ["Coffee", "Architecture", "Photography"],
  "datingIntent": "Coffee date"
}
```

#### Success Response (201 Created):
```json
{
  "success": true,
  "message": "Welcome to Gandhinagar Dating! Profile created successfully.",
  "data": {
    "user": {
      "id": "651a2b3c4d5e6f7a8b9c0d11",
      "name": "Ananya Sharma",
      "email": "ananya@example.com",
      "age": 23,
      "gender": "female",
      "city": "Gandhinagar",
      "plan": "free"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
}
```

#### Flutter Dart Sample Code:
```dart
Future<Map<String, dynamic>> registerUser(Map<String, dynamic> body) async {
  final response = await http.post(
    Uri.parse('https://date-node-js.onrender.com/api/auth/register'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode(body),
  );
  return jsonDecode(response.body);
}
```

---

## 3. User Login
**`POST /api/auth/login`**

#### Request Body:
```json
{
  "email": "ananya@example.com",
  "password": "password123"
}
```

#### Success Response (200 OK):
```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "user": {
      "id": "651a2b3c4d5e6f7a8b9c0d11",
      "name": "Ananya Sharma",
      "plan": "free"
    },
    "token": "eyJhbGciOiJIUzI1Ni..."
  }
}
```

---

## 4. Get Current User Profile
**`GET /api/auth/me`**  
Protected endpoint to fetch current user data.

#### Headers:
```text
Authorization: Bearer <TOKEN>
```

---

## 5. Get Discovery Feed (Card Stack)
**`GET /api/swipe/feed`**  
Fetch candidate profiles in Gandhinagar for the swipe deck.

#### Query Parameters:
- `page`: default 1
- `limit`: default 20
- `minAge`: default 18
- `maxAge`: default 100
- `gender`: optional (`female`, `male`)
- `maxDistance`: default 50 (km)

#### Headers:
```text
Authorization: Bearer <TOKEN>
```

#### Success Response (200 OK):
```json
{
  "success": true,
  "page": 1,
  "limit": 20,
  "count": 1,
  "data": {
    "profiles": [
      {
        "id": "651a2b3c4d5e6f7a8b9c0d22",
        "name": "Rohan Patel",
        "age": 25,
        "gender": "male",
        "bio": "Dev at GIFT City 💻 | Weekend Cyclist 🚴‍♂️",
        "city": "Gandhinagar",
        "photos": ["https://res.cloudinary.com/w9agauni/image/upload/v1790941873/gandhinagar_dating/photos/rohan.jpg"],
        "interests": ["Tech", "Cycling", "Fitness"],
        "datingIntent": "Long-term relationship",
        "distanceKm": 2,
        "isCityVerified": true
      }
    ]
  }
}
```

---

## 6. Get Single Profile Details
**`GET /api/swipe/user/:id`**  
Fetch full details for candidate profile card modal.

---

## 7. Swipe Action (Like / Pass / SuperLike / Comment)
**`POST /api/swipe`**  
Perform a swipe or attach an opener comment (Hinge style).

#### Request Body:
```json
{
  "targetUserId": "651a2b3c4d5e6f7a8b9c0d22",
  "action": "like",
  "comment": "Hey Rohan! Love cycling too! 🚴‍♂️"
}
```

#### Actions:
- `pass` (Left Swipe)
- `like` (Right Swipe)
- `superlike` (Up Swipe ⭐)

#### Mutual Match Response (`isMatch: true`):
```json
{
  "success": true,
  "action": "like",
  "isMatch": true,
  "message": "It's a Match! You and Rohan connected! 🎉",
  "data": {
    "matchId": "651a2b3c4d5e6f7a8b9c0d99",
    "matchedUser": {
      "id": "651a2b3c4d5e6f7a8b9c0d22",
      "name": "Rohan Patel",
      "photos": ["https://res.cloudinary.com/w9agauni/image/upload/v1790941873/gandhinagar_dating/photos/rohan.jpg"]
    }
  }
}
```

---

## 8. Get Incoming Pending Comment Requests
**`GET /api/swipe/requests`**  
Inbox endpoint for Hinge-style comment requests.

---

## 9. Respond to Match Request (Accept / Decline)
**`POST /api/swipe/respond`**

#### Request Body:
```json
{
  "requestId": "651a2b3c4d5e6f7a8b9c0d99",
  "action": "accept"
}
```
*Note: Accepting converts the initial comment into the first message in the chatbox!*

---

## 10. Undo / Rewind Last Swipe
**`POST /api/swipe/undo`**  
Rewind immediate last swipe (1-step limit rule).

---

## 11. Get Active Mutual Matches
**`GET /api/swipe/matches`**  
List active accepted matches with `unreadCount` badge for Chat tab.

---

## 12. Unmatch User
**`DELETE /api/swipe/unmatch/:matchId`**

---

## 13. Update Unified Profile
**`PUT /api/users/profile`**  
Update bio, interests, dating intentions, AND upload gallery photos in a single API call!

#### Format: `multipart/form-data` or `application/json`
- `photos`: Image files (up to 6)
- `bio`: String
- `interests`: Array / JSON String (`["Coffee", "Music"]`)
- `datingIntent`: String

---

## 14. Upgrade to ₹39 Premium VIP Plan
**`POST /api/users/upgrade-plan`**

#### Request Body:
```json
{
  "durationDays": 30,
  "paymentId": "pay_razorpay_12345"
}
```

---

## 15. Upload Gallery Photos
**`POST /api/users/photos`** (Multipart `photos`)

---

## 16. Delete Gallery Photo
**`DELETE /api/users/photos`**
```json
{ "photoUrl": "https://res.cloudinary.com/w9agauni/image/upload/v1790941873/gandhinagar_dating/photos/xyz.jpg" }
```

---

## 17. Update GPS Location
**`PUT /api/users/location`**
```json
{ "city": "Gandhinagar", "latitude": 23.2156, "longitude": 72.6369 }
```

---

## 18. Change Password
**`PUT /api/users/change-password`**
```json
{ "currentPassword": "oldpass", "newPassword": "newpass" }
```

---

## 19. Block User
**`POST /api/users/block`**
```json
{ "targetUserId": "651a2b3c4d5e6f7a8b9c0d22" }
```

---

## 20. Report User
**`POST /api/users/report`**
```json
{ "targetUserId": "651a2b3c4d5e6f7a8b9c0d22", "reason": "Inappropriate content" }
```

---

## 21. Delete Account
**`DELETE /api/users/account`** (Play Store Requirement)

---

## 22. Get Chat Message History
**`GET /api/chat/:matchId`**

---

## 23. Mark Messages as Read
**`PUT /api/chat/read/:matchId`**

---

## 24. Send HTTP Message
**`POST /api/chat/send`**  
*Enforces Free Weekend Promo & ₹39 Premium rules.*

```json
{
  "matchId": "651a2b3c4d5e6f7a8b9c0d99",
  "text": "Hey! Coffee at Sector 11?"
}
```

---

## 25. Socket.IO Real-Time Chat

### Flutter Dependency:
```yaml
dependencies:
  socket_io_client: ^3.0.0
```

### Flutter Socket Service Code:

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class ChatSocketService {
  late IO.Socket socket;

  void initSocket(String userJwtToken) {
    // Live Production WebSocket Endpoint
    socket = IO.io('https://date-node-js.onrender.com', <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'auth': {'token': userJwtToken},
    });

    socket.connect();

    socket.onConnect((_) {
      print('⚡ Live Socket Connected!');
    });

    socket.on('receive_message', (data) {
      print('📩 New Message: ${data['text']} from ${data['senderName']}');
    });

    socket.on('error_message', (data) {
      print('⚠️ Chat Error: ${data['message']}');
    });

    socket.on('user_typing', (data) {
      print('User typing: ${data['isTyping']}');
    });
  }

  void joinMatchRoom(String matchId) {
    socket.emit('join_chat', {'matchId': matchId});
  }

  void sendMessage(String matchId, String text) {
    socket.emit('send_message', {'matchId': matchId, 'text': text});
  }

  void sendTyping(String matchId, bool isTyping) {
    socket.emit('typing_status', {'matchId': matchId, 'isTyping': isTyping});
  }

  void disconnect() {
    socket.disconnect();
  }
}
```
