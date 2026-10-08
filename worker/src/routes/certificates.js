/**
 * Certificate Studio route handlers.
 *
 * Student data is sourced from the existing `students` table — no duplicate student DB.
 * School settings come from the `system_settings` table (key/value pattern).
 * Certificate records live in `graduation_certificates`.
 *
 * Public (no auth) endpoints:
 *   GET  /api/certificates/verify/:number   — verify a certificate number (public)
 *
 * Admin-only endpoints:
 *   GET  /api/certificates/classes                 — distinct classes/grades for the dropdown
 *   GET  /api/certificates/students                — search students by name/admission/class/stream
 *   GET  /api/certificates/students/class/:class   — students belonging to one class
 *   GET  /api/certificates/school-settings         — retrieve school settings
 *   PUT  /api/certificates/school-settings         — update school settings
 *   GET  /api/certificates/templates               — saved templates
 *   POST /api/certificates/templates               — save a new template
 *   POST /api/certificates/bulk-generate           — bulk-generate certificates for selected students
 *   POST /api/certificates/generate                 — single-student certificate generation
 *
 * Backwards-compatible PP2-only endpoints (kept for the legacy page):
 *   GET  /api/certificates/pp2/students
 *   GET  /api/certificates/pp2/student/:sid
 *   POST /api/certificates/pp2/generate
 *
 * All admin endpoints require a valid admin JWT.
 */
import { success, error } from '../utils/helpers.js';
import { authenticateRequest } from '../utils/auth.js';
import { getKenyaDate } from '../services/time.service.js';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default school settings used when the row has not been customised yet. */
function defaultSchoolSettings() {
  return {
    school_name: 'Changara Star Academy',
    school_motto: 'Assurance to Excellence',
    school_address: 'Changara, Kenya',
    school_phone: '+254 700 000 000',
    school_email: 'info@changarastaracademy.co.ke',
    school_logo: null,
    school_stamp: null,
    headteacher_name: 'Headteacher',
    website: 'https://www.changarastaracademy.co.ke'
  };
}

/** Normalise the various field names that student records may use. */
function publicStudent(s) {
  const firstName = s.firstName || s.first_name || s.firstname || '';
  const lastName = s.lastName || s.last_name || s.lastname || '';
  const fullName = (firstName + ' ' + lastName).trim() || s.fullName || s.name || '';
  const admissionNumber = s.admissionNumber || s.admission_number || s.admNo || s.id || s._id?.toString() || '';
  const stream = s.stream || s.streamId || s.sectionName || '';
  return {
    _id: s._id?.toString(),
    firstName,
    lastName,
    fullName,
    admissionNumber,
    studentId: admissionNumber,
    grade: s.grade || s.class || s.std || s.level || '',
    class: s.grade || s.class || s.std || s.level || '',
    stream,
    gender: s.gender || '',
    dateOfBirth: s.dateOfBirth || s.dob || '',
    photoUrl: s.photoUrl || s.photo || s.imageUrl || s.avatar || null,
    dateAdded: s.dateAdded || s.createdAt || null,
    status: s.status || 'ACTIVE',
    branch: s.branch || 'main'
  };
}

/** True when the class/grade value denotes PP2. */
function isPP2(value) {
  if (!value) return false;
  const v = String(value).toLowerCase().trim();
  return v === 'pp2' || v === 'pre-primary 2' || v === 'pre-primary two' || v === 'pp II' || v === 'p2' || v === 'pre primary 2';
}

/** Generate a unique certificate number: CSA/CERT/<prefix>/<YYYY>/<NNNN> */
async function generateUniqueCertificateNumber(db, prefix, year) {
  const yearStr = String(year);
  let attempt = 1;
  const maxAttempts = 200;

  while (attempt <= maxAttempts) {
    const seq = String(attempt).padStart(4, '0');
    const certNumber = `CSA/CERT/${prefix}/${yearStr}/${seq}`;
    const existing = await db.collection('graduation_certificates').findOne({ certificateNumber: certNumber });
    if (!existing) return certNumber;
    attempt++;
  }

  // Fallback: timestamp-based suffix to guarantee uniqueness
  const seq = String(Date.now()).slice(-4);
  return `CSA/CERT/${prefix}/${yearStr}/${seq}`;
}

/** Build the full certificate record from a student + event data. */
function buildCertificateRecord(db, student, eventName, eventDate, year, templateName, certNumber, generatedBy) {
  return {
    studentId: student.admissionNumber,
    certificateNumber: certNumber,
    studentName: student.fullName,
    studentFirstName: student.firstName,
    studentLastName: student.lastName,
    admissionNumber: student.admissionNumber,
    class: student.grade || student.class || '',
    stream: student.stream || '',
    gender: student.gender || '',
    grade: student.grade || '',
    eventName: eventName || '',
    eventDate: eventDate || '',
    graduationYear: String(year),
    generatedAt: new Date().toISOString(),
    generatedBy: generatedBy,
    templateName: templateName || '',
    pdfPath: null,
    status: 'generated'
  };
}

// ---------------------------------------------------------------------------
// Public verification endpoint (no auth)
// ---------------------------------------------------------------------------

async function verifyCertificateRecord(db, certNumber) {
  if (!db) return null;
  try {
    return await db.collection('graduation_certificates').findOne({ certificateNumber: certNumber });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Admin-only route dispatch
// ---------------------------------------------------------------------------

export async function handleCertificates(db, env, route, method, body, p, request) {
  const secret = env.JWT_SECRET || env.jwt_secret;

  // ---- Public: verify a certificate number ----
  // The certificate number contains slashes (CSA/CERT/PP2/2026/0001), so we
  // accept it as a query parameter instead of a path segment.
  if (p[0] === 'certificates' && p[1] === 'verify' && method === 'GET') {
    const url = new URL(request.url);
    const certNumber = url.searchParams.get('number') || (p.length > 2 ? decodeURIComponent(p.slice(2).join('/')) : '');
    if (!certNumber) return error('Certificate number is required (e.g. ?number=CSA/CERT/PP2/2026/0001)', 400);
    const record = await verifyCertificateRecord(db, certNumber);
    if (!record) return error('Certificate not found or invalid.', 404);
    // Only expose non-sensitive fields
    return success({
      valid: true,
      certificate: {
        certificateNumber: record.certificateNumber,
        studentName: record.studentName,
        admissionNumber: record.admissionNumber,
        class: record.class,
        eventName: record.eventName,
        eventDate: record.eventDate,
        graduationYear: record.graduationYear,
        issuedAt: record.generatedAt
      }
    });
  }

  // ---- All remaining endpoints require admin auth ----
  const payload = authenticateRequest(request, secret);
  if (!payload) return error('Unauthorized: a valid admin token is needed', 401);
  if (payload.role !== 'Super Admin' && payload.role !== 'Admin' && payload.role !== 'admin') {
    return error('Forbidden: admin access required', 403);
  }
  const generatedBy = payload.fullName || payload.username || payload.id || 'admin';

  /** Helper: read school settings from system_settings, merge with defaults. */
  async function getSchoolSettings() {
    const setting = await db.collection('system_settings').findOne({ key: 'school_settings' });
    if (setting && setting.value) return { ...defaultSchoolSettings(), ...setting.value };
    return defaultSchoolSettings();
  }

  /** Generate the numeric zero-padded sequence for a class+year, returning the next slot. */
  async function nextSeq(prefix, year) {
    const certNumber = await generateUniqueCertificateNumber(db, prefix, year);
    return certNumber;
  }

  // -----------------------------------------------------------------------
  // School settings
  // -----------------------------------------------------------------------

  // GET /api/certificates/school-settings
  if (route === '/certificates/school-settings' && method === 'GET') {
    const settings = await getSchoolSettings();
    return success({ settings });
  }

  // PUT /api/certificates/school-settings
  if (route === '/certificates/school-settings' && method === 'PUT') {
    const updates = body || {};
    const existing = await db.collection('system_settings').findOne({ key: 'school_settings' });
    const merged = { ...defaultSchoolSettings(), ...updates };
    delete merged._id;
    if (existing) {
      await db.collection('system_settings').updateOne({ _id: existing._id }, { $set: { value: merged, updatedAt: new Date().toISOString() } });
    } else {
      await db.collection('system_settings').insertOne({ key: 'school_settings', value: merged, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    return success({ settings: await getSchoolSettings() });
  }

  // -----------------------------------------------------------------------
  // Classes (distinct list for dropdown)
  // -----------------------------------------------------------------------

  // GET /api/certificates/classes
  if (route === '/certificates/classes' && method === 'GET') {
    const { results } = await db.collection('students').find({ isActive: { $ne: false } }).toArray();
    const classSet = new Set();
    const streamSet = new Set();
    for (const s of results) {
      const c = s.grade || s.class || s.std || s.level;
      if (c) classSet.add(c);
      if (s.stream) streamSet.add(s.stream);
    }
    const classes = Array.from(classSet).sort();
    const streams = Array.from(streamSet).sort();
    return success({ classes, streams });
  }

  // -----------------------------------------------------------------------
  // Student search (name / admission number / class / stream)
  // -----------------------------------------------------------------------

  // GET /api/certificates/students?query=...&class=...&stream=...
  if (route === '/certificates/students' && method === 'GET') {
    const url = new URL(request.url);
    const query = (url.searchParams.get('query') || '').toLowerCase().trim();
    const cls = (url.searchParams.get('class') || '').trim();
    const stream = (url.searchParams.get('stream') || '').trim();

    const { results } = await db.collection('students').find({ isActive: { $ne: false } }).toArray();
    let students = results;

    if (cls) students = students.filter(s => {
      const c = (s.grade || s.class || s.std || s.level || '').toLowerCase();
      return c === cls.toLowerCase();
    });

    if (stream) students = students.filter(s => (s.stream || '').toLowerCase() === stream.toLowerCase());

    if (query) {
      students = students.filter(s => {
        const fn = (s.firstName || s.first_name || s.fullName || '').toLowerCase();
        const ln = (s.lastName || s.last_name || '').toLowerCase();
        const adm = (s.admissionNumber || s.admission_number || '').toLowerCase();
        return fn.includes(query) || ln.includes(query) || adm.includes(query) ||
               (fn + ' ' + ln).includes(query);
      });
    }

    return success({ students: students.map(publicStudent), count: students.length });
  }

  // -----------------------------------------------------------------------
  // Templates (saved certificate designs)
  // -----------------------------------------------------------------------

  // GET /api/certificates/templates
  if (route === '/certificates/templates' && method === 'GET') {
    const { results } = await db.collection('certificate_templates').find({}).toArray();
    return success({ templates: results || [] });
  }

  // POST /api/certificates/templates  { name, template }
  if (route === '/certificates/templates' && method === 'POST') {
    const { name, template } = body || {};
    if (!name || !template) return error('name and template are required', 400);
    const existing = await db.collection('certificate_templates').findOne({ name });
    if (existing) return error('A template with this name already exists', 409);

    const record = { name, template, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const result = await db.collection('certificate_templates').insertOne(record);
    return success({ template: { _id: result.insertedId, ...record } });
  }

  // PUT /api/certificates/templates/:name  { template }
  if (p[0] === 'certificates' && p[1] === 'templates' && p[2] && method === 'PUT') {
    const name = decodeURIComponent(p[2]);
    const { template } = body || {};
    if (!template) return error('template is required', 400);
    const result = await db.collection('certificate_templates').updateOne(
      { name },
      { $set: { template, updatedAt: new Date().toISOString() } }
    );
    if (!result.matchedCount) return error('Template not found', 404);
    return success({ message: 'Template updated.' });
  }

  // -----------------------------------------------------------------------
  // Single-student generation (class-agnostic)
  // -----------------------------------------------------------------------

  // POST /api/certificates/generate
  if (route === '/certificates/generate' && method === 'POST') {
    const { studentId, eventName, eventDate, graduationYear, templateName } = body || {};
    if (!studentId) return error('studentId (admission number) is required', 400);

    const student = await db.collection('students').findOne({
      $or: [{ admissionNumber: studentId }, { studentId: studentId }, { _id: studentId }]
    });
    if (!student) return error('Student not found. Please check the admission number.', 404);

    const s = publicStudent(student);
    const year = graduationYear || new Date().getFullYear().toString();
    const prefix = s.grade || 'GEN';
    const gradDate = eventDate || getKenyaDate();

    // Check existing
    const existing = await db.collection('graduation_certificates').findOne({
      studentId: studentId,
      graduationYear: String(year),
      eventName: eventName || ''
    });
    if (existing) {
      return success({ message: 'Existing certificate found.', certificate: existing, isNew: false });
    }

    const certNumber = await nextSeq(prefix, year);
    const record = buildCertificateRecord(db, s, eventName, gradDate, year, templateName, certNumber, generatedBy);
    const result = await db.collection('graduation_certificates').insertOne(record);
    return success({ message: 'Certificate generated successfully!', certificate: { _id: result.insertedId, ...record }, isNew: true });
  }

  // -----------------------------------------------------------------------
  // Bulk generation
  // -----------------------------------------------------------------------

  // POST /api/certificates/bulk-generate
  if (route === '/certificates/bulk-generate' && method === 'POST') {
    const { studentIds = [], class: cls, stream, eventName, eventDate, graduationYear, templateName } = body || {};
    if (!eventName) return error('eventName is required', 400);

    let students = [];

    if (studentIds.length > 0) {
      // Fetch by admission numbers
      for (const sid of studentIds) {
        const student = await db.collection('students').findOne({
          $or: [{ admissionNumber: sid }, { studentId: sid }, { _id: sid }]
        });
        if (student && student.isActive !== false) students.push(publicStudent(student));
      }
    } else if (cls) {
      const query = { isActive: { $ne: false } };
      const { results } = await db.collection('students').find(query).toArray();
      students = results.filter(s => {
        const c = (s.grade || s.class || '').toLowerCase();
        const match = c === cls.toLowerCase();
        if (!match) return false;
        if (stream && (s.stream || '').toLowerCase() !== stream.toLowerCase()) return false;
        return true;
      }).map(publicStudent);
    }

    if (!students.length) return error('No students found matching the selection.', 400);

    const year = graduationYear || new Date().getFullYear().toString();
    const gradDate = eventDate || getKenyaDate();
    const certs = [];
    const skipped = [];

    for (const s of students) {
      // Check for existing certificate (same student + year + event)
      const existing = await db.collection('graduation_certificates').findOne({
        studentId: s.admissionNumber,
        graduationYear: String(year),
        eventName: eventName || ''
      });
      if (existing) {
        skipped.push({ studentId: s.admissionNumber, name: s.fullName, reason: 'Certificate already exists' });
        continue;
      }

      const prefix = s.grade || 'GEN';
      const certNumber = await generateUniqueCertificateNumber(db, prefix, year);
      const record = buildCertificateRecord(db, s, eventName, gradDate, year, templateName || '', certNumber, generatedBy);
      const result = await db.collection('graduation_certificates').insertOne(record);
      certs.push({ _id: result.insertedId, ...record });
    }

    return success({
      message: `Generated ${certs.length} certificate(s), skipped ${skipped.length}.`,
      certificates: certs,
      skipped
    });
  }

  // -----------------------------------------------------------------------
  // Certificate records (list / retrieve)
  // -----------------------------------------------------------------------

  // GET /api/certificates/records?studentId=...
  if (route === '/certificates/records' && method === 'GET') {
    const url = new URL(request.url);
    const sid = url.searchParams.get('studentId');
    let records;
    if (sid) {
      records = await db.collection('graduation_certificates').find({ studentId: sid }).toArray();
    } else {
      records = await db.collection('graduation_certificates').find({}).sort({ generatedAt: -1 }).toArray();
    }
    return success({ records: records || [], count: records.length });
  }

  // -----------------------------------------------------------------------
  // Backwards-compatible PP2 endpoints (legacy page support)
  // -----------------------------------------------------------------------

  // GET /api/certificates/pp2/students — list all active PP2 students
  if (route === '/certificates/pp2/students' && method === 'GET') {
    const { results } = await db.collection('students').find({ isActive: { $ne: false } }).toArray();
    const pp2Students = results
      .filter(s => isPP2(s.grade || s.class || s.std || s.level))
      .map(publicStudent);
    return success({ students: pp2Students, count: pp2Students.length });
  }

  // GET /api/certificates/pp2/student/:id
  if (p[0] === 'certificates' && p[1] === 'pp2' && p[2] === 'student' && p[3] && method === 'GET') {
    const sid = decodeURIComponent(p[3]);
    const student = await db.collection('students').findOne({
      $or: [{ admissionNumber: sid }, { studentId: sid }, { _id: sid }]
    });
    if (!student) return error('Student not found. Double-check the admission number.', 404);
    if (!isPP2(student.grade || student.class || student.std || student.level)) return error('This student is not in PP2.', 400);
    return success({ student: publicStudent(student) });
  }

  // POST /api/certificates/pp2/generate
  if (route === '/certificates/pp2/generate' && method === 'POST') {
    const { studentId, studentName, graduationYear, graduationDate } = body || {};
    if (!studentId) return error('studentId (admission number) is required', 400);

    const student = await db.collection('students').findOne({
      $or: [{ admissionNumber: studentId }, { studentId: studentId }, { _id: studentId }]
    });
    if (!student) return error('Student not found. Please check the admission number.', 404);
    if (!isPP2(student.grade || student.class || student.std || student.level)) return error('This student is not in PP2.', 400);

    const s = publicStudent(student);
    const year = graduationYear || new Date().getFullYear();
    if (isNaN(Number(year)) || Number(year) < 2000 || Number(year) > 2100) {
      return error('A valid graduation year is required.', 400);
    }
    const gradDate = graduationDate || getKenyaDate();

    // Check existing
    let existing = await db.collection('graduation_certificates').findOne({
      studentId: studentId,
      graduationYear: String(year),
      class: 'PP2'
    });
    if (!existing) {
      const all = await db.collection('graduation_certificates').find({}).toArray();
      existing = all.results?.find(r => r.studentId === studentId && r.graduationYear === String(year) && r.class === 'PP2') || null;
    }

    if (existing) {
      return success({ message: 'Existing certificate found.', certificate: existing, isNew: false });
    }

    const certNumber = await generateUniqueCertificateNumber(db, 'PP2', year);
    const record = {
      studentId: studentId,
      certificateNumber: certNumber,
      studentName: s.fullName,
      studentFirstName: s.firstName,
      studentLastName: s.lastName,
      class: 'PP2',
      level: 'PRE-PRIMARY 2',
      admissionNumber: student.admissionNumber || studentId,
      graduationYear: String(year),
      graduationDate: gradDate,
      generatedAt: new Date().toISOString(),
      generatedBy: generatedBy,
      pdfPath: null,
      status: 'generated'
    };
    const result = await db.collection('graduation_certificates').insertOne(record);
    return success({ message: 'Certificate generated successfully!', certificate: { _id: result.insertedId, ...record }, isNew: true });
  }

  return null;
}
