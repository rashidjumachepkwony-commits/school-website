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
// HELPER: GET KENYA TIME (UTC+3)
// ============================================
function getKenyaTime() {
    const now = new Date();
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

function formatKenyaTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleTimeString('en-KE', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatKenyaFullTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleTimeString('en-KE', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatKenyaDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short'
    });
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getMonthStart(date) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ============================================
// CONNECT TO MONGODB
// ============================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolDB')
  .then(() => {
    console.log('✅ MongoDB Connected');
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

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/ogg',
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
  limits: { fileSize: 100 * 1024 * 1024 }
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

app.use('/uploads', express.static('uploads'));

// ============================================
// CONTENT SCHEMA (CMS)
// ============================================
const contentSchema = new mongoose.Schema({
  heroTitle: { type: String, default: 'Welcome to Changara Star Academy' },
  heroSubtitle: { type: String, default: 'Your trusted partner in quality education and school management' },
  heroButtonText: { type: String, default: 'Learn More' },
  heroButtonLink: { type: String, default: '/about.html' },
  heroVideo: { type: String, default: '' },
  applyButtonText: { type: String, default: 'Apply Now' },
  
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

  aboutMission: { type: String, default: 'To provide quality education that nurtures talent, builds character, and prepares students for a successful future.' },
  aboutVision: { type: String, default: 'To be a center of excellence in education, producing well-rounded individuals who contribute positively to society.' },
  aboutValues: { type: String, default: 'Excellence, Integrity, Respect, Innovation, Community Engagement' },
  aboutHistory: { type: String, default: 'Changara Star Academy was founded with a vision to provide quality education to the community.' },
  aboutMotto: { type: String, default: 'Excellence in Education' },
  aboutWhy: { type: String, default: 'Holistic education, qualified teachers, modern facilities.' },

  academicsIntro: { type: String, default: '' },
  academics: [{
    grade: { type: String, default: 'Grade 1' },
    subjects: { type: String, default: 'Math, English, Science' },
    learningApproach: { type: String, default: 'Child-centered learning' },
    activities: { type: String, default: 'Group discussions, Projects' },
    teacherSupport: { type: String, default: 'Individual attention' }
  }],

  admissionsIntro: { type: String, default: '' },
  admissionsRequirements: { type: String, default: 'Admission is open to all students who meet the age requirements.' },
  admissionsAge: { type: String, default: 'Playgroup: 2-3 years, PP1: 4 years, PP2: 5 years, Grade 1: 6 years, Grade 2-6: 7-12 years' },
  admissionsDocuments: { type: String, default: 'Birth certificate, Previous school records, Passport photo, Parent ID, Medical records' },
  admissionsProcess: { type: String, default: '1. Visit the school for a tour. 2. Fill the admission form. 3. Submit required documents. 4. Pay registration fee.' },
  admissionsFees: { type: String, default: 'Please contact the school administration for the current fee structure.' },

  facilitiesIntro: { type: String, default: '' },
  facilities: [{
    name: { type: String, default: 'Modern Classrooms' },
    description: { type: String, default: 'Well-equipped classrooms with modern learning resources.' },
    image: { type: String, default: '' }
  }],

  gallery: [{
    title: { type: String, default: 'School Activity' },
    description: { type: String, default: '' },
    file: { type: String, default: '' },
    type: { type: String, default: 'image' },
    category: { type: String, default: 'General' }
  }],

  events: [{
    title: { type: String, default: 'Event Title' },
    content: { type: String, default: 'Event description' },
    date: { type: Date, default: Date.now },
    category: { type: String, default: 'General' },
    image: { type: String, default: '' }
  }],

  coCurricular: [{
    name: { type: String, default: 'Football' },
    description: { type: String, default: 'School football team.' },
    category: { type: String, default: 'Sports' },
    image: { type: String, default: '' }
  }],

  performanceIntro: { type: String, default: '' },
  performanceKcpe: { type: String, default: 'Our students consistently perform well in national examinations.' },
  performanceInternal: { type: String, default: 'Regular internal assessments track student progress.' },

  parentsIntro: { type: String, default: '' },
  parentsCalendar: { type: String, default: 'School calendar for 2026 with all important dates.' },
  parentsHomework: { type: String, default: 'Homework is given regularly to reinforce learning.' },
  parentsAttendance: { type: String, default: 'Attendance is mandatory and monitored daily.' },
  parentsRules: { type: String, default: 'School rules ensure a safe and conducive learning environment.' },
  parentsUniform: { type: String, default: 'All students must wear the official school uniform.' },
  parentsFees: { type: String, default: 'Fees must be paid at the beginning of each term.' },

  downloadsIntro: { type: String, default: '' },
  downloads: [{
    name: { type: String, default: 'Admission Form' },
    file: { type: String, default: '/downloads/admission-form.pdf' },
    description: { type: String, default: 'Download the admission form.' },
    icon: { type: String, default: '📄' }
  }],

  feesIntro: { type: String, default: '' },
  feesPaybill: { type: String, default: '474752' },
  feesInstructions: { type: String, default: '' },

  contactIntro: { type: String, default: '' },
  contactAddress: { type: String, default: 'Nairobi, Kenya' },
  contactPhone: { type: String, default: '+254 721 556 252' },
  contactEmail: { type: String, default: 'starchangara@gmail.com' },
  contactHours: { type: String, default: 'Monday - Friday: 7:00 AM - 6:00 PM' },
  contactMap: { type: String, default: '' },

  footerText: { type: String, default: 'Committed to providing quality education and fostering excellence.' },

  seoTitle: { type: String, default: 'Changara Star Academy - Excellence in Education' },
  seoDescription: { type: String, default: 'Changara Star Academy - Excellence in Education. School management system for students, staff, and parents.' },
  seoKeywords: { type: String, default: 'school, education, academy, Nairobi, Kenya' },

  noticeAlert: { type: String, default: '' },
  noticeType: { type: String, default: '' },
  noticeDate: { type: Date },

  lastUpdated: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'Admin' }
});

contentSchema.statics.getContent = async function() {
  let content = await this.findOne();
  if (!content) {
    content = await this.create({});
  }
  return content;
};

const Content = mongoose.model('Content', contentSchema);

// ============================================
// ADMIN SCHEMA
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
// TEACHER SCHEMA
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
// API ROUTES - TEACHER (USING KENYA TIME)
// ============================================

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
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============================================
// TEACHER CHECK-IN - FIXED WITH KENYA TIME
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
    
    const kenyaNow = getKenyaTime();
    const kenyaToday = getKenyaDate();
    const kenyaHour = getKenyaHour();
    const dayOfWeek = kenyaNow.getDay();
    
    console.log('📍 Check-in at (Kenya time):', kenyaNow.toString());
    console.log('🕐 Hour (Kenya time):', kenyaHour);
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({
        success: false,
        message: '📅 Weekend! Check-in is only available on weekdays (Monday-Friday).'
      });
    }
    
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
    
    if (kenyaHour >= 17) {
      return res.status(400).json({
        success: false,
        message: '⏰ Check-in is not allowed after 5:00 PM. Please try again tomorrow.'
      });
    }
    
    const isLate = kenyaHour > 7 || (kenyaHour === 7 && kenyaNow.getMinutes() > 0);
    const status = isLate ? 'Late' : 'Present';
    
    teacher.attendance.push({
      date: kenyaToday,
      checkIn: kenyaNow,
      status: status,
      location: 'School',
      isLate: isLate,
      notes: isLate ? 'Late check-in at ' + formatKenyaFullTime(kenyaNow) : 'On-time check-in at ' + formatKenyaFullTime(kenyaNow)
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
    
    const kenyaNow = getKenyaTime();
    const kenyaToday = getKenyaDate();
    const kenyaHour = getKenyaHour();
    
    console.log('📍 Check-out at (Kenya time):', kenyaNow.toString());
    console.log('🕐 Hour (Kenya time):', kenyaHour);
    
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
    
    if (kenyaHour < 15) {
      return res.status(400).json({
        success: false,
        message: '⏰ Check-out is only allowed after 3:00 PM. Please continue working.'
      });
    }
    
    todayAttendance.checkOut = kenyaNow;
    todayAttendance.notes = (todayAttendance.notes || '') + ' Checked out at ' + formatKenyaFullTime(kenyaNow);
    
    const checkInTime = new Date(todayAttendance.checkIn);
    const hoursWorked = ((kenyaNow - checkInTime) / (1000 * 60 * 60)).toFixed(2);
    todayAttendance.hoursWorked = parseFloat(hoursWorked);
    
    await teacher.save();
    
    res.json({
      success: true,
      message: '✅ Check-out successful!',
      checkOutTime: kenyaNow,
      checkOutTimeFormatted: formatKenyaTime(kenyaNow),
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
// STAFF ATTENDANCE REPORTS - DAILY, WEEKLY, MONTHLY
// ============================================
app.get('/api/reports/staff/attendance', async (req, res) => {
  try {
    const { period, date } = req.query;
    let startDate, endDate;
    
    // Parse the date using Kenya time
    let selectedDate;
    if (date) {
      const dateParts = date.split('-');
      selectedDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    } else {
      selectedDate = getKenyaTime();
    }
    
    // Set date range based on period using Kenya time
    if (period === 'daily') {
      startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      
    } else if (period === 'weekly') {
      // Weekly: Monday to Friday
      startDate = getWeekStart(selectedDate);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 5); // Monday to Friday
      
    } else if (period === 'monthly') {
      // Monthly: First day of month
      startDate = getMonthStart(selectedDate);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      
    } else {
      startDate = getKenyaDate();
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    }
    
    // Get all teachers
    const teachers = await Teacher.find({ isActive: true });
    
    let reportData = [];
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalOnTime = 0;
    let totalStaff = teachers.length;
    
    // Daily breakdown for the period
    const dailyBreakdown = {};
    let currentDate = new Date(startDate);
    while (currentDate < endDate) {
      const dayOfWeek = currentDate.getDay();
      // For weekly reports, only include weekdays (Monday-Friday)
      if (period === 'weekly' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
      const dateStr = formatKenyaDate(currentDate);
      dailyBreakdown[dateStr] = { present: 0, late: 0, absent: 0, onTime: 0, total: 0 };
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    teachers.forEach(teacher => {
      const attendanceRecords = teacher.attendance.filter(a => {
        const aDate = new Date(a.date);
        // For weekly reports, only include weekdays
        if (period === 'weekly') {
          const dayOfWeek = aDate.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) return false;
        }
        return aDate >= startDate && aDate < endDate;
      });
      
      const daysPresent = attendanceRecords.filter(a => a.status === 'Present' || a.status === 'Late').length;
      const daysLate = attendanceRecords.filter(a => a.isLate === true).length;
      const daysOnTime = attendanceRecords.filter(a => a.status === 'Present' && !a.isLate).length;
      const daysAbsent = attendanceRecords.filter(a => a.status === 'Absent').length;
      
      totalPresent += daysPresent;
      totalLate += daysLate;
      totalOnTime += daysOnTime;
      totalAbsent += daysAbsent;
      
      // Add to daily breakdown
      attendanceRecords.forEach(record => {
        const dateStr = formatKenyaDate(record.date);
        if (dailyBreakdown[dateStr]) {
          dailyBreakdown[dateStr].total++;
          if (record.status === 'Absent') {
            dailyBreakdown[dateStr].absent++;
          } else if (record.isLate) {
            dailyBreakdown[dateStr].late++;
          } else {
            dailyBreakdown[dateStr].present++;
            if (!record.isLate) {
              dailyBreakdown[dateStr].onTime++;
            }
          }
        }
      });
      
      // Calculate total working days (excluding weekends for weekly)
      let totalWorkingDays = attendanceRecords.length;
      if (period === 'weekly') {
        let weekdays = 0;
        let d = new Date(startDate);
        while (d < endDate) {
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6) weekdays++;
          d.setDate(d.getDate() + 1);
        }
        totalWorkingDays = weekdays;
      } else if (period === 'monthly') {
        totalWorkingDays = attendanceRecords.length || 0;
      }
      
      reportData.push({
        name: `${teacher.firstName} ${teacher.lastName}`,
        employeeId: teacher.employeeId,
        department: teacher.department,
        totalDays: totalWorkingDays,
        present: daysPresent,
        late: daysLate,
        onTime: daysOnTime,
        absent: daysAbsent,
        attendanceRate: totalWorkingDays > 0 ? ((daysPresent / totalWorkingDays) * 100).toFixed(1) : 0,
        punctualityRate: totalWorkingDays > 0 ? ((daysOnTime / totalWorkingDays) * 100).toFixed(1) : 0,
        records: attendanceRecords.map(a => ({
          date: formatKenyaDate(a.date),
          checkIn: formatKenyaTime(a.checkIn),
          checkOut: a.checkOut ? formatKenyaTime(a.checkOut) : '-',
          status: a.status,
          isLate: a.isLate,
          hoursWorked: a.hoursWorked || 0
        }))
      });
    });
    
    // Calculate summary
    const summary = {
      totalStaff,
      totalPresent,
      totalLate,
      totalOnTime,
      totalAbsent,
      overallAttendanceRate: totalStaff > 0 ? ((totalPresent / (totalStaff * 7)) * 100).toFixed(1) : 0,
      overallPunctualityRate: totalStaff > 0 ? ((totalOnTime / (totalStaff * 7)) * 100).toFixed(1) : 0,
      period: period,
      startDate: startDate,
      endDate: endDate,
      dailyBreakdown: dailyBreakdown
    };
    
    // Sort teachers by attendance rate (highest first)
    reportData.sort((a, b) => parseFloat(b.attendanceRate) - parseFloat(a.attendanceRate));
    
    res.json({
      success: true,
      summary,
      teachers: reportData
    });
    
  } catch (error) {
    console.error('Error generating staff report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// VISITOR REPORTS - DAILY, WEEKLY, MONTHLY
// ============================================
app.get('/api/reports/visitors', async (req, res) => {
  try {
    const { period, date } = req.query;
    let startDate, endDate;
    
    // Parse the date using Kenya time
    let selectedDate;
    if (date) {
      const dateParts = date.split('-');
      selectedDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    } else {
      selectedDate = getKenyaTime();
    }
    
    if (period === 'daily') {
      startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      
    } else if (period === 'weekly') {
      startDate = getWeekStart(selectedDate);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 5);
      
    } else if (period === 'monthly') {
      startDate = getMonthStart(selectedDate);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      
    } else {
      startDate = getKenyaDate();
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    }
    
    // Get all visitors in date range
    const visitors = await Visitor.find({
      checkIn: { $gte: startDate, $lt: endDate }
    }).sort({ checkIn: -1 });
    
    const totalVisitors = visitors.length;
    const active = visitors.filter(v => v.status === 'Checked In').length;
    const completed = visitors.filter(v => v.status === 'Checked Out').length;
    
    // Purpose breakdown
    const purposeStats = {};
    visitors.forEach(v => {
      purposeStats[v.purpose] = (purposeStats[v.purpose] || 0) + 1;
    });
    
    // Daily breakdown (weekdays only for weekly)
    const dailyBreakdown = {};
    let currentDate = new Date(startDate);
    while (currentDate < endDate) {
      if (period === 'weekly') {
        const dow = currentDate.getDay();
        if (dow === 0 || dow === 6) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }
      }
      const dateStr = formatKenyaDate(currentDate);
      dailyBreakdown[dateStr] = 0;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    visitors.forEach(v => {
      const dateStr = formatKenyaDate(v.checkIn);
      if (dailyBreakdown[dateStr] !== undefined) {
        dailyBreakdown[dateStr]++;
      }
    });
    
    const formattedVisitors = visitors.map(v => ({
      fullName: v.fullName,
      badgeNumber: v.badgeNumber,
      purpose: v.purpose,
      personToVisit: v.personToVisit,
      hostName: v.hostName,
      checkIn: v.checkIn,
      checkOut: v.checkOut,
      checkInTime: formatKenyaTime(v.checkIn),
      checkOutTime: v.checkOut ? formatKenyaTime(v.checkOut) : '-',
      status: v.status,
      duration: v.checkOut ? ((v.checkOut - v.checkIn) / 1000 / 60).toFixed(0) + ' mins' : 'In progress'
    }));
    
    res.json({
      success: true,
      summary: {
        period: period,
        startDate: startDate,
        endDate: endDate,
        totalVisitors,
        active,
        completed,
        purposeStats,
        dailyBreakdown
      },
      visitors: formattedVisitors
    });
    
  } catch (error) {
    console.error('Error generating visitor report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN TEACHER MANAGEMENT ROUTES
// ============================================

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

app.get('/api/admin/attendance/summary', async (req, res) => {
  try {
    const teachers = await Teacher.find({ isActive: true });
    const kenyaToday = getKenyaDate();
    
    let totalTeachers = teachers.length;
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalOnTime = 0;
    
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
          totalOnTime++;
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
        onTime: totalOnTime,
        attendanceRate: totalTeachers > 0 ? ((totalPresent / totalTeachers) * 100).toFixed(2) : 0,
        punctualityRate: totalTeachers > 0 ? ((totalOnTime / totalTeachers) * 100).toFixed(2) : 0
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
    const kenyaNow = getKenyaTime();

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
      checkIn: kenyaNow,
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
        checkInTime: formatKenyaTime(visitor.checkIn),
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
        message: 'Visitor already checked out at ' + formatKenyaTime(visitor.checkOut)
      });
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
        checkIn: visitor.checkIn,
        checkInTime: formatKenyaTime(visitor.checkIn),
        checkOut: visitor.checkOut,
        checkOutTime: formatKenyaTime(visitor.checkOut),
        duration: duration + ' minutes'
      }
    });

  } catch (error) {
    console.error('Visitor check-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

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

app.get('/api/visitors/today', async (req, res) => {
  try {
    const kenyaToday = getKenyaDate();
    const tomorrow = new Date(kenyaToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const visitors = await Visitor.find({
      checkIn: { $gte: kenyaToday, $lt: tomorrow }
    }).sort({ checkIn: -1 });
    
    const active = visitors.filter(v => v.status === 'Checked In');
    const completed = visitors.filter(v => v.status === 'Checked Out');
    
    const purposeStats = {};
    visitors.forEach(v => {
      purposeStats[v.purpose] = (purposeStats[v.purpose] || 0) + 1;
    });
    
    const formattedVisitors = visitors.map(v => ({
      ...v.toObject(),
      checkInTime: formatKenyaTime(v.checkIn),
      checkOutTime: v.checkOut ? formatKenyaTime(v.checkOut) : null
    }));
    
    res.json({
      success: true,
      date: kenyaToday,
      total: visitors.length,
      active: active.length,
      completed: completed.length,
      byPurpose: purposeStats,
      visitors: formattedVisitors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

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
      kenyaTime: kenyaNow.toString(),
      kenyaTimeFormatted: formatKenyaFullTime(kenyaNow),
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
        reports: {
          staff: '/api/reports/staff/attendance?period=daily&date=2024-01-15',
          visitor: '/api/reports/visitors?period=daily&date=2024-01-15'
        },
        adminAttendance: '/api/admin/attendance/all',
        visitor: {
          checkin: '/api/visitor/checkin',
          checkout: '/api/visitor/checkout/:badgeNumber',
          today: '/api/visitors/today'
        }
      }
    }
  });
});

// ============================================
// FIX DATA ENDPOINT
// ============================================
app.post('/api/fix-attendance-times', async (req, res) => {
  try {
    console.log('🔧 Manually fixing attendance times...');
    const teachers = await Teacher.find({});
    let fixedCount = 0;
    let recordCount = 0;

    for (const teacher of teachers) {
      let needsSave = false;
      
      for (const record of teacher.attendance) {
        if (record.checkIn) {
          const originalTime = new Date(record.checkIn);
          const kenyaTime = new Date(originalTime.getTime() + (3 * 60 * 60 * 1000));
          record.checkIn = kenyaTime;
          needsSave = true;
          recordCount++;
        }
        
        if (record.checkOut) {
          const originalTime = new Date(record.checkOut);
          const kenyaTime = new Date(originalTime.getTime() + (3 * 60 * 60 * 1000));
          record.checkOut = kenyaTime;
          needsSave = true;
          recordCount++;
        }
        
        if (record.date) {
          const originalDate = new Date(record.date);
          const kenyaDate = new Date(originalDate.getTime() + (3 * 60 * 60 * 1000));
          kenyaDate.setHours(0, 0, 0, 0);
          record.date = kenyaDate;
          needsSave = true;
        }
      }
      
      if (needsSave) {
        await teacher.save();
        fixedCount++;
      }
    }
    
    res.json({
      success: true,
      message: `✅ Fixed ${fixedCount} teachers, ${recordCount} attendance records with correct Kenya time`,
      fixedCount,
      recordCount
    });
  } catch (error) {
    console.error('❌ Error fixing attendance data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
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
  const kenyaNow = getKenyaTime();
  console.log('='.repeat(50));
  console.log('🏫 CHANGARA STAR ACADEMY');
  console.log('='.repeat(50));
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🕐 Kenya Time: ${formatKenyaFullTime(kenyaNow)}`);
  console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
  console.log(`🔧 Fix Data: http://localhost:${PORT}/api/fix-attendance-times`);
  console.log('='.repeat(50));
  console.log('✅ Server started successfully!');
});