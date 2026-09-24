/**
 * Supabase database adapter for Cloudflare Workers.
 *
 * The application routes were originally written against MongoDB. This adapter
 * intentionally exposes a small Mongo-like API (collection/find/insertOne/etc.)
 * so the existing HTTP contract can migrate to Supabase without changing every
 * frontend endpoint at once.
 */

const DEFAULT_LIMIT = 5000;

const TABLES = {
  admins: 'admins',
  teachers: 'teachers',
  students: 'students',
  classes: 'classes',
  subjects: 'subjects',
  syllabus: 'syllabus',
  assessments: 'assessments',
  assessmentResults: 'assessment_results',
  attendances: 'attendance_records',
  visitors: 'visitors',
  holidayassignments: 'holiday_assignments',
  contents: 'contents',
  content: 'contents',
  grades: 'grades'
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unwrapId(value) {
  if (value == null) return value;
  if (typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return String(value);
}

function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
}

function snakeToCamel(value) {
  return String(value).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function isoFromDateAndTime(date, time) {
  if (!date) return null;
  if (!time) return `${date}T00:00:00+03:00`;
  return `${date}T${String(time).slice(0, 8)}+03:00`;
}

function datePart(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function timePart(value) {
  if (!value) return null;
  return String(value).slice(11, 19) || null;
}

function toDbRow(collection, input) {
  const x = { ...input };
  delete x._id;

  switch (collection) {
    case 'admins':
      return {
        username: x.username,
        email: x.email,
        password_hash: x.password_hash ?? x.passwordHash,
        full_name: x.full_name ?? x.fullName,
        role: x.role ?? 'Admin',
        is_active: x.is_active !== undefined ? !!x.is_active : true,
        last_login: x.last_login ?? x.lastLogin ?? null,
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'teachers':
      return {
        first_name: x.first_name ?? x.firstName,
        last_name: x.last_name ?? x.lastName,
        email: x.email,
        password_hash: x.password_hash ?? x.password ?? null,
        employee_id: x.employee_id ?? x.employeeId,
        phone_number: x.phone_number ?? x.phoneNumber ?? '',
        department: x.department ?? 'Teaching',
        position: x.position ?? null,
        is_active: x.is_active !== undefined ? !!x.is_active : (x.isActive !== undefined ? !!x.isActive : true),
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'students': {
      const hasNameParts = x.full_name !== undefined || x.fullName !== undefined || x.firstName !== undefined || x.lastName !== undefined;
      const fullName = x.full_name ?? x.fullName ?? `${x.firstName ?? ''} ${x.lastName ?? ''}`.trim();
      const row = {
        student_id: x.student_id ?? x.studentId ?? x.admissionNumber,
        learner_code: x.learner_code ?? x.learnerCode ?? null,
        admission_number: x.admission_number ?? x.admissionNumber,
        first_name: x.first_name ?? x.firstName,
        last_name: x.last_name ?? x.lastName,
        ...(hasNameParts ? { full_name: fullName || 'Student' } : {}),
        date_of_birth: x.date_of_birth ?? x.dateOfBirth ?? null,
        gender: x.gender ?? null,
        email: x.email ?? '',
        phone: x.phone ?? '',
        parent_id: x.parent_id ?? x.parentId ?? '',
        age: x.age ?? null,
        grade: x.grade ?? '',
        class_name: x.class_name ?? x.class ?? '',
        stream: x.stream ?? '',
        branch: x.branch ?? 'main',
        password_hash: x.password_hash ?? x.password ?? null,
        status: x.status ?? (x.isActive === false ? 'INACTIVE' : 'ACTIVE'),
        is_active: x.is_active !== undefined ? !!x.is_active : (x.isActive !== undefined ? !!x.isActive : true),
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };
      return row;
    }

    case 'classes':
      return {
        name: x.name,
        description: x.description ?? '',
        capacity: Number(x.capacity ?? 30),
        form: x.form ?? '',
        education_level_id: x.education_level_id ?? x.educationLevelId ?? null,
        teacher_id: x.teacher_id ?? x.teacherId ?? null,
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'subjects':
      return {
        name: x.name,
        code: x.code ?? '',
        class_name: x.class_name ?? x.class ?? x.grade ?? '',
        grade: x.grade ?? null,
        description: x.description ?? '',
        teacher_id: x.teacher_id ?? x.teacherId ?? null,
        has_internal: x.has_internal !== undefined ? !!x.has_internal : (x.hasInternal !== undefined ? !!x.hasInternal : true),
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'syllabus':
      return {
        subject: x.subject ?? '',
        class_name: x.class_name ?? x.class ?? '',
        title: x.title,
        content: x.content ?? '',
        description: x.description ?? '',
        file_url: x.file_url ?? x.fileUrl ?? '',
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'assessments':
      return {
        name: x.name ?? x.title,
        title: x.title ?? x.name,
        assessment_type: x.assessment_type ?? x.assessmentType ?? x.category ?? 'cat1',
        assessment_period: x.assessment_period ?? x.term ?? '',
        assessment_date: x.assessment_date ?? x.assessmentDate ?? null,
        class_name: x.class_name ?? x.class ?? '',
        subject: x.subject ?? '',
        term: x.term ?? '',
        category: x.category ?? 'cat1',
        max_marks: x.max_marks ?? x.maxMarks ?? 100,
        academic_year: x.academic_year ?? x.academicYear ?? '',
        description: x.description ?? '',
        is_draft: !!x.is_draft,
        is_published: !!x.is_published,
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'assessmentResults':
      return {
        assessment_id: unwrapId(x.assessment_id ?? x.assessmentId),
        student_id: unwrapId(x.student_id ?? x.studentId),
        subject: x.subject ?? '',
        term: x.term ?? '',
        marks: x.marks ?? null,
        max_marks: x.max_marks ?? x.maxMarks ?? null,
        grade: x.grade ?? null,
        class_name: x.class_name ?? x.class ?? '',
        performance_level: x.performance_level ?? x.performanceLevel ?? null,
        teacher_comment: x.teacher_comment ?? x.teacherComment ?? null,
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'attendances': {
      const isTeacher = x.type === 'teacher' || !!x.teacherId;
      const checkIn = x.check_in ?? x.checkIn ?? isoFromDateAndTime(x.date ?? x.attendanceDate, x.time);
      return {
        person_type: isTeacher ? 'staff' : 'student',
        student_id: isTeacher ? null : (UUID_RE.test(unwrapId(x.studentId)) ? unwrapId(x.studentId) : null),
        teacher_id: isTeacher ? (UUID_RE.test(unwrapId(x.teacherId)) ? unwrapId(x.teacherId) : null) : null,
        person_code: x.person_code ?? x.personCode ?? x.studentId ?? x.teacherId ?? null,
        person_name: x.person_name ?? x.personName ?? x.studentName ?? x.teacherName ?? 'Unknown',
        class_name: x.class_name ?? x.class ?? null,
        branch: x.branch ?? 'main',
        attendance_date: x.attendance_date ?? x.date ?? datePart(checkIn),
        check_in: checkIn,
        check_out: x.check_out ?? x.checkOut ?? null,
        status: x.status === 'teacher' ? 'present' : (x.status ?? 'present'),
        notes: x.notes ?? null,
        location: x.location ?? null,
        is_late: !!x.is_late,
        hours_worked: x.hours_worked ?? null,
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };
    }

    case 'visitors':
      return {
        visitor_code: x.visitor_code ?? x.visitorCode ?? null,
        name: x.name,
        phone: x.phone ?? x.visitorPhone ?? '',
        national_id: x.national_id ?? x.nationalId ?? null,
        visitor_type: x.visitor_type ?? x.visitorType ?? 'Parent',
        purpose: x.purpose ?? '',
        accompany: x.accompany ?? '',
        whom_to_see: x.whom_to_see ?? x.whomToSee ?? '',
        branch: x.branch ?? 'main',
        visit_date: x.visit_date ?? x.visitDate ?? x.date ?? datePart(x.check_in) ?? new Date().toISOString().slice(0,10),
        check_in: x.check_in ?? x.checkIn ?? isoFromDateAndTime(x.date, x.time),
        check_out: x.check_out ?? x.checkOut ?? (x.checkoutTime ? isoFromDateAndTime(x.date, x.checkoutTime) : null),
        status: x.status ?? 'in',
        notes: x.notes ?? '',
        time_spent: x.time_spent ?? x.timeSpent ?? null,
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'holidayassignments':
      return {
        title: x.title,
        grade: x.grade,
        subject: x.subject ?? '',
        description: x.description ?? '',
        file_name: x.file_name ?? x.fileName ?? '',
        file_type: x.file_type ?? x.fileType ?? '',
        file_size: x.file_size ?? x.fileSize ?? 0,
        file_url: x.file_url ?? x.filePath ?? '',
        file_path: x.file_path ?? x.filePath ?? '',
        file_public_id: x.file_public_id ?? x.filePublicId ?? null,
        file_resource_type: x.file_resource_type ?? x.fileResourceType ?? null,
        uploaded_by: x.uploaded_by ?? x.uploadedBy ?? 'Admin',
        is_active: x.is_active !== undefined ? !!x.is_active : (x.isActive !== undefined ? !!x.isActive : true),
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'contents':
      return {
        section_key: x.section_key ?? x.sectionKey ?? 'main',
        data: x.data ?? (typeof x.content === 'string' ? safeJson(x.content) : (x.content ?? {})),
        is_published: x.is_published !== undefined ? !!x.is_published : true,
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    case 'grades':
      return {
        name: x.name,
        description: x.description ?? '',
        sort_order: x.sort_order ?? x.sortOrder ?? 0,
        created_at: x.created_at ?? x.createdAt ?? undefined,
        updated_at: x.updated_at ?? x.updatedAt ?? undefined
      };

    default: {
      const row = {};
      for (const [k, v] of Object.entries(x)) row[camelToSnake(k)] = v;
      return row;
    }
  }
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return value; }
}

function fromDbRow(collection, row) {
  if (!row) return null;
  const base = { ...row, _id: row.id };
  delete base.id;

  switch (collection) {
    case 'admins':
      return { ...base, password_hash: row.password_hash, full_name: row.full_name, is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at };
    case 'teachers':
      return { ...base, firstName: row.first_name, lastName: row.last_name, employeeId: row.employee_id, phoneNumber: row.phone_number, password: row.password_hash, password_hash: row.password_hash, isActive: row.is_active, createdAt: row.created_at, updatedAt: row.updated_at };
    case 'students':
      return {
        ...base,
        admissionNumber: row.admission_number,
        studentId: row.student_id ?? row.admission_number,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        class: row.class_name,
        grade: row.grade,
        age: row.age,
        gender: row.gender,
        dateOfBirth: row.date_of_birth,
        parentId: row.parent_id,
        stream: row.stream,
        branch: row.branch,
        password: row.password_hash,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    case 'classes':
      return { ...base, createdAt: row.created_at, updatedAt: row.updated_at };
    case 'subjects':
      return { ...base, class: row.class_name, teacherId: row.teacher_id, hasInternal: row.has_internal, createdAt: row.created_at, updatedAt: row.updated_at };
    case 'syllabus':
      return { ...base, class: row.class_name, fileUrl: row.file_url, createdAt: row.created_at, updatedAt: row.updated_at };
    case 'assessments':
      return { ...base, title: row.title ?? row.name, name: row.name, class: row.class_name, subject: row.subject, term: row.term ?? row.assessment_period, category: row.category ?? row.assessment_type, maxMarks: row.max_marks, academicYear: row.academic_year, createdAt: row.created_at, updatedAt: row.updated_at };
    case 'assessmentResults':
      return { ...base, assessmentId: row.assessment_id, studentId: row.student_id, class: row.class_name, maxMarks: row.max_marks, performanceLevel: row.performance_level, teacherComment: row.teacher_comment, createdAt: row.created_at, updatedAt: row.updated_at };
    case 'attendances':
      return {
        ...base,
        studentId: row.student_id ?? row.person_code,
        studentName: row.person_type === 'student' ? row.person_name : undefined,
        teacherId: row.teacher_id ?? (row.person_type === 'staff' ? row.person_code : undefined),
        teacherName: row.person_type === 'staff' ? row.person_name : undefined,
        class: row.class_name,
        date: row.attendance_date,
        time: timePart(row.check_in),
        checkIn: row.check_in,
        checkOut: row.check_out,
        branch: row.branch,
        type: row.person_type === 'staff' ? 'teacher' : 'student',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        status: row.status
      };
    case 'visitors':
      return {
        ...base,
        visitorPhone: row.phone,
        visitorType: row.visitor_type,
        whomToSee: row.whom_to_see,
        date: row.visit_date,
        time: timePart(row.check_in),
        checkoutTime: timePart(row.check_out),
        timeSpent: row.time_spent,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    case 'holidayassignments':
      return {
        ...base,
        fileName: row.file_name,
        fileType: row.file_type,
        fileSize: row.file_size,
        filePath: row.file_path ?? row.file_url,
        filePublicId: row.file_public_id,
        fileResourceType: row.file_resource_type,
        uploadedBy: row.uploaded_by,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    case 'contents':
      return { ...base, content: row.data, section_key: row.section_key, created_at: row.created_at, updated_at: row.updated_at };
    case 'grades':
      return { ...base, createdAt: row.created_at, updatedAt: row.updated_at };
    default:
      return { ...base };
  }
}

function getPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], obj);
}

function equals(a, b) {
  if (a == null && b == null) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  return String(a) === String(b);
}

function matches(doc, query) {
  if (!query || !Object.keys(query).length) return true;
  if (Array.isArray(query.$or)) return query.$or.some(q => matches(doc, q)) && Object.entries(query).filter(([k]) => k !== '$or').every(([k,v]) => matchesField(getPath(doc,k),v));
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some(q => matches(doc,q));
    return matchesField(getPath(doc, key), expected);
  });
}

function matchesField(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$ne' in expected) return !equals(actual, expected.$ne);
    if ('$in' in expected) return expected.$in.some(v => equals(actual,v));
    if ('$exists' in expected) return expected.$exists ? actual !== undefined : actual === undefined;
  }
  return equals(actual, expected);
}

class Cursor {
  constructor(rows) { this.rows = rows; }
  sort(spec) {
    const entries = Object.entries(spec || {});
    this.rows.sort((a,b) => {
      for (const [field, direction] of entries) {
        const av = getPath(a, field), bv = getPath(b, field);
        if (av === bv) continue;
        if (av == null) return -1 * direction;
        if (bv == null) return 1 * direction;
        return (av > bv ? 1 : -1) * direction;
      }
      return 0;
    });
    return this;
  }
  limit(n) { this.rows = this.rows.slice(0, Number(n)); return this; }
  async toArray() { return this.rows; }
}

class SupabaseCollection {
  constructor(client, name) { this.client = client; this.name = name; this.table = TABLES[name] || name; }

  async findRows() {
    const rows = await this.client.select(this.table);
    return rows.map(r => fromDbRow(this.name, r));
  }

  find(query = {}) {
    const promise = this.findRows().then(rows => new Cursor(rows.filter(r => matches(r, query))));
    return {
      sort: asyncSort(promise),
      limit: asyncLimit(promise),
      toArray: () => promise
    };
  }

  async findOne(query = {}) {
    const rows = await this.findRows();
    return rows.find(r => matches(r, query)) ?? null;
  }

  async insertOne(doc) {
    const row = toDbRow(this.name, doc);
    const inserted = await this.client.insert(this.table, row);
    const result = fromDbRow(this.name, inserted);
    return { insertedId: result?._id ?? inserted.id, acknowledged: true };
  }

  async updateOne(filter, update, options = {}) {
    const existing = await this.findOne(filter);
    const patch = update?.$set ? update.$set : update || {};
    if (!existing) {
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedId: null };
      const doc = { ...filter, ...patch };
      const inserted = await this.insertOne(doc);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: inserted.insertedId };
    }
    const id = unwrapId(existing._id);
    const rowPatch = toDbRow(this.name, { ...patch });
    delete rowPatch.id;
    const updated = await this.client.updateById(this.table, id, rowPatch);
    return { matchedCount: 1, modifiedCount: updated ? 1 : 0, upsertedId: null };
  }

  async deleteOne(filter) {
    const existing = await this.findOne(filter);
    if (!existing) return { deletedCount: 0 };
    await this.client.deleteById(this.table, unwrapId(existing._id));
    return { deletedCount: 1 };
  }

  aggregate(pipeline = []) {
    let cursorPromise = this.findRows();
    for (const stage of pipeline) {
      if (stage.$match) cursorPromise = cursorPromise.then(rows => rows.filter(r => matches(r, stage.$match)));
      if (stage.$sort) cursorPromise = cursorPromise.then(rows => new Cursor(rows).sort(stage.$sort).rows);
      if (stage.$limit) cursorPromise = cursorPromise.then(rows => rows.slice(0, Number(stage.$limit)));
    }
    return { toArray: () => cursorPromise };
  }
}

function asyncSort(promise) {
  const state = { promise };
  return {
    sort(spec) { state.promise = state.promise.then(rows => new Cursor(rows).sort(spec).rows); return this; },
    limit(n) { state.promise = state.promise.then(rows => rows.slice(0, Number(n))); return this; },
    toArray() { return state.promise; }
  };
}
function asyncLimit(promise) { return asyncSort(promise); }

class SupabaseClient {
  constructor(env) {
    this.url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!this.url || !this.key) throw new Error('Supabase not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  headers(extra = {}) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      ...options,
      headers: this.headers(options.headers || {})
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const message = data?.message || data?.error_description || data?.hint || text || `Supabase HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  async select(table) {
    const query = `select=*`;
    return await this.request(`${table}?${query}`, {
      method: 'GET',
      headers: { Range: `0-${DEFAULT_LIMIT - 1}`, Prefer: 'count=exact' }
    });
  }

  async insert(table, row) {
    return (await this.request(table, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(cleanUndefined(row))
    }))[0];
  }

  async updateById(table, id, row) {
    const data = await this.request(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(cleanUndefined(row))
    });
    return data[0] ?? null;
  }

  async deleteById(table, id) {
    return this.request(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
  }
}

function cleanUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([,v]) => v !== undefined));
}

export function connectToDatabase(env) {
  return Promise.resolve(new SupabaseDatabase(env));
}

export async function checkDbHealth(env) {
  try {
    const client = new SupabaseClient(env);
    const started = Date.now();
    await client.request('contents?select=id&limit=1', { method: 'GET' });
    return {
      ok: true,
      latencyMs: Date.now() - started,
      dbName: 'supabase-postgresql',
      collectionAccessible: true
    };
  } catch (err) {
    return { ok: false, error: err.message, code: err.status || 'SUPABASE_ERROR' };
  }
}

class SupabaseDatabase {
  constructor(env) { this.client = new SupabaseClient(env); }
  collection(name) { return new SupabaseCollection(this.client, name); }
}

export class DbId {
  constructor(value) {
    this.value = unwrapId(value);
  }
  toString() { return this.value; }
  valueOf() { return this.value; }
}
