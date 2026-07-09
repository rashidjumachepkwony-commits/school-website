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
// API ROUTES
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
// CREATE FIRST ADMIN
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
// TEST ROUTE - Check if server is working
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
        setup: '/api/setup-admin'
      }
    }
  });
});

// ============================================
// SERVE STATIC FILES (Your HTML, CSS, JS)
// ============================================
app.use(express.static(__dirname));

// ============================================
// DEFAULT ROUTE - Serve index.html
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// 404 HANDLER - For routes that don't exist
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
  console.log('='.repeat(50));
  console.log('✅ Server started successfully!');
});