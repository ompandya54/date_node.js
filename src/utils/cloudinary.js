import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary SDK using secure Environment Variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Helper: Check if Cloudinary credentials are configured in .env
 * @returns {boolean}
 */
export const isCloudinaryReady = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
};

/**
 * Helper: Create Multer Cloudinary Storage Engine for streaming image uploads
 * @param {string} folderName Target folder name on Cloudinary CDN
 */
export const createCloudinaryStorage = (folderName = 'gandhinagar_dating/photos') => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folderName,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: [{ width: 1080, height: 1350, crop: 'limit', quality: 'auto' }],
    },
  });
};

/**
 * Helper: Manually upload a local file or buffer to Cloudinary
 * @param {string} filePath Local file path or base64 string
 * @param {string} folder Target folder name
 */
export const uploadToCloudinary = async (filePath, folder = 'gandhinagar_dating/photos') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      quality: 'auto',
      transformation: [{ width: 1080, height: 1350, crop: 'limit' }],
    });
    return result;
  } catch (error) {
    console.error('[Cloudinary Upload Error]:', error.message);
    throw error;
  }
};

/**
 * Helper: Delete an image from Cloudinary CDN by URL or public_id
 * @param {string} imagePathOrUrl Cloudinary image URL
 */
export const deleteFromCloudinary = async (imagePathOrUrl) => {
  try {
    if (!imagePathOrUrl || !imagePathOrUrl.includes('cloudinary.com')) return null;

    // Extract public_id from Cloudinary URL (e.g. gandhinagar_dating/photos/sample)
    const parts = imagePathOrUrl.split('/');
    const filenameWithExt = parts.pop();
    const uploadIndex = parts.indexOf('upload');
    const folderPath = parts.slice(uploadIndex + 2).join('/');
    const publicId = folderPath
      ? `${folderPath}/${filenameWithExt.split('.')[0]}`
      : filenameWithExt.split('.')[0];

    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`[Cloudinary Delete] Public ID removed: ${publicId}`);
    return result;
  } catch (error) {
    console.error('[Cloudinary Delete Error]:', error.message);
    return null;
  }
};

export default cloudinary;
