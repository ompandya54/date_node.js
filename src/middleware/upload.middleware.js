import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { isCloudinaryReady, createCloudinaryStorage } from '../utils/cloudinary.js';

let storage;

if (isCloudinaryReady()) {
  // 1. Production Secure Cloud Storage (Cloudinary CDN via Utils)
  storage = createCloudinaryStorage('gandhinagar_dating/photos');
  console.log('[Upload Middleware] Active Storage Engine: Cloudinary CDN ☁️');
} else {
  // 2. Fallback Local Disk Storage
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `photo-${uniqueSuffix}${ext}`);
    },
  });
  console.log('[Upload Middleware] Active Storage Engine: Local Server Disk 📂');
}

// File Filter Validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif/;
  const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeType = allowedTypes.test(file.mimetype);

  if (extName && mimeType) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png, webp, gif) are allowed!'), false);
  }
};

export const uploadPhotos = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max per photo
  fileFilter,
});
