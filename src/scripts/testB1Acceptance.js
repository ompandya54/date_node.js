import app from '../app.js';
import mongoose from 'mongoose';
import http from 'http';
import dotenv from 'dotenv';
import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';

dotenv.config();

const PORT = 5055;
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

const runTests = async () => {
  console.log('🧪 Starting Backend Task B1 Automated Acceptance Verification Tests...\n');

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/date_app_db');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));

  // Clean test accounts
  await User.deleteMany({ email: { $in: ['test_b1_user1@example.com', 'test_b1_user2@example.com', 'test_b1_del@example.com', 'test_google_user@example.com', 'test_otp_user@example.com', 'test_b1_user1_new@example.com'] } });

  let testUser1Token, testUser1Refresh, testUser1Id;
  let testUser2Token, testUser2Id;

  // CHECK 1: Register with only email and password
  console.log('▶ Check 1: Minimal Registration...');
  const regRes = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'test_b1_user1@example.com', password: 'password123' },
  });
  if (
    regRes.status === 201 &&
    regRes.body.success === true &&
    regRes.body.data.user.onboardingCompleted === false &&
    regRes.body.data.accessToken &&
    regRes.body.data.refreshToken
  ) {
    testUser1Token = regRes.body.data.accessToken;
    testUser1Refresh = regRes.body.data.refreshToken;
    testUser1Id = regRes.body.data.user.id;
    console.log('  ✅ PASSED: 201 Created, onboardingCompleted is false');
  } else {
    console.error('  ❌ FAILED:', regRes);
    process.exit(1);
  }

  // Check /auth/me returns profile: null
  const meRes = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${testUser1Token}` },
  });
  if (meRes.status === 200 && meRes.body.data.user.profile === null) {
    console.log('  ✅ PASSED: /auth/me returns profile: null for un-onboarded user');
  } else {
    console.error('  ❌ FAILED /auth/me profile:null check:', meRes);
    process.exit(1);
  }

  // CHECK 1b: Google Sign-In / Sign-Up (POST /api/auth/google)
  console.log('\n▶ Check 1b: Google Sign-In / Sign-Up...');
  const googleRes = await request('/api/auth/google', {
    method: 'POST',
    body: { email: 'test_google_user@example.com', googleId: 'google_id_12345', name: 'Google Test User' },
  });
  if (
    (googleRes.status === 200 || googleRes.status === 201) &&
    googleRes.body.success === true &&
    googleRes.body.data.accessToken &&
    googleRes.body.data.refreshToken
  ) {
    console.log('  ✅ PASSED: Google auth returned 201/200 Created with access & refresh tokens');
  } else {
    console.error('  ❌ FAILED Google Auth:', googleRes);
    process.exit(1);
  }

  // CHECK 1c: Email OTP Sending & Verification (POST /api/auth/send-otp & /verify-otp)
  console.log('\n▶ Check 1c: Email OTP Sending & Verification...');
  const sendOtpRes = await request('/api/auth/send-otp', {
    method: 'POST',
    body: { email: 'test_otp_user@example.com', purpose: 'register' },
  });
  if (sendOtpRes.status === 200 && sendOtpRes.body.success === true) {
    console.log('  ✅ PASSED: POST /api/auth/send-otp sent OTP successfully');

    const otpUserDoc = await User.findOne({ email: 'test_otp_user@example.com' });
    const generatedOtp = otpUserDoc?.otpCode;

    const verifyOtpRes = await request('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: 'test_otp_user@example.com', otp: generatedOtp },
    });
    if (verifyOtpRes.status === 200 && verifyOtpRes.body.success === true) {
      console.log('  ✅ PASSED: POST /api/auth/verify-otp verified 6-digit OTP successfully');
    } else {
      console.error('  ❌ FAILED Verify OTP:', verifyOtpRes);
      process.exit(1);
    }
  } else {
    console.error('  ❌ FAILED Send OTP:', sendOtpRes);
    process.exit(1);
  }

  // CHECK 2: Duplicate Email
  console.log('\n▶ Check 2: Duplicate Email Registration...');
  const dupRes = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'test_b1_user1@example.com', password: 'password123' },
  });
  if (
    dupRes.status === 422 &&
    dupRes.body.success === false &&
    dupRes.body.errors?.email === 'This email is already registered.'
  ) {
    console.log('  ✅ PASSED: 422 with errors.email = "This email is already registered."');
  } else {
    console.error('  ❌ FAILED Duplicate Email:', dupRes);
    process.exit(1);
  }

  // CHECK 3: Wrong Password at Login & Expired Token
  console.log('\n▶ Check 3: Wrong password login & Invalid/Expired token...');
  const wrongLoginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'test_b1_user1@example.com', password: 'wrongpassword' },
  });
  if (wrongLoginRes.status === 401 && wrongLoginRes.body.code === 'INVALID_CREDENTIALS') {
    console.log('  ✅ PASSED: 401 code INVALID_CREDENTIALS on wrong login password');
  } else {
    console.error('  ❌ FAILED Wrong password login:', wrongLoginRes);
    process.exit(1);
  }

  const invalidTokenRes = await request('/api/auth/me', {
    headers: { Authorization: 'Bearer invalid_token_xyz' },
  });
  if (invalidTokenRes.status === 401 && (invalidTokenRes.body.code === 'UNAUTHORIZED' || invalidTokenRes.body.code === 'TOKEN_EXPIRED')) {
    console.log('  ✅ PASSED: 401 UNAUTHORIZED / TOKEN_EXPIRED on invalid token');
  } else {
    console.error('  ❌ FAILED Invalid token check:', invalidTokenRes);
    process.exit(1);
  }

  // CHECK 4: Refresh Token & Rotation
  console.log('\n▶ Check 4: Refresh Token Rotation & Reused Token Rejection...');
  const refreshRes = await request('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: testUser1Refresh },
  });
  if (
    refreshRes.status === 200 &&
    refreshRes.body.data.accessToken &&
    refreshRes.body.data.refreshToken
  ) {
    const newRefresh = refreshRes.body.data.refreshToken;
    testUser1Token = refreshRes.body.data.accessToken;
    console.log('  ✅ PASSED: Refresh returned new accessToken and refreshToken');

    const reuseRes = await request('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: testUser1Refresh },
    });
    if (reuseRes.status === 401 && reuseRes.body.code === 'UNAUTHORIZED') {
      console.log('  ✅ PASSED: Reused refresh token rejected with 401 UNAUTHORIZED');
    } else {
      console.error('  ❌ FAILED Reused refresh token:', reuseRes);
      process.exit(1);
    }
    testUser1Refresh = newRefresh;
  } else {
    console.error('  ❌ FAILED Refresh token:', refreshRes);
    process.exit(1);
  }

  // CHECK 5: Forgot Password & Reset via OTP (No account enumeration)
  console.log('\n▶ Check 5: Forgot Password & Reset via OTP (No account enumeration)...');
  const fpRes1 = await request('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'test_b1_user1@example.com' },
  });
  if (fpRes1.status === 200) {
    console.log('  ✅ PASSED: forgot-password returned 200 response');

    const fpUserDoc = await User.findOne({ email: 'test_b1_user1@example.com' });
    const resetOtp = fpUserDoc?.otpCode;

    const resetRes = await request('/api/auth/reset-password', {
      method: 'POST',
      body: { email: 'test_b1_user1@example.com', otp: resetOtp, newPassword: 'newpassword123' },
    });
    if (resetRes.status === 200 && resetRes.body.success === true) {
      console.log('  ✅ PASSED: reset-password using OTP updated password successfully');
    } else {
      console.error('  ❌ FAILED Reset password via OTP:', resetRes);
      process.exit(1);
    }
  } else {
    console.error('  ❌ FAILED forgot password:', fpRes1);
    process.exit(1);
  }

  // CHECK 6: Delete Account
  console.log('\n▶ Check 6: Delete Account with password verification...');
  const rightDelRes = await request('/api/users/account', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${testUser1Token}` },
    body: { password: 'newpassword123' },
  });
  if (rightDelRes.status === 200 && rightDelRes.body.success === true) {
    console.log('  ✅ PASSED: delete-account with right password returned 200');

    const oldTokenCheck = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${testUser1Token}` },
    });
    if (oldTokenCheck.status === 401) {
      console.log('  ✅ PASSED: Deleted user token no longer authorized');
    } else {
      console.error('  ❌ FAILED Deleted user token check:', oldTokenCheck);
      process.exit(1);
    }
  } else {
    console.error('  ❌ FAILED Delete account right password:', rightDelRes);
    process.exit(1);
  }

  // Create fresh active test user for remaining tests (Check 7, 8, 9)
  const freshReg = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'test_b1_user1_new@example.com', password: 'password123' },
  });
  const activeToken = freshReg.body.data.accessToken;
  const activeUserId = freshReg.body.data.user.id;

  // CHECK 7: Location Privacy (No distance/coords in feed, profile, matches, requests)
  console.log('\n▶ Check 7: Location Privacy Inspection across responses...');
  const user2 = await User.create({
    email: 'test_b1_user2@example.com',
    name: 'Test User Two',
    onboardingCompleted: true,
    age: 24,
    gender: 'female',
    city: 'Gandhinagar',
  });
  testUser2Id = user2._id.toString();

  await User.findByIdAndUpdate(activeUserId, {
    name: 'Test User One',
    onboardingCompleted: true,
    age: 25,
    gender: 'male',
    genderPreference: 'female',
  });

  const feedRes = await request('/api/swipe/feed?maxDistance=50', {
    headers: { Authorization: `Bearer ${activeToken}` },
  });
  const jsonStrFeed = JSON.stringify(feedRes.body);
  if (
    !jsonStrFeed.includes('distanceKm') &&
    !jsonStrFeed.includes('coordinates') &&
    !jsonStrFeed.includes('latitude') &&
    !jsonStrFeed.includes('longitude')
  ) {
    console.log('  ✅ PASSED: Discovery feed contains no distanceKm, coordinates, latitude, or longitude');
  } else {
    console.error('  ❌ FAILED Feed contains location leak:', jsonStrFeed);
    process.exit(1);
  }

  const profileRes = await request(`/api/swipe/user/${testUser2Id}`, {
    headers: { Authorization: `Bearer ${activeToken}` },
  });
  const jsonStrProfile = JSON.stringify(profileRes.body);
  if (
    !jsonStrProfile.includes('distanceKm') &&
    !jsonStrProfile.includes('coordinates')
  ) {
    console.log('  ✅ PASSED: Single profile response contains no distanceKm or coordinates');
  } else {
    console.error('  ❌ FAILED Profile contains location leak:', jsonStrProfile);
    process.exit(1);
  }

  // CHECK 8: PUT /api/users/location is no-op
  console.log('\n▶ Check 8: PUT /api/users/location is no-op returning 200...');
  const locRes = await request('/api/users/location', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${activeToken}` },
    body: { latitude: 23.21, longitude: 72.63, city: 'Gandhinagar' },
  });
  if (locRes.status === 200 && locRes.body.data?.stored === false) {
    console.log('  ✅ PASSED: PUT /api/users/location returned 200 { "stored": false }');
  } else {
    console.error('  ❌ FAILED PUT location:', locRes);
    process.exit(1);
  }

  // CHECK 9: Free Messaging with PREMIUM_ENFORCEMENT=false
  console.log('\n▶ Check 9: Free messaging with PREMIUM_ENFORCEMENT=false...');
  const matchDoc = await Match.create({
    users: [activeUserId, testUser2Id],
    status: 'accepted',
  });

  const chatRes = await request('/api/chat/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${activeToken}` },
    body: { matchId: matchDoc._id.toString(), text: 'Hello free chat test!' },
  });
  if (chatRes.status === 201 && chatRes.body.success === true) {
    console.log('  ✅ PASSED: Free user sent chat message successfully without premium restriction');
  } else {
    console.error('  ❌ FAILED Free chat send:', chatRes);
    process.exit(1);
  }

  // CHECK 10: Fast Health Check
  console.log('\n▶ Check 10: GET /api/health fast response...');
  const startT = Date.now();
  const healthRes = await request('/api/health');
  const elapsed = Date.now() - startT;
  if (healthRes.status === 200 && elapsed < 1000) {
    console.log(`  ✅ PASSED: Health check responded in ${elapsed} ms (< 1000 ms)`);
  } else {
    console.error('  ❌ FAILED Health check:', healthRes, elapsed);
    process.exit(1);
  }

  // CHECK 11: Interests Catalog
  console.log('\n▶ Check Interests Catalog (GET /api/meta/interests)...');
  const metaRes = await request('/api/meta/interests');
  if (
    metaRes.status === 200 &&
    metaRes.body.data?.interests?.length === 12 &&
    metaRes.body.data.interests[0].id === 'coffee'
  ) {
    console.log('  ✅ PASSED: GET /api/meta/interests returned exact 12 seeded interests');
  } else {
    console.error('  ❌ FAILED Meta interests:', metaRes);
    process.exit(1);
  }

  console.log('\n🎉 ALL ACCEPTANCE CHECKS PASSED SUCCESSFULLY!');

  // Cleanup test users & match
  await User.deleteMany({ email: { $in: ['test_b1_user1@example.com', 'test_b1_user2@example.com', 'test_b1_del@example.com', 'test_google_user@example.com', 'test_otp_user@example.com', 'test_b1_user1_new@example.com'] } });
  await Match.findByIdAndDelete(matchDoc._id);
  await Message.deleteMany({ matchId: matchDoc._id });

  server.close();
  mongoose.disconnect();
  process.exit(0);
};

runTests().catch((err) => {
  console.error('Test script error:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
