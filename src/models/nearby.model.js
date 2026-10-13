import mongoose from 'mongoose';

const nearbyConsentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  type: {
    type: String,
    default: 'nearby',
  },
  acknowledgedAt: {
    type: Date,
    default: Date.now,
  },
});

const nearbySessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cell: {
      type: String, // Coarse geohash precision 6 (~1.2km grid)
      required: true,
      index: true,
    },
    durationMinutes: {
      type: Number,
      enum: [30, 60, 120],
      required: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index auto-deletes when expiresAt is reached
    },
  },
  {
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.cell; // Never expose cell to clients
        return ret;
      },
    },
  }
);

export const NearbyConsent = mongoose.model('NearbyConsent', nearbyConsentSchema);
export const NearbySession = mongoose.model('NearbySession', nearbySessionSchema);
