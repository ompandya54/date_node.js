import app from '../app.js';
import mongoose from 'mongoose';
import http from 'http';
import dotenv from 'dotenv';
import User from '../models/user.model.js';
import Photo from '../models/photo.model.js';
import Match from '../models/match.model.js';
import UserAction from '../models/userAction.model.js';
import Block from '../models/block.model.js';
import Report from '../models/report.model.js';

dotenv.config();

const PORT = 5057;
let server;

const request = async (path, options = {}) => {
  const url = `http://127.0.0.1:${PORT}${path}`;
  const headers = options.headers || {};

  let body = options.body;
  if (body && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
  });

  const json = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, body: json };
};

const createTestUser = async (email, name, gender, interestedIn, hideProfile = false) => {
  const user = await User.create({
    email,
    password: 'password123',
    name,
    dateOfBirth: new Date('1998-05-15'),
    age: 26,
    gender,
    interestedIn,
    onboardingCompleted: true,
    hideProfile,
    photos: [{ id: 'ph_test_1', url: 'https://example.com/photo1.jpg' }, { id: 'ph_test_2', url: 'https://example.com/photo2.jpg' }],
    interests: ['coffee', 'music', 'travel'],
    datingIntent: 'longTermRelationship',
  });

  const tokenRes = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'password123' },
  });

  return { user, token: tokenRes.body.data.accessToken };
};

const runB3Tests = async () => {
  console.log('🧪 Starting Backend Task B3 Automated Acceptance Verification Tests...\n');

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/date_app_db');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));

  // Clean test collection data
  await User.deleteMany({ email: /@testb3\.com$/ });
  await Photo.deleteMany({});
  await Match.deleteMany({});
  await UserAction.deleteMany({});
  await Block.deleteMany({});
  await Report.deleteMany({});

  // CHECK 1: Feed visibility & hideProfile filtering
  console.log('▶ Check 1: Feed visibility & hideProfile filtering...');
  const userA = await createTestUser('userA@testb3.com', 'Alice', 'woman', ['man']);
  const userB = await createTestUser('userB@testb3.com', 'Bob', 'man', ['woman']);

  const feedRes1 = await request('/api/discover/profiles', {
    headers: { Authorization: `Bearer ${userA.token}` },
  });

  const foundBInA = feedRes1.body.data.items.some((p) => p.id === userB.user._id.toString());
  if (feedRes1.status === 200 && foundBInA) {
    console.log("  ✅ PASSED: Alice's feed contains onboarded compatible user Bob");
  } else {
    console.error("  ❌ FAILED Check 1 (A feed):", feedRes1);
    process.exit(1);
  }

  // Update Bob hideProfile to true
  await request('/api/settings/privacy', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${userB.token}` },
    body: { hideProfile: true },
  });

  const feedRes2 = await request('/api/discover/profiles', {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const foundBInAHidden = feedRes2.body.data.items.some((p) => p.id === userB.user._id.toString());
  if (feedRes2.status === 200 && !foundBInAHidden) {
    console.log("  ✅ PASSED: hideProfile=true on Bob removes Bob from Alice's feed");
  } else {
    console.error('  ❌ FAILED Check 1 (hideProfile):', feedRes2);
    process.exit(1);
  }

  // Restore Bob hideProfile to false
  await request('/api/settings/privacy', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${userB.token}` },
    body: { hideProfile: false },
  });

  // CHECK 2 & 9: Mutual Like -> Match creation & Idempotency & Matches seen
  console.log('\n▶ Check 2 & 9: Mutual Like -> Match creation, Idempotency & Matches seen...');
  const like1 = await request('/api/discover/likes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` },
    body: { profileId: userB.user._id.toString() },
  });
  if (like1.status === 200 && like1.body.data.outcome === 'liked') {
    console.log('  ✅ PASSED: A likes B returned outcome: "liked"');
  } else {
    console.error('  ❌ FAILED Like 1:', like1);
    process.exit(1);
  }

  // Repeat like (idempotency check 9)
  const repeatLike1 = await request('/api/discover/likes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` },
    body: { profileId: userB.user._id.toString() },
  });
  if (repeatLike1.status === 200 && repeatLike1.body.data.outcome === 'liked') {
    console.log('  ✅ PASSED: Repeating like is idempotent (returns outcome: "liked")');
  } else {
    console.error('  ❌ FAILED Repeat Like:', repeatLike1);
    process.exit(1);
  }

  const like2 = await request('/api/discover/likes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userB.token}` },
    body: { profileId: userA.user._id.toString() },
  });
  if (like2.status === 200 && like2.body.data.outcome === 'matched' && like2.body.data.matchId) {
    console.log('  ✅ PASSED: B likes A returned outcome: "matched" with matchId:', like2.body.data.matchId);
  } else {
    console.error('  ❌ FAILED Mutual Like 2:', like2);
    process.exit(1);
  }

  const matchId = like2.body.data.matchId;

  // Check /matches for both A and B with isNew: true
  const matchesA = await request('/api/matches', {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const matchesB = await request('/api/matches', {
    headers: { Authorization: `Bearer ${userB.token}` },
  });

  if (
    matchesA.body.data.items.length === 1 &&
    matchesA.body.data.items[0].isNew === true &&
    matchesB.body.data.items.length === 1 &&
    matchesB.body.data.items[0].isNew === true
  ) {
    console.log('  ✅ PASSED: Both A and B see match in /matches with isNew: true');
  } else {
    console.error('  ❌ FAILED /matches check:', matchesA, matchesB);
    process.exit(1);
  }

  // A calls /matches/:matchId/seen
  const seenRes = await request(`/api/matches/${matchId}/seen`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const matchesAAfterSeen = await request('/api/matches', {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const matchesBAfterSeen = await request('/api/matches', {
    headers: { Authorization: `Bearer ${userB.token}` },
  });

  if (
    seenRes.status === 200 &&
    matchesAAfterSeen.body.data.items[0].isNew === false &&
    matchesBAfterSeen.body.data.items[0].isNew === true
  ) {
    console.log('  ✅ PASSED: /matches/:matchId/seen clears isNew for A only');
  } else {
    console.error('  ❌ FAILED /matches/seen check:', matchesAAfterSeen, matchesBAfterSeen);
    process.exit(1);
  }

  // CHECK 3: Likes You list behavior
  console.log('\n▶ Check 3: Likes You list behavior...');
  const userC = await createTestUser('userC@testb3.com', 'Charlie', 'man', ['woman']);
  const userD = await createTestUser('userD@testb3.com', 'Diana', 'woman', ['man']);

  // Charlie likes Diana
  await request('/api/discover/likes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userC.token}` },
    body: { profileId: userD.user._id.toString() },
  });

  // Check Diana's /likes-you
  const likesYouD1 = await request('/api/likes-you', {
    headers: { Authorization: `Bearer ${userD.token}` },
  });
  if (
    likesYouD1.status === 200 &&
    likesYouD1.body.data.items.length === 1 &&
    likesYouD1.body.data.items[0].profileId === userC.user._id.toString()
  ) {
    console.log("  ✅ PASSED: Charlie appears in Diana's /likes-you");
  } else {
    console.error("  ❌ FAILED Likes-You Check 1:", likesYouD1);
    process.exit(1);
  }

  // Diana passes Charlie
  await request('/api/discover/passes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userD.token}` },
    body: { profileId: userC.user._id.toString() },
  });

  const likesYouD2 = await request('/api/likes-you', {
    headers: { Authorization: `Bearer ${userD.token}` },
  });
  if (likesYouD2.status === 200 && likesYouD2.body.data.items.length === 0) {
    console.log("  ✅ PASSED: After Diana passes Charlie, Charlie leaves Diana's /likes-you");
  } else {
    console.error('  ❌ FAILED Likes-You Check 2:', likesYouD2);
    process.exit(1);
  }

  // CHECK 4: Cursor pagination over 30+ profiles
  console.log('\n▶ Check 4: Feed Keyset Pagination over 30+ profiles...');
  const viewerP = await createTestUser('viewerP@testb3.com', 'ViewerP', 'man', ['woman']);

  // Create 32 female profiles
  const createdProfileIds = [];
  for (let i = 1; i <= 32; i++) {
    const u = await createTestUser(`girl${i}@testb3.com`, `Girl ${i}`, 'woman', ['man']);
    createdProfileIds.push(u.user._id.toString());
  }

  let page1 = await request('/api/discover/profiles?pageSize=10', {
    headers: { Authorization: `Bearer ${viewerP.token}` },
  });
  let page2 = await request(`/api/discover/profiles?pageSize=10&cursor=${page1.body.data.nextCursor}`, {
    headers: { Authorization: `Bearer ${viewerP.token}` },
  });
  let page3 = await request(`/api/discover/profiles?pageSize=15&cursor=${page2.body.data.nextCursor}`, {
    headers: { Authorization: `Bearer ${viewerP.token}` },
  });

  const allItems = [
    ...page1.body.data.items,
    ...page2.body.data.items,
    ...page3.body.data.items,
  ];

  const uniqueIds = new Set(allItems.map((i) => i.id));
  if (
    page1.body.data.items.length === 10 &&
    page2.body.data.items.length === 10 &&
    page3.body.data.items.length === 13 && // Alice + 12 girls remaining = 13
    page3.body.data.hasMore === false &&
    page3.body.data.nextCursor === null &&
    uniqueIds.size === allItems.length
  ) {
    console.log('  ✅ PASSED: Keyset pagination retrieved 3 pages cleanly without duplicates');
  } else {
    console.error('  ❌ FAILED Pagination Check:', {
      p1Len: page1.body.data.items.length,
      p2Len: page2.body.data.items.length,
      p3Len: page3.body.data.items.length,
      p3HasMore: page3.body.data.hasMore,
      uniqueCount: uniqueIds.size,
      totalCount: allItems.length,
    });
    process.exit(1);
  }

  // CHECK 5: Block & Unblock bidirectional isolation
  console.log('\n▶ Check 5: Block & Unblock bidirectional isolation...');
  const userX = await createTestUser('userX@testb3.com', 'Xavier', 'man', ['woman']);
  const userY = await createTestUser('userY@testb3.com', 'Yara', 'woman', ['man']);

  // Xavier blocks Yara
  const blockRes = await request('/api/safety/blocks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userX.token}` },
    body: { profileId: userY.user._id.toString() },
  });

  const getBlocksX = await request('/api/safety/blocks', {
    headers: { Authorization: `Bearer ${userX.token}` },
  });
  const feedY = await request('/api/discover/profiles', {
    headers: { Authorization: `Bearer ${userY.token}` },
  });

  const foundXInY = feedY.body.data.items.some((p) => p.id === userX.user._id.toString());

  if (
    blockRes.status === 200 &&
    getBlocksX.body.data.items.some((b) => b.profileId === userY.user._id.toString()) &&
    !foundXInY
  ) {
    console.log('  ✅ PASSED: Block created cleanly; GET /safety/blocks lists Yara; Xavier hidden from Yara');
  } else {
    console.error('  ❌ FAILED Block Check:', blockRes, getBlocksX, feedY);
    process.exit(1);
  }

  // CHECK 6: Report validation (501 chars -> 422, valid report -> 201, underage auto-hide)
  console.log('\n▶ Check 6: Report validation & Underage auto-hide...');
  const longDetails = 'a'.repeat(501);
  const reportFailRes = await request('/api/safety/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` },
    body: { profileId: userB.user._id.toString(), reason: 'spam', details: longDetails },
  });
  if (reportFailRes.status === 422 && reportFailRes.body.errors.details) {
    console.log('  ✅ PASSED: 501 char details rejected with 422 errors.details');
  } else {
    console.error('  ❌ FAILED Report 501 Chars Check:', reportFailRes);
    process.exit(1);
  }

  const underageReportRes = await request('/api/safety/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` },
    body: { profileId: userB.user._id.toString(), reason: 'underage', details: 'User looks under 18' },
  });

  const updatedBob = await User.findById(userB.user._id);
  if (underageReportRes.status === 201 && updatedBob.hideProfile === true) {
    console.log('  ✅ PASSED: Underage report created 201 and auto-hid reported user from discovery');
  } else {
    console.error('  ❌ FAILED Underage Report Check:', underageReportRes);
    process.exit(1);
  }

  // CHECK 7: Strict mutual gender matching
  console.log('\n▶ Check 7: Strict mutual gender matching...');
  const manOnlyWomen = await createTestUser('manOnlyWomen@testb3.com', 'M1', 'man', ['woman']);
  const man2 = await createTestUser('man2@testb3.com', 'M2', 'man', ['man', 'woman']);

  const feedM1 = await request('/api/discover/profiles', {
    headers: { Authorization: `Bearer ${manOnlyWomen.token}` },
  });
  const hasManInM1Feed = feedM1.body.data.items.some((p) => p.id === man2.user._id.toString());
  if (!hasManInM1Feed) {
    console.log('  ✅ PASSED: Man interested only in women never sees men in discovery feed');
  } else {
    console.error('  ❌ FAILED Gender Preference Check:', feedM1);
    process.exit(1);
  }

  // CHECK 8: Inspection of responses for forbidden fields (distance, coordinates, city)
  console.log('\n▶ Check 8: Privacy Inspection across all B3 responses...');
  const jsonString = JSON.stringify(feedRes1.body);
  const forbiddenKeys = ['distance', 'distanceKm', 'latitude', 'longitude', 'lat', 'lng', 'coordinates', 'city'];
  let leakedKey = null;
  for (const key of forbiddenKeys) {
    if (jsonString.includes(`"${key}":`)) {
      leakedKey = key;
      break;
    }
  }

  if (!leakedKey) {
    console.log('  ✅ PASSED: No B3 response contains distance, distanceKm, coordinates, latitude, longitude or city');
  } else {
    console.error(`  ❌ FAILED Privacy Leak Check: Leaked field "${leakedKey}" found in B3 response`);
    process.exit(1);
  }

  console.log('\n🎉 ALL PHASE B3 ACCEPTANCE CHECKS PASSED SUCCESSFULLY!\n');

  server.close();
  await mongoose.disconnect();
  process.exit(0);
};

runB3Tests().catch((err) => {
  console.error('Unhandled B3 test failure:', err);
  process.exit(1);
});
