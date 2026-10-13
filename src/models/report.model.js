import mongoose from 'mongoose';
import { REPORT_REASON_ENUM } from '../utils/shared.utils.js';

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reportedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: REPORT_REASON_ENUM,
      required: true,
    },
    details: {
      type: String,
      default: '',
      maxLength: 500,
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved'],
      default: 'pending',
    },
    evidenceSnapshot: {
      reportedProfile: { type: Object, default: null },
      recentMessages: { type: Array, default: [] },
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 180 * 86400, // 180 days retention
    },
  },
  { timestamps: true }
);

const Report = mongoose.model('Report', reportSchema);
export default Report;
