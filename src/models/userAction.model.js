import mongoose from 'mongoose';

const userActionSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['like', 'pass'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

userActionSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });

const UserAction = mongoose.model('UserAction', userActionSchema);
export default UserAction;
