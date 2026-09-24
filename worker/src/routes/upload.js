/**
 * File upload route handlers using Cloudinary.
 *
 * Browser → Cloudflare Worker → Cloudinary REST API
 * Credentials never leave the Worker.
 */
import { uploadToCloudinary, deleteFromCloudinary, getResourceTypeForExtension } from '../services/cloudinary.js';
import { success, error } from '../utils/helpers.js';
import { verifyToken } from '../utils/auth.js';

const ALLOWED_IMAGE = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'
]);
const ALLOWED_VIDEO = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/ogg'
]);
const ALLOWED_AUDIO = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac'
]);
const ALLOWED_MIME = new Set([...ALLOWED_IMAGE, ...ALLOWED_VIDEO, ...ALLOWED_AUDIO]);

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function getFileType(mimetype) {
  if (ALLOWED_IMAGE.has(mimetype)) return 'image';
  if (ALLOWED_VIDEO.has(mimetype)) return 'video';
  if (ALLOWED_AUDIO.has(mimetype)) return 'audio';
  return 'file';
}

function getExtension(filename) {
  const parts = String(filename).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export async function handleUpload(db, env, route, method, body, p, request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7), env.JWT_SECRET);
    if (!payload) return error('Unauthorized', 401);
  }

  // POST /api/upload — general media upload
  if (route === '/upload' && method === 'POST') {
    const formData = await request.formData().catch(() => null);
    if (!formData) return error('No form data provided');

    const file = formData.get('file');
    if (!file) return error('No file provided');

    const filename = file.name || 'upload';
    const mimetype = file.type || 'application/octet-stream';
    const fileBuffer = await file.arrayBuffer();

    if (fileBuffer.byteLength === 0) return error('Empty file');
    if (fileBuffer.byteLength > MAX_FILE_SIZE) return error('File too large (max 100 MB)');
    if (!ALLOWED_MIME.has(mimetype)) {
      return error('Unsupported file type. Allowed: images, videos, audio.');
    }

    try {
      const uploaded = await uploadToCloudinary(
        fileBuffer, filename, mimetype,
        { folder: 'csa_media' }, env
      );

      return success({
        message: 'File uploaded successfully',
        file: {
          filename: uploaded.fileName,
          originalname: uploaded.originalName,
          path: uploaded.url,
          size: uploaded.size,
          type: uploaded.type,
          icon: uploaded.type,
          mimetype: uploaded.mimetype,
          url: uploaded.url,
          publicId: uploaded.publicId
        }
      });
    } catch (err) {
      console.error('Upload error:', err);
      return error(err.message || 'Upload failed', 500);
    }
  }

  // POST /api/upload/hero-video — upload hero video to content CMS
  if (route === '/upload/hero-video' && method === 'POST') {
    const formData = await request.formData().catch(() => null);
    if (!formData) return error('No form data provided');

    const file = formData.get('file');
    if (!file) return error('No video file provided');

    const filename = file.name || 'hero-video';
    const mimetype = file.type || 'video/mp4';
    const fileBuffer = await file.arrayBuffer();

    if (!ALLOWED_VIDEO.has(mimetype)) {
      return error('Only video files are allowed for hero video');
    }
    if (fileBuffer.byteLength > MAX_FILE_SIZE) {
      return error('Video too large (max 100 MB)');
    }

    try {
      const uploaded = await uploadToCloudinary(
        fileBuffer, filename, mimetype,
        { folder: 'csa_hero', publicId: 'hero_video' }, env
      );

      // Store URL in content CMS
      const today = new Date().toISOString();
      const contentColl = db.collection('contents');
      const existing = await contentColl.findOne({ section_key: 'main' });

      if (existing) {
        const content = typeof existing.content === 'string'
          ? JSON.parse(existing.content)
          : existing.content;
        content.heroVideo = uploaded.url;
        await contentColl.updateOne(
          { section_key: 'main' },
          { $set: { content: JSON.stringify(content), updated_at: today } }
        );
      } else {
        await contentColl.insertOne({
          section_key: 'main',
          content: JSON.stringify({ heroVideo: uploaded.url }),
          created_at: today,
          updated_at: today
        });
      }

      return success({
        message: 'Hero video uploaded successfully!',
        file: {
          filename: uploaded.fileName,
          originalname: uploaded.originalName,
          path: uploaded.url,
          size: uploaded.size,
          type: 'video',
          mimetype: uploaded.mimetype,
          url: uploaded.url,
          publicId: uploaded.publicId
        }
      });
    } catch (err) {
      console.error('Hero video upload error:', err);
      return error(err.message || 'Upload failed', 500);
    }
  }

  return null;
}
