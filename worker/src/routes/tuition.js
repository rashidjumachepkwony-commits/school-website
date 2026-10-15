/**
 * Computer Studies Holiday Tuition Registration System — API route handlers.
 *
 * Public endpoints (no auth):
 *   GET  /api/tuition/programme          – current programme settings for the public form
 *   POST /api/tuition/register             – submit a registration (validated, rate-limited)
 *
 * Admin endpoints (require JWT, role Super Admin / Admin):
 *   GET    /api/tuition/settings                     – full programme settings
 *   PUT    /api/tuition/settings                     – update programme settings
 *   GET    /api/tuition/registrations                – list with search/filter/pagination
 *   GET    /api/tuition/registrations/:id            – single registration detail
 *   PUT    /api/tuition/registrations/:id            – edit registration
 *   DELETE /api/tuition/registrations/:id            – delete registration
 *   POST   /api/tuition/registrations/:id/status      – change application status
 *   POST   /api/tuition/registrations/:id/payment     – record a payment
 *   GET    /api/tuition/registrations/:id/payments    – payment history for a reg
 *   GET    /api/tuition/summary                      – dashboard summary
 *   GET    /api/tuition/export                       – CSV export
 *   POST   /api/tuition/sms/retry                    – retry a failed SMS
 */
import { success, error } from '../utils/helpers.js';
import { authenticateRequest } from '../utils/auth.js';
import { getKenyaTime, formatKenyaTime } from '../services/time.service.js';

// ------------------------------------------------------------------ defaults

const DEFAULT_SETTINGS = {
  section_key: 'computer_tuition',
  title: 'November–December 2026 Computer Studies Holiday Tuition Programme',
  description: 'Practical computer lessons covering computing components, typing, word processing, basic digital literacy, and internet safety.',
  startDate: '2026-11-02',
  endDate: '2026-12-20',
  venue: 'Changara Star Academy, Changara, Kenya',
  weeklyFee: 500,
  currency: 'KSh',
  registrationOpen: true,
  registrationOpensAt: '2026-10-01T00:00:00',
  registrationClosesAt: '2026-11-30T23:59:59',
  maxCapacity: 60,
  showHomepageAdvert: true,
  learningAreas: [
    'Introduction to computers and computer components',
    'Keyboard, mouse and typing skills',
    'Basic computer operations',
    'Microsoft Word or compatible word-processing software',
    'Creating and formatting documents',
    'Basic digital literacy',
    'Internet safety and responsible technology use',
    'Practical computer exercises and creative digital activities'
  ],
  schedules: [
    { id: 'morning', label: 'Morning: 9:00 AM – 11:00 AM' },
    { id: 'afternoon', label: 'Afternoon: 2:00 PM – 4:00 PM' }
  ],
  paymentPolicy: 'full',
  smsEnabled: false,
  smsAutoAck: true
};

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'waitlisted'];
const VALID_PAYMENT_METHODS = ['cash', 'mpesa', 'bank', 'cheque', 'other'];

// ------------------------------------------------------------------ helpers

function normalizeKenyanPhone(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('254')) {
    return '+254' + digits.slice(3);
  }
  if (digits.length === 12 && digits.startsWith('2540')) {
    return '+254' + digits.slice(4);
  }
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
    return '+254' + digits;
  }
  if (digits.length === 10 && digits.startsWith('07')) {
    return '+254' + digits.slice(1);
  }
  if (digits.length === 10 && digits.startsWith('01')) {
    return '+254' + digits.slice(1);
  }
  if (digits.length === 9 && (digits.startsWith('07') || digits.startsWith('01'))) {
    return '+254' + digits.slice(2);
  }
  return null;
}

function escCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function requireAdmin(request, env) {
  const secret = env.JWT_SECRET || env.jwt_secret;
  if (!secret) return { err: error('Authentication is not configured on the server', 503) };
  const payload = authenticateRequest(request, secret);
  if (!payload) return { err: error('Unauthorized — please log in.', 401) };
  if (payload.role !== 'Super Admin' && payload.role !== 'Admin') {
    return { err: error('Forbidden — admin access required.', 403) };
  }
  return { admin: payload };
}

function nowIso() {
  return getKenyaTime().toISOString();
}

async function getSettings(db) {
  const row = await db.collection('computer_tuition_programmes').findOne({ section_key: 'computer_tuition' });
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...row };
}

function checkRegistrationOpen(settings) {
  if (!settings.registrationOpen) {
    return { open: false, reason: 'Registrations are currently closed.' };
  }
  const now = new Date();
  if (settings.registrationClosesAt && new Date(settings.registrationClosesAt) < now) {
    return { open: false, reason: 'The registration deadline has passed.' };
  }
  if (settings.registrationOpensAt && new Date(settings.registrationOpensAt) > now) {
    return { open: false, reason: 'Registrations have not opened yet.' };
  }
  return { open: true };
}

function checkCapacity(settings, currentCount) {
  if (settings.maxCapacity && currentCount >= settings.maxCapacity) return false;
  return true;
}

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  if (phone.length <= 6) return phone;
  return phone.slice(0, -5) + '***' + phone.slice(-2);
}

// ------------------------------------------------------------------ handler

export async function handleTuition(db, env, route, method, body, p, url, request) {

  // ===============================
  // PUBLIC ENDPOINTS
  // ===============================

  // GET /api/tuition/programme
  if (route === '/tuition/programme' && method === 'GET') {
    const s = await getSettings(db);
    const regCheck = checkRegistrationOpen(s);
    const regs = await db.collection('computer_tuition_registrations').find({}).toArray();
    const capacity = checkCapacity(s, regs.length);
    return success({
      programme: {
        title: s.title,
        description: s.description,
        startDate: s.startDate,
        endDate: s.endDate,
        venue: s.venue,
        weeklyFee: s.weeklyFee,
        currency: s.currency,
        learningAreas: s.learningAreas
      },
      registrationOpen: regCheck.open,
      registrationClosedMessage: regCheck.reason || null,
      isAtCapacity: !capacity,
      schedules: capacity ? s.schedules : [],
      showHomepageAdvert: s.showHomepageAdvert,
      maxCapacity: s.maxCapacity
    });
  }

  // POST /api/tuition/register
  if (route === '/tuition/register' && method === 'POST') {
    const s = await getSettings(db);
    const regCheck = checkRegistrationOpen(s);
    if (!regCheck.open) return error(regCheck.reason || 'Registrations are closed.', 403);

    const count = await db.collection('computer_tuition_registrations').find({}).toArray();
    if (!checkCapacity(s, count.length)) return error('The programme has reached maximum capacity.', 403);

    // Validate required fields
    const required = ['studentName', 'currentSchool', 'gradeClass', 'age', 'guardianName', 'guardianPhone'];
    for (const f of required) {
      if (!body[f] || !String(body[f]).trim()) {
        return error('Please fill in all required fields and confirm consent.', 400);
      }
    }
    if (body.consentGiven !== true && body.consentGiven !== 'true') {
      return error('Please confirm the parental consent checkbox.', 400);
    }

    // Validate phone numbers
    const phone = normalizeKenyanPhone(body.guardianPhone);
    if (!phone) return error('Please provide a valid Kenyan phone number.', 400);

    let altPhone = null;
    if (body.alternativePhone) {
      altPhone = normalizeKenyanPhone(body.alternativePhone);
      if (!altPhone) return error('Alternative phone number is not valid.', 400);
    }

    // Validate age
    const ageNum = Number(body.age);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 100) {
      return error('Please enter a valid age (1–100 years).', 400);
    }

    // Validate learning preferences
    const validPrefs = ['computer_basics', 'typing', 'word', 'digital_literacy', 'other'];
    let prefs = [];
    if (Array.isArray(body.learningPreferences)) {
      prefs = body.learningPreferences.filter(x => validPrefs.includes(x));
    } else if (typeof body.learningPreferences === 'string' && body.learningPreferences) {
      prefs = [body.learningPreferences].filter(x => validPrefs.includes(x));
    }

    // Validate experience
    let exp = body.computerExperience || null;
    const validExp = ['beginner', 'some', 'experienced'];
    if (exp && !validExp.includes(exp)) exp = null;

    // Generate registration number: CSA-CS-YYYY-MMDD-XXXX
    const now = new Date();
    const year = now.getFullYear();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const datePart = now.toISOString().slice(5, 7) + now.toISOString().slice(8, 10);
    let regNumber;
    let tries = 0;
    do {
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      const seq = String(1 + Math.floor(Math.random() * 9000)).padStart(4, '0');
      regNumber = `CSA-CS-${year}-${datePart}-${rand}${seq}`;
      tries++;
    } while ((await db.collection('computer_tuition_registrations').findOne({ registration_number: regNumber })) && tries < 20);

    const ts = nowIso();
    const reg = {
      registration_number: regNumber,
      student_name: String(body.studentName).trim(),
      current_school: String(body.currentSchool).trim(),
      grade_class: String(body.gradeClass).trim(),
      age: ageNum,
      computer_experience: exp,
      guardian_name: String(body.guardianName).trim(),
      guardian_phone: phone,
      alternative_phone: altPhone,
      residence: body.residence ? String(body.residence).trim() : null,
      learning_preferences: prefs,
      additional_learning_goals: body.additionalGoals ? String(body.additionalGoals).trim() : null,
      schedule_preference: body.schedulePreference || null,
      consent_given: true,
      consent_timestamp: ts,
      consent_ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '',
      application_status: 'pending',
      payment_status: 'unpaid',
      weeks_paid: 0,
      total_paid: 0,
      admin_notes: null,
      created_at: ts,
      updated_at: ts
    };

    const result = await db.collection('computer_tuition_registrations').insertOne(reg);
    const inserted = { ...reg, _id: result.insertedId };

    // Auto-send SMS acknowledgment if enabled
    let smsStatus = null;
    try {
      if (s.smsEnabled && s.smsAutoAck) {
        const smsSvc = await import('../services/sms.service.js');
        const smsResult = await smsSvc.sendSms(env, {
          phoneNumber: phone,
          message: `Changara Star Academy: We have received your Computer Studies Tuition application for ${reg.student_name}. Ref: ${regNumber}. Status: Pending review. Tuition: KSh ${s.weeklyFee}/week. We will contact you after review.`,
          registrationId: result.insertedId,
          messageType: 'registration_received'
        });
        await smsSvc.logSms(db, { ...smsResult, registration_id: result.insertedId, phone_number: phone, message: `Changara Star Academy: We have received your Computer Studies Tuition application for ${reg.student_name}. Ref: ${regNumber}. Status: Pending review. Tuition: KSh ${s.weeklyFee}/week. We will contact you after review.`, message_type: 'registration_received' });
        smsStatus = smsResult.status;
      }
    } catch (e) {
      console.warn('SMS auto-ack failed:', e.message);
      smsStatus = 'failed';
    }

    return success({
      message: 'Registration submitted successfully!',
      registrationNumber: regNumber,
      status: 'pending',
      studentName: reg.student_name,
      programme: {
        startDate: s.startDate,
        endDate: s.endDate,
        venue: s.venue,
        weeklyFee: s.weeklyFee,
        currency: s.currency
      },
      smsAcknowledgement: smsStatus
    });
  }

  // ===============================
  // ADMIN ENDPOINTS
  // ===============================

  // GET /api/tuition/settings
  if (route === '/tuition/settings' && method === 'GET') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;
    const s = await getSettings(db);
    return success({ settings: s });
  }

  // PUT /api/tuition/settings
  if (route === '/tuition/settings' && method === 'PUT') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const s = { ...DEFAULT_SETTINGS, ...body, section_key: 'computer_tuition' };
    s.updated_at = nowIso();

    // Store settings fields directly as document fields (db adapter wraps in data jsonb)
    const existing = await db.collection('computer_tuition_programmes').findOne({ section_key: 'computer_tuition' });
    if (existing) {
      await db.collection('computer_tuition_programmes').updateOne(
        { _id: existing._id },
        { $set: s }
      );
    } else {
      await db.collection('computer_tuition_programmes').insertOne(s);
    }
    return success({ message: 'Programme settings saved successfully!', settings: s });
  }

  // GET /api/tuition/registrations
  if (route === '/tuition/registrations' && method === 'GET') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    let rows = await db.collection('computer_tuition_registrations').find({}).sort({ created_at: -1 }).toArray();

    const s = await getSettings(db);

    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        (r.student_name || '').toLowerCase().includes(q) ||
        (r.registration_number || '').toLowerCase().includes(q) ||
        (r.guardian_name || '').toLowerCase().includes(q) ||
        (r.guardian_phone || '').toLowerCase().includes(q)
      );
    }

    const statusFilter = url.searchParams.get('status');
    if (statusFilter) rows = rows.filter(r => r.application_status === statusFilter);

    const paymentFilter = url.searchParams.get('payment');
    if (paymentFilter) rows = rows.filter(r => r.payment_status === paymentFilter);

    const gradeFilter = url.searchParams.get('grade');
    if (gradeFilter) rows = rows.filter(r => (r.grade_class || '').toLowerCase() === gradeFilter.toLowerCase());

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get('limit') || '50')));
    const total = rows.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const pageRows = rows.slice(skip, skip + limit);

    return success({
      registrations: pageRows.map(r => ({
        id: r._id.toString(),
        registrationNumber: r.registration_number,
        studentName: r.student_name,
        currentSchool: r.current_school,
        gradeClass: r.grade_class,
        guardianName: r.guardian_name,
        guardianPhone: r.guardian_phone,
        applicationStatus: r.application_status,
        paymentStatus: r.payment_status,
        weeksPaid: r.weeks_paid,
        totalPaid: r.total_paid,
        fee: s.weeklyFee,
        createdAt: r.created_at
      })),
      total, page, limit, totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    });
  }

  // GET /api/tuition/registrations/:id
  if (p[0] === 'tuition' && p[1] === 'registrations' && p[2] && !p[3] && method === 'GET') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const reg = await db.collection('computer_tuition_registrations').findOne({ _id: p[2] });
    if (!reg) return error('Registration not found.', 404);

   const s = await getSettings(db);

    const [payments, smsLogs] = await Promise.all([
      db.collection('computer_tuition_payments').find({ registration_id: reg._id.toString() }).sort({ payment_date: -1 }).toArray(),
      db.collection('computer_tuition_sms_logs').find({ registration_id: reg._id.toString() }).sort({ created_at: -1 }).toArray()
    ]);

    return success({
      registration: {
        id: reg._id.toString(),
        registrationNumber: reg.registration_number,
        studentName: reg.student_name,
        currentSchool: reg.current_school,
        gradeClass: reg.grade_class,
        age: reg.age,
        computerExperience: reg.computer_experience,
        guardianName: reg.guardian_name,
        guardianPhone: reg.guardian_phone,
        alternativePhone: reg.alternative_phone,
        residence: reg.residence,
        learningPreferences: reg.learning_preferences || [],
        additionalLearningGoals: reg.additional_learning_goals,
        schedulePreference: reg.schedule_preference,
        consentGiven: reg.consent_given,
        consentTimestamp: reg.consent_timestamp,
        applicationStatus: reg.application_status,
        paymentStatus: reg.payment_status,
        weeksPaid: reg.weeks_paid,
        totalPaid: reg.total_paid,
        fee: s ? s.weeklyFee : undefined,
        adminNotes: reg.admin_notes,
        createdAt: reg.created_at,
        updatedAt: reg.updated_at,
        maskedPhone: maskPhone(reg.guardian_phone),
        payments: payments.map(pmt => ({
          id: pmt._id.toString(),
          amount: pmt.amount,
          currency: pmt.currency,
          paymentDate: pmt.payment_date,
          paymentMethod: pmt.payment_method,
          paymentReference: pmt.payment_reference,
          weeksCovered: pmt.weeks_covered,
          recordedBy: pmt.recorded_by_name || pmt.recorded_by,
          notes: pmt.notes,
          createdAt: pmt.created_at
        })),
        smsLogs: smsLogs.map(s => ({
          id: s._id.toString(),
          status: s.status,
          phoneNumber: maskPhone(s.phone_number),
          sentAt: s.sent_at,
          messagePreview: (s.message || '').slice(0, 80),
          error: s.error,
          createdAt: s.created_at
        }))
      }
    });
  }

  // PUT /api/tuition/registrations/:id
  if (p[0] === 'tuition' && p[1] === 'registrations' && p[2] && !p[3] && method === 'PUT') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const reg = await db.collection('computer_tuition_registrations').findOne({ _id: p[2] });
    if (!reg) return error('Registration not found.', 404);

    const updates = {};
    const fields = ['student_name', 'current_school', 'grade_class', 'age', 'computer_experience',
      'guardian_name', 'guardian_phone', 'alternative_phone', 'residence', 'learning_preferences',
      'additional_learning_goals', 'schedule_preference', 'admin_notes'];
    for (const f of fields) if (body[f] !== undefined) updates[f] = body[f];

    if (updates.guardian_phone) {
      const ph = normalizeKenyanPhone(updates.guardian_phone);
      if (!ph) return error('Invalid phone number.', 400);
      updates.guardian_phone = ph;
    }
    updates.updated_at = nowIso();

    await db.collection('computer_tuition_registrations').updateOne({ _id: p[2] }, { $set: updates });
    return success({ message: 'Registration updated successfully!' });
  }

  // PATCH /api/tuition/registrations/:id — partial update (notes, status, etc.)
  if (p[0] === 'tuition' && p[1] === 'registrations' && p[2] && !p[3] && method === 'PATCH') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const reg = await db.collection('computer_tuition_registrations').findOne({ _id: p[2] });
    if (!reg) return error('Registration not found.', 404);

    const updates = {};
    if (body.adminNote !== undefined) {
      updates.admin_notes = body.adminNote;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) return error('Invalid status.', 400);
      updates.application_status = body.status;
    }
    if (body.guardian_name !== undefined) {
      updates.guardian_name = body.guardian_name;
    }
    updates.updated_at = nowIso();

    if (Object.keys(updates).length === 1) return error('No valid fields to update.', 400);

    await db.collection('computer_tuition_registrations').updateOne({ _id: p[2] }, { $set: updates });
    return success({ message: 'Registration updated successfully!' });
  }

  // DELETE /api/tuition/registrations/:id
  if (p[0] === 'tuition' && p[1] === 'registrations' && p[2] && !p[3] && method === 'DELETE') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const reg = await db.collection('computer_tuition_registrations').findOne({ _id: p[2] });
    if (!reg) return error('Registration not found.', 404);

    await db.collection('computer_tuition_registrations').deleteOne({ _id: p[2] });
    await db.collection('computer_tuition_payments').deleteOne({ registration_id: p[2] });
    await db.collection('computer_tuition_sms_logs').deleteOne({ registration_id: p[2] });

    return success({ message: 'Registration deleted.', deleted: 1 });
  }

  // POST /api/tuition/registrations/:id/payments — list payments
  if (p[0] === 'tuition' && p[1] === 'registrations' && p[2] && p[3] === 'payments' && method === 'GET') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const payments = await db.collection('computer_tuition_payments')
      .find({ registration_id: p[2] })
      .sort({ payment_date: -1 })
      .toArray();

    return success({
      payments: payments.map(pmt => ({
        id: pmt._id.toString(),
        amount: pmt.amount,
        currency: pmt.currency,
        paymentDate: pmt.payment_date,
        paymentMethod: pmt.payment_method,
        paymentReference: pmt.payment_reference,
        weeksCovered: pmt.weeks_covered,
        recordedBy: pmt.recorded_by_name || pmt.recorded_by,
        notes: pmt.notes,
        createdAt: pmt.created_at
      }))
    });
  }

  // POST /api/tuition/registrations/:id/status
  if (p[0] === 'tuition' && p[1] === 'registrations' && p[2] && p[3] === 'status' && method === 'POST') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const reg = await db.collection('computer_tuition_registrations').findOne({ _id: p[2] });
    if (!reg) return error('Registration not found.', 404);

    const { status, notes, sendSms } = body;
    if (!VALID_STATUSES.includes(status)) return error('Invalid status.', 400);

    const updates = {
      application_status: status,
      updated_at: nowIso()
    };
    if (notes !== undefined && notes !== null) {
      updates.admin_notes = (reg.admin_notes || '') + `\n[${nowIso()}] ${status}: ${notes}\n`;
    }
    await db.collection('computer_tuition_registrations').updateOne({ _id: p[2] }, { $set: updates });

    // Send SMS if applicable
    let smsResult = null;
    try {
      const s = await getSettings(db);
      if (s.smsEnabled && reg.guardian_phone) {
        const smsSvc = await import('../services/sms.service.js');
        let smsMsg = null;
        if (status === 'approved') {
          smsMsg = `Changara Star Academy: Good news! ${reg.student_name}'s Computer Studies Tuition application has been approved for ${s.startDate}–${s.endDate}. Tuition: KSh ${s.weeklyFee}/week. Ref: ${reg.registration_number}. Contact the school for attendance and payment arrangements.`;
        } else if (status === 'rejected' && sendSms) {
          smsMsg = `Changara Star Academy: ${reg.student_name}'s Computer Studies application has been reviewed. Please contact the school office for details. Ref: ${reg.registration_number}.`;
        } else if (status === 'waitlisted') {
          smsMsg = `Changara Star Academy: ${reg.student_name}'s Computer Studies application has been placed on the waiting list. Ref: ${reg.registration_number}. We will contact you if a spot opens.`;
        }
        if (smsMsg) {
          smsResult = await smsSvc.sendSms(env, {
            phoneNumber: reg.guardian_phone,
            message: smsMsg,
            registrationId: p[2],
            messageType: 'status_update'
          });
          await smsSvc.logSms(db, {
            ...smsResult,
            registration_id: p[2],
            phone_number: reg.guardian_phone,
            message: smsMsg,
            message_type: 'status_update'
          });
        }
      }
    } catch (e) {
      console.warn('SMS send failed:', e.message);
      smsResult = { error: e.message };
    }

    return success({
      message: 'Status updated to: ' + status,
      status,
      smsSent: smsResult ? true : false,
      smsError: smsResult && smsResult.error ? smsResult.error : null
    });
  }

  // POST /api/tuition/registrations/:id/payment
  if (p[0] === 'tuition' && p[1] === 'registrations' && p[2] && p[3] === 'payment' && method === 'POST') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const reg = await db.collection('computer_tuition_registrations').findOne({ _id: p[2] });
    if (!reg) return error('Registration not found.', 404);

    const { amount, paymentDate, paymentMethod, paymentReference, weeksCovered, notes } = body;
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) return error('Please enter a valid payment amount.', 400);

    const method = VALID_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'other';
    const weeks = Number(weeksCovered || 0);
    if (weeks < 0) return error('Weeks covered must be zero or positive.', 400);

    const s = await getSettings(db);
    const ts = nowIso();
    const payment = {
      registration_id: p[2],
      amount: amt,
      currency: s.currency || 'KSh',
      payment_date: paymentDate || ts,
      payment_method: method,
      payment_reference: paymentReference || null,
      weeks_covered: weeks,
      notes: notes || null,
      recorded_by: admin.id,
      recorded_by_name: admin.fullName || admin.username,
      created_at: ts,
      updated_at: ts
    };
    await db.collection('computer_tuition_payments').insertOne(payment);

    // Recalculate payment status
    const allPayments = await db.collection('computer_tuition_payments').find({ registration_id: p[2] }).toArray();
    const totalPaid = allPayments.reduce((sum, pmt) => sum + Number(pmt.amount || 0), 0);
    const totalWeeks = allPayments.reduce((sum, pmt) => sum + Number(pmt.weeks_covered || 0), 0);
    const totalWeeksProgram = Math.ceil((new Date(s.endDate) - new Date(s.startDate)) / (7 * 24 * 60 * 60 * 1000));
    const totalOwed = totalWeeksProgram * (s.weeklyFee || 500);

    let paymentStatus;
    if (totalPaid >= totalOwed && totalWeeks >= totalWeeksProgram) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partially_paid';
    } else {
      paymentStatus = 'unpaid';
    }

    await db.collection('computer_tuition_registrations').updateOne(
      { _id: p[2] },
      { $set: { payment_status: paymentStatus, weeks_paid: totalWeeks, total_paid: totalPaid, updated_at: ts } }
    );

    return success({
      message: 'Payment recorded successfully!',
      payment: { amount: amt, currency: payment.currency, paymentDate: payment.payment_date, paymentMethod: method, paymentReference, weeksCovered: weeks },
      updatedRegistration: { paymentStatus, weeksPaid: totalWeeks, totalPaid }
    });
  }

  // GET /api/tuition/summary
  if (route === '/tuition/summary' && method === 'GET') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const regs = await db.collection('computer_tuition_registrations').find({}).toArray();
    const payments = await db.collection('computer_tuition_payments').find({}).toArray();
    const s = await getSettings(db);

    const weeklyFee = s.weeklyFee || 500;
    const weeksInProgram = Math.max(1, Math.ceil((new Date(s.endDate) - new Date(s.startDate)) / (7 * 24 * 60 * 60 * 1000)));
    const totalFeePerStudent = weeklyFee * weeksInProgram;

    const counts = { pending: 0, approved: 0, rejected: 0, waitlisted: 0 };
    for (const r of regs) {
      const st = r.application_status;
      if (counts[st] !== undefined) counts[st]++;
    }
    const totalTuition = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalOwed = regs
      .filter(r => r.application_status === 'approved')
      .reduce((sum) => sum + totalFeePerStudent, 0);
    const totalOutstanding = Math.max(0, totalOwed - totalTuition);

    return success({
      summary: {
        total: regs.length,
        pending: counts.pending,
        approved: counts.approved,
        rejected: counts.rejected,
        waitlisted: counts.waitlisted,
        totalPaid: totalTuition,
        totalOutstanding: totalOutstanding
      }
    });
  }

  // GET /api/tuition/export
  if (route === '/tuition/export' && method === 'GET') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    let rows = await db.collection('computer_tuition_registrations').find({}).sort({ created_at: -1 }).toArray();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q) rows = rows.filter(r =>
      (r.student_name || '').toLowerCase().includes(q) ||
      (r.registration_number || '').toLowerCase().includes(q) ||
      (r.guardian_phone || '').toLowerCase().includes(q)
    );
    const statusFilter = url.searchParams.get('status');
    if (statusFilter) rows = rows.filter(r => r.application_status === statusFilter);
    const format = url.searchParams.get('format') || 'csv';

    if (format === 'json') {
      return success({
        registrations: rows.map(r => ({
          registrationNumber: r.registration_number,
          studentName: r.student_name,
          currentSchool: r.current_school,
          gradeClass: r.grade_class,
          age: r.age,
          guardianName: r.guardian_name,
          guardianPhone: r.guardian_phone,
          applicationStatus: r.application_status,
          paymentStatus: r.payment_status,
          weeksPaid: r.weeks_paid,
          createdAt: r.created_at
        }))
      });
    }

    // CSV
    const csv = [
      'Registration Number,Student Name,School,Grade,Guardian Name,Guardian Phone,Application Status,Payment Status,Weeks Paid,Created At',
      ...rows.map(r => [
        escCsv(r.registration_number),
        escCsv(r.student_name),
        escCsv(r.current_school),
        escCsv(r.grade_class),
        escCsv(r.guardian_name),
        escCsv(r.guardian_phone),
        escCsv(r.application_status),
        escCsv(r.payment_status),
        escCsv(r.weeks_paid),
        escCsv(r.created_at)
      ].join(','))
    ].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="computer-tuition-registrations.csv"'
      }
    });
  }

  // POST /api/tuition/sms/retry
  if (route === '/tuition/sms/retry' && method === 'POST') {
    const { admin, err } = requireAdmin(request, env);
    if (err) return err;

    const { smsLogId } = body;
    if (!smsLogId) return error('SMS log ID is required.', 400);

    const log = await db.collection('computer_tuition_sms_logs').findOne({ _id: smsLogId });
    if (!log || log.status !== 'failed') return error('No failed SMS log found.', 404);

    try {
      const smsSvc = await import('../services/sms.service.js');
      const result = await smsSvc.sendSms(env, {
        phoneNumber: log.phone_number,
        message: log.message,
        registrationId: log.registration_id,
        messageType: 'retry'
      });
      await smsSvc.logSms(db, {
        ...result,
        registration_id: log.registration_id,
        phone_number: log.phone_number,
        message: log.message,
        message_type: 'retry'
      });
      return success({ message: 'SMS retry sent.', result });
    } catch (e) {
      return error('SMS retry failed: ' + e.message, 500);
    }
  }

  return null;
}
