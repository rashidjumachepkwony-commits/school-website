// ============================================
// API BASE URL (change when deployed)
// ============================================
const API_URL = 'http://localhost:3000/api';

// ============================================
// VISITOR FUNCTIONS
// ============================================

// Visitor Check-In
async function visitorCheckIn(id, name, phone, purpose) {
    try {
        const response = await fetch(`${API_URL}/visitor/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, phone, purpose })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}

// Visitor Check-Out
async function visitorCheckOut(id) {
    try {
        const response = await fetch(`${API_URL}/visitor/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}

// Get Today's Visitors
async function getTodayVisitors() {
    try {
        const response = await fetch(`${API_URL}/visitor/today`);
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}

// ============================================
// STAFF FUNCTIONS
// ============================================

// Staff Check-In
async function staffCheckIn(staffId, pin) {
    try {
        const response = await fetch(`${API_URL}/staff/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staffId, pin, action: 'IN' })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}

// Staff Check-Out
async function staffCheckOut(staffId, pin) {
    try {
        const response = await fetch(`${API_URL}/staff/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staffId, pin, action: 'OUT' })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}

// ============================================
// STUDENT FUNCTIONS
// ============================================

// Student Check-In
async function studentCheckIn(studentId, pin) {
    try {
        const response = await fetch(`${API_URL}/student/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, pin, action: 'IN' })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}

// Student Check-Out
async function studentCheckOut(studentId, pin) {
    try {
        const response = await fetch(`${API_URL}/student/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, pin, action: 'OUT' })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

// Verify Admin PIN
async function verifyAdminPin(pin) {
    try {
        const response = await fetch(`${API_URL}/admin/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}

// Get Dashboard Data
async function getDashboardData() {
    try {
        const response = await fetch(`${API_URL}/admin/dashboard`);
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, message: '❌ Error: ' + error.message };
    }
}