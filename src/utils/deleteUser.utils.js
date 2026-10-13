import User from '../models/user.model.js';
import Photo from '../models/photo.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import UserAction from '../models/userAction.model.js';
import Block from '../models/block.model.js';
import { deletePhotoAsset } from '../controllers/photo.controller.js';

/**
 * Centralized idempotent user data cleanup handler (Document 0 & B1-B9)
 */
export const deleteUserData = async (userId) => {
  const user = await User.findById(userId);

  // 1. Clean up user photos (Cloudinary & Local disk)
  const userPhotos = await Photo.find({ userId });
  for (const photo of userPhotos) {
    await deletePhotoAsset(photo);
  }

  // 2. Clean up user actions (likes/passes in both directions)
  await UserAction.deleteMany({
    $or: [{ fromUserId: userId }, { toUserId: userId }],
  });

  // 3. Clean up blocks (in both directions)
  await Block.deleteMany({
    $or: [{ blockerId: userId }, { blockedId: userId }],
  });

  // 4. Clean up matches & messages
  const matches = await Match.find({ users: userId });
  const matchIds = matches.map((m) => m._id);

  if (matchIds.length > 0) {
    await Message.deleteMany({ matchId: { $in: matchIds } });
    await Match.deleteMany({ _id: { $in: matchIds } });
  }

  // 5. Remove user reference from all other user documents
  await User.updateMany(
    {},
    {
      $pull: {
        matches: userId,
        likes: userId,
        passes: userId,
        blockedUsers: userId,
      },
    }
  );

  // 6. Delete the User document itself
  if (user) {
    await User.findByIdAndDelete(userId);
  }

  return true;
};
