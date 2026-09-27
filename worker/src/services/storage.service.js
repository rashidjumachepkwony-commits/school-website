/**
 * File storage.
 *
 * Cloudinary is the preferred store, but its credentials are optional in this
 * project and, when absent, every upload failed with
 * "Cloudinary credentials not configured". Supabase Storage is used as the
 * fallback so teachers can upload holiday assignments and media without any
 * extra account.
 *
 * Both helpers return the same shape:
 *   { path, url, publicId, resourceType, provider }
 */

const BUCKET = 'csa-uploads';

/** True when the Cloudinary credentials are present. */
export function hasCloudinary(env) {
  return !!(env?.CLOUDINARY_CLOUD_NAME && env?.CLOUDINARY_API_KEY && env?.CLOUDINARY_API_SECRET);
}

function supabaseConfig(env) {
  const url = (env?.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase storage is not configured');
  return { url, key };
}

/** Public URL for an object already in the bucket. */
export function supabasePublicUrl(env, path) {
  const { url } = supabaseConfig(env);
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Upload bytes to Supabase Storage, creating the public bucket on first use.
 * Returns the same shape as uploadToCloudinary so callers do not care which
 * provider stored the file.
 */
export async function uploadToSupabaseStorage(buffer, filename, mimetype, options = {}, env) {
  const { url, key } = supabaseConfig(env);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': mimetype || 'application/octet-stream',
    'x-upsert': 'true'
  };

  // Ensure the bucket exists; creating it is idempotent, and a 409 means it
  // is already there, which is fine.
  const createRes = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 52428800
    })
  });
  if (!createRes.ok && createRes.status !== 400 && createRes.status !== 409) {
    const errText = await createRes.text().catch(() => '');
    // 400/409 mean the bucket already exists, which is the normal case.
    if (createRes.status >= 500) {
      throw new Error(`Could not create the upload bucket (${createRes.status}): ${errText.slice(0, 150)}`);
    }
  }

  const folder = options.folder || 'csa';
  const safe = String(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;

  const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers,
    body: buffer
  });

  if (!up.ok) {
    const errText = await up.text().catch(() => '');
    throw new Error(`Supabase upload failed (${up.status}): ${errText.slice(0, 200)}`);
  }

  return {
    path,
    publicId: path,
    url: supabasePublicUrl(env, path),
    provider: 'supabase'
  };
}

/** Remove an object previously stored in Supabase Storage. */
export async function deleteFromSupabaseStorage(publicId, env) {
  if (!publicId) return false;
  const { url, key } = supabaseConfig(env);
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${publicId}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  return res.ok;
}
