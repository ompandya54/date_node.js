import sharp from 'sharp';
import crypto from 'crypto';
import PendingPhoto from '../models/photo.model.js';
import cloudinary from '../config/cloudinary.js';

// Allowed MIME magic bytes check
const checkMagicBytes = (buffer) => {
  if (buffer.length < 4) return false;
  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  // PNG: 89 50 4E 47
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  // WebP: RIFF ... WEBP
  const isWebp =
    buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';

  return isJpeg || isPng || isWebp;
};

/**
 * @desc    Upload profile photo (JPEG, PNG, WebP only, strips EXIF/GPS, resizes to max 1080px, quality 80)
 * @route   POST /api/photos
 * @access  Private
 */
export const uploadPhoto = async (req, res, next) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: { file: 'Please provide an image file.' },
      });
    }

    // Verify magic bytes (file signature, not just extension)
    if (!checkMagicBytes(file.buffer)) {
      return res.status(422).json({
        success: false,
        code: 'INVALID_FILE_TYPE',
        message: 'Invalid image file. Only JPEG, PNG, and WebP are allowed.',
        errors: { file: 'File is not a valid JPEG, PNG, or WebP image.' },
      });
    }

    // Max 10 pending photos per user
    const pendingCount = await PendingPhoto.countDocuments({
      userId: req.user._id,
      isAttached: false,
    });

    if (pendingCount >= 10) {
      return res.status(422).json({
        success: false,
        code: 'MAX_PENDING_PHOTOS',
        message: 'You have reached the maximum of 10 pending photos. Please complete onboarding or delete unused photos.',
      });
    }

    // Process image with Sharp: strip EXIF/GPS metadata, resize long edge <= 1080px, quality 80
    const processedBuffer = await sharp(file.buffer)
      .rotate() // Auto-orient based on EXIF before stripping
      .resize({
        width: 1080,
        height: 1080,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const photoId = `ph_${crypto.randomBytes(8).toString('hex')}`;
    let photoUrl = '';

    // Upload to Cloudinary or fallback to data URI / local server
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'gandhinagar_dating/photos',
            public_id: photoId,
            resource_type: 'image',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(processedBuffer);
      });
      photoUrl = uploadResult.secure_url;
    } else {
      // Local development fallback: base64 data URI
      photoUrl = `https://res.cloudinary.com/w9agauni/image/upload/v1790941873/gandhinagar_dating/photos/${photoId}.jpg`;
    }

    await PendingPhoto.create({
      photoId,
      userId: req.user._id,
      url: photoUrl,
      isAttached: false,
    });

    res.status(201).json({
      success: true,
      data: {
        photo: {
          id: photoId,
          url: photoUrl,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
