import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  GENDER_ENUM,
  DATING_INTENT_ENUM,
  HABIT_ENUM,
} from '../utils/shared.utils.js';

const photoSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    url: { type: String, required: true },
    moderationStatus: { type: String, enum: ['approved', 'pending', 'flagged'], default: 'approved' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      select: false,
    },
    authProvider: {
      type: String,
      enum: ['password', 'google'],
      default: 'password',
    },
    googleId: {
      type: String,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    otpCode: {
      type: String,
      default: null,
    },
    otpExpires: {
      type: Date,
      default: null,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      trim: true,
      maxLength: [50, 'Name cannot exceed 50 characters'],
    },
    dateOfBirth: {
      type: Date,
    },
    age: {
      type: Number,
    },
    gender: {
      type: String,
      enum: GENDER_ENUM,
    },
    interestedIn: {
      type: [String],
      enum: GENDER_ENUM,
      default: ['woman', 'man'],
    },
    city: {
      type: String,
      default: 'Gandhinagar',
      trim: true,
    },
    state: {
      type: String,
      default: 'Gujarat',
    },
    bio: {
      type: String,
      default: null,
      maxLength: [500, 'Bio cannot exceed 500 characters'],
    },
    photos: {
      type: [photoSchema],
      default: [],
    },
    interestIds: {
      type: [String],
      default: [],
    },
    datingIntent: {
      type: String,
      enum: DATING_INTENT_ENUM,
      default: 'longTermRelationship',
    },
    drinking: {
      type: String,
      enum: HABIT_ENUM,
      default: null,
    },
    smoking: {
      type: String,
      enum: HABIT_ENUM,
      default: null,
    },
    // Privacy settings (B2)
    hideProfile: {
      type: Boolean,
      default: false,
    },
    locationDiscoveryEnabled: {
      type: Boolean,
      default: true,
    },
    // Crossed Paths settings (B8)
    recordingEnabled: {
      type: Boolean,
      default: true,
    },
    // Discovery & Swiping (B3)
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    passes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    actedOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Refresh Tokens & Auth
    refreshTokens: [
      {
        tokenHash: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
      },
    ],
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    deviceTokens: [{ type: String }],
    isActive: { type: Boolean, default: true },
    lastActive: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.otpCode;
        delete ret.otpExpires;
        delete ret.refreshTokens;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.location;
        delete ret.latitude;
        delete ret.longitude;
        delete ret.likes;
        delete ret.passes;
        delete ret.actedOn;
        delete ret.blockedUsers;
        return ret;
      },
    },
  }
);

// Pre-save hook: Hash password and auto-calculate age from dateOfBirth
userSchema.pre('save', async function () {
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (this.isModified('dateOfBirth') && this.dateOfBirth) {
    const diffMs = Date.now() - new Date(this.dateOfBirth).getTime();
    const ageDate = new Date(diffMs);
    this.age = Math.abs(ageDate.getUTCFullYear() - 1970);
  }
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
