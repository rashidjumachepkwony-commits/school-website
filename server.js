const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const pdf = require('html-pdf');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// CRITICAL: GET KENYA TIME (UTC+3) - THE RIGHT WAY
// ============================================
function getKenyaTime() {
    // Get current UTC time
    const now = new Date();
    // Kenya is UTC+3, so add 3 hours
    const kenyaTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    return kenyaTime;
}

function getKenyaDate() {
    const kenyaTime = getKenyaTime();
    const date = new Date(kenyaTime);
    date.setHours(0, 0, 0, 0);
    return date;
}

function getKenyaHour() {
    return getKenyaTime().getHours();
}

function getKenyaMinutes() {
    return getKenyaTime().getMinutes();
}

// SIMPLE TIME FORMATTER - NO TIMEZONE CONFUSION
function formatKenyaTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    let hours = d.getHours();
    let minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; // 12-hour format
    const strMinutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + strMinutes + ' ' + ampm;
}

function formatKenyaFullTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    let hours = d.getHours();
    let minutes = d.getMinutes();
    let seconds = d.getSeconds();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strMinutes = minutes < 10 ? '0' + minutes : minutes;
    const strSeconds = seconds < 10 ? '0' + seconds : seconds;
    return hours + ':' + strMinutes + ':' + strSeconds + ' ' + ampm;
}

function formatKenyaDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

// ============================================
// FIX PAST RECORDS - FORCE CORRECT TIME
// ============================================
async function fixPastRecords() {
    try {
        console.log('🔄 Starting time fix for all past records...');
        let totalFixed = 0;

        // Fix Teachers
        const teachers = await Teacher.find({});
        let teacherCount = 0;
        for (const teacher of teachers) {
            let changed = false;
            for (const record of teacher.attendance) {
                if (record.checkIn) {
                    const original = new Date(record.checkIn);
                    // Force add 3 hours for Kenya time
                    const kenyaTime = new Date(original.getTime() + (3 * 60 * 60 * 1000));
                    record.checkIn = kenyaTime;
                    changed = true;
                }
                if (record.checkOut) {
                    const original = new Date(record.checkOut);
                    const kenyaTime = new Date(original.getTime() + (3 * 60 * 60 * 1000));
                    record.checkOut = kenyaTime;
                    changed = true;
                }
            }
            if (changed) {
                await teacher.save();
                teacherCount++;
                totalFixed++;
                console.log(`  ✅ Fixed ${teacher.firstName} ${teacher.lastName}`);
            }
        }
        console.log(`✅ Fixed ${teacherCount} teacher records`);

        // Fix Visitors
        const visitors = await Visitor.find({});
        let visitorCount = 0;
        for (const visitor of visitors) {
            let changed = false;
            if (visitor.checkIn) {
                const original = new Date(visitor.checkIn);
                visitor.checkIn = new Date(original.getTime() + (3 * 60 * 60 * 1000));
                changed = true;
            }
            if (visitor.checkOut) {
                const original = new Date(visitor.checkOut);
                visitor.checkOut = new Date(original.getTime() + (3 * 60 * 60 * 1000));
                changed = true;
            }
            if (changed) {
                await visitor.save();
                visitorCount++;
                totalFixed++;
            }
        }
        console.log(`✅ Fixed ${visitorCount} visitor records`);
        
        console.log(`✅ TOTAL FIXED: ${totalFixed} records`);
        return { totalFixed };
    } catch (error) {
        console.error('❌ Error fixing records:', error);
        return { error: error.message };
    }
}

// ============================================
// CONNECT TO MONGODB
// ============================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolDB')
  .then(() => {
    console.log('✅ MongoDB Connected');
    // Auto-fix past records on startup
    setTimeout(fixPastRecords, 3000);
  })
  .catch(err => console.error('❌ MongoDB Error:', err.message));

// ============================================
// FILE UPLOAD SETUP
// ============================================
const uploadDirs = ['./uploads', './uploads/images', './uploads/videos', './uploads/audio'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let folder = 'uploads/';
        if (file.mimetype.startsWith('image/')) {
            folder = 'uploads/images/';
        } else if (file.mimetype.startsWith('video/')) {
            folder = 'uploads/videos/';
        } else if (file.mimetype.startsWith('audio/')) {
            folder = 'uploads/audio/';
        }
        cb(null, folder);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = file.originalname.split('.').pop();
        cb(null, uniqueSuffix + '.' + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ============================================
// SCHEMAS
// ============================================

const contentSchema = new mongoose.Schema({
    heroTitle: { type: String, default: 'Welcome to Changara Star Academy' },
    heroSubtitle: { type: String, default: 'Your trusted partner in quality education' },
    heroButtonText: { type: String, default: 'Learn More' },
    heroButtonLink: { type: String, default: '/about.html' },
    heroVideo: { type: String, default: '' },
    applyButtonText: { type: String, default: 'Apply Now' },
    homeFeatures: [{ icon: String, title: String, description: String }],
    homeStats: [{ number: String, label: String }],
    homeNews: [{ title: String, content: String, date: Date }],
    aboutMission: String,
    aboutVision: String,
    aboutValues: String,
    aboutHistory: String,
    aboutMotto: String,
    aboutWhy: String,
    academicsIntro: String,
    academics: [{ grade: String, subjects: String, learningApproach: String, activities: String, teacherSupport: String }],
    admissionsIntro: String,
    admissionsRequirements: String,
    admissionsAge: String,
    admissionsDocuments: String,
    admissionsProcess: String,
    admissionsFees: String,
    facilitiesIntro: String,
    facilities: [{ name: String, description: String, image: String }],
    gallery: [{ title: String, description: String, file: String, type: String, category: String }],
    events: [{ title: String, content: String, date: Date, category: String, image: String }],
    coCurricular: [{ name: String, description: String, category: String, image: String }],
    performanceIntro: String,
    performanceKcpe: String,
    performanceInternal: String,
    parentsIntro: String,
    parentsCalendar: String,
    parentsHomework: String,
    parentsAttendance: String,
    parentsRules: String,
    parentsUniform: String,
    parentsFees: String,
    downloadsIntro: String,
    downloads: [{ name: String, file: String, description: String, icon: String }],
    feesIntro: String,
    feesPaybill: String,
    feesInstructions: String,
    contactIntro: String,
    contactAddress: String,
    contactPhone: String,
    contactEmail: String,
    contactHours: String,
    contactMap: String,
    footerText: String,
    seoTitle: String,
    seoDescription: String,
    seoKeywords: String,
    noticeAlert: String,
    noticeType: String,
    noticeDate: Date,
    lastUpdated: Date,
    updatedBy: String
});

contentSchema.statics.getContent = async function() {
    let content = await this.findOne();
    if (!content) {
        content = await this.create({});
    }
    return content;
};

const Content = mongoose.model('Content', contentSchema);

const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    role: { type: String, default: 'Admin' },
    isActive: { type: Boolean, default: true },
    lastLogin: Date
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);

const teacherSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 4 },
    phoneNumber: { type: String, trim: true },
    employeeId: { type: String, required: true, unique: true },
    department: { type: String, default: 'Teaching' },
    isActive: { type: Boolean, default: true },
    attendance: [{
        date: Date,
        checkIn: Date,
        checkOut: Date,
        status: { type: String, enum: ['Present', 'Absent', 'Late', 'Excused'], default: 'Present' },
        notes: String,
        location: String,
        hoursWorked: Number,
        isLate: { type: Boolean, default: false }
    }],
    createdAt: { type: Date, default: Date.now }
});

const Teacher = mongoose.model('Teacher', teacherSchema);

const visitorSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true },
    phoneNumber: { type: String, required: true },
    idNumber: { type: String, required: true },
    purpose: { type: String, enum: ['Interview', 'Meeting', 'Delivery', 'Parent Visit', 'Visitor', 'Other'], required: true },
    purposeDetails: String,
    personToVisit: { type: String, required: true },
    department: String,
    checkIn: { type: Date, required: true, default: Date.now },
    checkOut: Date,
    status: { type: String, enum: ['Checked In', 'Checked Out'], default: 'Checked In' },
    badgeNumber: { type: String, unique: true },
    hostName: String,
    notes: String,
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

visitorSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

visitorSchema.set('toJSON', { virtuals: true });
visitorSchema.set('toObject', { virtuals: true });

const Visitor = mongoose.model('Visitor', visitorSchema);

// ============================================
// API ROUTES
// ============================================

// FIX PAST RECORDS - MANUAL API
app.post('/api/fix-past-times', async (req, res) => {
    try {
        const result = await fixPastRecords();
        res.json({ success: true, message: '✅ Past records time fixed successfully!', result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET CURRENT KENYA TIME
app.get('/api/current-time', (req, res) => {
    const now = getKenyaTime();
    res.json({
        success: true,
        kenyaTime: now,
        formatted: formatKenyaFullTime(now),
        date: formatKenyaDate(now),
        hour: getKenyaHour(),
        minutes: getKenyaMinutes()
    });
});

// ============================================
// TEACHER CHECK-IN - COMPLETE FIX
// ============================================
app.post('/api/teacher/checkin', async (req, res) => {
    try {
        const { employeeId, pin } = req.body;
        
        const teacher = await Teacher.findOne({ employeeId });
        if (!teacher) {
            return res.status(404).json({ 
                success: false, 
                message: '❌ Staff not found. Please contact admin.' 
            });
        }
        
        if (teacher.password !== pin) {
            return res.status(401).json({
                success: false,
                message: '❌ Invalid PIN. Please try again.'
            });
        }
        
        // CRITICAL: Get Kenya time
        const kenyaNow = getKenyaTime();
        const kenyaToday = getKenyaDate();
        const kenyaHour = getKenyaHour();
        const dayOfWeek = kenyaNow.getDay();
        
        console.log('========================================');
        console.log('📍 CHECK-IN REQUEST');
        console.log('📅 Kenya Date:', formatKenyaDate(kenyaNow));
        console.log('🕐 Kenya Time:', formatKenyaFullTime(kenyaNow));
        console.log('🕐 Hour (24h):', kenyaHour);
        console.log('🕐 Raw Date:', kenyaNow.toString());
        console.log('========================================');
        
        // Weekend check
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return res.status(400).json({
                success: false,
                message: '📅 Weekend! Check-in is only available on weekdays (Monday-Friday).'
            });
        }
        
        // Check if already checked in today
        const existingAttendance = teacher.attendance.find(a => {
            const aDate = new Date(a.date);
            aDate.setHours(0, 0, 0, 0);
            return aDate.getTime() === kenyaToday.getTime();
        });
        
        if (existingAttendance) {
            return res.status(400).json({
                success: false,
                message: '⚠️ You already checked in today at ' + formatKenyaTime(existingAttendance.checkIn)
            });
        }
        
        // Check if after 5:00 PM
        if (kenyaHour >= 17) {
            return res.status(400).json({
                success: false,
                message: '⏰ Check-in is not allowed after 5:00 PM. Please try again tomorrow.'
            });
        }
        
        // Determine if late (after 7:00 AM)
        const isLate = kenyaHour > 7 || (kenyaHour === 7 && kenyaNow.getMinutes() > 0);
        const status = isLate ? 'Late' : 'Present';
        
        // Store check-in time - STORE AS IS (already Kenya time)
        teacher.attendance.push({
            date: kenyaToday,
            checkIn: kenyaNow,
            status: status,
            location: 'School',
            isLate: isLate,
            notes: isLate ? 'Late check-in' : 'On-time check-in'
        });
        
        await teacher.save();
        
        const message = isLate 
            ? '⚠️ Check-in successful! (You are LATE - after 7:00 AM)' 
            : '✅ Check-in successful! (On time)';
        
        res.json({
            success: true,
            message: message,
            checkInTime: kenyaNow,
            checkInTimeFormatted: formatKenyaTime(kenyaNow),
            checkInFullFormatted: formatKenyaFullTime(kenyaNow),
            isLate: isLate,
            status: status,
            teacher: {
                name: `${teacher.firstName} ${teacher.lastName}`,
                employeeId: teacher.employeeId
            }
        });
        
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================
// TEACHER CHECK-OUT - COMPLETE FIX
// ============================================
app.post('/api/teacher/checkout', async (req, res) => {
    try {
        const { employeeId, pin } = req.body;
        
        const teacher = await Teacher.findOne({ employeeId });
        if (!teacher) {
            return res.status(404).json({ 
                success: false, 
                message: '❌ Staff not found. Please contact admin.' 
            });
        }
        
        if (teacher.password !== pin) {
            return res.status(401).json({
                success: false,
                message: '❌ Invalid PIN. Please try again.'
            });
        }
        
        const kenyaNow = getKenyaTime();
        const kenyaToday = getKenyaDate();
        const kenyaHour = getKenyaHour();
        
        console.log('========================================');
        console.log('📍 CHECK-OUT REQUEST');
        console.log('📅 Kenya Date:', formatKenyaDate(kenyaNow));
        console.log('🕐 Kenya Time:', formatKenyaFullTime(kenyaNow));
        console.log('🕐 Hour (24h):', kenyaHour);
        console.log('========================================');
        
        // Find today's attendance
        const todayAttendance = teacher.attendance.find(a => {
            const aDate = new Date(a.date);
            aDate.setHours(0, 0, 0, 0);
            return aDate.getTime() === kenyaToday.getTime();
        });
        
        if (!todayAttendance) {
            return res.status(400).json({
                success: false,
                message: '❌ No check-in found for today. Please check in first.'
            });
        }
        
        if (todayAttendance.checkOut) {
            return res.status(400).json({
                success: false,
                message: '⚠️ You already checked out today at ' + formatKenyaTime(todayAttendance.checkOut)
            });
        }
        
        // Allow check-out after 3:00 PM
        if (kenyaHour < 15) {
            return res.status(400).json({
                success: false,
                message: '⏰ Check-out is only allowed after 3:00 PM. Please continue working.'
            });
        }
        
        // Store check-out time
        todayAttendance.checkOut = kenyaNow;
        todayAttendance.notes = (todayAttendance.notes || '') + ' Checked out';
        
        const checkInTime = new Date(todayAttendance.checkIn);
        const hoursWorked = ((kenyaNow - checkInTime) / (1000 * 60 * 60)).toFixed(2);
        todayAttendance.hoursWorked = parseFloat(hoursWorked);
        
        await teacher.save();
        
        res.json({
            success: true,
            message: '✅ Check-out successful!',
            checkOutTime: kenyaNow,
            checkOutTimeFormatted: formatKenyaTime(kenyaNow),
            checkOutFullFormatted: formatKenyaFullTime(kenyaNow),
            hoursWorked: hoursWorked,
            teacher: {
                name: `${teacher.firstName} ${teacher.lastName}`,
                employeeId: teacher.employeeId
            }
        });
        
    } catch (error) {
        console.error('Check-out error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================
// GET TODAY'S ATTENDANCE
// ============================================
app.get('/api/teacher/attendance/today', async (req, res) => {
    try {
        const kenyaToday = getKenyaDate();
        
        const teachers = await Teacher.find({ isActive: true });
        
        const todayAttendance = teachers.map(teacher => {
            const todayRecord = teacher.attendance.find(a => {
                const aDate = new Date(a.date);
                aDate.setHours(0, 0, 0, 0);
                return aDate.getTime() === kenyaToday.getTime();
            });
            
            let status = 'Absent';
            let checkInFormatted = null;
            let checkOutFormatted = null;
            
            if (todayRecord) {
                if (todayRecord.checkOut) {
                    status = 'Checked Out';
                    checkOutFormatted = formatKenyaTime(todayRecord.checkOut);
                } else {
                    status = 'Checked In';
                }
                if (todayRecord.checkIn) {
                    checkInFormatted = formatKenyaTime(todayRecord.checkIn);
                }
            }
            
            return {
                name: `${teacher.firstName} ${teacher.lastName}`,
                employeeId: teacher.employeeId,
                department: teacher.department,
                status: status,
                checkIn: todayRecord ? todayRecord.checkIn : null,
                checkOut: todayRecord ? todayRecord.checkOut : null,
                checkInTime: checkInFormatted,
                checkOutTime: checkOutFormatted,
                isLate: todayRecord ? todayRecord.isLate : false,
                hoursWorked: todayRecord ? todayRecord.hoursWorked : 0
            };
        });
        
        res.json({
            success: true,
            date: kenyaToday,
            total: todayAttendance.length,
            attendance: todayAttendance
        });
        
    } catch (error) {
        console.error('Error loading attendance:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================
// GET TEACHER ATTENDANCE HISTORY
// ============================================
app.get('/api/teacher/attendance/:employeeId', async (req, res) => {
    try {
        const teacher = await Teacher.findOne({ 
            employeeId: req.params.employeeId 
        });
        
        if (!teacher) {
            return res.status(404).json({ 
                success: false, 
                message: 'Teacher not found' 
            });
        }
        
        const totalDays = teacher.attendance.length;
        const presentDays = teacher.attendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
        const lateDays = teacher.attendance.filter(a => a.isLate === true).length;
        const absentDays = teacher.attendance.filter(a => a.status === 'Absent').length;
        
        res.json({
            success: true,
            teacher: {
                name: `${teacher.firstName} ${teacher.lastName}`,
                employeeId: teacher.employeeId,
                department: teacher.department
            },
            stats: {
                totalDays,
                presentDays,
                lateDays,
                absentDays,
                attendanceRate: totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(2) : 0
            },
            attendance: teacher.attendance.sort((a, b) => b.date - a.date)
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================
// ADMIN ROUTES
// ============================================

app.post('/api/setup-admin', async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;
        if (!username || !email || !password || !fullName) {
            return res.status(400).json({ success: false, message: 'Please provide all fields' });
        }
        const existing = await Admin.findOne({ $or: [{ username }, { email }] });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Admin already exists' });
        }
        const admin = new Admin({ username, email, password, fullName, role: 'Super Admin' });
        await admin.save();
        res.json({ success: true, message: 'Admin created successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Please provide username and password' });
        }
        const admin = await Admin.findOne({ $or: [{ username }, { email: username }] });
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        if (admin.password !== password) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        admin.lastLogin = new Date();
        await admin.save();
        res.json({ success: true, message: 'Login successful!', admin: { id: admin._id, username: admin.username, fullName: admin.fullName, role: admin.role } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// TEACHER MANAGEMENT
// ============================================

app.post('/api/teacher/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, employeeId, phoneNumber, department } = req.body;
        const existing = await Teacher.findOne({ $or: [{ email }, { employeeId }] });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email or Employee ID already exists' });
        }
        const teacher = new Teacher({ firstName, lastName, email, password: password || '1234', employeeId, phoneNumber: phoneNumber || '', department: department || 'Teaching' });
        await teacher.save();
        res.json({ success: true, message: 'Staff registered successfully!', teacher });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/teachers', async (req, res) => {
    try {
        const teachers = await Teacher.find({ isActive: true }).select('-password');
        res.json({ success: true, count: teachers.length, teachers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/teachers/:id', async (req, res) => {
    try {
        const teacher = await Teacher.findById(req.params.id).select('-password');
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        res.json({ success: true, teacher });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/teachers/:id', async (req, res) => {
    try {
        const { firstName, lastName, email, employeeId, phoneNumber, department } = req.body;
        const teacher = await Teacher.findById(req.params.id);
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        teacher.firstName = firstName || teacher.firstName;
        teacher.lastName = lastName || teacher.lastName;
        teacher.email = email || teacher.email;
        teacher.employeeId = employeeId || teacher.employeeId;
        teacher.phoneNumber = phoneNumber || teacher.phoneNumber;
        teacher.department = department || teacher.department;
        await teacher.save();
        res.json({ success: true, message: 'Teacher updated successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/teachers/:id', async (req, res) => {
    try {
        await Teacher.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Teacher deleted successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/teachers/:id/reset-pin', async (req, res) => {
    try {
        const { pin } = req.body;
        const teacher = await Teacher.findById(req.params.id);
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        if (!pin || pin.length < 4 || pin.length > 6) {
            return res.status(400).json({ success: false, message: 'PIN must be 4-6 digits' });
        }
        teacher.password = pin;
        await teacher.save();
        res.json({ success: true, message: 'PIN reset successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN ATTENDANCE
// ============================================

app.get('/api/admin/attendance/all', async (req, res) => {
    try {
        const teachers = await Teacher.find({ isActive: true });
        const allAttendance = teachers.map(teacher => ({
            id: teacher._id,
            name: `${teacher.firstName} ${teacher.lastName}`,
            employeeId: teacher.employeeId,
            department: teacher.department,
            email: teacher.email,
            phoneNumber: teacher.phoneNumber,
            totalDays: teacher.attendance.length,
            attendance: teacher.attendance.sort((a, b) => b.date - a.date)
        }));
        res.json({ success: true, count: allAttendance.length, teachers: allAttendance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/admin/attendance/summary', async (req, res) => {
    try {
        const teachers = await Teacher.find({ isActive: true });
        const kenyaToday = getKenyaDate();
        let totalTeachers = teachers.length;
        let totalPresent = 0;
        let totalLate = 0;
        let totalAbsent = 0;
        teachers.forEach(teacher => {
            const todayRecord = teacher.attendance.find(a => {
                const aDate = new Date(a.date);
                aDate.setHours(0, 0, 0, 0);
                return aDate.getTime() === kenyaToday.getTime();
            });
            if (todayRecord) {
                if (todayRecord.isLate) {
                    totalLate++;
                } else {
                    totalPresent++;
                }
            } else {
                totalAbsent++;
            }
        });
        res.json({ 
            success: true, 
            today: { 
                date: kenyaToday, 
                total: totalTeachers, 
                present: totalPresent, 
                late: totalLate, 
                absent: totalAbsent, 
                attendanceRate: totalTeachers > 0 ? ((totalPresent / totalTeachers) * 100).toFixed(2) : 0 
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// VISITOR ROUTES
// ============================================

app.post('/api/visitor/checkin', async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, idNumber, purpose, personToVisit, hostName } = req.body;
        if (!firstName || !lastName || !phoneNumber || !idNumber || !purpose || !personToVisit) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }
        const badgeNumber = 'V' + Date.now().toString().slice(-6);
        const kenyaNow = getKenyaTime();
        const visitor = new Visitor({ firstName, lastName, phoneNumber, idNumber, purpose, personToVisit, hostName: hostName || '', badgeNumber, checkIn: kenyaNow, status: 'Checked In' });
        await visitor.save();
        res.status(201).json({ 
            success: true, 
            message: 'Visitor checked in successfully!', 
            visitor: { 
                id: visitor._id, 
                fullName: visitor.fullName, 
                badgeNumber: visitor.badgeNumber, 
                checkIn: visitor.checkIn, 
                checkInTime: formatKenyaTime(visitor.checkIn) 
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/visitor/checkout/:badgeNumber', async (req, res) => {
    try {
        const visitor = await Visitor.findOne({ badgeNumber: req.params.badgeNumber });
        if (!visitor) {
            return res.status(404).json({ success: false, message: 'Visitor not found' });
        }
        if (visitor.status === 'Checked Out') {
            return res.status(400).json({ success: false, message: 'Visitor already checked out' });
        }
        const kenyaNow = getKenyaTime();
        visitor.checkOut = kenyaNow;
        visitor.status = 'Checked Out';
        await visitor.save();
        const duration = ((visitor.checkOut - visitor.checkIn) / 1000 / 60).toFixed(0);
        res.json({ 
            success: true, 
            message: 'Visitor checked out successfully!', 
            visitor: { 
                id: visitor._id, 
                fullName: visitor.fullName, 
                badgeNumber: visitor.badgeNumber, 
                checkOut: visitor.checkOut, 
                checkOutTime: formatKenyaTime(visitor.checkOut), 
                duration: duration + ' minutes' 
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/visitors/today', async (req, res) => {
    try {
        const kenyaToday = getKenyaDate();
        const tomorrow = new Date(kenyaToday);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const visitors = await Visitor.find({ checkIn: { $gte: kenyaToday, $lt: tomorrow } }).sort({ checkIn: -1 });
        res.json({ 
            success: true, 
            date: kenyaToday, 
            total: visitors.length, 
            visitors: visitors.map(v => ({ 
                ...v.toObject(), 
                checkInTime: formatKenyaTime(v.checkIn), 
                checkOutTime: v.checkOut ? formatKenyaTime(v.checkOut) : null 
            })) 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CONTENT ROUTES
// ============================================

app.get('/api/content', async (req, res) => {
    try {
        const content = await Content.getContent();
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/content', async (req, res) => {
    try {
        const content = await Content.getContent();
        Object.keys(req.body).forEach(key => {
            content[key] = req.body[key];
        });
        content.lastUpdated = new Date();
        await content.save();
        res.json({ success: true, message: 'Content updated successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// FILE UPLOAD
// ============================================

app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        res.json({ 
            success: true, 
            message: 'File uploaded successfully!', 
            file: { 
                filename: req.file.filename, 
                originalname: req.file.originalname, 
                path: `/${req.file.path.replace(/\\/g, '/')}`, 
                size: req.file.size 
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.use('/uploads', express.static('uploads'));

// ============================================
// TEST ROUTE
// ============================================

app.get('/api/test', (req, res) => {
    const kenyaNow = getKenyaTime();
    res.json({
        success: true,
        message: '🎉 Changara Star Academy is running!',
        data: {
            server: 'Online',
            kenyaTime: kenyaNow,
            kenyaTimeFormatted: formatKenyaFullTime(kenyaNow),
            kenyaDate: formatKenyaDate(kenyaNow),
            hour: getKenyaHour(),
            minutes: getKenyaMinutes()
        }
    });
});

// ============================================
// SERVE STATIC FILES
// ============================================

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    const kenyaNow = getKenyaTime();
    console.log('='.repeat(50));
    console.log('🏫 CHANGARA STAR ACADEMY');
    console.log('='.repeat(50));
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🕐 Kenya Time: ${formatKenyaFullTime(kenyaNow)}`);
    console.log(`📅 Kenya Date: ${formatKenyaDate(kenyaNow)}`);
    console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
    console.log(`🕐 Current Time API: http://localhost:${PORT}/api/current-time`);
    console.log('='.repeat(50));
    console.log('✅ Server started successfully!');
});