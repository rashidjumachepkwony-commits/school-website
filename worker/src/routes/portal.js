/**
 * Student / parent portal route handlers.
 *
 * Designed for parents who are not confident with computers:
 *   1. the portal lists every student by name and admission number,
 *   2. the parent picks their child from a plain dropdown,
 *   3. they choose what to look at - results, holiday assignments or fees.
 *
 * Nothing here exposes another child's results, and no password is required,
 * so only identification data is returned for the list.
 */
import { success, error } from '../utils/helpers.js';
import { loadPolicy, gradePercentage, DEFAULT_POLICY } from '../services/assessment.service.js';

const isBoardingStudent = s =>
  s.boarding === true || s.boarding === 'true' ||
  s.isBoarding === true || s.isBoarding === 'true' ||
  s.studentType === 'Boarder' || s.studentType === 'boarder';

const fullNameOf = s => `${s.firstName || ''} ${s.lastName || ''}`.trim();

/** Find a student by admission number first, then by exact name, then by id. */
async function findStudent(db, key) {
  const wanted = decodeURIComponent(String(key || '')).trim();
  if (!wanted) return null;
  const all = await db.collection('students').find({}).toArray();
  const lower = wanted.toLowerCase();
  return (
    all.find(s => s.admissionNumber && s.admissionNumber.toLowerCase() === lower) ||
    all.find(s => String(s._id.toString()) === wanted) ||
    all.find(s => fullNameOf(s).toLowerCase() === lower) ||
    null
  );
}

export async function handlePortal(db, env, route, method, body, p, url) {
  // GET /api/portal/students?q=...  — the searchable dropdown list
  if (route === '/portal/students' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const students = await db.collection('students').find({}).toArray();
    const list = students
      .map(s => ({
        id: s._id.toString(),
        admissionNumber: s.admissionNumber || '',
        name: fullNameOf(s),
        grade: s.grade || s.class || ''
      }))
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.admissionNumber.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    return success({ students: list, total: list.length });
  }

  // GET /api/portal/student/:key  — everything the portal can show
  if (p[0] === 'portal' && p[1] === 'student' && p[2] && method === 'GET') {
    const student = await findStudent(db, p[2]);
    if (!student) return error('Student not found. Please check the name and try again.', 404);

    const grade = student.grade || student.class || '';
    const id = student._id.toString();

    // ---- Results ----
    const policySetting = await db.collection('system_settings').findOne({ key: 'grading_policy' });
    const policy = loadPolicy(policySetting && policySetting.value ? JSON.stringify(policySetting.value) : null);

    const allRecords = await db.collection('assessments').find({}).toArray();
    const lowerName = fullNameOf(student).toLowerCase();
    const mine = allRecords.filter(r =>
      (r.studentId && String(r.studentId) === id) ||
      (r.studentId && r.admissionNumber && String(r.studentId) === String(r.admissionNumber)) ||
      (r.studentName || '').trim().toLowerCase() === lowerName
    );

    // Group by assessment sitting, so the portal shows one card per period.
    const groups = new Map();
    for (const r of mine) {
      const key = `${r.assessmentPeriod || ''}|${r.assessmentType || ''}|${r.assessmentName || ''}`;
      if (!groups.has(key)) groups.set(key, {
        period: r.assessmentPeriod || '',
        type: r.assessmentType || '',
        name: r.assessmentName || r.assessmentType || '',
        date: r.assessmentDate || null,
        subjects: [],
        total: 0,
        maxTotal: 0
      });
      const g = groups.get(key);
      for (const a of (r.assessments || [])) {
        const score = a.score === null || a.score === undefined || a.score === '' ? null : Number(a.score);
        g.subjects.push({ subject: a.subject || '', score, max: Number(a.maxScore) || 0 });
        if (score !== null) { g.total += score; g.maxTotal += Number(a.maxScore) || 0; }
      }
    }

    const assessments = [...groups.values()].map(g => {
      const percentage = g.maxTotal > 0 ? Number(((g.total / g.maxTotal) * 100).toFixed(2)) : null;
      const graded = percentage === null
        ? { level: 'Not Assessed', code: 'NA' }
        : gradePercentage(percentage, policy);
      const scored = g.subjects.filter(s => s.score !== null);
      return {
        period: g.period, type: g.type, name: g.name, date: g.date,
        subjects: g.subjects,
        total: g.total,
        maxTotal: g.maxTotal,
        percentage,
        average: scored.length ? Number((g.total / scored.length).toFixed(2)) : null,
        performanceLevel: graded.level,
        performanceCode: graded.code
      };
    }).sort((a, b) => String(b.period).localeCompare(String(a.period)));

    // ---- Holiday assignments (for this student's grade) ----
    const assignments = await db.collection('holidayassignments')
      .find(grade ? { grade, isActive: { $ne: false } } : { isActive: { $ne: false } })
      .sort({ uploadedAt: -1 }).toArray();

    // ---- Fees ----
    const payments = await db.collection('fee_payments').find({}).toArray();
    const structures = await db.collection('fee_structures').find({ isActive: { $ne: false } }).toArray();
    const paid = payments
      .filter(pmt => String(pmt.studentId || '') === (student.admissionNumber || id) || String(pmt.studentId || '') === id)
      .reduce((n, pmt) => n + Number(pmt.totalAmount || pmt.amount || 0), 0);
    const defaultFee = structures.reduce((n, s) => n + Number(s.amount || 0), 0);
    const totalFees = Number(student.totalFees ?? defaultFee ?? 0);
    const boarding = isBoardingStudent(student);

    return success({
      student: {
        id,
        admissionNumber: student.admissionNumber || '',
        name: fullNameOf(student),
        grade,
        gender: student.gender || '',
        studentType: boarding ? 'Boarder' : 'Day Scholar',
        guardianName: student.guardianName || '',
        guardianPhone: student.phone || '',
        email: student.email || ''
      },
      assessments,
      assignments: assignments.map(a => ({
        id: a._id.toString(),
        title: a.title || '',
        subject: a.subject || '',
        description: a.description || '',
        grade: a.grade || grade,
        term: a.term || '',
        fileUrl: a.fileUrl || a.file || '',
        fileName: a.fileName || (a.fileUrl || '').split('/').pop() || '',
        uploadedAt: a.uploadedAt || a.createdAt || null
      })),
      fees: {
        total: totalFees,
        paid,
        balance: Math.max(0, totalFees - paid),
        currency: 'KES',
        structure: structures.map(s => ({ type: s.type, term: s.term, amount: Number(s.amount || 0) }))
      },
      gradingKey: (policy.levels || DEFAULT_POLICY.levels).map(l => ({
        code: l.code, name: l.name, min: l.min, max: l.max
      }))
    });
  }

  return null;
}
