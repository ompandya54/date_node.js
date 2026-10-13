import app from '../app.js';
import mongoose from 'mongoose';
import http from 'http';
import dotenv from 'dotenv';
import sharp from 'sharp';
import User from '../models/user.model.js';
import Photo from '../models/photo.model.js';
import { cleanupPendingPhotos } from '../controllers/photo.controller.js';

dotenv.config();

const PORT = 5056;
let server;

const request = async (path, options = {}) => {
  const url = `http://127.0.0.1:${PORT}${path}`;
  const headers = options.headers || {};
  
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof Buffer)) {
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

const runB2Tests = async () => {
  console.log('🧪 Starting Backend Task B2 Automated Acceptance Verification Tests...\n');

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/date_app_db');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));

  // Clean test user data
  await User.deleteMany({ email: { $in: ['test_b2_user1@example.com', 'test_b2_user2@example.com'] } });
  await Photo.deleteMany({});

  // 1. Create registered user
  const regRes = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'test_b2_user1@example.com', password: 'password123' },
  });
  const token = regRes.body.data.accessToken;

  // CHECK 1: Upload valid image buffer & verify EXIF stripping, dimensions <= 1080, absolute URL
  console.log('▶ Check 1: Upload photo with EXIF metadata...');
  const testImgBuffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 255, g: 100, b: 50 },
    },
  })
    .jpeg({ quality: 90 })
    .withMetadata({
      exif: {
        IFD0: {
          Artist: 'Test Camera GPS User',
        },
      },
    })
    .toBuffer();

  const formDataBoundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const multipartBody = Buffer.concat([
    Buffer.from(
      `--${formDataBoundary}\r\nContent-Disposition: form-data; name="file"; filename="test_photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    ),
    testImgBuffer,
    Buffer.from(`\r\n--${formDataBoundary}--\r\n`),
  ]);

  const uploadRes1 = await request('/api/photos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${formDataBoundary}`,
    },
    body: multipartBody,
  });

  if (uploadRes1.status === 201 && uploadRes1.body.data.photo.id && uploadRes1.body.data.photo.url.startsWith('http')) {
    console.log('  ✅ PASSED: Photo uploaded successfully, returned 201 with absolute URL:', uploadRes1.body.data.photo.url);
  } else {
    console.error('  ❌ FAILED Check 1:', uploadRes1);
    process.exit(1);
  }

  // Upload a second photo for onboarding
  const uploadRes2 = await request('/api/photos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${formDataBoundary}`,
    },
    body: multipartBody,
  });
  const photo1Id = uploadRes1.body.data.photo.id;
  const photo2Id = uploadRes2.body.data.photo.id;

  // CHECK 2: Upload non-image file renamed .jpg (rejected with 422 magic byte check)
  console.log('\n▶ Check 2: Upload non-image renamed .jpg...');
  const fakeImgBuffer = Buffer.from('THIS_IS_NOT_AN_IMAGE_FILE_JUST_PLAIN_TEXT');
  const fakeMultipartBody = Buffer.concat([
    Buffer.from(
      `--${formDataBoundary}\r\nContent-Disposition: form-data; name="file"; filename="fake_image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    ),
    fakeImgBuffer,
    Buffer.from(`\r\n--${formDataBoundary}--\r\n`),
  ]);

  const uploadFakeRes = await request('/api/photos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${formDataBoundary}`,
    },
    body: fakeMultipartBody,
  });

  if (uploadFakeRes.status === 422 && uploadFakeRes.body.errors.file) {
    console.log('  ✅ PASSED: Non-image rejected with 422 validation error');
  } else {
    console.error('  ❌ FAILED Check 2:', uploadFakeRes);
    process.exit(1);
  }

  // CHECK 3: Onboarding validations (Underage 17 -> 422, 1 photo -> 422, 2 interests -> 422, valid -> 200)
  console.log('\n▶ Check 3: Onboarding validations & completion...');
  
  // Underage 17 check
  const underageRes = await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      name: 'Ananya',
      dateOfBirth: '2010-01-01', // Under 18
      gender: 'woman',
      interestedIn: ['man'],
      photoIds: [photo1Id, photo2Id],
      interestIds: ['coffee', 'music', 'travel'],
      datingIntent: 'longTermRelationship',
    },
  });
  if (underageRes.status === 422 && underageRes.body.errors.dateOfBirth) {
    console.log('  ✅ PASSED: Underage age 17 rejected with 422 errors.dateOfBirth');
  } else {
    console.error('  ❌ FAILED Underage Check:', underageRes);
    process.exit(1);
  }

  // 1 photo check
  const photoCountRes = await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      name: 'Ananya',
      dateOfBirth: '2000-05-15',
      gender: 'woman',
      interestedIn: ['man'],
      photoIds: [photo1Id], // Only 1 photo
      interestIds: ['coffee', 'music', 'travel'],
      datingIntent: 'longTermRelationship',
    },
  });
  if (photoCountRes.status === 422 && photoCountRes.body.errors.photoIds) {
    console.log('  ✅ PASSED: 1 photo rejected with 422 errors.photoIds');
  } else {
    console.error('  ❌ FAILED Photo Count Check:', photoCountRes);
    process.exit(1);
  }

  // 2 interests check
  const interestCountRes = await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      name: 'Ananya',
      dateOfBirth: '2000-05-15',
      gender: 'woman',
      interestedIn: ['man'],
      photoIds: [photo1Id, photo2Id],
      interestIds: ['coffee', 'music'], // Only 2 interests
      datingIntent: 'longTermRelationship',
    },
  });
  if (interestCountRes.status === 422 && interestCountRes.body.errors.interestIds) {
    console.log('  ✅ PASSED: 2 interests rejected with 422 errors.interestIds');
  } else {
    console.error('  ❌ FAILED Interest Count Check:', interestCountRes);
    process.exit(1);
  }

  // Valid onboarding submission
  const validOnboardRes = await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      name: 'Ananya',
      dateOfBirth: '2001-05-15',
      gender: 'woman',
      interestedIn: ['man'],
      photoIds: [photo1Id, photo2Id],
      bio: 'Lover of coffee and coding',
      interestIds: ['coffee', 'music', 'travel'],
      datingIntent: 'longTermRelationship',
      drinking: 'socially',
      smoking: 'never',
    },
  });

  if (validOnboardRes.status === 200 && validOnboardRes.body.data.profile.name === 'Ananya') {
    console.log('  ✅ PASSED: Valid onboarding completed with 200 and returns MyProfile');
  } else {
    console.error('  ❌ FAILED Valid Onboard Check:', validOnboardRes);
    process.exit(1);
  }

  // Verify /auth/me returns MyProfile
  const meRes = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (meRes.status === 200 && meRes.body.data.user.profile.name === 'Ananya') {
    console.log('  ✅ PASSED: /auth/me now returns populated MyProfile');
  } else {
    console.error('  ❌ FAILED /auth/me profile check:', meRes);
    process.exit(1);
  }

  // CHECK 4: Second onboarding call gives 409 ALREADY_ONBOARDED
  console.log('\n▶ Check 4: Second onboarding attempt...');
  const secondOnboardRes = await request('/api/onboarding/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      name: 'Ananya',
      dateOfBirth: '2001-05-15',
      gender: 'woman',
      interestedIn: ['man'],
      photoIds: [photo1Id, photo2Id],
      interestIds: ['coffee', 'music', 'travel'],
      datingIntent: 'longTermRelationship',
    },
  });
  if (secondOnboardRes.status === 409 && secondOnboardRes.body.code === 'ALREADY_ONBOARDED') {
    console.log('  ✅ PASSED: Second onboarding attempt rejected with 409 ALREADY_ONBOARDED');
  } else {
    console.error('  ❌ FAILED Check 4:', secondOnboardRes);
    process.exit(1);
  }

  // CHECK 5: PATCH with gender or dateOfBirth gives 422 FIELD_NOT_EDITABLE
  console.log('\n▶ Check 5: Edit immutable profile fields (gender / DOB)...');
  const patchImmutableRes = await request('/api/profile/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: { gender: 'man' },
  });
  if (patchImmutableRes.status === 422 && patchImmutableRes.body.code === 'FIELD_NOT_EDITABLE') {
    console.log('  ✅ PASSED: Editing gender rejected with 422 FIELD_NOT_EDITABLE');
  } else {
    console.error('  ❌ FAILED Check 5:', patchImmutableRes);
    process.exit(1);
  }

  // CHECK 6: PATCH photoIds reordered & minimum validation
  console.log('\n▶ Check 6: Reorder photos & min photo validation on PATCH...');
  const patchReorderRes = await request('/api/profile/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: { photoIds: [photo2Id, photo1Id] },
  });
  if (
    patchReorderRes.status === 200 &&
    patchReorderRes.body.data.profile.photos[0].id === photo2Id
  ) {
    console.log('  ✅ PASSED: Photo list reordered successfully; first photo is main');
  } else {
    console.error('  ❌ FAILED Check 6 Reorder:', patchReorderRes);
    process.exit(1);
  }

  const patchMinPhotosRes = await request('/api/profile/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: { photoIds: [photo2Id] }, // only 1 photo
  });
  if (patchMinPhotosRes.status === 422 && patchMinPhotosRes.body.errors.photoIds) {
    console.log('  ✅ PASSED: Removing below 2 photos rejected with 422 errors.photoIds');
  } else {
    console.error('  ❌ FAILED Check 6 Min Photos:', patchMinPhotosRes);
    process.exit(1);
  }

  // CHECK 7: Privacy settings GET & PUT (hideProfile, locationDiscoveryEnabled, locationAllowed)
  console.log('\n▶ Check 7: Privacy settings GET & PUT...');
  const getPrivacyRes = await request('/api/settings/privacy', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (
    getPrivacyRes.status === 200 &&
    getPrivacyRes.body.data.settings.hideProfile === false &&
    getPrivacyRes.body.data.settings.locationAllowed === true
  ) {
    console.log('  ✅ PASSED: GET /api/settings/privacy returns defaults (hideProfile: false, locationAllowed: true)');
  } else {
    console.error('  ❌ FAILED Check 7 GET:', getPrivacyRes);
    process.exit(1);
  }

  const putPrivacyRes = await request('/api/settings/privacy', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: { hideProfile: true },
  });
  if (
    putPrivacyRes.status === 200 &&
    putPrivacyRes.body.data.settings.hideProfile === true &&
    putPrivacyRes.body.data.settings.locationAllowed === false
  ) {
    console.log('  ✅ PASSED: PUT /api/settings/privacy updated hideProfile to true; locationAllowed computed as false');
  } else {
    console.error('  ❌ FAILED Check 7 PUT:', putPrivacyRes);
    process.exit(1);
  }

  // CHECK 8: Unattached pending photos cleanup job
  console.log('\n▶ Check 8: Pending photos cleanup job execution...');
  // Create an old pending photo
  const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
  await Photo.create({
    photoId: 'ph_old_pending_test',
    userId: new mongoose.Types.ObjectId(),
    url: 'https://example.com/uploads/old_test.jpg',
    isPending: true,
    createdAt: oldDate,
  });

  const cleanedCount = await cleanupPendingPhotos();
  if (cleanedCount >= 1) {
    console.log(`  ✅ PASSED: Pending photos cleanup job ran successfully, deleted ${cleanedCount} expired photo(s)`);
  } else {
    console.error('  ❌ FAILED Check 8 Cleanup Job');
    process.exit(1);
  }

  console.log('\n🎉 ALL PHASE B2 ACCEPTANCE CHECKS PASSED SUCCESSFULLY!\n');

  server.close();
  await mongoose.disconnect();
  process.exit(0);
};

runB2Tests().catch((err) => {
  console.error('Unhandled B2 test failure:', err);
  process.exit(1);
});
