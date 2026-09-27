/**
 * Holiday Assignment management route handlers.
 * Uploads files to Cloudinary; metadata stored in Supabase.
 * File paths stored as Cloudinary URLs (no local disk).
 */
import { success, error } from '../utils/helpers.js';
import { verifyToken } from '../utils/auth.js';
import { uploadToCloudinary, deleteFromCloudinary, getResourceTypeForExtension, MAX_ASSIGNMENT_SIZE } from '../services/cloudinary.js';
import { hasCloudinary, uploadToSupabaseStorage, deleteFromSupabaseStorage } from '../services/storage.service.js';

/**
 * Remove an assignment's stored file from whichever provider holds it.
 * Never throws: a failed cleanup must not block replacing or deleting the
 * assignment record itself.
 */
async function removeStoredFile(assignment, env) {
  if (!assignment || !assignment.filePublicId) return;
  try {
    if (assignment.storageProvider === 'supabase' || !assignment.fileResourceType) {
      await deleteFromSupabaseStorage(assignment.filePublicId, env);
    } else {
      await deleteFromCloudinary(assignment.filePublicId, assignment.fileResourceType, env);
    }
  } catch (err) {
    console.error('File deletion failed (non-fatal):', err.message);
  }
}

const ALLOWED_ASSIGNMENT_MIME = new Set([  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'jpg', 'jpeg', 'png', 'webp'
]);

function getExtension(filename) {
  const parts = String(filename).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export async function handleHolidayAssignments(db, env, route, method, body, p, request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7), env.JWT_SECRET);
    if (!payload) return error('Unauthorized', 401);
  }
  const now = new Date().toISOString();

  // POST /api/holiday-assignments — upload new assignment
  // GET /api/holiday-assignments - list every active assignment.
  // (Without this the bare path fell through to the worker's
  // "Endpoint under construction" reply and the admin screens showed nothing.)
  if (route === '/holiday-assignments' && method === 'GET') {
    const params = new URL(request.url).searchParams;
    const grade = params.get('grade') || '';
    const term = params.get('term') || '';
    const query = { isActive: { $ne: false } };
    if (grade) query.grade = grade;
    if (term) query.term = term;
    const rows = await db.collection('holidayassignments')
      .find(query)
      .sort({ uploadedAt: -1, createdAt: -1 }).toArray();
    return success({ assignments: serializeList(rows), total: rows.length });
  }

  // GET /api/holiday-assignments - POST
  if (route === '/holiday-assignments' && method === 'POST') {
    const formData = await request.formData().catch(() => null);
    if (!formData) return error('No form data provided');

    const title = (formData.get('title') || '').trim();
    const grade = (formData.get('grade') || '').trim();
    const subject = (formData.get('subject') || '').trim();
    const description = (formData.get('description') || '').trim();
    const uploadedBy = formData.get('uploadedBy') || formData.get('uploaded_by') || 'Admin';

    if (!title) return error('Title is required');
    if (!grade) return error('Grade is required');

    const file = formData.get('file');

    if (!file) {
      // A written-only assignment (no attachment). This keeps holiday work
      // usable even when file storage is not configured, instead of forcing
      // the teacher to attach a file they do not have.
      const result = await db.collection('holidayassignments').insertOne({
        title, grade, subject, description, uploadedBy,
        fileName: '', fileType: '', fileSize: 0,
        filePath: '', filePublicId: '', fileResourceType: '',
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
      return success({
        message: 'Assignment saved successfully!',
        assignment: {
          _id: result.insertedId.toString(),
          title, grade, subject, description, uploadedBy,
          fileName: '', isActive: true, createdAt: now
        }
      });
    }

    const filename = file.name || 'assignment';
    const ext = getExtension(filename);
    const mimetype = file.type || 'application/octet-stream';
    const fileBuffer = await file.arrayBuffer();

    if (fileBuffer.byteLength === 0) return error('Empty file');
    if (fileBuffer.byteLength > MAX_ASSIGNMENT_SIZE) return error('File too large (max 50 MB)');
    if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_ASSIGNMENT_MIME.has(mimetype)) {
      return error('Only PDF, Word, Excel, PowerPoint and image files are allowed');
    }

    const resourceType = getResourceTypeForExtension(ext);
    let uploaded;
    try {
      // Cloudinary when it is configured, otherwise Supabase Storage, so an
      // upload never fails just because Cloudinary was never set up.
      if (hasCloudinary(env)) {
        uploaded = await uploadToCloudinary(
          fileBuffer, filename, mimetype,
          { folder: 'csa_assignments', publicId: `assignment_${Date.now()}_${ext}` }, env
        );
      } else {
        uploaded = await uploadToSupabaseStorage(
          fileBuffer, filename, mimetype, { folder: 'csa_assignments' }, env
        );
      }
    } catch (uploadErr) {
      return error('Upload failed: ' + uploadErr.message);
    }

    try {
      const result = await db.collection('holidayassignments').insertOne({
        title, grade, subject, description, uploadedBy,
        fileName: uploaded.fileName || filename,
        fileType: ext,
        fileSize: uploaded.size || fileBuffer.byteLength,
        filePath: uploaded.url,
        filePublicId: uploaded.publicId,
        fileResourceType: resourceType,
        storageProvider: uploaded.provider || 'cloudinary',
        isActive: true,
        createdAt: now,
        updatedAt: now
      });

      return success({
        message: 'Assignment uploaded successfully!',
        assignment: {
          _id: result.insertedId.toString(),
          title, grade, subject, description, uploadedBy,
          fileName: uploaded.fileName || filename,
            fileType: ext,
            fileSize: uploaded.size || fileBuffer.byteLength,
            filePath: uploaded.url,
          filePublicId: uploaded.publicId,
          isActive: true,
          createdAt: now
        }
      });
    } catch (err) {
      console.error('Holiday assignment upload error:', err);
      return error(err.message || 'Upload failed', 500);
    }
  }

  // GET /api/holiday-assignments/all
  if (route === '/holiday-assignments/all' && method === 'GET') {
    const assignments = await db.collection('holidayassignments')
      .find({}).sort({ createdAt: -1 }).toArray();
    return success({ assignments: serializeList(assignments) });
  }

  // GET /api/holiday-assignments/id/:id
  if (p[0] === 'holiday-assignments' && p[1] === 'id' && p[2] && method === 'GET') {
    const assignment = await db.collection('holidayassignments').findOne({ _id: p[2] });
    if (!assignment) return error('Assignment not found', 404);
    return success({ assignment: serializeOne(assignment) });
  }

  // GET /api/holiday-assignments/download/:id — redirect to Cloudinary URL
  if (p[0] === 'holiday-assignments' && p[1] === 'download' && p[2] && method === 'GET') {
    const assignment = await db.collection('holidayassignments').findOne({ _id: p[2] });
    if (!assignment) return error('Assignment not found', 404);

    // With an uploaded file, hand back the stored location.
    if (assignment.filePath) {
      const headers = new Headers();
      headers.set('Location', assignment.filePath);
      headers.set('Content-Disposition', `attachment; filename="${assignment.fileName || 'assignment'}"`);
      return new Response(null, { status: 302, headers });
    }

    // No file was attached, so build a printable sheet from the assignment
    // text instead of failing. This keeps "download" useful even when file
    // storage is not configured.
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
    const title = assignment.title || 'Holiday Assignment';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
@page{size:A4 portrait;margin:18mm}
body{font-family:"Segoe UI",Arial;margin:0;padding:26px;color:#12233f;line-height:1.6}
.sheet{max-width:760px;margin:0 auto;border:1px solid #cfd8e6;padding:28px 32px}
.hd{text-align:center;border-bottom:3px solid #d4a017;padding-bottom:14px;margin-bottom:18px}
.hd h1{margin:0;font-size:20px;color:#0a1628}
.hd .sub{font-size:11px;letter-spacing:2px;color:#5a6b85;text-transform:uppercase;margin-top:4px}
.meta{display:flex;flex-wrap:wrap;gap:6px 22px;padding:11px 14px;background:#f7f9fc;border:1px solid #e3e9f2;border-radius:8px;font-size:12px;margin-bottom:16px}
.meta b{margin-right:5px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.5px;color:#0b5394;margin:18px 0 6px}
.desc{font-size:13.5px;white-space:pre-wrap}
.rule{margin-top:26px;padding-top:10px;border-top:1px solid #e3e9f2;font-size:11px;color:#8a97ab}
.line{margin-top:34px}
.line div{border-bottom:1px solid #b9c4d4;height:30px}
.btn{display:inline-block;background:#d4a017;color:#12233f;border:0;border-radius:7px;padding:9px 18px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;margin-bottom:16px}
@media print{.btn{display:none}}
</style></head><body>
<button class="btn" onclick="window.print()">Print / Save as PDF</button>
<div class="sheet">
  <div class="hd"><h1>${esc(title)}</h1>
  <div class="sub">Changara Star Academy &middot; Holiday Assignment</div></div>
  <div class="meta">
    <div><b>Class:</b> ${esc(assignment.grade || '-')}</div>
    <div><b>Subject:</b> ${esc(assignment.subject || '-')}</div>
    <div><b>Term:</b> ${esc(assignment.term || '-')}</div>
    <div><b>Set by:</b> ${esc(assignment.uploadedBy || 'Class Teacher')}</div>
  </div>
  <h2>What to do</h2>
  <div class="desc">${esc(assignment.description || 'Please ask your class teacher for the details of this assignment.')}</div>
  <div class="line"><div></div><div></div><div></div><div></div><div></div></div>
  <div class="rule">Generated ${esc(new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }))}</div>
</div></body></html>`;
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${(assignment.title || 'assignment').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html"`
      }
    });
  }

  // GET /api/holiday-assignments/:grade
  if (p[0] === 'holiday-assignments' && p[1] && p[1] !== 'all' && !p[2] && method === 'GET') {
    const grade = decodeURIComponent(p[1]);
    const assignments = await db.collection('holidayassignments')
      .find({ grade, isActive: true }).sort({ createdAt: -1 }).toArray();
    return success({ assignments: serializeList(assignments) });
  }

  // PUT /api/holiday-assignments/:id
  if (p[0] === 'holiday-assignments' && p[1] && method === 'PUT') {
    const formData = await request.formData().catch(() => null);
    if (!formData) return error('No form data provided');

    const assignment = await db.collection('holidayassignments').findOne({ _id: p[1] });
    if (!assignment) return error('Assignment not found', 404);

    const updates = {};

    const title = (formData.get('title') || '').trim();
    const grade = (formData.get('grade') || '').trim();
    const subject = (formData.get('subject') || '').trim();
    const description = (formData.get('description') || '').trim();
    const isActive = formData.get('isActive');

    if (title) updates.title = title;
    if (grade) updates.grade = grade;
    if (subject !== null && subject !== undefined) updates.subject = subject;
    if (description !== null && description !== undefined) updates.description = description;
    if (isActive !== null && isActive !== undefined) updates.isActive = String(isActive) === 'true';
    updates.updatedAt = now;

    // Handle file replacement
    const file = formData.get('file');
    if (file) {
      const filename = file.name || 'assignment';
      const ext = getExtension(filename);
      const mimetype = file.type || 'application/octet-stream';
      const fileBuffer = await file.arrayBuffer();

      if (fileBuffer.byteLength === 0) return error('Empty file');
      if (fileBuffer.byteLength > MAX_ASSIGNMENT_SIZE) return error('File too large (max 50 MB)');
      if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_ASSIGNMENT_MIME.has(mimetype)) {
        return error('Only PDF, Word, Excel, PowerPoint and image files are allowed');
      }

      const resourceType = getResourceTypeForExtension(ext);
      let uploaded;
      try {
        if (hasCloudinary(env)) {
          uploaded = await uploadToCloudinary(
            fileBuffer, filename, mimetype,
            { folder: 'csa_assignments', publicId: `assignment_${Date.now()}_${ext}` }, env
          );
        } else {
          uploaded = await uploadToSupabaseStorage(
            fileBuffer, filename, mimetype, { folder: 'csa_assignments' }, env
          );
        }
      } catch (uploadErr) {
        return error('Upload failed: ' + uploadErr.message);
      }

      // Update DB fields first
      updates.fileName = uploaded.fileName || filename;
      updates.fileType = ext;
      updates.fileSize = uploaded.size || fileBuffer.byteLength;
      updates.filePath = uploaded.url;
      updates.filePublicId = uploaded.publicId;
      updates.fileResourceType = resourceType;
      updates.storageProvider = uploaded.provider || 'cloudinary';

      // Delete the old file from whichever store kept it (best-effort).
      await removeStoredFile(assignment, env);
    }

    await db.collection('holidayassignments').updateOne(
      { _id: p[1] },
      { $set: updates }
    );

    const updated = { ...assignment, ...updates };
    return success({
      message: 'Assignment updated successfully!',
      assignment: serializeOne(updated)
    });
  }

  // DELETE /api/holiday-assignments/:id
  if (p[0] === 'holiday-assignments' && p[1] && method === 'DELETE') {
    const reqUrl = new URL(request.url);
    if (reqUrl.searchParams.get('confirm') !== 'yes') {
      return error('Confirmation required. Add ?confirm=yes');
    }

    const assignment = await db.collection('holidayassignments').findOne({ _id: p[1] });
    if (!assignment) return error('Assignment not found', 404);

    // Delete file from Cloudinary (best-effort)
    await removeStoredFile(assignment, env);

    await db.collection('holidayassignments').deleteOne({ _id: p[1] });
    return success({ message: 'Assignment deleted successfully!' });
  }

  return null;
}

function serializeList(arr) {
  return arr.map(a => serializeOne(a));
}

function serializeOne(a) {
      return {
        _id: a._id?.toString(),
        title: a.title, grade: a.grade, subject: a.subject, description: a.description,
        fileName: a.fileName, fileType: a.fileType, fileSize: a.fileSize,
        filePath: a.filePath, filePublicId: a.filePublicId,
        // Aliases so every screen (admin list, manage page, student portal)
        // can rely on the same two fields.
        hasFile: !!a.filePath,
        fileUrl: a.filePath || '',
        storageProvider: a.storageProvider || '',
        term: a.term || '',
        uploadedBy: a.uploadedBy, isActive: a.isActive !== false,
        uploadedAt: a.uploadedAt || a.createdAt || null,
        createdAt: a.createdAt, updatedAt: a.updatedAt
      };
    }
