import mongoose from 'mongoose';
import { PLACE_CATEGORY_ENUM } from '../utils/shared.utils.js';

const placeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, enum: PLACE_CATEGORY_ENUM, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  {
    toJSON: {
      transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        delete ret.latitude;
        delete ret.longitude;
        return ret;
      },
    },
  }
);

const placeConsentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  type: { type: String, default: 'place' },
  acknowledgedAt: { type: Date, default: Date.now },
});

const placeSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    placeId: { type: String, required: true },
    placeName: { type: String, required: true },
    category: { type: String, enum: PLACE_CATEGORY_ENUM, required: true },
    durationMinutes: { type: Number, enum: [30, 60, 120], required: true },
    verified: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  {
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const Place = mongoose.model('Place', placeSchema);
export const PlaceConsent = mongoose.model('PlaceConsent', placeConsentSchema);
export const PlaceSession = mongoose.model('PlaceSession', placeSessionSchema);
