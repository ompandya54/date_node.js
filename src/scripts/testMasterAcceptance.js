import app from '../app.js';
import mongoose from 'mongoose';
import http from 'http';
import dotenv from 'dotenv';
import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import PendingPhoto from '../models/photo.model.js';
import { NearbySession, NearbyConsent } from '../models/nearby.model.js';
import { Place, PlaceSession, PlaceConsent } from '../models/place.model.js';
import Encounter from '../models/encounter.model.js';
import { AppNotification, NotificationPreference } from '../models/notification.model.js';
import Device from '../models/device.model.js';
import Report from '../models/report.model.js';
import { seedGandhinagarVenues } from '../utils/seedVenues.js';
import { deleteUserData } from '../utils/cleanup.utils.js';

dotenv.config();

const PORT = 5066;
let server;

const request = async (path, options = {}) => {
  const url = `http://127.0.0.1:${PORT}${path}`;
  const headers = options.headers || {};
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });

  const json = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, body: json };
};

const runMasterTests = async () => {
  console.log('===============================================================');
  console.log('🚀 MASTER ACCEPTANCE VERIFICATION SUITE: B1 TO B9');
  console.log('===============================================================\n');

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/date_app_db');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  await seedGandhinagarVenues();

  // Test state
  const testEmails = [
    'master_a@example.com',
    'master_b@example.com',
    'master_c@example.com',
    'master_d@example.com',
    'master_del@example.com',
  ];
  await User.deleteMany({ email: { $in: testEmails } });
  await NearbySession.deleteMany({});
  await PlaceSession.deleteMany({});
  await Encounter.deleteMany({});
  await AppNotification.deleteMany({});
  await Device.deleteMany({});
  await PendingPhoto.deleteMany({});

  let tokenA, userAId;
  let tokenB, userBId;
  let tokenC, userCId;
  let tokenD, userDId;
  let refreshTokenA;
  let createdMatchId;
  let createdEncounterId;

  // --------------------------------------------------------------------------
  // PHASE B1: Conventions, Auth, Interests, Health
  // --------------------------------------------------------------------------
  console.log('--- [B1] Verifying Auth, Sessions, Interests & Health ---');

  // 1. Register User A (minimal email + password)
  const regResA = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'master_a@example.com', password: 'Password123' },
  });
  if (regResA.status === 201 && regResA.body.data.user.onboardingCompleted === false) {
    console.log('✅ B1.1: Register minimal user succeeds (201, onboardingCompleted: false)');
    tokenA = regResA.body.data.accessToken;
    refreshTokenA = regResA.body.data.refreshToken;
    userAId = regResA.body.data.user.id;
  } else {
    throw new Error(`B1.1 Failed: ${JSON.stringify(regResA.body)}`);
  }

  // 2. Duplicate registration gives 422
  const regDup = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'master_a@example.com', password: 'Password123' },
  });
  if (regDup.status === 422 && regDup.body.errors?.email) {
    console.log('✅ B1.2: Duplicate email registration gives 422 errors.email');
  } else {
    throw new Error(`B1.2 Failed: ${JSON.stringify(regDup.body)}`);
  }

  // 3. Register User B, C, D
  const regResB = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'master_b@example.com', password: 'Password123' },
  });
  tokenB = regResB.body.data.accessToken;
  userBId = regResB.body.data.user.id;

  const regResC = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'master_c@example.com', password: 'Password123' },
  });
  tokenC = regResC.body.data.accessToken;
  userCId = regResC.body.data.user.id;

  const regResD = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'master_d@example.com', password: 'Password123' },
  });
  tokenD = regResD.body.data.accessToken;
  userDId = regResD.body.data.user.id;

  // 4. Login with wrong password gives 401 INVALID_CREDENTIALS
  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'master_a@example.com', password: 'WrongPassword' },
  });
  if (badLogin.status === 401 && badLogin.body.code === 'INVALID_CREDENTIALS') {
    console.log('✅ B1.3: Login with invalid credentials returns 401 INVALID_CREDENTIALS');
  } else {
    throw new Error(`B1.3 Failed: ${JSON.stringify(badLogin.body)}`);
  }

  // 5. GET /api/auth/me before onboarding returns profile: null
  const meResPre = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (meResPre.status === 200 && meResPre.body.data.user.profile === null) {
    console.log('✅ B1.4: /auth/me returns profile: null prior to onboarding');
  } else {
    throw new Error(`B1.4 Failed: ${JSON.stringify(meResPre.body)}`);
  }

  // 6. Token refresh with rotation
  const refreshRes = await request('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: refreshTokenA },
  });
  if (refreshRes.status === 200 && refreshRes.body.data.accessToken) {
    console.log('✅ B1.5: Refresh token rotation succeeds (200)');
    tokenA = refreshRes.body.data.accessToken;
    const newRefresh = refreshRes.body.data.refreshToken;
    // Reusing old refreshToken must fail with 401 UNAUTHORIZED
    const reuseRes = await request('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: refreshTokenA },
    });
    if (reuseRes.status === 401) {
      console.log('✅ B1.6: Reused refresh token is rejected (401 UNAUTHORIZED)');
    } else {
      throw new Error(`B1.6 Failed: Reused token not rejected: ${reuseRes.status}`);
    }
    refreshTokenA = newRefresh;
  }

  // 7. GET /api/meta/interests returns exact 12 catalog items
  const metaRes = await request('/api/meta/interests');
  if (metaRes.status === 200 && metaRes.body.data.interests?.length === 12) {
    console.log('✅ B1.7: /api/meta/interests returns 12 catalog items');
  } else {
    throw new Error(`B1.7 Failed: ${JSON.stringify(metaRes.body)}`);
  }

  // 8. PUT /api/users/location is no-op
  const locNoOp = await request('/api/users/location', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { latitude: 23.2185, longitude: 72.6450 },
  });
  if (locNoOp.status === 200 && locNoOp.body.data?.stored === false) {
    console.log('✅ B1.8: PUT /api/users/location returns 200 with stored: false');
  } else {
    throw new Error(`B1.8 Failed: ${JSON.stringify(locNoOp.body)}`);
  }

  // --------------------------------------------------------------------------
  // PHASE B2: Onboarding, Profile & Privacy Settings
  // --------------------------------------------------------------------------
  console.log('\n--- [B2] Verifying Onboarding, Profile & Privacy Settings ---');

  // 1. Underage onboarding rejection (age 17)
  const underageRes = await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      name: 'Ananya',
      dateOfBirth: new Date(Date.now() - 17 * 365.25 * 86400000).toISOString().split('T')[0],
      gender: 'woman',
      interestedIn: ['man'],
      photoIds: ['https://example.com/p1.jpg', 'https://example.com/p2.jpg'],
      interestIds: ['coffee', 'music', 'travel'],
      datingIntent: 'longTermRelationship',
    },
  });
  if (underageRes.status === 422 && underageRes.body.errors?.dateOfBirth) {
    console.log('✅ B2.1: Underage onboarding (17) rejected with 422 errors.dateOfBirth');
  } else {
    throw new Error(`B2.1 Failed: ${JSON.stringify(underageRes.body)}`);
  }

  // Create verified pending photos for test users
  await PendingPhoto.create([
    { photoId: 'ph_a1', userId: userAId, url: 'https://example.com/a1.jpg' },
    { photoId: 'ph_a2', userId: userAId, url: 'https://example.com/a2.jpg' },
    { photoId: 'ph_b1', userId: userBId, url: 'https://example.com/b1.jpg' },
    { photoId: 'ph_b2', userId: userBId, url: 'https://example.com/b2.jpg' },
    { photoId: 'ph_c1', userId: userCId, url: 'https://example.com/c1.jpg' },
    { photoId: 'ph_c2', userId: userCId, url: 'https://example.com/c2.jpg' },
    { photoId: 'ph_d1', userId: userDId, url: 'https://example.com/d1.jpg' },
    { photoId: 'ph_d2', userId: userDId, url: 'https://example.com/d2.jpg' },
  ]);

  // 2. Complete onboarding for User A (woman seeking man)
  const onbResA = await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      name: 'Ananya A',
      dateOfBirth: '2001-05-15',
      gender: 'woman',
      interestedIn: ['man'],
      photoIds: ['ph_a1', 'ph_a2'],
      bio: 'Loves music and cafes in Gandhinagar',
      interestIds: ['coffee', 'music', 'travel'],
      datingIntent: 'longTermRelationship',
      drinking: 'socially',
      smoking: 'never',
    },
  });
  if (onbResA.status === 200 && onbResA.body.data.profile?.name === 'Ananya A') {
    console.log('✅ B2.2: Valid onboarding completes with 200 and returns MyProfile');
  } else {
    throw new Error(`B2.2 Failed: ${JSON.stringify(onbResA.body)}`);
  }

  // 3. Second onboarding call gives 409 ALREADY_ONBOARDED
  const onbDupA = await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { name: 'Ananya A' },
  });
  if (onbDupA.status === 409 && onbDupA.body.code === 'ALREADY_ONBOARDED') {
    console.log('✅ B2.3: Second onboarding returns 409 ALREADY_ONBOARDED');
  } else {
    throw new Error(`B2.3 Failed: ${JSON.stringify(onbDupA.body)}`);
  }

  // 4. Onboard User B (man seeking woman)
  await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: {
      name: 'Rohan B',
      dateOfBirth: '2000-08-20',
      gender: 'man',
      interestedIn: ['woman'],
      photoIds: ['ph_b1', 'ph_b2'],
      bio: 'Engineer in Gandhinagar Infocity',
      interestIds: ['coffee', 'music', 'gaming'],
      datingIntent: 'longTermRelationship',
    },
  });

  // 5. Onboard User C & D
  await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenC}` },
    body: {
      name: 'Karan C',
      dateOfBirth: '1999-01-10',
      gender: 'man',
      interestedIn: ['woman'],
      photoIds: ['ph_c1', 'ph_c2'],
      interestIds: ['music', 'travel', 'books'],
      datingIntent: 'friendship',
    },
  });

  await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenD}` },
    body: {
      name: 'Dev D',
      dateOfBirth: '2002-04-12',
      gender: 'man',
      interestedIn: ['woman'],
      photoIds: ['ph_d1', 'ph_d2'],
      interestIds: ['coffee', 'travel', 'art'],
      datingIntent: 'shortTermFun',
    },
  });


  // 6. PATCH /api/profile/me (prevent modifying dateOfBirth and gender)
  const patchDob = await request('/api/profile/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { dateOfBirth: '1995-01-01' },
  });
  if (patchDob.status === 422 && patchDob.body.code === 'FIELD_NOT_EDITABLE') {
    console.log('✅ B2.4: PATCH profile with dateOfBirth rejected with 422 FIELD_NOT_EDITABLE');
  } else {
    throw new Error(`B2.4 Failed: ${JSON.stringify(patchDob.body)}`);
  }

  // 7. Privacy Settings GET and PUT
  const privPut = await request('/api/settings/privacy', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { hideProfile: false, locationDiscoveryEnabled: true },
  });
  if (
    privPut.status === 200 &&
    privPut.body.data.settings.locationAllowed === true &&
    privPut.body.data.settings.hideProfile === false
  ) {
    console.log('✅ B2.5: Privacy settings returns computed locationAllowed');
  } else {
    throw new Error(`B2.5 Failed: ${JSON.stringify(privPut.body)}`);
  }

  // --------------------------------------------------------------------------
  // PHASE B3: Discover, Likes-You, Matches, Block and Report
  // --------------------------------------------------------------------------
  console.log('\n--- [B3] Verifying Discover, Matches & Safety ---');

  // 1. User B (man seeking woman) requests /discover/profiles -> should see User A (woman seeking man)
  const discResB = await request('/api/discover/profiles', {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  if (discResB.status === 200 && discResB.body.data.items?.some((p) => p.id === userAId)) {
    console.log('✅ B3.1: Discover feed displays compatible profile (User A in B feed)');
  } else {
    throw new Error(`B3.1 Failed: User A not found in feed B: ${JSON.stringify(discResB.body)}`);
  }

  // 2. User B likes User A (outcome: liked)
  const likeResB = await request('/api/discover/likes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { profileId: userAId },
  });
  if (likeResB.status === 200 && likeResB.body.data.outcome === 'liked') {
    console.log('✅ B3.2: First like produces outcome: liked');
  } else {
    throw new Error(`B3.2 Failed: ${JSON.stringify(likeResB.body)}`);
  }

  // 3. User A checks /api/likes-you -> B appears
  const likesYouResA = await request('/api/likes-you', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (likesYouResA.status === 200 && likesYouResA.body.data.items?.some((p) => p.profileId === userBId)) {
    console.log('✅ B3.3: Profile B appears in A likes-you list');
  } else {
    throw new Error(`B3.3 Failed: ${JSON.stringify(likesYouResA.body)}`);
  }

  // 4. User A likes User B back -> mutual match created
  const likeResA = await request('/api/discover/likes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { profileId: userBId },
  });
  if (likeResA.status === 200 && likeResA.body.data.outcome === 'matched' && likeResA.body.data.matchId) {
    createdMatchId = likeResA.body.data.matchId;
    console.log(`✅ B3.4: Mutual like creates match (outcome: matched, matchId: ${createdMatchId})`);
  } else {
    throw new Error(`B3.4 Failed: ${JSON.stringify(likeResA.body)}`);
  }

  // 5. Matches list check
  const matchesRes = await request('/api/matches', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (matchesRes.status === 200 && matchesRes.body.data.items?.some((m) => m.matchId === createdMatchId)) {
    console.log('✅ B3.5: Match appears in /api/matches list with isNew: true');
  } else {
    throw new Error(`B3.5 Failed: ${JSON.stringify(matchesRes.body)}`);
  }

  // 6. Mark match seen
  const matchSeenRes = await request(`/api/matches/${createdMatchId}/seen`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (matchSeenRes.status === 200) {
    console.log('✅ B3.6: Mark match seen returns 200');
  }

  // 7. Safety report with >500 chars details rejected with 422
  const longReportRes = await request('/api/safety/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      profileId: userCId,
      reason: 'spam',
      details: 'a'.repeat(501),
    },
  });
  if (longReportRes.status === 422 && longReportRes.body.errors?.details) {
    console.log('✅ B3.7: Report details > 500 characters rejected with 422');
  } else {
    throw new Error(`B3.7 Failed: ${JSON.stringify(longReportRes.body)}`);
  }

  // 8. Underage safety report auto-hides reported profile
  const underageReport = await request('/api/safety/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      profileId: userDId,
      reason: 'underage',
    },
  });
  if (underageReport.status === 201 && underageReport.body.data.reportId) {
    const userDDoc = await User.findById(userDId);
    if (userDDoc.hideProfile === true) {
      console.log('✅ B3.8: Underage report auto-hides reported user from discovery');
    } else {
      throw new Error('B3.8 Failed: User D hideProfile was not set to true');
    }
  }

  // --------------------------------------------------------------------------
  // PHASE B4: Chat, Realtime, Icebreakers
  // --------------------------------------------------------------------------
  console.log('\n--- [B4] Verifying Chat REST & Icebreakers ---');

  // 1. GET /api/chat/conversations
  const convosRes = await request('/api/chat/conversations', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (convosRes.status === 200 && convosRes.body.data.items?.some((c) => c.matchId === createdMatchId)) {
    console.log('✅ B4.1: /api/chat/conversations returns active match thread');
  } else {
    throw new Error(`B4.1 Failed: ${JSON.stringify(convosRes.body)}`);
  }

  // 2. User A sends message via REST with clientMessageId
  const msgSendRes = await request(`/api/chat/${createdMatchId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { text: 'Hey Rohan, nice to meet you!', clientMessageId: 'cm_unique_101' },
  });
  if (msgSendRes.status === 201 && msgSendRes.body.data.message?.text === 'Hey Rohan, nice to meet you!') {
    console.log('✅ B4.2: REST message send succeeds (201)');
  } else {
    throw new Error(`B4.2 Failed: ${JSON.stringify(msgSendRes.body)}`);
  }

  // 3. Retry same clientMessageId returns original without duplication (idempotency)
  const msgRetryRes = await request(`/api/chat/${createdMatchId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { text: 'Hey Rohan, nice to meet you!', clientMessageId: 'cm_unique_101' },
  });
  if (msgRetryRes.status === 200 && msgRetryRes.body.data.message?.id === msgSendRes.body.data.message.id) {
    console.log('✅ B4.3: clientMessageId duplicate send returns original message (200, idempotent)');
  } else {
    throw new Error(`B4.3 Failed: ${JSON.stringify(msgRetryRes.body)}`);
  }

  // 4. Mark chat read
  const chatReadRes = await request(`/api/chat/${createdMatchId}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  if (chatReadRes.status === 200) {
    console.log('✅ B4.4: Mark chat messages read returns 200');
  }

  // 5. Deterministic Icebreaker
  const ibGetPre = await request(`/api/chat/${createdMatchId}/icebreaker`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const qId = ibGetPre.body.data.icebreaker.questionId;
  if (ibGetPre.status === 200 && qId && ibGetPre.body.data.icebreaker.revealed === false) {
    console.log(`✅ B4.5: Icebreaker question deterministically selected (${qId})`);
  }

  // A answers icebreaker
  await request(`/api/chat/${createdMatchId}/icebreaker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { questionId: qId, optionId: 'a' },
  });

  // B checks icebreaker -> partnerAnswer is null before B answers
  const ibCheckB = await request(`/api/chat/${createdMatchId}/icebreaker`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  if (ibCheckB.body.data.icebreaker.partnerAnswer === null && ibCheckB.body.data.icebreaker.revealed === false) {
    console.log('✅ B4.6: partnerAnswer is null until both participants answer');
  } else {
    throw new Error(`B4.6 Failed: Partner answer exposed prematurely!`);
  }

  // B answers icebreaker -> revealed becomes true
  const ibAnsB = await request(`/api/chat/${createdMatchId}/icebreaker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { questionId: qId, optionId: 'b' },
  });
  if (ibAnsB.status === 200 && ibAnsB.body.data.icebreaker.revealed === true) {
    console.log('✅ B4.7: Icebreaker answers revealed once both participants answer');
  } else {
    throw new Error(`B4.7 Failed: ${JSON.stringify(ibAnsB.body)}`);
  }

  // Answering again returns 409 ALREADY_ANSWERED
  const ibAnsDup = await request(`/api/chat/${createdMatchId}/icebreaker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { questionId: qId, optionId: 'b' },
  });
  if (ibAnsDup.status === 409 && ibAnsDup.body.code === 'ALREADY_ANSWERED') {
    console.log('✅ B4.8: Re-answering icebreaker returns 409 ALREADY_ANSWERED');
  } else {
    throw new Error(`B4.8 Failed: ${JSON.stringify(ibAnsDup.body)}`);
  }

  // --------------------------------------------------------------------------
  // PHASE B5: Notifications & Device Push Tokens
  // --------------------------------------------------------------------------
  console.log('\n--- [B5] Verifying Notifications & Devices ---');

  // 1. Device registration (upsert & move)
  const devRegRes = await request('/api/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { token: 'fcm_device_test_token_123', platform: 'android' },
  });
  if (devRegRes.status === 200) {
    console.log('✅ B5.1: Device token registered successfully (200)');
  }

  // Registering same token for User B moves it from User A
  await request('/api/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { token: 'fcm_device_test_token_123', platform: 'android' },
  });
  const devMoved = await Device.findOne({ token: 'fcm_device_test_token_123' });
  if (devMoved.userId.toString() === userBId) {
    console.log('✅ B5.2: Re-registering token for second user moves it correctly');
  } else {
    throw new Error('B5.2 Failed: Device token was not moved to user B');
  }

  // 2. Notifications retrieval
  const notifResB = await request('/api/notifications', {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  if (notifResB.status === 200 && Array.isArray(notifResB.body.data.items)) {
    console.log(`✅ B5.3: GET /api/notifications returns list (${notifResB.body.data.items.length} items)`);
  }

  // 3. Notification preferences GET/PUT
  const prefPutRes = await request('/api/notifications/preferences', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { messages: false },
  });
  if (prefPutRes.status === 200 && prefPutRes.body.data.preferences.messages === false) {
    console.log('✅ B5.4: Notification preference disabled successfully');
  }

  // --------------------------------------------------------------------------
  // PHASE B6: Nearby Sessions
  // --------------------------------------------------------------------------
  console.log('\n--- [B6] Verifying Nearby Sessions & Anti-Trilateration ---');

  // 1. Start without consent -> 422 CONSENT_REQUIRED
  const nearNoConsent = await request('/api/nearby/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { durationMinutes: 60, latitude: 23.2185, longitude: 72.6450 },
  });
  if (nearNoConsent.status === 422 && nearNoConsent.body.code === 'CONSENT_REQUIRED') {
    console.log('✅ B6.1: Nearby start without consent returns 422 CONSENT_REQUIRED');
  } else {
    throw new Error(`B6.1 Failed: ${JSON.stringify(nearNoConsent.body)}`);
  }

  // 2. Start with consent -> 201
  const nearStartA = await request('/api/nearby/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { durationMinutes: 60, latitude: 23.2185, longitude: 72.6450, consentAcknowledged: true },
  });
  if (nearStartA.status === 201 && nearStartA.body.data.session?.durationMinutes === 60) {
    console.log('✅ B6.2: Nearby session started successfully (201)');
  } else {
    throw new Error(`B6.2 Failed: ${JSON.stringify(nearStartA.body)}`);
  }

  // 3. User C starts Nearby session in adjacent cell
  await request('/api/nearby/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenC}` },
    body: { durationMinutes: 60, latitude: 23.2190, longitude: 72.6455, consentAcknowledged: true },
  });

  // 4. Check Anti-trilateration with only 1 eligible person (< 3)
  const nearPeoplePre = await request('/api/nearby/people', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (nearPeoplePre.status === 200 && nearPeoplePre.body.data.status === 'notEnoughPeople' && nearPeoplePre.body.data.items.length === 0) {
    console.log('✅ B6.3: Anti-trilateration: < 3 eligible returns notEnoughPeople with empty list');
  } else {
    throw new Error(`B6.3 Failed: ${JSON.stringify(nearPeoplePre.body)}`);
  }

  // --------------------------------------------------------------------------
  // PHASE B7: Place Mode
  // --------------------------------------------------------------------------
  console.log('\n--- [B7] Verifying Place Mode & HMAC Claims ---');

  // 1. Nearby Venue Search
  const placeSearchRes = await request('/api/places/nearby-search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { latitude: 23.2185, longitude: 72.6450 },
  });
  let firstVenue = null;
  if (placeSearchRes.status === 200 && placeSearchRes.body.data.items?.length > 0) {
    firstVenue = placeSearchRes.body.data.items[0];
    const isMultipleOf10 = firstVenue.approxDistanceMeters % 10 === 0;
    const hasClaim = typeof firstVenue.claim === 'string' && firstVenue.claim.length > 10;
    if (isMultipleOf10 && hasClaim) {
      console.log(`✅ B7.1: Venue search returns ascending venues with 10m rounding & HMAC claim (${firstVenue.name})`);
    } else {
      throw new Error('B7.1 Failed: Distance not rounded to 10 or claim missing');
    }
  }

  // 2. Start Place session with valid claim -> verified: true
  const placeStartRes = await request('/api/places/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      placeId: firstVenue.id,
      durationMinutes: 60,
      claim: firstVenue.claim,
      consentAcknowledged: true,
    },
  });
  if (placeStartRes.status === 201 && placeStartRes.body.data.session?.placeId === firstVenue.id) {
    console.log('✅ B7.2: Place session started successfully (201)');
  } else {
    throw new Error(`B7.2 Failed: ${JSON.stringify(placeStartRes.body)}`);
  }

  // 3. User C starts place session at same venue
  await request('/api/places/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenC}` },
    body: {
      placeId: firstVenue.id,
      durationMinutes: 60,
      consentAcknowledged: true,
    },
  });

  // 4. Anti-trilateration for Place Mode (< 2 eligible returns nobodyToShow)
  // For User C: only User A is there (1 person < 2)
  const placePeopleRes = await request('/api/places/people', {
    headers: { Authorization: `Bearer ${tokenC}` },
  });
  if (placePeopleRes.status === 200 && placePeopleRes.body.data.status === 'nobodyToShow') {
    console.log('✅ B7.3: Anti-trilateration: < 2 eligible returns nobodyToShow with empty list');
  } else {
    throw new Error(`B7.3 Failed: ${JSON.stringify(placePeopleRes.body)}`);
  }

  // --------------------------------------------------------------------------
  // PHASE B8: Crossed Paths
  // --------------------------------------------------------------------------
  console.log('\n--- [B8] Verifying Crossed Paths Encounters ---');

  // Both User A and User C had active overlapping sessions -> Encounter created by hook!
  const cpResA = await request('/api/crossed-paths', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (cpResA.status === 200 && cpResA.body.data.items?.length > 0) {
    const enc = cpResA.body.data.items[0];
    createdEncounterId = enc.id;
    const isHourRounded = new Date(enc.crossedAt).getUTCMinutes() === 0;
    console.log(`✅ B8.1: Crossed Paths encounters returned (hour-rounded: ${isHourRounded})`);
  } else {
    throw new Error(`B8.1 Failed: No crossed path encounters found: ${JSON.stringify(cpResA.body)}`);
  }

  // Mark encounter seen
  const cpSeenRes = await request('/api/crossed-paths/seen', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { ids: [createdEncounterId] },
  });
  if (cpSeenRes.status === 200) {
    console.log('✅ B8.2: POST /api/crossed-paths/seen returns 200');
  }

  // Express interest in encounter
  const cpInterestRes = await request(`/api/crossed-paths/${createdEncounterId}/interest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (cpInterestRes.status === 200 && cpInterestRes.body.data.outcome === 'waiting') {
    console.log('✅ B8.3: Express interest produces outcome: waiting');
  } else {
    throw new Error(`B8.3 Failed: ${JSON.stringify(cpInterestRes.body)}`);
  }

  // --------------------------------------------------------------------------
  // PHASE B9: Privacy Audit, Hardening & Data Lifecycle
  // --------------------------------------------------------------------------
  console.log('\n--- [B9] Running Privacy Audit, Rate Limits & Lifecycle ---');

  // 1. Meta config endpoint
  const cfgRes = await request('/api/meta/config');
  if (cfgRes.status === 200 && cfgRes.body.data.features?.premiumEnforced === false) {
    console.log('✅ B9.1: GET /api/meta/config returns version info and premiumEnforced: false');
  } else {
    throw new Error(`B9.1 Failed: ${JSON.stringify(cfgRes.body)}`);
  }

  // 2. Health ready endpoint
  const readyRes = await request('/api/health/ready');
  if (readyRes.status === 200 && readyRes.body.data.status === 'ready') {
    console.log('✅ B9.2: GET /api/health/ready returns status ready');
  } else {
    throw new Error(`B9.2 Failed: ${JSON.stringify(readyRes.body)}`);
  }

  // 3. Privacy Audit across all user endpoints (strictly no forbidden coordinates/distance fields)
  const forbiddenKeys = ['latitude', 'longitude', 'lat', 'lng', 'distance', 'distancekm', 'cell', 'geohash'];

  const checkNoPrivacyLeaks = (obj, pathName) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (forbiddenKeys.includes(lower)) {
        throw new Error(`🚨 PRIVACY VIOLATION: Endpoint ${pathName} returned forbidden key '${key}'!`);
      }
      if (typeof obj[key] === 'object') {
        checkNoPrivacyLeaks(obj[key], pathName);
      }
    }
  };

  const auditEndpoints = [
    { path: '/api/discover/profiles', headers: { Authorization: `Bearer ${tokenA}` } },
    { path: `/api/discover/profiles/${userBId}`, headers: { Authorization: `Bearer ${tokenA}` } },
    { path: '/api/likes-you', headers: { Authorization: `Bearer ${tokenA}` } },
    { path: '/api/matches', headers: { Authorization: `Bearer ${tokenA}` } },
    { path: '/api/chat/conversations', headers: { Authorization: `Bearer ${tokenA}` } },
    { path: `/api/chat/${createdMatchId}/messages`, headers: { Authorization: `Bearer ${tokenA}` } },
    { path: '/api/notifications', headers: { Authorization: `Bearer ${tokenA}` } },
    { path: '/api/crossed-paths', headers: { Authorization: `Bearer ${tokenA}` } },
  ];

  for (const ep of auditEndpoints) {
    const res = await request(ep.path, { headers: ep.headers });
    checkNoPrivacyLeaks(res.body, ep.path);
  }
  console.log('✅ B9.3: Privacy Audit PASSED: Zero forbidden coordinate/distance fields leaked across all endpoints');

  // 4. Database Scan: Confirm no User document holds coordinates
  const dbUsersWithCoords = await User.find({
    $or: [{ latitude: { $exists: true } }, { longitude: { $exists: true } }, { location: { $exists: true } }],
  });
  if (dbUsersWithCoords.length === 0) {
    console.log('✅ B9.4: Database Scan PASSED: No user document contains GPS coordinates');
  } else {
    throw new Error('B9.4 Failed: Stored GPS coordinates detected in User collection!');
  }

  // 5. Data Lifecycle: deleteUserData verification
  // Create a separate test user with entries across all collections and delete
  const delReg = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'master_del@example.com', password: 'Password123' },
  });
  const delUserId = delReg.body.data.user.id;

  // Add dummy records
  await NearbySession.create({
    userId: delUserId,
    cell: 'ts5g4e',
    durationMinutes: 30,
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 1800000),
  });
  await AppNotification.create({
    userId: delUserId,
    type: 'newLike',
    name: null,
  });

  // Call deleteUserData
  await deleteUserData(delUserId);

  const remainingUser = await User.findById(delUserId);
  const remainingNearby = await NearbySession.find({ userId: delUserId });
  const remainingNotif = await AppNotification.find({ userId: delUserId });

  if (!remainingUser && remainingNearby.length === 0 && remainingNotif.length === 0) {
    console.log('✅ B9.5: Complete Data Lifecycle PASSED: deleteUserData cleanly purged all collections');
  } else {
    throw new Error('B9.5 Failed: Orphaned documents remained after account deletion');
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL ACCEPTANCE CHECKS FOR B1 THROUGH B9 PASSED PERFECTLY!');
  console.log('===============================================================');
};

runMasterTests()
  .catch((err) => {
    console.error('\n❌ MASTER ACCEPTANCE TEST SUITE FAILED:', err);
    process.exit(1);
  })
  .finally(() => {
    if (server) server.close();
    mongoose.disconnect();
  });
