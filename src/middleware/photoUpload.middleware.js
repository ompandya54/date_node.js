import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import v2Cloudinary from '../utils/cloudinary.js';
import Photo from '../models/photo.model.js';

// Memory storage so sharp can inspect magic bytes & process buffer before saving
const memoryStorage = multer.memoryStorage();

export const uploadSinglePhoto = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single('file');

/**
 * Magic bytes signature check for JPEG, PNG, WebP
 */
export const verifyImageMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }

  // WebP: RIFF ... WEBP
  const header = buffer.toString('utf8', 0, 4);
  const type = buffer.toString('utf8', 8, 12);
  if (header === 'RIFF' && type === 'WEBP') {
    return true;
  }

  return false;
};

/**
 * Process image with sharp: strip EXIF/GPS metadata, resize long edge <= 1080px, quality 80
 */
export const processAndSavePhoto = async (req, res, buffer) => {
  // Re-encode & strip metadata
  const processedBuffer = await sharp(buffer)
    .rotate() // Auto-orient based on EXIF before stripping it
    .resize({
      width: 1080,
      height: 1080,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();

  const photoId = `ph_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let finalUrl = '';
  let cloudinaryPublicId = null;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const isCloudinaryConfigured = cloudName && apiKey && apiSecret && !cloudName.includes('your_');

  if (isCloudinaryConfigured) {
    // Upload processed buffer to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = v2Cloudinary.uploader.upload_stream(
        {
          folder: 'gandhinagar_dating/photos',
          public_id: photoId,
          resource_type: 'image',
          format: 'jpg',
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      uploadStream.end(processedBuffer);
    });

    finalUrl = uploadResult.secure_url;
    cloudinaryPublicId = uploadResult.public_id;
  } else {
    // Save locally to /uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${photoId}.jpg`;
    const filepath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(filepath, processedBuffer);

    // Build absolute URL
    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    finalUrl = `${protocol}://${host}/uploads/${filename}`;
  }

  // Create pending photo record
  const photo = await Photo.create({
    photoId,
    userId: req.user._id,
    url: finalUrl,
    cloudinaryPublicId,
    isPending: true,
    moderationStatus: 'approved',
  });

  return { id: photo.photoId, url: photo.url };
};
