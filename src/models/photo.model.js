import mongoose from 'mongoose';

const pendingPhotoSchema = new mongoose.Schema(
  {
    photoId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
    },
    isAttached: {
      type: Boolean,
      default: false,
    },
    moderationStatus: {
      type: String,
      enum: ['approved', 'pending', 'flagged'],
      default: 'approved',
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // 24-hour TTL index for unattached photos
    },
  },
  { timestamps: true }
);

const PendingPhoto = mongoose.model('PendingPhoto', pendingPhotoSchema);
export default PendingPhoto;
