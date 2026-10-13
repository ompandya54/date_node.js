import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema(
  {
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    matchedAt: {
      type: Date,
      default: Date.now,
    },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    lastMessageText: {
      type: String,
      default: null,
    },
    lastMessageSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    icebreaker: {
      questionId: { type: String, default: null },
      answers: {
        type: Map,
        of: String,
        default: {},
      },
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

matchSchema.index({ users: 1 });

const Match = mongoose.model('Match', matchSchema);
export default Match;
