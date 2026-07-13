const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');

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
// FILE UPLOAD SETUP (Images, Videos, Audio)
// ============================================
// Create upload directories
const uploadDirs = ['./uploads', './uploads/images', './uploads/videos', './uploads/audio'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure storage
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

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Videos
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/ogg',
    // Audio
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images, videos, and audio files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// ============================================
// FILE UPLOAD ROUTE
// ============================================
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }
    
    // Determine file type
    let fileType = 'image';
    let icon = '🖼️';
    if (req.file.mimetype.startsWith('video/')) {
      fileType = 'video';
      icon = '🎬';
    } else if (req.file.mimetype.startsWith('audio/')) {
      fileType = 'audio';
      icon = '🎵';
    }
    
    res.json({
      success: true,
      message: 'File uploaded successfully!',
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: `/${req.file.path.replace(/\\/g, '/')}`,
        size: req.file.size,
        type: fileType,
        icon: icon,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============================================
// SERVE UPLOADED FILES (Static)
// ============================================
app.use('/uploads', express.static('uploads'));

// ============================================
// COMPLETE WEBSITE CONTENT SCHEMA (CMS)
// ============================================
const contentSchema = new mongoose.Schema({
  // ===== HOME PAGE =====
  heroTitle: { type: String, default: 'Welcome to Changara Star Academy' },
  heroSubtitle: { type: String, default: 'Your trusted partner in quality education and school management' },
  heroButtonText: { type: String, default: 'Learn More' },
  heroButtonLink: { type: String, default: '/about.html' },
  
  homeFeatures: [{
    icon: { type: String, default: '📚' },
    title: { type: String, default: 'Quality Education' },
    description: { type: String, default: 'Holistic education that nurtures talent.' }
  }],
  
  homeStats: [{
    number: { type: String, default: '500+' },
    label: { type: String, default: 'Students' }
  }],
  
  homeNews: [{
    title: { type: String, default: 'Latest News' },
    content: { type: String, default: 'Stay updated with our latest announcements.' },
    date: { type: Date, default: Date.now }
  }],

  // ===== ABOUT PAGE =====
  aboutMission: { type: String, default: 'To provide quality education that nurtures talent, builds character, and prepares students for a successful future.' },
  aboutVision: { type: String, default: 'To be a center of excellence in education, producing well-rounded individuals who contribute positively to society.' },
  aboutValues: { type: String, default: 'Excellence, Integrity, Respect, Innovation, Community Engagement' },
  aboutHistory: { type: String, default: 'Changara Star Academy was founded with a vision to provide quality education to the community.' },
  aboutMotto: { type: String, default: 'Excellence in Education' },
  aboutWhy: { type: String, default: 'Holistic education, qualified teachers, modern facilities.' },

  // ===== ACADEMICS =====
  academics: [{
    grade: { type: String, default: 'Grade 1' },
    subjects: { type: String, default: 'Math, English, Science' },
    learningApproach: { type: String, default: 'Child-centered learning' },
    activities: { type: String, default: 'Group discussions, Projects' },
    teacherSupport: { type: String, default: 'Individual attention' }
  }],

  // ===== ADMISSIONS =====
  admissionsRequirements: { type: String, default: 'Admission is open to all students who meet the age requirements.' },
  admissionsAge: { type: String, default: 'Playgroup: 2-3 years, PP1: 4 years, PP2: 5 years, Grade 1: 6 years, Grade 2-6: 7-12 years' },
  admissionsDocuments: { type: String, default: 'Birth certificate, Previous school records, Passport photo, Parent ID, Medical records' },
  admissionsProcess: { type: String, default: '1. Visit the school for a tour. 2. Fill the admission form. 3. Submit required documents. 4. Pay registration fee.' },
  admissionsFees: { type: String, default: 'Please contact the school administration for the current fee structure.' },

  // ===== FACILITIES =====
  facilities: [{
    name: { type: String, default: 'Modern Classrooms' },
    description: { type: String, default: 'Well-equipped classrooms with modern learning resources.' },
    image: { type: String, default: '' }
  }],

  // ===== GALLERY =====
  gallery: [{
    title: { type: String, default: 'School Activity' },
    description: { type: String, default: '' },
    file: { type: String, default: '' },
    type: { type: String, default: 'image' },
    category: { type: String, default: 'General' }
  }],

  // ===== EVENTS =====
  events: [{
    title: { type: String, default: 'Event Title' },
    content: { type: String, default: 'Event description' },
    date: { type: Date, default: Date.now },
    category: { type: String, default: 'General' },
    image: { type: String, default: '' }
  }],

  // ===== CO-CURRICULAR =====
  coCurricular: [{
    name: { type: String, default: 'Football' },
    description: { type: String, default: 'School football team.' },
    category: { type: String, default: 'Sports' },
    image: { type: String, default: '' }
  }],

  // ===== PERFORMANCE =====
  performanceKcpe: { type: String, default: 'Our students consistently perform well in national examinations.' },
  performanceInternal: { type: String, default: 'Regular internal assessments track student progress.' },

  // ===== PARENTS CORNER =====
  parentsCalendar: { type: String, default: 'School calendar for 2026 with all important dates.' },
  parentsHomework: { type: String, default: 'Homework is given regularly to reinforce learning.' },
  parentsAttendance: { type: String, default: 'Attendance is mandatory and monitored daily.' },
  parentsRules: { type: String, default: 'School rules ensure a safe and conducive learning environment.' },
  parentsUniform: { type: String, default: 'All students must wear the official school uniform.' },
  parentsFees: { type: String, default: 'Fees must be paid at the beginning of each term.' },

  // ===== DOWNLOADS =====
  downloads: [{
    name: { type: String, default: 'Admission Form' },
    file: { type: String, default: '/downloads/admission-form.pdf' },
    description: { type: String, default: 'Download the admission form.' },
    icon: { type: String, default: '📄' }
  }],

  // ===== CONTACT =====
  contactAddress: { type: String, default: 'Nairobi, Kenya' },
  contactPhone: { type: String, default: '+254 721 556 252' },
  contactEmail: { type: String, default: 'starchangara@gmail.com' },
  contactHours: { type: String, default: 'Monday - Friday: 7:00 AM - 6:00 PM' },
  contactMap: { type: String, default: '' },

  // ===== FOOTER =====
  footerText: { type: String, default: 'Committed to providing quality education and fostering excellence.' },

  // ===== SEO =====
  seoTitle: { type: String, default: 'Changara Star Academy - Excellence in Education' },
  seoDescription: { type: String, default: 'Changara Star Academy - Excellence in Education. School management system for students, staff, and parents.' },
  seoKeywords: { type: String, default: 'school, education, academy, Nairobi, Kenya' },

  // ===== METADATA =====
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
  password: { type: String, required: true, minlength: 4 },
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
// VISITOR SCHEMA
// ============================================
const visitorSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phoneNumber: { type: String, required: true },
  idNumber: { type: String, required: true },
  purpose: {
    type: String,
    enum: ['Interview', 'Meeting', 'Delivery', 'Parent Visit', 'Visitor', 'Other'],
    required: true
  },
  purposeDetails: { type: String, trim: true },
  personToVisit: { type: String, required: true },
  department: { type: String, trim: true },
  checkIn: { type: Date, required: true, default: Date.now },
  checkOut: { type: Date },
  status: { type: String, enum: ['Checked In', 'Checked Out'], default: 'Checked In' },
  badgeNumber: { type: String, unique: true },
  hostName: { type: String, trim: true },
  notes: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

visitorSchema.methods.checkOutVisitor = async function() {
  if (this.checkOut) throw new Error('Already checked out');
  this.checkOut = new Date();
  this.status = 'Checked Out';
  return await this.save();
};

visitorSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

visitorSchema.set('toJSON', { virtuals: true });
visitorSchema.set('toObject', { virtuals: true });

const Visitor = mongoose.model('Visitor', visitorSchema);

// ============================================
// API ROUTES - CONTENT (CMS)
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

// UPDATE website content (Admin)
app.put('/api/content', async (req, res) => {
  try {
    const content = await Content.getContent();
    
    // Update all fields from request body
    Object.keys(req.body).forEach(key => {
      if (key === 'homeFeatures' && Array.isArray(req.body.homeFeatures)) {
        content.homeFeatures = req.body.homeFeatures;
      } else if (key === 'homeStats' && Array.isArray(req.body.homeStats)) {
        content.homeStats = req.body.homeStats;
      } else if (key === 'homeNews' && Array.isArray(req.body.homeNews)) {
        content.homeNews = req.body.homeNews;
      } else if (key === 'academics' && Array.isArray(req.body.academics)) {
        content.academics = req.body.academics;
      } else if (key === 'facilities' && Array.isArray(req.body.facilities)) {
        content.facilities = req.body.facilities;
      } else if (key === 'gallery' && Array.isArray(req.body.gallery)) {
        content.gallery = req.body.gallery;
      } else if (key === 'events' && Array.isArray(req.body.events)) {
        content.events = req.body.events;
      } else if (key === 'coCurricular' && Array.isArray(req.body.coCurricular)) {
        content.coCurricular = req.body.coCurricular;
      } else if (key === 'downloads' && Array.isArray(req.body.downloads)) {
        content.downloads = req.body.downloads;
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
    console.error('Content update error:', error);
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

// TEACHER REGISTRATION (With PIN)
app.post('/api/teacher/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, employeeId, phoneNumber, department } = req.body;
    
    console.log('📝 Registering teacher:', { firstName, lastName, email, employeeId });
    
    const existing = await Teacher.findOne({ 
      $or: [{ email }, { employeeId }] 
    });
    
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email or Employee ID already exists' 
      });
    }
    
    if (password && (password.length < 4 || password.length > 6)) {
      return res.status(400).json({
        success: false,
        message: 'PIN must be 4-6 digits'
      });
    }
    
    const teacher = new Teacher({
      firstName,
      lastName,
      email,
      password: password || '1234',
      employeeId,
      phoneNumber: phoneNumber || '',
      department: department || 'Teaching'
    });
    
    await teacher.save();
    
    console.log('✅ Teacher registered successfully:', teacher.employeeId);
    
    res.json({ 
      success: true, 
      message: 'Staff registered successfully!',
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
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// TEACHER CHECK-IN
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
    
    const today = new Date();
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({
        success: false,
        message: '📅 Weekend! Check-in is only available on weekdays (Monday-Friday).'
      });
    }
    
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
    
    const currentHour = today.getHours();
    if (currentHour >= 17) {
      return res.status(400).json({
        success: false,
        message: '⏰ Check-in is not allowed after 5:00 PM. Please try again tomorrow.'
      });
    }
    
    const checkInTime = new Date();
    const isLate = checkInTime.getHours() > 7 || (checkInTime.getHours() === 7 && checkInTime.getMinutes() > 0);
    const status = isLate ? 'Late' : 'Present';
    
    teacher.attendance.push({
      date: new Date(),
      checkIn: new Date(),
      status: status,
      location: 'School',
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

// ============================================
// TEACHER CHECK-OUT - FIXED WITH KENYA TIME
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
    
    // ============================================
    // FIX: Get Kenya time (UTC+3)
    // ============================================
    const kenyaTime = new Date();
    const kenyaTimeString = kenyaTime.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    const kenyaDate = new Date(kenyaTimeString);
    const currentHour = kenyaDate.getHours();
    
    console.log('📍 Check-out attempt at:', kenyaDate.toLocaleString());
    console.log('🕐 Current hour (Kenya time):', currentHour);
    
    // Allow check-out after 3:00 PM (15:00) Kenya time
    if (currentHour < 15) {
      return res.status(400).json({
        success: false,
        message: '⏰ Check-out is only allowed after 3:00 PM. Please continue working.'
      });
    }
    
    const checkOutTime = kenyaDate;
    todayAttendance.checkOut = checkOutTime;
    todayAttendance.status = 'Checked Out';
    todayAttendance.notes = req.body.notes || todayAttendance.notes || '';
    
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

// ============================================
// ADMIN TEACHER MANAGEMENT ROUTES
// ============================================

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

// GET SINGLE TEACHER (Admin)
app.get('/api/teachers/:id', async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id).select('-password');
    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        message: 'Teacher not found' 
      });
    }
    res.json({
      success: true,
      teacher
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// UPDATE TEACHER (Admin)
app.put('/api/teachers/:id', async (req, res) => {
  try {
    const { firstName, lastName, email, employeeId, phoneNumber, department } = req.body;
    
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        message: 'Teacher not found' 
      });
    }
    
    const existing = await Teacher.findOne({
      _id: { $ne: req.params.id },
      $or: [{ email }, { employeeId }]
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Email or Employee ID already in use by another teacher'
      });
    }
    
    teacher.firstName = firstName || teacher.firstName;
    teacher.lastName = lastName || teacher.lastName;
    teacher.email = email || teacher.email;
    teacher.employeeId = employeeId || teacher.employeeId;
    teacher.phoneNumber = phoneNumber || teacher.phoneNumber;
    teacher.department = department || teacher.department;
    
    await teacher.save();
    
    res.json({
      success: true,
      message: 'Teacher updated successfully!',
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
    console.error('Update teacher error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// DELETE TEACHER (Admin)
app.delete('/api/teachers/:id', async (req, res) => {
  try {
    const teacher = await Teacher.findByIdAndDelete(req.params.id);
    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        message: 'Teacher not found' 
      });
    }
    res.json({
      success: true,
      message: 'Teacher deleted successfully!'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// RESET TEACHER PIN (Admin)
app.post('/api/teachers/:id/reset-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    const teacher = await Teacher.findById(req.params.id);
    
    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        message: 'Teacher not found' 
      });
    }
    
    if (!pin || pin.length < 4 || pin.length > 6) {
      return res.status(400).json({
        success: false,
        message: 'PIN must be 4-6 digits'
      });
    }
    
    teacher.password = pin;
    await teacher.save();
    
    res.json({
      success: true,
      message: 'PIN reset successfully!'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============================================
// ADMIN ATTENDANCE ROUTES
// ============================================

// GET ALL TEACHERS ATTENDANCE (Admin)
app.get('/api/admin/attendance/all', async (req, res) => {
  try {
    const teachers = await Teacher.find({ isActive: true });
    
    const allAttendance = teachers.map(teacher => {
      return {
        id: teacher._id,
        name: `${teacher.firstName} ${teacher.lastName}`,
        employeeId: teacher.employeeId,
        department: teacher.department,
        email: teacher.email,
        phoneNumber: teacher.phoneNumber,
        totalDays: teacher.attendance.length,
        attendance: teacher.attendance.sort((a, b) => b.date - a.date)
      };
    });
    
    res.json({
      success: true,
      count: allAttendance.length,
      teachers: allAttendance
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// GET ATTENDANCE SUMMARY (Admin)
app.get('/api/admin/attendance/summary', async (req, res) => {
  try {
    const teachers = await Teacher.find({ isActive: true });
    
    let totalTeachers = teachers.length;
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    teachers.forEach(teacher => {
      const todayRecord = teacher.attendance.find(a => {
        const aDate = new Date(a.date);
        aDate.setHours(0, 0, 0, 0);
        return aDate.getTime() === todayStart.getTime();
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
        date: todayStart,
        total: totalTeachers,
        present: totalPresent,
        late: totalLate,
        absent: totalAbsent,
        attendanceRate: totalTeachers > 0 ? ((totalPresent / totalTeachers) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============================================
// VISITOR API ROUTES
// ============================================

// VISITOR CHECK-IN (Public)
app.post('/api/visitor/checkin', async (req, res) => {
  try {
    const { 
      firstName, lastName, email, phoneNumber, idNumber, 
      purpose, purposeDetails, personToVisit, department, hostName, notes 
    } = req.body;

    if (!firstName || !lastName || !phoneNumber || !idNumber || !purpose || !personToVisit) {
      return res.status(400).json({
        success: false,
        message: 'Please provide: firstName, lastName, phoneNumber, idNumber, purpose, personToVisit'
      });
    }

    const badgeNumber = 'V' + Date.now().toString().slice(-6);

    const visitor = new Visitor({
      firstName,
      lastName,
      email,
      phoneNumber,
      idNumber,
      purpose,
      purposeDetails,
      personToVisit,
      department,
      hostName,
      notes,
      badgeNumber,
      checkIn: new Date(),
      status: 'Checked In'
    });

    await visitor.save();

    res.status(201).json({
      success: true,
      message: 'Visitor checked in successfully!',
      visitor: {
        id: visitor._id,
        fullName: visitor.fullName,
        badgeNumber: visitor.badgeNumber,
        checkIn: visitor.checkIn,
        purpose: visitor.purpose,
        personToVisit: visitor.personToVisit,
        hostName: visitor.hostName
      }
    });

  } catch (error) {
    console.error('Visitor check-in error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// VISITOR CHECK-OUT (by badge number)
app.put('/api/visitor/checkout/:badgeNumber', async (req, res) => {
  try {
    const visitor = await Visitor.findOne({ badgeNumber: req.params.badgeNumber });
    
    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'Visitor not found. Please check the badge number.'
      });
    }
    
    if (visitor.status === 'Checked Out') {
      return res.status(400).json({
        success: false,
        message: 'Visitor already checked out at ' + new Date(visitor.checkOut).toLocaleTimeString()
      });
    }
    
    visitor.checkOut = new Date();
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
        checkIn: visitor.checkIn,
        checkOut: visitor.checkOut,
        duration: duration + ' minutes'
      }
    });

  } catch (error) {
    console.error('Visitor check-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET ALL VISITORS (Admin)
app.get('/api/visitors', async (req, res) => {
  try {
    const visitors = await Visitor.find().sort({ checkIn: -1 });
    res.json({
      success: true,
      count: visitors.length,
      visitors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET ACTIVE VISITORS (Admin)
app.get('/api/visitors/active', async (req, res) => {
  try {
    const visitors = await Visitor.find({ status: 'Checked In' }).sort({ checkIn: -1 });
    res.json({
      success: true,
      count: visitors.length,
      visitors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET TODAY'S VISITORS (Admin)
app.get('/api/visitors/today', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const visitors = await Visitor.find({
      checkIn: { $gte: todayStart, $lt: tomorrow }
    }).sort({ checkIn: -1 });
    
    const active = visitors.filter(v => v.status === 'Checked In');
    const completed = visitors.filter(v => v.status === 'Checked Out');
    
    const purposeStats = {};
    visitors.forEach(v => {
      purposeStats[v.purpose] = (purposeStats[v.purpose] || 0) + 1;
    });
    
    res.json({
      success: true,
      date: todayStart,
      total: visitors.length,
      active: active.length,
      completed: completed.length,
      byPurpose: purposeStats,
      visitors: visitors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET WEEKLY VISITORS (Admin)
app.get('/api/visitors/weekly', async (req, res) => {
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const visitors = await Visitor.find({
      checkIn: { $gte: weekStart, $lt: weekEnd }
    }).sort({ checkIn: -1 });

    const active = visitors.filter(v => v.status === 'Checked In');
    const completed = visitors.filter(v => v.status === 'Checked Out');

    const purposeStats = {};
    visitors.forEach(v => {
      purposeStats[v.purpose] = (purposeStats[v.purpose] || 0) + 1;
    });

    const dailyStats = {};
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      const dayStr = day.toDateString();
      dailyStats[dayStr] = visitors.filter(v => new Date(v.checkIn).toDateString() === dayStr).length;
    }

    res.json({
      success: true,
      weekStart: weekStart,
      weekEnd: weekEnd,
      total: visitors.length,
      active: active.length,
      completed: completed.length,
      byPurpose: purposeStats,
      daily: dailyStats,
      visitors: visitors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET MONTHLY VISITORS (Admin)
app.get('/api/visitors/monthly', async (req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const visitors = await Visitor.find({
      checkIn: { $gte: monthStart, $lt: monthEnd }
    }).sort({ checkIn: -1 });

    const active = visitors.filter(v => v.status === 'Checked In');
    const completed = visitors.filter(v => v.status === 'Checked Out');

    const purposeStats = {};
    visitors.forEach(v => {
      purposeStats[v.purpose] = (purposeStats[v.purpose] || 0) + 1;
    });

    const dailyStats = {};
    for (let d = 1; d <= monthEnd.getDate(); d++) {
      const day = new Date(monthStart);
      day.setDate(d);
      const dayStr = day.toDateString();
      dailyStats[dayStr] = visitors.filter(v => new Date(v.checkIn).toDateString() === dayStr).length;
    }

    res.json({
      success: true,
      monthStart: monthStart,
      monthEnd: monthEnd,
      total: visitors.length,
      active: active.length,
      completed: completed.length,
      byPurpose: purposeStats,
      daily: dailyStats,
      visitors: visitors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE VISITOR RECORD (Admin)
app.delete('/api/visitors/:id', async (req, res) => {
  try {
    const visitor = await Visitor.findByIdAndDelete(req.params.id);
    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'Visitor not found'
      });
    }
    res.json({
      success: true,
      message: 'Visitor record deleted successfully!'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
        },
        adminAttendance: '/api/admin/attendance/all',
        visitor: {
          checkin: '/api/visitor/checkin',
          checkout: '/api/visitor/checkout/:badgeNumber',
          today: '/api/visitors/today',
          weekly: '/api/visitors/weekly',
          monthly: '/api/visitors/monthly'
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
// 404 HANDLER - MUST BE LAST!
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
  console.log(`👨‍🏫 Staff Check-in: http://localhost:${PORT}/teacher-checkin.html`);
  console.log(`📋 Admin Attendance: http://localhost:${PORT}/admin-attendance.html`);
  console.log(`👨‍🏫 Manage Teachers: http://localhost:${PORT}/admin-teachers.html`);
  console.log(`🚪 Visitor Check-in: http://localhost:${PORT}/visitor-checkin.html`);
  console.log(`📋 Admin Visitors: http://localhost:${PORT}/admin-visitors.html`);
  console.log('='.repeat(50));
  console.log('✅ Server started successfully!');
});