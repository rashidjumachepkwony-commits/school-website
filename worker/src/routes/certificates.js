/**
 * Graduation certificate route handlers.
 *
 * Single-student flow:
 *   GET  /api/certificates/pp2/students          — list PP2 students (admin)
 *   GET  /api/certificates/pp2/student/:sid      — fetch a single student for the generator (admin)
 *   POST /api/certificates/pp2/generate          — generate/retrieve a certificate number for a student (admin)
 *
 * All endpoints require a valid admin JWT.
 */
import { success, error } from '../utils/helpers.js';
import { authenticateRequest } from '../utils/auth.js';
import { getKenyaDate } from '../services/time.service.js';

/** True when the class/grade value denotes PP2. */
function isPP2(value) {
  if (!value) return false;
  const v = String(value).toLowerCase().trim();
  return v === 'pp2'
    || v === 'pre-primary 2'
    || v === 'pre-primary two'
    || v === 'pp II'
    || v === 'p2'
    || v === 'pre primary 2';
}

/** Extract the grade/class from a student record, normalising keys. */
function studentGrade(s) {
  return s.grade || s.class || s.std || s.level || '';
}

/** Build the public student shape returned to the frontend. */
function publicStudent(s) {
  const firstName = s.firstName || s.first_name || s.firstname || '';
  const lastName = s.lastName || s.last_name || s.lastname || '';
  const fullName = (firstName + ' ' + lastName).trim() || s.fullName || s.name || '';
  const admissionNumber = s.admissionNumber || s.admission_number || s.admNo || s.id || s._id?.toString() || '';
  return {
    _id: s._id?.toString(),
    firstName,
    lastName,
    fullName,
    admissionNumber,
    studentId: admissionNumber,
    grade: studentGrade(s),
    class: studentGrade(s),
    gender: s.gender || '',
    dateOfBirth: s.dateOfBirth || s.dob || '',
    photoUrl: s.photoUrl || s.photo || s.imageUrl || s.avatar || null,
    dateAdded: s.dateAdded || s.createdAt || null,
    status: s.status || 'ACTIVE'
  };
}

export async function handleCertificates(db, env, route, method, body, p, request) {
  const secret = env.JWT_SECRET || env.jwt_secret;

  // ---- All routes require admin auth ----
  const payload = authenticateRequest(request, secret);
  if (!payload) return error('Unauthorized: a valid admin token is required', 401);
  if (payload.role !== 'Super Admin' && payload.role !== 'Admin' && payload.role !== 'admin') {
    return error('Forbidden: admin access required', 403);
  }

  const isAdmin = payload.role === 'Super Admin' || payload.role === 'Admin' || payload.role === 'admin';
  const generatedBy = payload.fullName || payload.username || payload.id || 'admin';

  // GET /api/certificates/pp2/students — list all active PP2 students
  if (route === '/certificates/pp2/students' && method === 'GET') {
    const { results } = await db.collection('students').find({ isActive: { $ne: false } }).toArray();
    const pp2Students = results
      .filter(s => isPP2(studentGrade(s)))
      .map(publicStudent);
    return success({ students: pp2Students, count: pp2Students.length });
  }

  // GET /api/certificates/pp2/student/:id — fetch one student by admission number or _id
  if (p[0] === 'certificates' && p[1] === 'pp2' && p[2] === 'student' && p[3] && method === 'GET') {
    const sid = decodeURIComponent(p[3]);
    const student = await db.collection('students').findOne({
      $or: [
        { admissionNumber: sid },
        { studentId: sid },
        { _id: sid }
      ]
    });
    if (!student) return error('Student not found. Double-check the admission number.', 404);
    if (!isPP2(studentGrade(student))) return error('This student is not in PP2.', 400);

    return success({ student: publicStudent(student) });
  }

  // POST /api/certificates/pp2/generate — create or retrieve a certificate for a student
  if (route === '/certificates/pp2/generate' && method === 'POST') {
    const { studentId, studentName, graduationYear, graduationDate } = body;
    if (!studentId) return error('studentId (admission number) is required', 400);

    // Resolve the student record
    const student = await db.collection('students').findOne({
      $or: [{ admissionNumber: studentId }, { studentId: studentId }, { _id: studentId }]
    });
    if (!student) return error('Student not found. Please check the admission number.', 404);
    if (!isPP2(studentGrade(student))) return error('This student is not in PP2.', 400);

    const firstName = student.firstName || student.first_name || student.firstname || '';
    const lastName = student.lastName || student.last_name || student.lastname || '';
    const fullName = (firstName + ' ' + lastName).trim() || student.fullName || student.name || '';
    if (!fullName) return error('Student name not found in the record.', 400);

    const year = graduationYear || new Date().getFullYear();
    if (isNaN(Number(year)) || Number(year) < 2000 || Number(year) > 2100) {
      return error('A valid graduation year is required.', 400);
    }

    const gradDate = graduationDate || getKenyaDate();

    // Check for an existing certificate for this student + year
    const certificateYear = String(year);
    let existing = await db.collection('graduation_certificates').findOne({
      studentId: studentId,
      graduationYear: certificateYear,
      class: 'PP2'
    });
    // Fallback: search data field manually if the above didn't match
    if (!existing) {
      const all = await db.collection('graduation_certificates').find({}).toArray();
      existing = all.results?.find(r =>
        r.studentId === studentId && r.graduationYear === certificateYear && r.class === 'PP2'
      ) || null;
    }

    if (existing) {
      return success({
        message: 'Existing certificate found.',
        certificate: existing,
        isNew: false
      });
    }

    // Generate a unique certificate number: CSA/GRAD/PP2/YYYY/NNNN
    const certNumber = await generateUniqueCertificateNumber(db, year);

    const now = new Date().toISOString();
    const certRecord = {
      studentId: studentId,
      certificateNumber: certNumber,
      studentName: fullName,
      studentFirstName: firstName,
      studentLastName: lastName,
      class: 'PP2',
      level: 'PRE-PRIMARY 2',
      admissionNumber: student.admissionNumber || studentId,
      graduationYear: certificateYear,
      graduationDate: gradDate,
      generatedAt: now,
      generatedBy: generatedBy,
      pdfPath: null,
      status: 'generated'
    };

    const result = await db.collection('graduation_certificates').insertOne(certRecord);

    return success({
      message: 'Certificate generated successfully!',
      certificate: { _id: result.insertedId, ...certRecord },
      isNew: true
    });
  }

  return null;
}

/**
 * Generate a unique certificate number in the format:
 *   CSA/GRAD/PP2/YYYY/NNNN
 * where NNNN is zero-padded to 4 digits, auto-incremented.
 */
async function generateUniqueCertificateNumber(db, year) {
  const yearStr = String(year);
  let attempt = 1;
  const maxAttempts = 100;

  while (attempt <= maxAttempts) {
    const seq = String(attempt).padStart(4, '0');
    const certNumber = `CSA/GRAD/PP2/${yearStr}/${seq}`;

    // Check if this certificate number already exists
    const existing = await db.collection('graduation_certificates').findOne({
      certificateNumber: certNumber
    });

    if (!existing) return certNumber;
    attempt++;
  }

  // Fallback: use timestamp-based suffix
  const seq = String(Date.now()).slice(-4);
  return `CSA/GRAD/PP2/${yearStr}/${seq}`;
}
