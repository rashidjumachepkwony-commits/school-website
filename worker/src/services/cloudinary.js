/**
 * Cloudinary storage service for Cloudflare Worker.
 *
 * Uploads files via the Cloudinary REST API from the Worker (server-side),
 * keeping credentials private. Uses resource_type=auto to handle
 * images, videos, audio, and raw files (PDF, DOCX, XLSX, etc.).
 */

const UPLOAD_URL = 'https://api.cloudinary.com/v1_1';
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;  // 100 MB free tier limit
const MAX_GENERAL_SIZE = 100 * 1024 * 1024;
const MAX_ASSIGNMENT_SIZE = 100 * 1024 * 1024;

const ALLOWED_IMAGE = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'
]);
const ALLOWED_VIDEO = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/ogg', 'video/x-msvideo'
]);
const ALLOWED_AUDIO = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac'
]);
const ALLOWED_DOCUMENT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-rar-compressed'
]);

function getResourceKind(mimetype) {
  if (ALLOWED_IMAGE.has(mimetype)) return 'image';
  if (ALLOWED_VIDEO.has(mimetype)) return 'video';
  if (ALLOWED_AUDIO.has(mimetype)) return 'raw';
  if (ALLOWED_DOCUMENT.has(mimetype)) return 'raw';
  return 'raw';
}

function getFriendlyType(mimetype) {
  if (ALLOWED_IMAGE.has(mimetype)) return 'image';
  if (ALLOWED_VIDEO.has(mimetype)) return 'video';
  if (ALLOWED_AUDIO.has(mimetype)) return 'audio';
  return 'file';
}

function getExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getMimeType(ext) {
  const map = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4',
    mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm'
  };
  return map[ext] || 'application/octet-stream';
}

export async function uploadToCloudinary(fileBuffer, filename, mimetype, opts = {}, env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured');
  }

  const ext = getExtension(filename);
  const contentType = mimetype || getMimeType(ext) || 'application/octet-stream';
  const resourceType = getResourceKind(contentType);
  const friendlyType = getFriendlyType(contentType);

  const folder = opts.folder || 'csa_uploads';
  const publicId = opts.publicId || `${folder}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // Build form-data for Cloudinary signed upload
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: contentType }), filename);
  formData.append('upload_preset', '');
  formData.append('folder', folder);
  formData.append('resource_type', resourceType);
  formData.append('public_id', publicId);

  // Sign: API requires timestamp, API key, and signature
  const timestamp = Math.floor(Date.now() / 1000);
  formData.append('timestamp', String(timestamp));

  // Build signature: sort all string params alphabetically, join k=v, append api_secret, sha256
  const signatureParts = [];
  const formEntries = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && value && key !== 'file') {
      formEntries.push({ key, value });
    }
  }
  formEntries.sort((a, b) => a.key.localeCompare(b.key));
  for (const { key, value } of formEntries) {
    signatureParts.push(`${key}=${value}`);
  }
  signatureParts.push(`timestamp=${timestamp}`);

  const signatureString = signatureParts.join('&') + apiSecret;
  const signature = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signatureString));
  const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  formData.append('signature', sigHex);
  formData.append('api_key', apiKey);

  const uploadUrl = `${UPLOAD_URL}/${cloudName}/upload`;
  const response = await fetch(uploadUrl, { method: 'POST', body: formData });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Cloudinary upload failed: ${response.status} ${errBody}`);
  }

  const result = await response.json();

  const secureUrl = result.secure_url || result.url;
  const fileExt = ext || getExtension(result.original_filename || filename);

  return {
    publicId: result.public_id,
    url: secureUrl,
    fileName: filename,
    originalName: result.original_filename || filename,
    size: result.bytes || fileBuffer.byteLength,
    type: friendlyType,
    mimetype: contentType,
    format: result.format,
    resourceType: result.resource_type,
    extension: fileExt,
    width: result.width || null,
    height: result.height || null,
    duration: result.duration || null
  };
}

export async function deleteFromCloudinary(publicId, resourceType = 'raw', env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured');
  }

  const destroyUrl = `${UPLOAD_URL}/${cloudName}/${resourceType}/destroy`;
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const sig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(toSign));
  const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', apiKey);
  formData.append('signature', signature);
  formData.append('resource_type', resourceType);

  const response = await fetch(destroyUrl, { method: 'POST', body: formData });
  return { ok: response.ok, status: response.status };
}

export function getResourceTypeForExtension(ext) {
  const e = ext.toLowerCase();
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv', 'txt'].includes(e)) {
    return 'raw';
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(e)) {
    return 'image';
  }
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'mpg', 'mpeg'].includes(e)) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a', 'wma'].includes(e)) {
    return 'raw';
  }
  return 'raw';
}

export {
  MAX_VIDEO_SIZE,
  MAX_GENERAL_SIZE,
  MAX_ASSIGNMENT_SIZE,
  ALLOWED_IMAGE,
  ALLOWED_VIDEO,
  ALLOWED_AUDIO,
  ALLOWED_DOCUMENT,
  getResourceKind,
  getFriendlyType,
  getExtension
};
