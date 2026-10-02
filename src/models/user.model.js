import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
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
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Please provide your date of birth'],
    },
    age: {
      type: Number,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: [true, 'Please specify your gender'],
    },
    genderPreference: {
      type: String,
      enum: ['male', 'female', 'everyone'],
      default: 'everyone',
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      default: 'Gandhinagar',
      trim: true,
    },
    state: {
      type: String,
      default: 'Gujarat',
    },
    // GeoJSON Point location for distance filtering
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [72.6369, 23.2156], // Default Gandhinagar coordinates
      },
    },
    isCityVerified: {
      type: Boolean,
      default: true,
    },
    bio: {
      type: String,
      default: '',
      maxLength: [500, 'Bio cannot exceed 500 characters'],
    },
    photos: {
      type: [String], // Array of uploaded image URLs (max 6)
      default: [],
    },
    interests: {
      type: [String], // e.g. ["Coffee", "Music", "Fitness", "Travel", "Foodie"]
      default: [],
    },
    datingIntent: {
      type: String,
      enum: [
        'Long-term relationship',
        'Casual dating',
        'Coffee date',
        'Making new friends',
        'Not sure yet',
      ],
      default: 'Coffee date',
    },
    // Subscription & Plan Limits (Free vs ₹39 Premium)
    plan: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
    },
    planExpiresAt: {
      type: Date,
      default: null,
    },
    dailySwipeCount: {
      type: Number,
      default: 0,
    },
    dailySuperLikeCount: {
      type: Number,
      default: 0,
    },
    lastSwipeResetDate: {
      type: Date,
      default: Date.now,
    },
    // Swiping Tracking
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    superLikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    passes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Tracks only the immediate last swipe for 1-step Rewind/Undo
    lastSwipedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    matches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Safety & Moderation
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    reportedUsers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.likes;
        delete ret.superLikes;
        delete ret.passes;
        delete ret.blockedUsers;
        delete ret.reportedUsers;
        delete ret.lastSwipedUser;
        return ret;
      },
    },
  }
);

// Create 2dsphere index on location field for GeoSpatial distance queries
userSchema.index({ location: '2dsphere' });

// Pre-save hook: Hash password and auto-calculate age from dateOfBirth
userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (this.isModified('dateOfBirth') && this.dateOfBirth) {
    const diffMs = Date.now() - new Date(this.dateOfBirth).getTime();
    const ageDate = new Date(diffMs);
    this.age = Math.abs(ageDate.getUTCFullYear() - 1970);
  }
});

// Method to check password match
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
