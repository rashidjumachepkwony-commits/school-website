# === Cloudflare D1 Migration ===
# Run: wrangler d1 execute DB --file=schema.sql

-- ============================================
-- Changara Star Academy - D1 Database Schema
-- ============================================

CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'Admin',
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone_number TEXT DEFAULT '',
    department TEXT DEFAULT 'Teaching',
    position TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    hours_worked REAL DEFAULT 0,
    status TEXT DEFAULT 'Present',
    is_late INTEGER DEFAULT 0,
    notes TEXT,
    location TEXT DEFAULT 'School',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(staff_id, attendance_date),
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pin TEXT NOT NULL,
    grade TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    status TEXT DEFAULT 'Present',
    is_late INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    badge_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    id_number TEXT,
    person_visiting TEXT,
    purpose TEXT,
    check_in TEXT,
    check_out TEXT,
    status TEXT DEFAULT 'Checked In',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_key TEXT UNIQUE NOT NULL,
    title TEXT DEFAULT '',
    content TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff ON staff_attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(status);
CREATE INDEX IF NOT EXISTS idx_visitors_check_in ON visitors(check_in);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_id);
