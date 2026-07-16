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
    const kenyaTimeString = now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    return new Date(kenyaTimeString);
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
        timeZone: 'Africa/Nairobi',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatKenyaFullTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleTimeString('en-KE', {
        timeZone: 'Africa/Nairobi',
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
        timeZone: 'Africa/Nairobi',
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
// ACADEMIC ASSESSMENT SCHEMAS
// ============================================

// Subject Config Schema
const subjectConfigSchema = new mongoose.Schema({
  grade: { type: String, required: true },
  type: { type: String, required: true, default: 'monthly' },
  subjects: [{
    name: { type: String, required: true },
    max: { type: Number, required: true }
  }],
  rankLevels: {
    type: [String],
    default: ['Below Expectation', 'Approaching Expectation', 'Meeting Expectation', 'Exceeding Expectation']
  },
  updatedAt: { type: Date, default: Date.now }
});

subjectConfigSchema.index({ grade: 1, type: 1 }, { unique: true });

const SubjectConfig = mongoose.model('SubjectConfig', subjectConfigSchema);

// Student Assessment Schema
const studentAssessmentSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  admissionNumber: { type: String, default: '' },
  grade: { type: String, required: true },
  type: { type: String, default: 'monthly' },
  period: { type: String, default: '' },
  month: { type: String, default: '' },
  year: { type: String, default: '' },
  term: { type: String, default: '' },
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const StudentAssessment = mongoose.model('StudentAssessment', studentAssessmentSchema);

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculatePerformanceLevel(assessments) {
  if (!assessments || assessments.length === 0) return 'Approaching Expectation';
  
  let totalPercentage = 0;
  let validCount = 0;
  assessments.forEach(a => {
    if (a.maxScore > 0) {
      totalPercentage += (a.score / a.maxScore) * 100;
      validCount++;
    }
  });
  const avgPercentage = validCount > 0 ? totalPercentage / validCount : 0;
  
  if (avgPercentage >= 80) return 'Exceeding Expectation';
  if (avgPercentage >= 60) return 'Meeting Expectation';
  if (avgPercentage >= 40) return 'Approaching Expectation';
  return 'Below Expectation';
}

function calculateTotals(assessments) {
  let totalScore = 0;
  let totalMax = 0;
  assessments.forEach(a => {
    totalScore += a.score || 0;
    totalMax += a.maxScore || 0;
  });
  return { totalScore, totalMax };
}

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

// Notice Alert Routes
app.put('/api/content/notice', async (req, res) => {
  try {
    const content = await Content.getContent();
    content.noticeAlert = req.body.noticeAlert || '';
    content.noticeType = req.body.noticeType || 'staff';
    content.noticeDate = new Date();
    await content.save();
    res.json({ success: true, message: 'Notice updated successfully' });
  } catch (error) {
    console.error('Notice update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/content/notice', async (req, res) => {
  try {
    const content = await Content.getContent();
    content.noticeAlert = '';
    content.noticeType = '';
    content.noticeDate = null;
    await content.save();
    res.json({ success: true, message: 'Notice dismissed successfully' });
  } catch (error) {
    console.error('Notice dismiss error:', error);
    res.status(500).json({ success: false, message: error.message });
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
// API ROUTES - TEACHER
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
// ACADEMIC ASSESSMENT API ROUTES
// ============================================

// GET subject configuration for a grade and type
app.get('/api/assessments/subjects/:grade', async (req, res) => {
  try {
    const { grade } = req.params;
    const type = req.query.type || 'monthly';
    
    let config = await SubjectConfig.findOne({ grade, type });
    if (!config) {
      const defaultSubjects = getDefaultSubjects(grade, type);
      config = { grade, type, subjects: defaultSubjects };
    }
    
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error fetching subject config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update subject configuration
app.put('/api/assessments/subjects/:grade', async (req, res) => {
  try {
    const { grade } = req.params;
    const { type, subjects } = req.body;
    
    if (!grade || !type || !subjects || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid data. Need grade, type, and subjects array.' 
      });
    }
    
    for (const s of subjects) {
      if (!s.name || typeof s.max !== 'number' || s.max < 1) {
        return res.status(400).json({ 
          success: false, 
          message: 'Each subject must have a name and a max score > 0' 
        });
      }
    }
    
    let config = await SubjectConfig.findOne({ grade, type });
    if (config) {
      config.subjects = subjects;
      config.updatedAt = new Date();
    } else {
      config = new SubjectConfig({ grade, type, subjects });
    }
    await config.save();
    
    const students = await StudentAssessment.find({ grade, type });
    let updatedCount = 0;
    for (const student of students) {
      let changed = false;
      for (const assessment of student.assessments) {
        const subjectConfig = subjects.find(s => s.name === assessment.subject);
        if (subjectConfig && assessment.maxScore !== subjectConfig.max) {
          assessment.maxScore = subjectConfig.max;
          changed = true;
        }
      }
      if (changed) {
        const { totalScore } = calculateTotals(student.assessments);
        const avgScore = student.assessments.length > 0 ? totalScore / student.assessments.length : 0;
        student.totalScore = totalScore;
        student.averageScore = avgScore;
        student.performanceLevel = calculatePerformanceLevel(student.assessments);
        student.updatedAt = new Date();
        await student.save();
        updatedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Subject configuration updated successfully! ${updatedCount} student records updated.`,
      config 
    });
  } catch (error) {
    console.error('Error updating subject config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET assessments for a specific grade and period
app.get('/api/assessments/grade/:grade', async (req, res) => {
  try {
    const { grade } = req.params;
    const { type, period, month, year, term } = req.query;
    
    const filter = { grade };
    if (type) filter.type = type;
    if (period) filter.period = period;
    if (month) filter.month = month;
    if (year) filter.year = year;
    if (term) filter.term = term;
    
    const students = await StudentAssessment.find(filter).sort({ studentName: 1 });
    
    let config = await SubjectConfig.findOne({ grade, type: type || 'monthly' });
    if (!config) {
      const defaultSubjects = getDefaultSubjects(grade, type || 'monthly');
      config = { grade, type: type || 'monthly', subjects: defaultSubjects };
    }
    
    res.json({ 
      success: true, 
      students,
      subjectConfig: { [`${grade}_${type || 'monthly'}`]: config }
    });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET a single student assessment
app.get('/api/assessments/student/:id', async (req, res) => {
  try {
    const student = await StudentAssessment.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, student });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create a new student assessment
app.post('/api/assessments', async (req, res) => {
  try {
    const { studentName, admissionNumber, grade, type, period, month, year, term, assessments } = req.body;
    
    if (!studentName || !grade || !assessments || !Array.isArray(assessments) || assessments.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid data. Need studentName, grade, and assessments array.' 
      });
    }
    
    const { totalScore } = calculateTotals(assessments);
    const avgScore = assessments.length > 0 ? totalScore / assessments.length : 0;
    const performanceLevel = calculatePerformanceLevel(assessments);
    
    const student = new StudentAssessment({
      studentName,
      admissionNumber: admissionNumber || '',
      grade,
      type: type || 'monthly',
      period: period || '',
      month: month || '',
      year: year || '',
      term: term || '',
      assessments,
      totalScore,
      averageScore: avgScore,
      performanceLevel
    });
    
    await student.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'Student assessment created successfully!',
      student
    });
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update a student assessment
app.put('/api/assessments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { studentName, admissionNumber, grade, type, period, month, year, term, assessments } = req.body;
    
    const student = await StudentAssessment.findById(id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    if (studentName) student.studentName = studentName;
    if (admissionNumber) student.admissionNumber = admissionNumber;
    if (grade) student.grade = grade;
    if (type) student.type = type;
    if (period) student.period = period;
    if (month) student.month = month;
    if (year) student.year = year;
    if (term) student.term = term;
    
    if (assessments && Array.isArray(assessments) && assessments.length > 0) {
      student.assessments = assessments;
      const { totalScore } = calculateTotals(assessments);
      const avgScore = assessments.length > 0 ? totalScore / assessments.length : 0;
      student.totalScore = totalScore;
      student.averageScore = avgScore;
      student.performanceLevel = calculatePerformanceLevel(assessments);
    }
    
    student.updatedAt = new Date();
    await student.save();
    
    res.json({ 
      success: true, 
      message: 'Student assessment updated successfully!',
      student
    });
  } catch (error) {
    console.error('Error updating assessment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE a student assessment
app.delete('/api/assessments/:id', async (req, res) => {
  try {
    const student = await StudentAssessment.findByIdAndDelete(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, message: 'Student assessment deleted successfully!' });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET all student assessments (for admin list)
app.get('/api/assessments/all', async (req, res) => {
  try {
    const students = await StudentAssessment.find().sort({ studentName: 1 });
    res.json({ success: true, students });
  } catch (error) {
    console.error('Error fetching all assessments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// PARENT/STUDENT RESULTS SEARCH API - FIXED
// ============================================

// GET search for student results by name, grade, or type
app.get('/api/assessments/search', async (req, res) => {
  try {
    const { name, grade, type, admission } = req.query;
    
    // Build search filter
    let filter = {};
    
    if (name) {
      filter.studentName = { $regex: name, $options: 'i' };
    }
    
    if (admission) {
      filter.admissionNumber = { $regex: admission, $options: 'i' };
    }
    
    if (grade) {
      filter.grade = grade;
    }
    
    if (type) {
      filter.type = type;
    }
    
    // If no search criteria, return error
    if (Object.keys(filter).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, grade, or admission number'
      });
    }
    
    console.log('🔍 Searching with filter:', filter);
    
    // Find students matching the criteria
    const students = await StudentAssessment.find(filter).sort({ studentName: 1 });
    
    console.log('📊 Found students:', students.length);
    
    // If no students found
    if (students.length === 0) {
      return res.json({
        success: true,
        students: [],
        count: 0,
        message: 'No students found'
      });
    }
    
    res.json({
      success: true,
      students: students,
      count: students.length
    });
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// GET generate student report
app.get('/api/assessments/generate-report/:studentId', async (req, res) => {
  try {
    const student = await StudentAssessment.findById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const html = generateStudentReportHTML(student);
    res.json({ success: true, html });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// POST copy assessments from one period to another
// ============================================
app.post('/api/assessments/copy', async (req, res) => {
  try {
    const { 
      fromGrade, fromType, fromPeriod, fromMonth, fromYear, fromTerm,
      toGrade, toType, toPeriod, toMonth, toYear, toTerm
    } = req.body;
    
    const sourceFilter = { grade: fromGrade };
    if (fromType) sourceFilter.type = fromType;
    if (fromPeriod) sourceFilter.period = fromPeriod;
    if (fromMonth) sourceFilter.month = fromMonth;
    if (fromYear) sourceFilter.year = fromYear;
    if (fromTerm) sourceFilter.term = fromTerm;
    
    const sourceStudents = await StudentAssessment.find(sourceFilter);
    
    if (sourceStudents.length === 0) {
      return res.json({ success: true, message: 'No students found to copy', count: 0 });
    }
    
    let config = await SubjectConfig.findOne({ grade: toGrade, type: toType || 'monthly' });
    if (!config) {
      const defaultSubjects = getDefaultSubjects(toGrade, toType || 'monthly');
      config = { grade: toGrade, type: toType || 'monthly', subjects: defaultSubjects };
    }
    
    let copiedCount = 0;
    
    for (const source of sourceStudents) {
      const existingFilter = {
        studentName: source.studentName,
        grade: toGrade,
        type: toType || 'monthly',
        period: toPeriod,
        month: toMonth,
        year: toYear,
        term: toTerm
      };
      
      const existing = await StudentAssessment.findOne(existingFilter);
      if (existing) continue;
      
      const newAssessments = config.subjects.map(subj => {
        const sourceAssessment = source.assessments.find(a => a.subject === subj.name);
        return {
          subject: subj.name,
          maxScore: subj.max,
          score: sourceAssessment ? Math.min(sourceAssessment.score, subj.max) : 0
        };
      });
      
      const { totalScore } = calculateTotals(newAssessments);
      const avgScore = newAssessments.length > 0 ? totalScore / newAssessments.length : 0;
      const performanceLevel = calculatePerformanceLevel(newAssessments);
      
      const newStudent = new StudentAssessment({
        studentName: source.studentName,
        admissionNumber: source.admissionNumber || '',
        grade: toGrade,
        type: toType || 'monthly',
        period: toPeriod,
        month: toMonth,
        year: toYear,
        term: toTerm,
        assessments: newAssessments,
        totalScore,
        averageScore: avgScore,
        performanceLevel
      });
      
      await newStudent.save();
      copiedCount++;
    }
    
    res.json({ 
      success: true, 
      message: `Copied ${copiedCount} students successfully!`,
      count: copiedCount
    });
  } catch (error) {
    console.error('Error copying assessments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// DEFAULT SUBJECT CONFIGURATIONS
// ============================================
function getDefaultSubjects(grade, type) {
  const configs = {
    'weekly': {
      'Play Group': [
        { name: 'MATH', max: 10 }, { name: 'LANG', max: 10 }, { name: 'LIT', max: 10 },
        { name: 'KUS', max: 10 }, { name: 'ENVI/CRE', max: 10 }, { name: 'C/A', max: 10 }
      ],
      'PP1': [
        { name: 'MATH', max: 10 }, { name: 'LANG', max: 10 }, { name: 'LIT', max: 10 },
        { name: 'KIS', max: 10 }, { name: 'KUS', max: 10 }, { name: 'ENV', max: 10 },
        { name: 'CRE/I.R.E', max: 10 }, { name: 'C/A', max: 10 }
      ],
      'PP2': [
        { name: 'MATH', max: 10 }, { name: 'LANG', max: 10 }, { name: 'LIT', max: 10 },
        { name: 'KIS', max: 10 }, { name: 'KUS', max: 10 }, { name: 'ENV', max: 10 },
        { name: 'CRE/I.R.E', max: 10 }, { name: 'C/A', max: 10 }
      ],
      'Grade 1': [
        { name: 'MATH', max: 30 }, { name: 'LIST/SPEAKING', max: 20 }, { name: 'READING', max: 20 },
        { name: 'GRAMMAR', max: 20 }, { name: 'KUSOMA', max: 20 }, { name: 'SARUFI', max: 20 },
        { name: 'ENV', max: 30 }, { name: 'C.R.E', max: 20 }, { name: 'CREATIVE ARTS', max: 20 }
      ],
      'Grade 2': [
        { name: 'LIST & SPEAKING', max: 20 }, { name: 'READING ALOUD', max: 20 },
        { name: 'GRAMMAR', max: 20 }, { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 20 },
        { name: 'KUSOMA KWA SAUTI', max: 20 }, { name: 'LUGHA', max: 20 },
        { name: 'MATH', max: 30 }, { name: 'ENVIRONMENTAL', max: 30 },
        { name: 'C/A', max: 20 }, { name: 'RE', max: 20 }
      ],
      'Grade 3': [
        { name: 'LIST & SPEAKING', max: 20 }, { name: 'READING ALOUD', max: 20 },
        { name: 'GRAMMAR', max: 20 }, { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 20 },
        { name: 'KUSOMA KWA SAUTI', max: 20 }, { name: 'SARUFI', max: 20 },
        { name: 'MATHS', max: 30 }, { name: 'ENVIRONMENTAL', max: 30 },
        { name: 'C.R.E', max: 20 }, { name: 'I.R.E', max: 20 }, { name: 'C/A', max: 20 }
      ],
      'Grade 4': [
        { name: 'MATHS ACTIVITIES', max: 30 }, { name: 'ENGLISH ACTIVITIES', max: 50 },
        { name: 'SCI & TECH', max: 30 }, { name: 'KISW LUGHA', max: 50 },
        { name: 'SST', max: 30 }, { name: 'RELIGIOUS EDUCATION', max: 20 },
        { name: 'AGRICULTURE', max: 20 }, { name: 'CREATIVE ART', max: 35 }
      ],
      'Grade 5': [
        { name: 'MATHS ACTIVITIES', max: 30 }, { name: 'ENGLISH ACTIVITIES', max: 50 },
        { name: 'SCI & TECH', max: 30 }, { name: 'KISW LUGHA', max: 50 },
        { name: 'SST', max: 30 }, { name: 'RELIGIOUS EDUCATION', max: 20 },
        { name: 'AGRICULTURE', max: 20 }, { name: 'CREATIVE ART', max: 35 }
      ],
      'Grade 6': [
        { name: 'MATHS ACTIVITIES', max: 30 }, { name: 'ENGLISH ACTIVITIES', max: 50 },
        { name: 'SCI & TECH', max: 30 }, { name: 'KISW LUGHA', max: 50 },
        { name: 'SST', max: 30 }, { name: 'RELIGIOUS EDUCATION', max: 20 },
        { name: 'AGRICULTURE', max: 20 }, { name: 'CREATIVE ART', max: 35 }
      ]
    },
    'monthly': {
      'Grade 1': [
        { name: 'MATH', max: 50 }, { name: 'LIST/SPEAKING', max: 30 },
        { name: 'READING', max: 30 }, { name: 'GRAMMAR', max: 30 },
        { name: 'KUSOMA', max: 30 }, { name: 'SARUFI', max: 30 },
        { name: 'ENV', max: 50 }, { name: 'C.R.E', max: 30 },
        { name: 'CREATIVE ARTS', max: 30 }
      ],
      'Grade 4': [
        { name: 'MATHS ACTIVITIES', max: 60 }, { name: 'ENGLISH ACTIVITIES', max: 80 },
        { name: 'SCI & TECH', max: 60 }, { name: 'KISW LUGHA', max: 80 },
        { name: 'SST', max: 60 }, { name: 'RELIGIOUS EDUCATION', max: 40 },
        { name: 'AGRICULTURE', max: 40 }, { name: 'CREATIVE ART', max: 50 }
      ]
    },
    'term': {
      'Grade 1': [
        { name: 'MATH', max: 70 }, { name: 'LIST/SPEAKING', max: 50 },
        { name: 'READING', max: 50 }, { name: 'GRAMMAR', max: 50 },
        { name: 'KUSOMA', max: 50 }, { name: 'SARUFI', max: 50 },
        { name: 'ENV', max: 70 }, { name: 'C.R.E', max: 50 },
        { name: 'CREATIVE ARTS', max: 50 }
      ],
      'Grade 4': [
        { name: 'MATHS ACTIVITIES', max: 80 }, { name: 'ENGLISH ACTIVITIES', max: 100 },
        { name: 'SCI & TECH', max: 80 }, { name: 'KISW LUGHA', max: 100 },
        { name: 'SST', max: 80 }, { name: 'RELIGIOUS EDUCATION', max: 60 },
        { name: 'AGRICULTURE', max: 60 }, { name: 'CREATIVE ART', max: 70 }
      ]
    }
  };
  
  const fallback = [
    { name: 'MATHEMATICS', max: 50 },
    { name: 'ENGLISH', max: 50 },
    { name: 'KISWAHILI', max: 50 },
    { name: 'SCIENCE', max: 50 }
  ];
  
  try {
    return configs[type]?.[grade] || configs['weekly']['Grade 1'] || fallback;
  } catch {
    return fallback;
  }
}

// ============================================
// STUDENT REPORT HTML GENERATOR
// ============================================
function generateStudentReportHTML(student) {
  const typeNames = { 'weekly': 'Weekly', 'monthly': 'Monthly', 'term': 'End of Term' };
  const performanceColors = {
    'Exceeding Expectation': '#28a745',
    'Meeting Expectation': '#17a2b8',
    'Approaching Expectation': '#d4a017',
    'Below Expectation': '#dc3545'
  };
  
  const subjectsHtml = student.assessments.map(a => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ddd;">${a.subject}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${a.maxScore}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;font-weight:bold;">${a.score}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;font-weight:bold;">
        ${a.maxScore > 0 ? ((a.score / a.maxScore) * 100).toFixed(1) + '%' : '0%'}
      </td>
    </tr>
  `).join('');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Student Report - ${student.studentName}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; max-width: 800px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 3px solid #D4A017; padding-bottom: 15px; margin-bottom: 20px; }
        .header h1 { color: #0A1628; font-size: 24px; margin: 0; }
        .header p { color: #666; margin: 5px 0; }
        .student-info { background: #f8f9fc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .student-info table { width: 100%; font-size: 14px; }
        .student-info td { padding: 4px 8px; }
        .student-info .label { font-weight: 600; color: #555; width: 120px; }
        .performance-box { text-align: center; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .performance-box .level { font-size: 28px; font-weight: 700; }
        .performance-box .score { font-size: 16px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        table th { background: #0A1628; color: white; padding: 8px 10px; text-align: left; }
        table td { padding: 6px 10px; border: 1px solid #ddd; }
        .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
        @media print { body { padding: 15px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🏫 Changara Star Academy</h1>
        <p>Student Assessment Report</p>
      </div>
      
      <div class="student-info">
        <table>
          <tr><td class="label">Student Name:</td><td><strong>${student.studentName}</strong></td></tr>
          ${student.admissionNumber ? `<tr><td class="label">Admission Number:</td><td><strong>${student.admissionNumber}</strong></td></tr>` : ''}
          <tr><td class="label">Grade:</td><td>${student.grade}</td></tr>
          <tr><td class="label">Assessment Type:</td><td>${typeNames[student.type] || student.type || 'Monthly'}</td></tr>
          <tr><td class="label">Period:</td><td>${student.period || 'N/A'}</td></tr>
          <tr><td class="label">Month:</td><td>${student.month || 'N/A'}</td></tr>
          <tr><td class="label">Term:</td><td>${student.term || 'N/A'}</td></tr>
        </table>
      </div>
      
      <div class="performance-box" style="background: ${performanceColors[student.performanceLevel] || '#f0f0f0'}20; border: 2px solid ${performanceColors[student.performanceLevel] || '#ccc'};">
        <div class="level" style="color: ${performanceColors[student.performanceLevel] || '#333'};">${student.performanceLevel}</div>
        <div class="score">Total Score: ${student.totalScore} | Average: ${student.averageScore.toFixed(1)}</div>
      </div>
      
      <h3 style="margin:15px 0 10px;">📊 Subject Scores</h3>
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Max Score</th>
            <th>Score</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${subjectsHtml}
        </tbody>
      </table>
      
      <div class="footer">
        <p>© 2026 Changara Star Academy - P.O Box 7, Cheptais | 📞 +254 721 556 252 | 📧 starchangara@gmail.com</p>
        <p>Generated on ${formatKenyaFullTime(new Date())}</p>
      </div>
    </body>
    </html>
  `;
}

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
      kenyaTime: kenyaNow.toLocaleString(),
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
        adminAttendance: '/api/admin/attendance/all',
        visitor: {
          checkin: '/api/visitor/checkin',
          checkout: '/api/visitor/checkout/:badgeNumber',
          today: '/api/visitors/today',
          weekly: '/api/visitors/weekly',
          monthly: '/api/visitors/monthly'
        },
        assessments: {
          subjects: '/api/assessments/subjects/:grade',
          grade: '/api/assessments/grade/:grade',
          student: '/api/assessments/student/:id',
          all: '/api/assessments/all',
          search: '/api/assessments/search?name=&grade=&type=',
          create: '/api/assessments (POST)',
          update: '/api/assessments/:id (PUT)',
          delete: '/api/assessments/:id (DELETE)',
          copy: '/api/assessments/copy',
          report: '/api/assessments/generate-report/:studentId'
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
  const kenyaNow = getKenyaTime();
  console.log('='.repeat(50));
  console.log('🏫 CHANGARA STAR ACADEMY');
  console.log('='.repeat(50));
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🕐 Kenya Time: ${kenyaNow.toLocaleString()}`);
  console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
  console.log(`🌐 Website: http://localhost:${PORT}/`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin-login.html`);
  console.log(`👨‍🏫 Staff Check-in: http://localhost:${PORT}/teacher-checkin.html`);
  console.log(`📋 Admin Attendance: http://localhost:${PORT}/admin-attendance.html`);
  console.log(`👨‍🏫 Manage Teachers: http://localhost:${PORT}/admin-teachers.html`);
  console.log(`🚪 Visitor Check-in: http://localhost:${PORT}/visitor-checkin.html`);
  console.log(`📋 Admin Visitors: http://localhost:${PORT}/admin-visitors.html`);
  console.log(`📝 Academic Assessments: http://localhost:${PORT}/admin-academics.html`);
  console.log(`📚 Parent Results: http://localhost:${PORT}/academics.html#assessments`);
  console.log('='.repeat(50));
  console.log('✅ Server started successfully!');
});