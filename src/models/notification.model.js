import mongoose from 'mongoose';
import { NOTIFICATION_TYPE_ENUM } from '../utils/shared.utils.js';

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPE_ENUM,
      required: true,
    },
    eventId: {
      type: String,
      unique: true,
      sparse: true,
    },
    profileId: {
      type: String,
      default: null,
    },
    matchId: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 30 * 86400, // 30-day retention
    },
  },
  {
    timestamps: true,
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

const notificationPrefSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  likes: { type: Boolean, default: true },
  matches: { type: Boolean, default: true },
  messages: { type: Boolean, default: true },
  icebreakers: { type: Boolean, default: true },
});

export const AppNotification = mongoose.model('AppNotification', notificationSchema);
export const NotificationPreference = mongoose.model('NotificationPreference', notificationPrefSchema);
