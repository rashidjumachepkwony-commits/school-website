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
// ACADEMIC ASSESSMENT ROUTES
// ============================================

// Student Assessment Schema
// NOTE: assessmentPeriod / assessmentType / assessmentDate were added later to
// support history-aware (per-period) assessments. Old records that predate this
// change are treated as "Legacy Assessment" / "Legacy" so existing data keeps
// displaying correctly without any destructive migration.
const studentAssessmentSchema = new mongoose.Schema({
  studentName: { type: String, required: true, trim: true },
  grade: { type: String, required: true, trim: true },
  assessments: [{
    subject: { type: String, required: true },
    maxScore: { type: Number, required: true },
    score: { type: Number, required: true }
  }],
  totalScore: { type: Number, default: 0 },
  averageScore: { type: Number, default: 0 },
  performanceLevel: {
    type: String,
    enum: ['Below Expectation', 'Approaching Expectation', 'Meeting Expectation', 'Exceeding Expectation'],
    default: 'Approaching Expectation'
  },
  assessmentPeriod: {
    type: String,
    default: 'Legacy Assessment',
    index: true
  },
  assessmentType: {
    type: String,
    default: 'Legacy',
    index: true
  },
  assessmentDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const StudentAssessment = mongoose.model('StudentAssessment', studentAssessmentSchema);

// Default assessment period/type helpers (used for legacy fallback)
const DEFAULT_PERIOD = 'Legacy Assessment';
const DEFAULT_TYPE = 'Legacy';

// Helper: normalise a period/type value, defaulting empty values to the
// legacy fallback so that old records remain queryable.
function normalisePeriodType(period, type) {
  return {
    period: (period && String(period).trim()) || DEFAULT_PERIOD,
    type: (type && String(type).trim()) || DEFAULT_TYPE
  };
}

// Helper function to calculate performance level
function calculatePerformanceLevel(assessments) {
  if (!assessments || assessments.length === 0) return 'Approaching Expectation';
  
  let totalPercentage = 0;
  assessments.forEach(a => {
    if (a.maxScore > 0) {
      totalPercentage += (a.score / a.maxScore) * 100;
    }
  });
  const avgPercentage = assessments.length > 0 ? totalPercentage / assessments.length : 0;
  
  if (avgPercentage >= 80) return 'Exceeding Expectation';
  if (avgPercentage >= 60) return 'Meeting Expectation';
  if (avgPercentage >= 40) return 'Approaching Expectation';
  return 'Below Expectation';
}

// Compute total score from an assessments array
function computeTotal(assessments) {
  return assessments.reduce((sum, a) => sum + (Number(a.score) || 0), 0);
}

// Server-side validation for an assessments array.
// Throws an Error (caught by route handlers) when validation fails.
function validateAssessments(assessments) {
  if (!Array.isArray(assessments)) {
    throw new Error('assessments must be an array');
  }
  const errors = [];
  assessments.forEach((a, i) => {
    const subjName = a && a.subject ? String(a.subject).trim() : '';
    if (!subjName) {
      errors.push(`Subject at position ${i + 1} is required`);
      return;
    }
    const maxScore = Number(a.maxScore);
    const score = Number(a.score);
    if (isNaN(maxScore) || maxScore < 0) {
      errors.push(`Max score for ${subjName} is invalid`);
    }
    if (isNaN(score) || score < 0) {
      errors.push(`Score for ${subjName} must be >= 0`);
    }
    if (!isNaN(score) && !isNaN(maxScore) && score > maxScore) {
      errors.push(`Score for ${subjName} (${score}) exceeds maximum (${maxScore})`);
    }
  });
  if (errors.length) {
    throw new Error('Validation error: ' + errors.join('; '));
  }
}

// Build a MongoDB filter for period/type, treating missing fields (legacy
// records) as the legacy fallback so old data is still matched when requested.
function buildPeriodFilter(period, type) {
  const filter = {};
  if (period && String(period).trim()) {
    const p = String(period).trim();
    filter.assessmentPeriod = p === DEFAULT_PERIOD ? { $in: [p, null] } : p;
  }
  if (type && String(type).trim()) {
    const t = String(type).trim();
    filter.assessmentType = t === DEFAULT_TYPE ? { $in: [t, null] } : t;
  }
  return filter;
}

// GET all assessments (optionally filtered by assessment period/type)
app.get('/api/assessments/all', async (req, res) => {
  try {
    const query = buildPeriodFilter(req.query.period, req.query.type);
    const students = await StudentAssessment.find(query).sort({ createdAt: -1 });
    res.json({ success: true, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET assessments by grade (optionally filtered by assessment period/type)
app.get('/api/assessments/grade/:grade', async (req, res) => {
  try {
    const grade = decodeURIComponent(req.params.grade);
    const query = buildPeriodFilter(req.query.period, req.query.type);
    query.grade = grade;
    const students = await StudentAssessment.find(query).sort({ studentName: 1 });
    res.json({ success: true, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET search assessments
app.get('/api/assessments/search', async (req, res) => {
  try {
    const { name, grade, period, type } = req.query;
    let query = buildPeriodFilter(period, type);
    if (name) query.studentName = { $regex: name, $options: 'i' };
    if (grade) query.grade = grade;
    
    const students = await StudentAssessment.find(query).sort({ createdAt: -1 });
    res.json({ success: true, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET single student
app.get('/api/assessments/student/:id', async (req, res) => {
  try {
    const student = await StudentAssessment.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET stats (optionally filtered by assessment period/type)
app.get('/api/assessments/stats', async (req, res) => {
  try {
    const query = buildPeriodFilter(req.query.period, req.query.type);
    const students = await StudentAssessment.find(query);
    const stats = {
      total: students.length,
      exceeding: students.filter(s => s.performanceLevel === 'Exceeding Expectation').length,
      meeting: students.filter(s => s.performanceLevel === 'Meeting Expectation').length,
      approaching: students.filter(s => s.performanceLevel === 'Approaching Expectation').length,
      below: students.filter(s => s.performanceLevel === 'Below Expectation').length
    };
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create-or-update assessment (upsert by student+grade+period+type).
// This is the history-safe save: a new month's assessment NEVER overwrites a
// previous month's because each period is identified by a separate document.
app.post('/api/assessments', async (req, res) => {
  try {
    const { studentName, grade, assessments, assessmentPeriod, assessmentType, assessmentDate } = req.body;
    
    if (!studentName || !String(studentName).trim()) {
      return res.status(400).json({ success: false, message: 'studentName is required' });
    }
    if (!grade || !String(grade).trim()) {
      return res.status(400).json({ success: false, message: 'grade is required' });
    }
    validateAssessments(assessments);
    
    const { period, type } = normalisePeriodType(assessmentPeriod, assessmentType);
    
    const totalScore = computeTotal(assessments);
    const averageScore = assessments.length > 0 ? totalScore / assessments.length : 0;
    const performanceLevel = calculatePerformanceLevel(assessments);
    
    const update = {
      studentName: String(studentName).trim(),
      grade: String(grade).trim(),
      assessments,
      totalScore,
      averageScore,
      performanceLevel,
      assessmentPeriod: period,
      assessmentType: type,
      assessmentDate: assessmentDate ? new Date(assessmentDate) : new Date(),
      updatedAt: new Date()
    };
    
    // Upsert on the composite key so the same student+period+type is updated
    // in place while a different period remains untouched.
    const student = await StudentAssessment.findOneAndUpdate(
      {
        studentName: update.studentName,
        grade: update.grade,
        assessmentPeriod: period,
        assessmentType: type
      },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    res.json({ success: true, message: 'Assessment saved!', student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update assessment by id (kept for backward compatibility). Also honours
// the assessment period/type so edits stay in their correct period.
app.put('/api/assessments/:id', async (req, res) => {
  try {
    const { studentName, grade, assessments, assessmentPeriod, assessmentType, assessmentDate } = req.body;
    const student = await StudentAssessment.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    validateAssessments(assessments);
    
    const period = (assessmentPeriod && String(assessmentPeriod).trim()) || student.assessmentPeriod || DEFAULT_PERIOD;
    const type = (assessmentType && String(assessmentType).trim()) || student.assessmentType || DEFAULT_TYPE;
    
    student.studentName = studentName || student.studentName;
    student.grade = grade || student.grade;
    student.assessments = assessments;
    student.totalScore = computeTotal(assessments);
    student.averageScore = assessments.length > 0 ? student.totalScore / assessments.length : 0;
    student.performanceLevel = calculatePerformanceLevel(assessments);
    student.assessmentPeriod = period;
    student.assessmentType = type;
    if (assessmentDate) student.assessmentDate = new Date(assessmentDate);
    student.updatedAt = new Date();
    
    await student.save();
    res.json({ success: true, message: 'Assessment updated!', student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE assessment
app.delete('/api/assessments/:id', async (req, res) => {
  try {
    await StudentAssessment.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Assessment deleted!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE all assessments
app.delete('/api/assessments/all', async (req, res) => {
  try {
    await StudentAssessment.deleteMany({});
    res.json({ success: true, message: 'All assessments deleted!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET assessment history (distinct periods/types) for a grade
app.get('/api/assessments/history/:grade', async (req, res) => {
  try {
    const grade = decodeURIComponent(req.params.grade);
    const history = await StudentAssessment.aggregate([
      { $match: { grade: grade } },
      {
        $group: {
          _id: {
            period: { $ifNull: ['$assessmentPeriod', DEFAULT_PERIOD] },
            type: { $ifNull: ['$assessmentType', DEFAULT_TYPE] }
          },
          studentCount: { $sum: 1 },
          latestDate: { $max: '$assessmentDate' }
        }
      },
      { $sort: { latestDate: -1 } }
    ]);
    const periods = history.map(h => ({
      assessmentPeriod: h._id.period,
      assessmentType: h._id.type,
      studentCount: h.studentCount,
      latestDate: h.latestDate
    }));
    res.json({ success: true, periods });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE assessments for a specific period only (scoped).
// Implemented as individual deletes (no deleteMany) to protect other periods.
app.delete('/api/assessments/by-period/:grade', async (req, res) => {
  try {
    const grade = decodeURIComponent(req.params.grade);
    const { period, type } = req.query;
    if (!period) {
      return res.status(400).json({ success: false, message: 'period query parameter is required' });
    }
    const filter = buildPeriodFilter(period, type);
    filter.grade = grade;
    const toDelete = await StudentAssessment.find(filter);
    let deleted = 0;
    for (const doc of toDelete) {
      await doc.deleteOne();
      deleted++;
    }
    res.json({ success: true, message: `${deleted} assessment record(s) deleted for the selected period`, deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET whole-class assessment report HTML (professional print/PDF layout).
// Usage: /api/assessments/class-report/:grade?period=September%202026&type=Monthly%20Assessment
app.get('/api/assessments/class-report/:grade', async (req, res) => {
  try {
    const grade = decodeURIComponent(req.params.grade);
    const { period, type } = req.query;

    const query = buildPeriodFilter(period, type);
    query.grade = grade;

    const students = await StudentAssessment.find(query).sort({ studentName: 1 });

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No assessment data found for the selected grade and period'
      });
    }

    // Collect distinct subjects in order of first appearance
    const subjectOrder = [];
    const subjectSet = new Set();
    students.forEach(s => {
      s.assessments.forEach(a => {
        if (!subjectSet.has(a.subject)) {
          subjectSet.add(a.subject);
          subjectOrder.push(a.subject);
        }
      });
    });

    const periodLabel = period || 'All Periods';
    const typeLabel = type || 'All Types';
    const genDate = new Date().toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const performanceColors = {
      'Exceeding Expectation': '#28a745',
      'Meeting Expectation': '#17a2b8',
      'Approaching Expectation': '#d4a017',
      'Below Expectation': '#dc3545'
    };

    // Build subject header cells
    const subjectHeaders = subjectOrder.map(subj =>
      `<th class="subj-header" title="${subj}">${escapeHtml(subj)}</th>`
    ).join('');

    // Build student rows
    const rows = students.map((student, index) => {
      const subjectCells = subjectOrder.map(subj => {
        const a = student.assessments.find(x => x.subject === subj);
        const score = (a && !isNaN(a.score)) ? a.score : '';
        return `<td class="score-cell">${score !== '' ? score : ''}</td>`;
      }).join('');

      const avgDisplay = student.averageScore ? Number(student.averageScore).toFixed(1) : '0.0';
      const pcolor = performanceColors[student.performanceLevel] || '#6c757d';
      const perfClass = 'perf-' + (student.performanceLevel || '').replace(/\s+/g, '-').toLowerCase();

      return `
        <tr class="student-row" style="break-inside:avoid;page-break-inside:avoid;">
          <td class="no-cell">${index + 1}</td>
          <td class="name-cell" title="${escapeHtml(student.studentName)}">${escapeHtml(student.studentName)}</td>
          ${subjectCells}
          <td class="num-cell"><strong>${student.totalScore || 0}</strong></td>
          <td class="num-cell">${avgDisplay}</td>
          <td class="perf-cell">
            <span class="perf-badge ${perfClass}" style="background:${pcolor};">${escapeHtml(student.performanceLevel || 'N/A')}</span>
          </td>
        </tr>`;
    }).join('');

    const subjectCount = subjectOrder.length;
    // Landscape is required when there are several subject columns (always for our grades)
    const useLandscape = subjectCount >= 3;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Class Assessment Report - ${escapeHtml(grade)}</title>
<style>
  @page {
    size: A4 ${useLandscape ? 'landscape' : 'portrait'};
    margin: 10mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: #ffffff;
    color: #1a1a2e;
    font-size: 10pt;
    line-height: 1.3;
  }
  .report { width: 100%; max-width: 100%; }
  .school-header {
    text-align: center;
    border-bottom: 3px solid #0A1628;
    padding-bottom: 12px;
    margin-bottom: 8px;
  }
  .school-header h1 {
    color: #0A1628;
    font-size: 22pt;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .school-header .tagline {
    color: #D4A017;
    font-size: 11pt;
    font-weight: 600;
    margin-top: 2px;
  }
  .school-header .address {
    color: #555;
    font-size: 9pt;
    margin-top: 3px;
  }
  .report-title {
    text-align: center;
    margin: 8px 0 4px 0;
    font-size: 16pt;
    color: #0A1628;
    font-weight: 700;
  }
  .report-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    justify-content: center;
    margin-bottom: 6px;
    font-size: 9.5pt;
    color: #333;
  }
  .report-meta span strong { color: #0A1628; }
  .print-controls { text-align: center; margin-bottom: 10px; }
  .print-controls button {
    background: #0A1628; color: #fff; border: none; border-radius: 6px;
    padding: 8px 18px; font-size: 10pt; cursor: pointer; margin: 0 4px;
  }
  .print-controls button:hover { background: #D4A017; color: #0A1628; }
  table.class-results {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
    table-layout: auto;
  }
  table.class-results th, table.class-results td {
    border: 1px solid #777;
    padding: 4px 5px;
    text-align: center;
    vertical-align: middle;
  }
  table.class-results th {
    background: #0A1628;
    color: #fff;
    font-weight: 600;
    font-size: 8pt;
    white-space: normal;
    word-break: normal;
    overflow-wrap: anywhere;
    padding: 5px 4px;
  }
  table.class-results thead th:first-child,
  table.class-results thead th:nth-child(2) { text-align: left; }
  .subj-header {
    min-width: 70px;
    max-width: 140px;
    word-break: normal;
    overflow-wrap: anywhere;
    white-space: normal;
    line-height: 1.2;
  }
  .name-cell {
    min-width: 140px;
    text-align: left;
    word-break: normal;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  .no-cell { min-width: 36px; }
  .num-cell { min-width: 50px; word-break: normal; overflow-wrap: anywhere; }
  .score-cell { min-width: 48px; word-break: normal; overflow-wrap: anywhere; }
  .perf-cell { min-width: 150px; }
  .perf-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 50px;
    color: #fff !important;
   font-weight: 700;
     font-size: 8pt;
     white-space: normal;
     word-break: normal;
     overflow-wrap: anywhere;
   }
  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  .report-footer {
    text-align: center;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #bbb;
    font-size: 8.5pt;
    color: #666;
  }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; color-adjust: exact; }
    table.class-results th { -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="report">
    <div class="school-header">
      <h1>CHANGARA STAR ACADEMY</h1>
      <div class="tagline">Assurance for Excellence</div>
      <div class="address">P.O. Box 7-50201, Cheptais &nbsp;|&nbsp; 📞 +254 721 556 252 &nbsp;|&nbsp; starchangara@gmail.com</div>
    </div>

    <div class="report-title">ACADEMIC ASSESSMENT REPORT</div>
    <div class="report-meta">
      <span><strong>Grade:</strong> ${escapeHtml(grade)}</span>
      <span><strong>Assessment:</strong> ${escapeHtml(typeLabel)}</span>
      <span><strong>Period:</strong> ${escapeHtml(periodLabel)}</span>
      <span><strong>Term:</strong> ${escapeHtml(getTermForPeriod(periodLabel))}</span>
      <span><strong>Date Generated:</strong> ${genDate}</span>
    </div>

    <div class="print-controls no-print">
      <button onclick="window.print()"><i class="fas fa-print"></i> Print / Save as PDF</button>
    </div>

    <table class="class-results">
      <thead>
        <tr>
          <th>No.</th>
          <th>Student Name</th>
          ${subjectHeaders}
          <th class="num-cell">Total</th>
          <th class="num-cell">Average</th>
          <th class="perf-cell">Performance Level</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:8pt;">
      <tr>
        <td style="padding:3px 6px;">📊 <strong>Performance Levels Explained</strong></td>
      </tr>
      <tr><td style="padding:2px 6px;">● 80% &amp; above = Exceeding Expectation &nbsp;|&nbsp; 60-79% = Meeting Expectation &nbsp;|&nbsp; 40-59% = Approaching Expectation &nbsp;|&nbsp; Below 40% = Below Expectation</td></tr>
    </table>

    <div class="report-footer">
      <p>© ${new Date().getFullYear()} Changara Star Academy. This is a computer-generated report.</p>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;

    res.json({
      success: true,
      html,
      grade,
      period: periodLabel,
      type: typeLabel,
      studentCount: students.length,
      subjectCount
    });
  } catch (error) {
    console.error('Class report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper: escape HTML to prevent injection in generated reports
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper: derive a simple term label from a period string
function getTermForPeriod(period) {
  if (!period) return '-';
  const p = String(period).toLowerCase();
  if (p.indexOf('january') !== -1 || p.indexOf('february') !== -1 || p.indexOf('march') !== -1 ||
      p.indexOf('april') !== -1 || p.indexOf('may') !== -1 || p.indexOf('june') !== -1) {
    return 'Term 1';
  }
  if (p.indexOf('july') !== -1 || p.indexOf('august') !== -1 || p.indexOf('september') !== -1 ||
      p.indexOf('october') !== -1 || p.indexOf('november') !== -1 || p.indexOf('december') !== -1) {
    return 'Term 2';
  }
  if (p.indexOf('term 1') !== -1) return 'Term 1';
  if (p.indexOf('term 2') !== -1) return 'Term 2';
  if (p.indexOf('term 3') !== -1) return 'Term 3';
  return '-';
}

// Generate report
app.get('/api/assessments/generate-report/:id', async (req, res) => {
  try {
    const student = await StudentAssessment.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const performanceColors = {
      'Exceeding Expectation': '#28a745',
      'Meeting Expectation': '#17a2b8',
      'Approaching Expectation': '#ffc107',
      'Below Expectation': '#dc3545'
    };
    
    const subjectsHtml = student.assessments.map(a => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(a.subject)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${a.maxScore}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${a.score}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${a.maxScore > 0 ? ((a.score / a.maxScore) * 100).toFixed(1) : 0}%</td>
      </tr>
    `).join('');
    
    const periodDisplay = (student.assessmentPeriod && student.assessmentPeriod !== DEFAULT_PERIOD)
      ? student.assessmentPeriod : 'Legacy Assessment';
    const typeDisplay = (student.assessmentType && student.assessmentType !== DEFAULT_TYPE)
      ? student.assessmentType : 'Legacy';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Assessment Report - ${escapeHtml(student.studentName)}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 3px solid #D4A017; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { color: #0A1628; margin: 0; font-size: 28px; }
          .header .subtitle { color: #D4A017; font-size: 14px; }
          .student-info { background: #f8f9fc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .student-info table { width: 100%; }
          .student-info td { padding: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #0A1628; color: white; padding: 10px; text-align: left; }
          td { padding: 8px; border: 1px solid #ddd; }
          .summary { display: flex; gap: 20px; flex-wrap: wrap; margin: 20px 0; }
          .summary-item { background: #f8f9fc; padding: 15px; border-radius: 8px; flex: 1; min-width: 120px; text-align: center; }
          .summary-item .label { color: #666; font-size: 12px; }
          .summary-item .value { font-size: 24px; font-weight: bold; color: #0A1628; }
          .performance-badge { 
            display: inline-block; 
            padding: 8px 20px; 
            border-radius: 50px; 
            font-weight: bold;
            background: ${performanceColors[student.performanceLevel] || '#6c757d'};
            color: white;
          }
          .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #ddd; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏫 Changara Star Academy</h1>
          <div class="subtitle">Academic Assessment Report</div>
        </div>
        
        <div class="student-info">
          <table>
            <tr><td><strong>Student Name:</strong></td><td>${escapeHtml(student.studentName)}</td></tr>
            <tr><td><strong>Grade:</strong></td><td>${escapeHtml(student.grade)}</td></tr>
            <tr><td><strong>Assessment:</strong></td><td>${escapeHtml(typeDisplay)}</td></tr>
            <tr><td><strong>Period:</strong></td><td>${escapeHtml(periodDisplay)}</td></tr>
            <tr><td><strong>Report Date:</strong></td><td>${new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })}</td></tr>
            <tr><td><strong>Performance Level:</strong></td><td><span class="performance-badge">${escapeHtml(student.performanceLevel)}</span></td></tr>
          </table>
        </div>
        
        <div class="summary">
          <div class="summary-item">
            <div class="label">Total Score</div>
            <div class="value">${student.totalScore}</div>
          </div>
          <div class="summary-item">
            <div class="label">Average Score</div>
            <div class="value">${student.averageScore.toFixed(1)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Subjects</div>
            <div class="value">${student.assessments.length}</div>
          </div>
        </div>
        
        <h3>📊 Subject Performance</h3>
        <table>
          <thead>
            <tr><th>Subject</th><th>Max Score</th><th>Score</th><th>Percentage</th></tr>
          </thead>
          <tbody>${subjectsHtml}</tbody>
        </table>
        
        <div style="margin-top:20px;padding:15px;background:#f0f2f5;border-radius:8px;">
          <h4>📌 Performance Key</h4>
          <ul style="list-style:none;padding:0;">
            <li>🎯 <strong>Exceeding Expectation</strong> - 80% and above</li>
            <li>✅ <strong>Meeting Expectation</strong> - 60% to 79%</li>
            <li>📈 <strong>Approaching Expectation</strong> - 40% to 59%</li>
            <li>📚 <strong>Below Expectation</strong> - Below 40%</li>
          </ul>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} Changara Star Academy - P.O Box 7, Cheptais</p>
          <p>📞 +254 721 556 252 | 📧 starchangara@gmail.com</p>
        </div>
      </body>
      </html>
    `;
    
    res.json({ success: true, html, student });
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
        },
        assessments: {
          all: '/api/assessments/all?period=September%202026&type=Monthly%20Assessment',
          grade: '/api/assessments/grade/:grade?period=September%202026&type=Monthly%20Assessment',
          search: '/api/assessments/search?name=John&period=September%202026&type=Monthly%20Assessment',
          history: '/api/assessments/history/:grade',
          stats: '/api/assessments/stats?period=September%202026&type=Monthly%20Assessment',
          create: '/api/assessments (POST - upsert by student+grade+period+type)',
          update: '/api/assessments/:id (PUT - period-aware)',
          generateReport: '/api/assessments/generate-report/:id',
          classReport: '/api/assessments/class-report/:grade?period=September%202026&type=Monthly%20Assessment'
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
  console.log(`📊 Assessments API: http://localhost:${PORT}/api/assessments/all`);
  console.log('='.repeat(50));
  console.log('✅ Server started successfully!');
});