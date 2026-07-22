const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/schoolDB')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

// ============================================
// FILE UPLOAD SETUP - ONLY ONCE
// ============================================
const uploadDirs = ['./uploads'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = file.originalname.split('.').pop();
        cb(null, uniqueSuffix + '.' + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/mpeg', 'video/webm',
        'audio/mpeg', 'audio/mp3', 'audio/wav',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('File type not allowed'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ============================================
// HOLIDAY ASSIGNMENTS SCHEMA
// ============================================
const holidayAssignmentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    grade: { type: String, required: true },
    subject: { type: String, default: '' },
    description: { type: String, default: '' },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, default: 'pdf' },
    fileSize: { type: Number, default: 0 },
    uploadedBy: { type: String, default: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const HolidayAssignment = mongoose.model('HolidayAssignment', holidayAssignmentSchema);

// ============================================
// ROUTES - ALL API ROUTES FIRST
// ============================================

// GET - all assignments
app.get('/api/holiday-assignments/all', async (req, res) => {
    try {
        const assignments = await HolidayAssignment.find({}).sort({ createdAt: -1 });
        res.json({ success: true, assignments });
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET - by grade
app.get('/api/holiday-assignments/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        const assignments = await HolidayAssignment.find({ grade: grade }).sort({ createdAt: -1 });
        res.json({ success: true, assignments });
    } catch (error) {
        console.error('Error fetching assignments by grade:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET - single assignment
app.get('/api/holiday-assignments/:id', async (req, res) => {
    try {
        const assignment = await HolidayAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        res.json({ success: true, assignment });
    } catch (error) {
        console.error('Error fetching assignment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST - Upload new assignment
app.post('/api/holiday-assignments', upload.single('file'), async (req, res) => {
    console.log('📥 POST /api/holiday-assignments received');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    try {
        const { title, grade, subject, description } = req.body;
        
        if (!title || !grade) {
            return res.status(400).json({ success: false, message: 'Title and Grade are required' });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload a file' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        const fileName = req.file.originalname;
        const fileType = fileName.split('.').pop().toLowerCase();
        const fileSize = req.file.size;
        
        const assignment = new HolidayAssignment({
            title,
            grade,
            subject: subject || '',
            description: description || '',
            fileName,
            fileUrl,
            fileType,
            fileSize,
            uploadedBy: req.body.uploadedBy || 'Admin',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        await assignment.save();
        
        console.log('✅ Assignment saved:', assignment._id);
        
        res.status(201).json({
            success: true,
            message: 'Assignment uploaded successfully!',
            assignment
        });
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE - Delete assignment
app.delete('/api/holiday-assignments/:id', async (req, res) => {
    try {
        const assignment = await HolidayAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        
        try {
            const filePath = path.join(__dirname, assignment.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('🗑️ File deleted:', filePath);
            }
        } catch (fileError) {
            console.log('File deletion warning:', fileError.message);
        }
        
        await HolidayAssignment.findByIdAndDelete(req.params.id);
        
        res.json({ success: true, message: 'Assignment deleted successfully!' });
    } catch (error) {
        console.error('Error deleting assignment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

console.log('✅ Holiday Assignment routes loaded');

// ============================================
// TEST ROUTE
// ============================================
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'Test server is running!' });
});

// ============================================
// SERVE STATIC FILES - AFTER ALL API ROUTES
// ============================================
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// 404 HANDLER - MUST BE LAST
// ============================================
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ============================================
// START THE SERVER
// ============================================
const PORT = 5000;
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🏫 CHANGARA STAR ACADEMY - TEST SERVER');
    console.log('='.repeat(50));
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
    console.log(`📚 Holiday Assignments API: http://localhost:${PORT}/api/holiday-assignments/all`);
    console.log('='.repeat(50));
    console.log('✅ Server started successfully!');
});