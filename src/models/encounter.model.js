import mongoose from 'mongoose';

const encounterSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    otherUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    crossedAt: {
      type: Date,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // 24 hours TTL
    },
    seen: {
      type: Boolean,
      default: false,
    },
    interestExpressed: {
      type: Boolean,
      default: false,
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

// Compound index to avoid duplicate encounters within same hour
encounterSchema.index({ ownerUserId: 1, otherUserId: 1, crossedAt: 1 }, { unique: true });

const Encounter = mongoose.model('Encounter', encounterSchema);
export default Encounter;
