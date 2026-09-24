/**
 * Holiday Assignment management route handlers.
 * Uploads files to Cloudinary; metadata stored in Supabase.
 * File paths stored as Cloudinary URLs (no local disk).
 */
import { success, error } from '../utils/helpers.js';
import { verifyToken } from '../utils/auth.js';
import { uploadToCloudinary, deleteFromCloudinary, getResourceTypeForExtension, MAX_ASSIGNMENT_SIZE } from '../services/cloudinary.js';

const ALLOWED_ASSIGNMENT_MIME = new Set([
  'application/pdf',
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
    if (!file) return error('Please select a file to upload');

    const filename = file.name || 'assignment';
    const ext = getExtension(filename);
    const mimetype = file.type || 'application/octet-stream';
    const fileBuffer = await file.arrayBuffer();

    if (fileBuffer.byteLength === 0) return error('Empty file');
    if (fileBuffer.byteLength > MAX_ASSIGNMENT_SIZE) return error('File too large (max 50 MB)');
    if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_ASSIGNMENT_MIME.has(mimetype)) {
      return error('Only PDF, Word, Excel, PowerPoint and image files are allowed');
    }

    try {
      const resourceType = getResourceTypeForExtension(ext);
      const uploaded = await uploadToCloudinary(
        fileBuffer, filename, mimetype,
        { folder: 'csa_assignments', publicId: `assignment_${Date.now()}_${ext}` }, env
      );

      const result = await db.collection('holidayassignments').insertOne({
        title, grade, subject, description, uploadedBy,
        fileName: uploaded.fileName,
        fileType: ext,
        fileSize: uploaded.size,
        filePath: uploaded.url,
        filePublicId: uploaded.publicId,
        fileResourceType: resourceType,
        isActive: true,
        createdAt: now,
        updatedAt: now
      });

      return success({
        message: 'Assignment uploaded successfully!',
        assignment: {
          _id: result.insertedId.toString(),
          title, grade, subject, description, uploadedBy,
          fileName: uploaded.fileName,
          fileType: ext,
          fileSize: uploaded.size,
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
    if (!assignment || !assignment.filePath) return error('Assignment file not found', 404);

    const headers = new Headers();
    headers.set('Location', assignment.filePath);
    headers.set('Content-Disposition', `attachment; filename="${assignment.fileName || 'assignment'}"`);
    return new Response(null, { status: 302, headers });
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

      try {
        const resourceType = getResourceTypeForExtension(ext);
        const uploaded = await uploadToCloudinary(
          fileBuffer, filename, mimetype,
          { folder: 'csa_assignments', publicId: `assignment_${Date.now()}_${ext}` }, env
        );

        // Update DB fields first
        updates.fileName = uploaded.fileName;
        updates.fileType = ext;
        updates.fileSize = uploaded.size;
        updates.filePath = uploaded.url;
        updates.filePublicId = uploaded.publicId;
        updates.fileResourceType = resourceType;

        // Delete old file from Cloudinary (best-effort, non-blocking)
        if (assignment.filePublicId && assignment.fileResourceType) {
          try {
            await deleteFromCloudinary(
              assignment.filePublicId,
              assignment.fileResourceType,
              env
            );
          } catch (delErr) {
            console.error('Old file deletion failed (non-fatal):', delErr.message);
          }
        }
      } catch (err) {
        console.error('Replacement upload error:', err);
        return error(err.message || 'Upload failed', 500);
      }
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
    if (assignment.filePublicId && assignment.fileResourceType) {
      try {
        await deleteFromCloudinary(
          assignment.filePublicId,
          assignment.fileResourceType,
          env
        );
      } catch (delErr) {
        console.error('File deletion failed (non-fatal):', delErr.message);
      }
    }

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
    uploadedBy: a.uploadedBy, isActive: a.isActive !== false,
    createdAt: a.createdAt, updatedAt: a.updatedAt
  };
}
