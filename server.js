const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// CONNECT TO MONGODB
// ============================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolDB')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

// ============================================
// CREATE CONTENT SCHEMA
// ============================================
const contentSchema = new mongoose.Schema({
  heroTitle: { type: String, default: 'Welcome to Changara Star Academy' },
  heroSubtitle: { type: String, default: 'Your trusted partner in quality education and school management' },
  aboutMission: { type: String, default: 'To provide quality education that nurtures talent, builds character, and prepares students for a successful future.' },
  aboutVision: { type: String, default: 'To be a center of excellence in education, producing well-rounded individuals who contribute positively to society.' },
  aboutValues: { type: String, default: 'Excellence, Integrity, Respect, Innovation, Community Engagement' },
  aboutCommitment: { type: String, default: 'Changara Star Academy is dedicated to providing a safe, nurturing, and stimulating environment.' },
  footerText: { type: String, default: 'Committed to providing quality education and fostering excellence.' },
  contact: {
    address: { type: String, default: 'Nairobi, Kenya' },
    phone: { type: String, default: '+254 700 000 000' },
    email: { type: String, default: 'info@changarastaracademy.co.ke' },
    workingHours: { type: String, default: 'Monday - Friday: 7:00 AM - 6:00 PM' }
  },
  stats: {
    students: { type: String, default: '500+' },
    staff: { type: String, default: '50+' },
    attendance: { type: String, default: '98%' },
    years: { type: String, default: '15+' }
  },
  features: [{
    icon: String,
    title: String,
    description: String
  }],
  lastUpdated: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'Admin' }
});

// Singleton - only one content document
contentSchema.statics.getContent = async function() {
  let content = await this.findOne();
  if (!content) {
    content = await this.create({});
  }
  return content;
};

const Content = mongoose.model('Content', contentSchema);

// ============================================
// ADMIN SCHEMA (For authentication)
// ============================================
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

// ============================================
// TEACHER SCHEMA (For check-in/out)
// ============================================
const teacherSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  phoneNumber: { type: String, trim: true },
  employeeId: { type: String, required: true, unique: true },
  department: { type: String, default: 'Teaching' },
  isActive: { type: Boolean, default: true },
  attendance: [{
    date: Date,
    checkIn: Date,
    checkOut: Date,
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Excused'],
      default: 'Present'
    },
    notes: String,
    location: String,
    hoursWorked: Number,
    isLate: { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Teacher = mongoose.model('Teacher', teacherSchema);

// ============================================
// API ROUTES - CONTENT
// ============================================

// GET website content (Public)
app.get('/api/content', async (req, res) => {
  try {
    const content = await Content.getContent();
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// UPDATE website content
app.put('/api/content', async (req, res) => {
  try {
    const content = await Content.getContent();
    
    Object.keys(req.body).forEach(key => {
      if (key === 'features' && Array.isArray(req.body.features)) {
        content.features = req.body.features;
      } else if (key === 'stats') {
        content.stats = { ...content.stats, ...req.body.stats };
      } else if (key === 'contact') {
        content.contact = { ...content.contact, ...req.body.contact };
      } else {
        content[key] = req.body[key];
      }
    });
    
    content.lastUpdated = new Date();
    content.updatedBy = req.body.updatedBy || 'Admin';
    await content.save();

    res.json({
      success: true,
      message: 'Content updated successfully!',
      content
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating content',
      error: error.message
    });
  }
});

// ============================================
// API ROUTES - ADMIN
// ============================================

// CREATE FIRST ADMIN
app.post('/api/setup-admin', async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;
    
    if (!username || !email || !password || !fullName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide username, email, password, and fullName' 
      });
    }
    
    const existing = await Admin.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Admin already exists' });
    }
    
    const admin = new Admin({
      username,
      email,
      password,
      fullName,
      role: 'Super Admin'
    });
    await admin.save();
    
    res.json({ 
      success: true, 
      message: 'Admin created successfully!',
      admin: {
        username: admin.username,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ADMIN LOGIN
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide username and password' 
      });
    }
    
    const admin = await Admin.findOne({ 
      $or: [{ username }, { email: username }] 
    });
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    if (admin.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    admin.lastLogin = new Date();
    await admin.save();
    
    res.json({
      success: true,
      message: 'Login successful!',
      admin: {
        id: admin._id,
        username: admin.username,
        fullName: admin.fullName,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// API ROUTES - TEACHER CHECK-IN/OUT
// ============================================

// TEACHER REGISTRATION
app.post('/api/teacher/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, employeeId, phoneNumber, department } = req.body;
    
    const existing = await Teacher.findOne({ 
      $or: [{ email }, { employeeId }] 
    });
    
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email or Employee ID already exists' 
      });
    }
    
    const teacher = new Teacher({
      firstName,
      lastName,
      email,
      password,
      employeeId,
      phoneNumber,
      department: department || 'Teaching'
    });
    
    await teacher.save();
    
    res.json({ 
      success: true, 
      message: 'Teacher registered successfully!',
      teacher: {
        id: teacher._id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        employeeId: teacher.employeeId,
        email: teacher.email,
        department: teacher.department
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// TEACHER CHECK-IN
app.post('/api/teacher/checkin', async (req, res) => {
  try {
    const { employeeId, location } = req.body;
    
    // 1. Check if teacher exists
    const teacher = await Teacher.findOne({ employeeId });
    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        message: '❌ Teacher not found. Please contact admin.' 
      });
    }
    
    // 2. Check if it's a weekend
    const today = new Date();
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({
        success: false,
        message: '📅 Weekend! Check-in is only available on weekdays (Monday-Friday).'
      });
    }
    
    // 3. Check if already checked in today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const existingAttendance = teacher.attendance.find(a => {
      const aDate = new Date(a.date);
      aDate.setHours(0, 0, 0, 0);
      return aDate.getTime() === todayStart.getTime();
    });
    
    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: '⚠️ You already checked in today at ' + new Date(existingAttendance.checkIn).toLocaleTimeString(),
        checkInTime: existingAttendance.checkIn
      });
    }
    
    // 4. Check if after 5:00 PM
    const currentHour = today.getHours();
    if (currentHour >= 17) {
      return res.status(400).json({
        success: false,
        message: '⏰ Check-in is not allowed after 5:00 PM. Please try again tomorrow.'
      });
    }
    
    // 5. Determine if late (after 7:00 AM)
    const checkInTime = new Date();
    const isLate = checkInTime.getHours() > 7 || (checkInTime.getHours() === 7 && checkInTime.getMinutes() > 0);
    const status = isLate ? 'Late' : 'Present';
    
    // 6. Create attendance record
    teacher.attendance.push({
      date: new Date(),
      checkIn: new Date(),
      status: status,
      location: location || 'School',
      isLate: isLate,
      notes: isLate ? 'Late check-in' : ''
    });
    
    await teacher.save();
    
    const message = isLate 
      ? '⚠️ Check-in successful! (You are LATE - after 7:00 AM)' 
      : '✅ Check-in successful! (On time)';
    
    res.json({
      success: true,
      message: message,
      checkInTime: new Date(),
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

// TEACHER CHECK-OUT
app.post('/api/teacher/checkout', async (req, res) => {
  try {
    const { employeeId, notes } = req.body;
    
    // 1. Check if teacher exists
    const teacher = await Teacher.findOne({ employeeId });
    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        message: '❌ Teacher not found. Please contact admin.' 
      });
    }
    
    // 2. Find today's attendance
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayAttendance = teacher.attendance.find(a => {
      const aDate = new Date(a.date);
      aDate.setHours(0, 0, 0, 0);
      return aDate.getTime() === todayStart.getTime();
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
        message: '⚠️ You already checked out today at ' + new Date(todayAttendance.checkOut).toLocaleTimeString(),
        checkOutTime: todayAttendance.checkOut
      });
    }
    
    // 3. Check if check-out is before 3:00 PM
    const currentHour = new Date().getHours();
    if (currentHour < 15) {
      return res.status(400).json({
        success: false,
        message: '⏰ Check-out is only allowed after 3:00 PM. Please continue working.'
      });
    }
    
    // 4. Update checkout time
    const checkOutTime = new Date();
    todayAttendance.checkOut = checkOutTime;
    todayAttendance.notes = notes || todayAttendance.notes || '';
    
    // 5. Calculate hours worked
    const checkInTime = new Date(todayAttendance.checkIn);
    const hoursWorked = ((checkOutTime - checkInTime) / (1000 * 60 * 60)).toFixed(2);
    todayAttendance.hoursWorked = parseFloat(hoursWorked);
    
    await teacher.save();
    
    res.json({
      success: true,
      message: '✅ Check-out successful!',
      checkOutTime: checkOutTime,
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

// GET TODAY'S ATTENDANCE (Admin)
app.get('/api/teacher/attendance/today', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const teachers = await Teacher.find({ isActive: true });
    
    const todayAttendance = teachers.map(teacher => {
      const todayRecord = teacher.attendance.find(a => {
        const aDate = new Date(a.date);
        aDate.setHours(0, 0, 0, 0);
        return aDate.getTime() === todayStart.getTime();
      });
      
      return {
        name: `${teacher.firstName} ${teacher.lastName}`,
        employeeId: teacher.employeeId,
        department: teacher.department,
        status: todayRecord ? (todayRecord.checkOut ? 'Checked Out' : 'Checked In') : 'Absent',
        checkIn: todayRecord ? todayRecord.checkIn : null,
        checkOut: todayRecord ? todayRecord.checkOut : null,
        isLate: todayRecord ? todayRecord.isLate : false,
        hoursWorked: todayRecord ? todayRecord.hoursWorked : 0
      };
    });
    
    res.json({
      success: true,
      date: todayStart,
      total: todayAttendance.length,
      attendance: todayAttendance
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// GET TEACHER ATTENDANCE HISTORY (Admin)
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

// GET ALL TEACHERS (Admin)
app.get('/api/teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find({ isActive: true }).select('-password');
    res.json({
      success: true,
      count: teachers.length,
      teachers
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============================================
// TEST ROUTE
// ============================================
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '🎉 Changara Star Academy is running!',
    data: {
      server: 'Online',
      timestamp: new Date().toISOString(),
      endpoints: {
        test: '/api/test',
        content: '/api/content',
        admin: '/api/admin/login',
        setup: '/api/setup-admin',
        teacher: {
          register: '/api/teacher/register',
          checkin: '/api/teacher/checkin',
          checkout: '/api/teacher/checkout',
          attendance: '/api/teacher/attendance/today'
        }
      }
    }
  });
});

// ============================================
// SERVE STATIC FILES
// ============================================
app.use(express.static(__dirname));

// ============================================
// DEFAULT ROUTE
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// ============================================
// START THE SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🏫 CHANGARA STAR ACADEMY');
  console.log('='.repeat(50));
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
  console.log(`🌐 Website: http://localhost:${PORT}/`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin-login.html`);
  console.log(`👨‍🏫 Teacher Check-in: http://localhost:${PORT}/teacher-checkin.html`);
  console.log('='.repeat(50));
  console.log('✅ Server started successfully!');
});