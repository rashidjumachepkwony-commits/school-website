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

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// SET TIME ZONE TO KENYA
// ============================================
process.env.TZ = 'Africa/Nairobi';

// ============================================
// HELPER: GET KENYA TIME (UTC+3) - CORRECTED
// ============================================
function getKenyaTime() {
    const now = new Date();
    
    // Get current time in Kenya (UTC+3)
    // Use toLocaleString to get Kenya time
    const kenyaTimeString = now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    let kenyaTime = new Date(kenyaTimeString);
    
    // Check if time is showing PM when it should be AM
    // If hour is between 12 and 23 (PM), subtract 12 hours
    if (kenyaTime.getHours() >= 12) {
        kenyaTime = new Date(kenyaTime.getTime() - (12 * 60 * 60 * 1000));
    }
    
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
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    const hour12 = d.getHours() % 12 || 12;
    return `${hour12.toString().padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}

function formatKenyaFullTime(date) {
    if (!date) return '-';
    return formatKenyaTime(date);
}

function formatKenyaDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
// ============================================
// REPORT HTML GENERATORS
// ============================================

// STAFF REPORT HTML GENERATOR - SINGLE PAGE
function generateStaffReportHTML(report, title, periodInfo) {
    const now = getKenyaTime();
    
    let rowsHtml = report.map((staff, index) => {
        const rate = staff.totalDays > 0 ? ((staff.onTime / staff.totalDays) * 100).toFixed(1) : 0;
        return `
            <tr>
                <td style="padding:3px 4px;border:1px solid #ddd;text-align:center;font-size:7px;">${index + 1}</td>
                <td style="padding:3px 4px;border:1px solid #ddd;font-weight:600;font-size:7px;">${staff.name}</td>
                <td style="padding:3px 4px;border:1px solid #ddd;text-align:center;font-size:7px;">${staff.employeeId || '-'}</td>
                <td style="padding:3px 4px;border:1px solid #ddd;font-size:7px;">${staff.department || '-'}</td>
                <td style="padding:3px 4px;border:1px solid #ddd;text-align:center;font-size:7px;">${staff.totalDays || 0}</td>
                <td style="padding:3px 4px;border:1px solid #ddd;text-align:center;color:#28a745;font-weight:600;font-size:7px;">${staff.onTime || 0}</td>
                <td style="padding:3px 4px;border:1px solid #ddd;text-align:center;color:#d4a017;font-weight:600;font-size:7px;">${staff.late || 0}</td>
                <td style="padding:3px 4px;border:1px solid #ddd;text-align:center;color:#dc3545;font-weight:600;font-size:7px;">${staff.absent || 0}</td>
                <td style="padding:3px 4px;border:1px solid #ddd;text-align:center;font-weight:700;font-size:7px;">${rate}%</td>
            </tr>
        `;
    }).join('');

    let totalStaff = report.length;
    let totalOnTime = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalDays = 0;
    
    report.forEach(staff => {
        totalOnTime += staff.onTime || 0;
        totalLate += staff.late || 0;
        totalAbsent += staff.absent || 0;
        totalDays += staff.totalDays || 0;
    });
    
    const attendanceRate = totalDays > 0 ? ((totalOnTime / totalDays) * 100).toFixed(1) : 0;

    const topPerformers = [...report].sort((a, b) => {
        const rateA = a.totalDays > 0 ? (a.onTime / a.totalDays) : 0;
        const rateB = b.totalDays > 0 ? (b.onTime / b.totalDays) : 0;
        return rateB - rateA;
    }).slice(0, 3);

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Staff Attendance Report</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 8px; max-width: 1100px; margin: 0 auto; font-size: 8px; line-height: 1.2; }
                .header { text-align: center; border-bottom: 2px solid #D4A017; padding-bottom: 4px; margin-bottom: 6px; }
                .header h1 { color: #0A1628; font-size: 14px; margin: 0; }
                .header h1 .school-name { color: #D4A017; }
                .header p { color: #666; margin: 1px 0; font-size: 8px; }
                .summary-box { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 6px; }
                .summary-box .item { text-align: center; padding: 3px 4px; background: #f8f9fc; border-radius: 4px; border: 1px solid #e8ecf1; }
                .summary-box .item .num { font-size: 14px; font-weight: 700; }
                .summary-box .item .label { font-size: 6px; color: #666; }
                .summary-box .item .num.gold { color: #D4A017; }
                .summary-box .item .num.green { color: #28a745; }
                .summary-box .item .num.orange { color: #d4a017; }
                .summary-box .item .num.red { color: #dc3545; }
                .summary-box .item .num.blue { color: #17a2b8; }
                .table-wrap { overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; font-size: 7px; }
                table th { background: #0A1628; color: white; padding: 4px 4px; text-align: left; font-size: 6px; }
                table td { padding: 3px 4px; border-bottom: 1px solid #e8ecf1; }
                table tr:nth-child(even) { background: #fafbfc; }
                .footer { text-align: center; margin-top: 6px; padding-top: 4px; border-top: 1px solid #ddd; color: #999; font-size: 6px; }
                .top-performers { display: flex; justify-content: center; gap: 12px; margin: 4px 0; flex-wrap: wrap; }
                .top-performers .performer { text-align: center; padding: 2px 8px; background: #e8f5e9; border-radius: 4px; }
                .top-performers .performer .name { font-weight: 600; font-size: 7px; }
                .top-performers .performer .rate { color: #28a745; font-weight: 700; font-size: 8px; }
                @media print { body { padding: 4px; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🏫 <span class="school-name">Changara Star Academy</span></h1>
                <p>${title}</p>
                <p style="font-size:6px;color:#999;">${periodInfo}</p>
            </div>
            <div class="summary-box">
                <div class="item"><div class="num gold">${totalStaff}</div><div class="label">Total Staff</div></div>
                <div class="item"><div class="num green">${totalOnTime}</div><div class="label">✅ On Time</div></div>
                <div class="item"><div class="num orange">${totalLate}</div><div class="label">⚠️ Late</div></div>
                <div class="item"><div class="num red">${totalAbsent}</div><div class="label">❌ Absent</div></div>
                <div class="item"><div class="num blue">${attendanceRate}%</div><div class="label">📈 Attendance</div></div>
                <div class="item"><div class="num" style="color:#0A1628;">${totalDays}</div><div class="label">📅 Total Days</div></div>
            </div>
            ${topPerformers.length > 0 ? `
            <div class="top-performers">
                <span style="font-weight:600;font-size:7px;">🏆 Top Performers:</span>
                ${topPerformers.map((p, i) => {
                    const rate = p.totalDays > 0 ? ((p.onTime / p.totalDays) * 100).toFixed(1) : 0;
                    return `<div class="performer"><span class="name">${i+1}. ${p.name}</span> <span class="rate">${rate}%</span></div>`;
                }).join('')}
            </div>
            ` : ''}
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:center;">#</th>
                            <th>Staff Name</th>
                            <th style="text-align:center;">ID</th>
                            <th>Department</th>
                            <th style="text-align:center;">Days</th>
                            <th style="text-align:center;">On Time</th>
                            <th style="text-align:center;">Late</th>
                            <th style="text-align:center;">Absent</th>
                            <th style="text-align:center;">Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
            <div class="footer">
                <p>© 2026 Changara Star Academy - P.O Box 7, Cheptais | 📞 +254 721 556 252 | 📧 starchangara@gmail.com</p>
                <p>Generated on ${formatKenyaFullTime(now)}</p>
            </div>
        </body>
        </html>
    `;
}

// VISITOR REPORT HTML GENERATOR - SINGLE PAGE
function generateVisitorReportHTML(report, title, periodInfo) {
    const now = getKenyaTime();
    
    let rowsHtml = report.map((visitor, index) => {
        const duration = visitor.duration || 0;
        return `
            <tr>
                <td style="padding:2px 3px;border:1px solid #ddd;text-align:center;font-size:6px;">${index + 1}</td>
                <td style="padding:2px 3px;border:1px solid #ddd;font-weight:600;font-size:6px;">${visitor.fullName || visitor.firstName + ' ' + visitor.lastName}</td>
                <td style="padding:2px 3px;border:1px solid #ddd;text-align:center;font-size:6px;">${visitor.badgeNumber || '-'}</td>
                <td style="padding:2px 3px;border:1px solid #ddd;font-size:6px;">${visitor.purpose || '-'}</td>
                <td style="padding:2px 3px;border:1px solid #ddd;font-size:6px;">${visitor.personToVisit || '-'}</td>
                <td style="padding:2px 3px;border:1px solid #ddd;text-align:center;font-size:6px;">${visitor.checkInTime || '-'}</td>
                <td style="padding:2px 3px;border:1px solid #ddd;text-align:center;font-size:6px;">${visitor.checkOutTime || '-'}</td>
                <td style="padding:2px 3px;border:1px solid #ddd;text-align:center;font-size:6px;">
                    <span style="display:inline-block;padding:1px 6px;border-radius:50px;font-size:5px;font-weight:700;color:white;background:${visitor.status === 'Checked In' ? '#28a745' : '#6c757d'};">${visitor.status || '-'}</span>
                </td>
                <td style="padding:2px 3px;border:1px solid #ddd;text-align:center;font-size:6px;">${duration > 0 ? duration + 'm' : '-'}</td>
            </tr>
        `;
    }).join('');

    let totalVisitors = report.length;
    let active = report.filter(v => v.status === 'Checked In').length;
    let completed = report.filter(v => v.status === 'Checked Out').length;
    let totalDuration = 0;
    let purposeCount = {};
    report.forEach(v => { 
        totalDuration += v.duration || 0;
        const p = v.purpose || 'Other';
        purposeCount[p] = (purposeCount[p] || 0) + 1;
    });
    const avgDuration = totalVisitors > 0 ? Math.round(totalDuration / totalVisitors) : 0;
    
    const topPurposes = Object.entries(purposeCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Visitor Report</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 6px; max-width: 1100px; margin: 0 auto; font-size: 7px; line-height: 1.1; }
                .header { text-align: center; border-bottom: 2px solid #D4A017; padding-bottom: 3px; margin-bottom: 4px; }
                .header h1 { color: #0A1628; font-size: 13px; margin: 0; }
                .header h1 .school-name { color: #D4A017; }
                .header p { color: #666; margin: 1px 0; font-size: 7px; }
                .summary-box { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; margin-bottom: 4px; }
                .summary-box .item { text-align: center; padding: 2px 3px; background: #f8f9fc; border-radius: 3px; border: 1px solid #e8ecf1; }
                .summary-box .item .num { font-size: 12px; font-weight: 700; }
                .summary-box .item .label { font-size: 5px; color: #666; }
                .summary-box .item .num.gold { color: #D4A017; }
                .summary-box .item .num.blue { color: #17a2b8; }
                .summary-box .item .num.green { color: #28a745; }
                .summary-box .item .num.orange { color: #d4a017; }
                .summary-box .item .num.purple { color: #6f42c1; }
                .table-wrap { overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; font-size: 6px; }
                table th { background: #0A1628; color: white; padding: 3px 3px; text-align: left; font-size: 5.5px; }
                table td { padding: 2px 3px; border-bottom: 1px solid #e8ecf1; }
                table tr:nth-child(even) { background: #fafbfc; }
                .footer { text-align: center; margin-top: 4px; padding-top: 3px; border-top: 1px solid #ddd; color: #999; font-size: 5px; }
                .purpose-tags { display: flex; justify-content: center; gap: 8px; margin: 3px 0; flex-wrap: wrap; }
                .purpose-tags .tag { padding: 1px 6px; background: #e8ecf1; border-radius: 3px; font-size: 6px; }
                .purpose-tags .tag .count { font-weight: 700; }
                @media print { body { padding: 3px; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🏫 <span class="school-name">Changara Star Academy</span></h1>
                <p>${title}</p>
                <p style="font-size:5px;color:#999;">${periodInfo}</p>
            </div>
            <div class="summary-box">
                <div class="item"><div class="num gold">${totalVisitors}</div><div class="label">Total Visitors</div></div>
                <div class="item"><div class="num blue">${active}</div><div class="label">✅ Checked In</div></div>
                <div class="item"><div class="num green">${completed}</div><div class="label">✅ Checked Out</div></div>
                <div class="item"><div class="num orange">${avgDuration}m</div><div class="label">⏱️ Avg Duration</div></div>
                <div class="item"><div class="num purple">${Object.keys(purposeCount).length}</div><div class="label">📋 Purposes</div></div>
            </div>
            ${topPurposes.length > 0 ? `
            <div class="purpose-tags">
                ${topPurposes.map(([purpose, count]) => 
                    `<span class="tag">${purpose}: <span class="count">${count}</span></span>`
                ).join('')}
            </div>
            ` : ''}
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:center;">#</th>
                            <th>Visitor</th>
                            <th style="text-align:center;">Badge</th>
                            <th>Purpose</th>
                            <th>Person</th>
                            <th style="text-align:center;">Check In</th>
                            <th style="text-align:center;">Check Out</th>
                            <th style="text-align:center;">Status</th>
                            <th style="text-align:center;">Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || `<tr><td colspan="9" style="text-align:center;padding:10px;color:#999;">No visitors found</td></tr>`}
                    </tbody>
                </table>
            </div>
            <div class="footer">
                <p>© 2026 Changara Star Academy - P.O Box 7, Cheptais | 📞 +254 721 556 252 | 📧 starchangara@gmail.com</p>
                <p>Generated on ${formatKenyaFullTime(now)}</p>
            </div>
        </body>
        </html>
    `;
}

// ============================================
// FIX PAST RECORDS
// ============================================
async function fixPastRecords() {
    try {
        console.log('🔄 Fixing past records time...');
        let totalFixed = 0;

        const teachers = await Teacher.find({});
        for (const teacher of teachers) {
            let changed = false;
            for (const record of teacher.attendance) {
                if (record.checkIn) {
                    const original = new Date(record.checkIn);
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
                totalFixed++;
            }
        }

        const visitors = await Visitor.find({});
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
                totalFixed++;
            }
        }

        console.log(`✅ Time fix completed! Fixed ${totalFixed} records.`);
    } catch (error) {
        console.error('❌ Error fixing records:', error);
    }
}

// ============================================
// CONNECT TO MONGODB
// ============================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolDB')
  .then(() => {
    console.log('✅ MongoDB Connected');
    setTimeout(fixPastRecords, 2000);
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
// SCHEMAS
// ============================================

// Content Schema
const contentSchema = new mongoose.Schema({
    heroTitle: { type: String, default: 'Welcome to Changara Star Academy' },
    heroSubtitle: { type: String, default: 'Your trusted partner in quality education and school management' },
    heroButtonText: { type: String, default: 'Learn More' },
    heroButtonLink: { type: String, default: '/about.html' },
    heroVideo: { type: String, default: '' },
    applyButtonText: { type: String, default: 'Apply Now' },
    homeFeatures: [{ icon: { type: String, default: '📚' }, title: { type: String, default: 'Quality Education' }, description: { type: String, default: 'Holistic education that nurtures talent.' } }],
    homeStats: [{ number: { type: String, default: '500+' }, label: { type: String, default: 'Students' } }],
    homeNews: [{ title: { type: String, default: 'Latest News' }, content: { type: String, default: 'Stay updated with our latest announcements.' }, date: { type: Date, default: Date.now } }],
    aboutMission: { type: String, default: 'To provide quality education that nurtures talent, builds character, and prepares students for a successful future.' },
    aboutVision: { type: String, default: 'To be a center of excellence in education, producing well-rounded individuals who contribute positively to society.' },
    aboutValues: { type: String, default: 'Excellence, Integrity, Respect, Innovation, Community Engagement' },
    aboutHistory: { type: String, default: 'Changara Star Academy was founded with a vision to provide quality education to the community.' },
    aboutMotto: { type: String, default: 'Excellence in Education' },
    aboutWhy: { type: String, default: 'Holistic education, qualified teachers, modern facilities.' },
    academicsIntro: { type: String, default: '' },
    academics: [{ grade: { type: String, default: 'Grade 1' }, subjects: { type: String, default: 'Math, English, Science' }, learningApproach: { type: String, default: 'Child-centered learning' }, activities: { type: String, default: 'Group discussions, Projects' }, teacherSupport: { type: String, default: 'Individual attention' } }],
    admissionsIntro: { type: String, default: '' },
    admissionsRequirements: { type: String, default: 'Admission is open to all students who meet the age requirements.' },
    admissionsAge: { type: String, default: 'Playgroup: 2-3 years, PP1: 4 years, PP2: 5 years, Grade 1: 6 years, Grade 2-6: 7-12 years' },
    admissionsDocuments: { type: String, default: 'Birth certificate, Previous school records, Passport photo, Parent ID, Medical records' },
    admissionsProcess: { type: String, default: '1. Visit the school for a tour. 2. Fill the admission form. 3. Submit required documents. 4. Pay registration fee.' },
    admissionsFees: { type: String, default: 'Please contact the school administration for the current fee structure.' },
    facilitiesIntro: { type: String, default: '' },
    facilities: [{ name: { type: String, default: 'Modern Classrooms' }, description: { type: String, default: 'Well-equipped classrooms with modern learning resources.' }, image: { type: String, default: '' } }],
    gallery: [{ title: { type: String, default: 'School Activity' }, description: { type: String, default: '' }, file: { type: String, default: '' }, type: { type: String, default: 'image' }, category: { type: String, default: 'General' } }],
    events: [{ title: { type: String, default: 'Event Title' }, content: { type: String, default: 'Event description' }, date: { type: Date, default: Date.now }, category: { type: String, default: 'General' }, image: { type: String, default: '' } }],
    coCurricular: [{ name: { type: String, default: 'Football' }, description: { type: String, default: 'School football team.' }, category: { type: String, default: 'Sports' }, image: { type: String, default: '' } }],
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
    downloads: [{ name: { type: String, default: 'Admission Form' }, file: { type: String, default: '/downloads/admission-form.pdf' }, description: { type: String, default: 'Download the admission form.' }, icon: { type: String, default: '📄' } }],
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

// Admin Schema
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

// Teacher Schema
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
        status: { type: String, enum: ['Present', 'Absent', 'Late', 'Excused'], default: 'Present' },
        notes: String,
        location: String,
        hoursWorked: Number,
        isLate: { type: Boolean, default: false }
    }],
    createdAt: { type: Date, default: Date.now }
});

const Teacher = mongoose.model('Teacher', teacherSchema);

// Visitor Schema
const visitorSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phoneNumber: { type: String, required: true },
    idNumber: { type: String, required: true },
    purpose: { type: String, enum: ['Interview', 'Meeting', 'Delivery', 'Parent Visit', 'Visitor', 'Other'], required: true },
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

visitorSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

visitorSchema.set('toJSON', { virtuals: true });
visitorSchema.set('toObject', { virtuals: true });

const Visitor = mongoose.model('Visitor', visitorSchema);

// Student Schema
const studentSchema = new mongoose.Schema({
    studentId: { type: String, unique: true },
    name: { type: String, required: true },
    grade: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    type: { type: String, enum: ['Day Scholar', 'Boarder'], default: 'Day Scholar' },
    guardian: { type: String, default: '' },
    pin: { type: String, default: '1234' },
    paid: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);

// ============================================
// SUBJECT CONFIG SCHEMA - NO INDEXES, NEW COLLECTION
// ============================================
const subjectConfigSchema = new mongoose.Schema({
    grade: { type: String, required: true },
    type: { type: String, required: true, default: 'monthly' },
    period: { type: String, default: '' },
    subjects: [{ name: { type: String, required: true }, max: { type: Number, required: true } }],
    rankLevels: { type: [String], default: ['Below Expectation', 'Approaching Expectation', 'Meeting Expectation', 'Exceeding Expectation'] },
    rubric: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now }
}, { autoIndex: false, collection: 'subjectconfigs_new' });

const SubjectConfig = mongoose.model('SubjectConfig', subjectConfigSchema);

// NO INDEX - DO NOT add any index

// Student Assessment Schema
const studentAssessmentSchema = new mongoose.Schema({
    studentName: { type: String, required: true },
    studentId: { type: String },
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
        score: { type: Number, required: true },
        percentage: { type: Number, default: 0 },
        performanceLevel: { type: String, default: 'Approaching Expectation' },
        rating: { type: Number, default: 2 }
    }],
    totalScore: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    performanceLevel: { type: String, enum: ['Below Expectation', 'Approaching Expectation', 'Meeting Expectation', 'Exceeding Expectation'], default: 'Approaching Expectation' },
    overallRating: { type: Number, default: 2 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const StudentAssessment = mongoose.model('StudentAssessment', studentAssessmentSchema);

// ============================================
// HELPER FUNCTIONS - CBC RUBRIC
// ============================================

// Calculate performance level based on percentage using CBC Rubric
function calculatePerformanceLevel(percentage) {
    if (percentage >= 75) return 'Exceeding Expectation';
    if (percentage >= 50) return 'Meeting Expectation';
    if (percentage >= 26) return 'Approaching Expectation';
    return 'Below Expectation';
}

// Get rating (1-4) based on performance level
function getPerformanceRating(level) {
    const ratings = {
        'Exceeding Expectation': 4,
        'Meeting Expectation': 3,
        'Approaching Expectation': 2,
        'Below Expectation': 1
    };
    return ratings[level] || 2;
}

// Get short label (EE, ME, AE, BE)
function getPerformanceShort(level) {
    const shorts = {
        'Exceeding Expectation': 'EE',
        'Meeting Expectation': 'ME',
        'Approaching Expectation': 'AE',
        'Below Expectation': 'BE'
    };
    return shorts[level] || 'AE';
}

// Get color for performance level
function getPerformanceColor(level) {
    const colors = {
        'Exceeding Expectation': '#28a745',
        'Meeting Expectation': '#17a2b8',
        'Approaching Expectation': '#d4a017',
        'Below Expectation': '#dc3545'
    };
    return colors[level] || '#d4a017';
}

// Calculate performance for a single assessment
function calculateAssessmentPerformance(score, maxScore) {
    if (maxScore <= 0) return { percentage: 0, level: 'Approaching Expectation', rating: 2 };
    const percentage = (score / maxScore) * 100;
    const level = calculatePerformanceLevel(percentage);
    return {
        percentage: parseFloat(percentage.toFixed(1)),
        level: level,
        rating: getPerformanceRating(level),
        short: getPerformanceShort(level),
        color: getPerformanceColor(level)
    };
}

// Calculate overall performance for a student
function calculateStudentOverall(assessments) {
    if (!assessments || assessments.length === 0) {
        return { totalScore: 0, averageScore: 0, performanceLevel: 'Approaching Expectation', overallRating: 2 };
    }
    
    let totalScore = 0;
    let totalMax = 0;
    let validCount = 0;
    
    assessments.forEach(a => {
        totalScore += a.score || 0;
        totalMax += a.maxScore || 0;
        validCount++;
    });
    
    const totalScoreValue = totalScore;
    const avgScore = validCount > 0 ? totalScore / validCount : 0;
    const avgPercentage = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
    const performanceLevel = calculatePerformanceLevel(avgPercentage);
    
    return {
        totalScore: totalScoreValue,
        averageScore: parseFloat(avgScore.toFixed(1)),
        performanceLevel: performanceLevel,
        overallRating: getPerformanceRating(performanceLevel)
    };
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

function getDefaultSubjects(grade, type) {
    const configs = {
        'weekly': {
            'Play Group': [{ name: 'MATH', max: 10 }, { name: 'LANG', max: 10 }, { name: 'LIT', max: 10 }, { name: 'KUS', max: 10 }, { name: 'ENVI/CRE', max: 10 }, { name: 'C/A', max: 10 }],
            'PP1': [{ name: 'MATH', max: 10 }, { name: 'LANG', max: 10 }, { name: 'LIT', max: 10 }, { name: 'KIS', max: 10 }, { name: 'KUS', max: 10 }, { name: 'ENV', max: 10 }, { name: 'CRE/I.R.E', max: 10 }, { name: 'C/A', max: 10 }],
            'PP2': [{ name: 'MATH', max: 10 }, { name: 'LANG', max: 10 }, { name: 'LIT', max: 10 }, { name: 'KIS', max: 10 }, { name: 'KUS', max: 10 }, { name: 'ENV', max: 10 }, { name: 'CRE/I.R.E', max: 10 }, { name: 'C/A', max: 10 }],
            'Grade 1': [{ name: 'MATH', max: 30 }, { name: 'LIST/SPEAKING', max: 20 }, { name: 'READING', max: 20 }, { name: 'GRAMMAR', max: 20 }, { name: 'KUSOMA', max: 20 }, { name: 'SARUFI', max: 20 }, { name: 'ENV', max: 30 }, { name: 'C.R.E', max: 20 }, { name: 'CREATIVE ARTS', max: 20 }],
            'Grade 2': [{ name: 'LIST & SPEAKING', max: 20 }, { name: 'READING ALOUD', max: 20 }, { name: 'GRAMMAR', max: 20 }, { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 20 }, { name: 'KUSOMA KWA SAUTI', max: 20 }, { name: 'LUGHA', max: 20 }, { name: 'MATH', max: 30 }, { name: 'ENVIRONMENTAL', max: 30 }, { name: 'C/A', max: 20 }, { name: 'RE', max: 20 }],
            'Grade 3': [{ name: 'LIST & SPEAKING', max: 20 }, { name: 'READING ALOUD', max: 20 }, { name: 'GRAMMAR', max: 20 }, { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 20 }, { name: 'KUSOMA KWA SAUTI', max: 20 }, { name: 'SARUFI', max: 20 }, { name: 'MATHS', max: 30 }, { name: 'ENVIRONMENTAL', max: 30 }, { name: 'C.R.E', max: 20 }, { name: 'I.R.E', max: 20 }, { name: 'C/A', max: 20 }],
            'Grade 4': [{ name: 'MATHS ACTIVITIES', max: 30 }, { name: 'ENGLISH ACTIVITIES', max: 50 }, { name: 'SCI & TECH', max: 30 }, { name: 'KISW LUGHA', max: 50 }, { name: 'SST', max: 30 }, { name: 'RELIGIOUS EDUCATION', max: 20 }, { name: 'AGRICULTURE', max: 20 }, { name: 'CREATIVE ART', max: 35 }],
            'Grade 5': [{ name: 'MATHS ACTIVITIES', max: 30 }, { name: 'ENGLISH ACTIVITIES', max: 50 }, { name: 'SCI & TECH', max: 30 }, { name: 'KISW LUGHA', max: 50 }, { name: 'SST', max: 30 }, { name: 'RELIGIOUS EDUCATION', max: 20 }, { name: 'AGRICULTURE', max: 20 }, { name: 'CREATIVE ART', max: 35 }],
            'Grade 6': [{ name: 'MATHS ACTIVITIES', max: 30 }, { name: 'ENGLISH ACTIVITIES', max: 50 }, { name: 'SCI & TECH', max: 30 }, { name: 'KISW LUGHA', max: 50 }, { name: 'SST', max: 30 }, { name: 'RELIGIOUS EDUCATION', max: 20 }, { name: 'AGRICULTURE', max: 20 }, { name: 'CREATIVE ART', max: 35 }]
        },
        'monthly': {
            'Play Group': [{ name: 'MATH', max: 20 }, { name: 'LANG', max: 20 }, { name: 'LIT', max: 20 }, { name: 'KUS', max: 20 }, { name: 'ENVI/CRE', max: 20 }, { name: 'C/A', max: 20 }],
            'PP1': [{ name: 'MATH', max: 20 }, { name: 'LANG', max: 20 }, { name: 'LIT', max: 20 }, { name: 'KIS', max: 20 }, { name: 'KUS', max: 20 }, { name: 'ENV', max: 20 }, { name: 'CRE/I.R.E', max: 20 }, { name: 'C/A', max: 20 }],
            'PP2': [{ name: 'MATH', max: 20 }, { name: 'LANG', max: 20 }, { name: 'LIT', max: 20 }, { name: 'KIS', max: 20 }, { name: 'KUS', max: 20 }, { name: 'ENV', max: 20 }, { name: 'CRE/I.R.E', max: 20 }, { name: 'C/A', max: 20 }],
            'Grade 1': [{ name: 'MATH', max: 50 }, { name: 'LIST/SPEAKING', max: 30 }, { name: 'READING', max: 30 }, { name: 'GRAMMAR', max: 30 }, { name: 'KUSOMA', max: 30 }, { name: 'SARUFI', max: 30 }, { name: 'ENV', max: 50 }, { name: 'C.R.E', max: 30 }, { name: 'CREATIVE ARTS', max: 30 }],
            'Grade 2': [{ name: 'LIST & SPEAKING', max: 40 }, { name: 'READING ALOUD', max: 40 }, { name: 'GRAMMAR', max: 40 }, { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 40 }, { name: 'KUSOMA KWA SAUTI', max: 40 }, { name: 'LUGHA', max: 40 }, { name: 'MATH', max: 50 }, { name: 'ENVIRONMENTAL', max: 50 }, { name: 'C/A', max: 40 }, { name: 'RE', max: 40 }],
            'Grade 3': [{ name: 'LIST & SPEAKING', max: 40 }, { name: 'READING ALOUD', max: 40 }, { name: 'GRAMMAR', max: 40 }, { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 40 }, { name: 'KUSOMA KWA SAUTI', max: 40 }, { name: 'SARUFI', max: 40 }, { name: 'MATHS', max: 50 }, { name: 'ENVIRONMENTAL', max: 50 }, { name: 'C.R.E', max: 40 }, { name: 'I.R.E', max: 40 }, { name: 'C/A', max: 40 }],
            'Grade 4': [{ name: 'MATHS ACTIVITIES', max: 60 }, { name: 'ENGLISH ACTIVITIES', max: 80 }, { name: 'SCI & TECH', max: 60 }, { name: 'KISW LUGHA', max: 80 }, { name: 'SST', max: 60 }, { name: 'RELIGIOUS EDUCATION', max: 40 }, { name: 'AGRICULTURE', max: 40 }, { name: 'CREATIVE ART', max: 50 }],
            'Grade 5': [{ name: 'MATHS ACTIVITIES', max: 60 }, { name: 'ENGLISH ACTIVITIES', max: 80 }, { name: 'SCI & TECH', max: 60 }, { name: 'KISW LUGHA', max: 80 }, { name: 'SST', max: 60 }, { name: 'RELIGIOUS EDUCATION', max: 40 }, { name: 'AGRICULTURE', max: 40 }, { name: 'CREATIVE ART', max: 50 }],
            'Grade 6': [{ name: 'MATHS ACTIVITIES', max: 60 }, { name: 'ENGLISH ACTIVITIES', max: 80 }, { name: 'SCI & TECH', max: 60 }, { name: 'KISW LUGHA', max: 80 }, { name: 'SST', max: 60 }, { name: 'RELIGIOUS EDUCATION', max: 40 }, { name: 'AGRICULTURE', max: 40 }, { name: 'CREATIVE ART', max: 50 }]
        },
        'term': {
            'Play Group': [{ name: 'MATH', max: 30 }, { name: 'LANG', max: 30 }, { name: 'LIT', max: 30 }, { name: 'KUS', max: 30 }, { name: 'ENVI/CRE', max: 30 }, { name: 'C/A', max: 30 }],
            'PP1': [{ name: 'MATH', max: 30 }, { name: 'LANG', max: 30 }, { name: 'LIT', max: 30 }, { name: 'KIS', max: 30 }, { name: 'KUS', max: 30 }, { name: 'ENV', max: 30 }, { name: 'CRE/I.R.E', max: 30 }, { name: 'C/A', max: 30 }],
            'PP2': [{ name: 'MATH', max: 30 }, { name: 'LANG', max: 30 }, { name: 'LIT', max: 30 }, { name: 'KIS', max: 30 }, { name: 'KUS', max: 30 }, { name: 'ENV', max: 30 }, { name: 'CRE/I.R.E', max: 30 }, { name: 'C/A', max: 30 }],
            'Grade 1': [{ name: 'MATH', max: 70 }, { name: 'LIST/SPEAKING', max: 50 }, { name: 'READING', max: 50 }, { name: 'GRAMMAR', max: 50 }, { name: 'KUSOMA', max: 50 }, { name: 'SARUFI', max: 50 }, { name: 'ENV', max: 70 }, { name: 'C.R.E', max: 50 }, { name: 'CREATIVE ARTS', max: 50 }],
            'Grade 2': [{ name: 'LIST & SPEAKING', max: 60 }, { name: 'READING ALOUD', max: 60 }, { name: 'GRAMMAR', max: 60 }, { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 60 }, { name: 'KUSOMA KWA SAUTI', max: 60 }, { name: 'LUGHA', max: 60 }, { name: 'MATH', max: 70 }, { name: 'ENVIRONMENTAL', max: 70 }, { name: 'C/A', max: 60 }, { name: 'RE', max: 60 }],
            'Grade 3': [{ name: 'LIST & SPEAKING', max: 60 }, { name: 'READING ALOUD', max: 60 }, { name: 'GRAMMAR', max: 60 }, { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 60 }, { name: 'KUSOMA KWA SAUTI', max: 60 }, { name: 'SARUFI', max: 60 }, { name: 'MATHS', max: 70 }, { name: 'ENVIRONMENTAL', max: 70 }, { name: 'C.R.E', max: 60 }, { name: 'I.R.E', max: 60 }, { name: 'C/A', max: 60 }],
            'Grade 4': [{ name: 'MATHS ACTIVITIES', max: 80 }, { name: 'ENGLISH ACTIVITIES', max: 100 }, { name: 'SCI & TECH', max: 80 }, { name: 'KISW LUGHA', max: 100 }, { name: 'SST', max: 80 }, { name: 'RELIGIOUS EDUCATION', max: 60 }, { name: 'AGRICULTURE', max: 60 }, { name: 'CREATIVE ART', max: 70 }],
            'Grade 5': [{ name: 'MATHS ACTIVITIES', max: 80 }, { name: 'ENGLISH ACTIVITIES', max: 100 }, { name: 'SCI & TECH', max: 80 }, { name: 'KISW LUGHA', max: 100 }, { name: 'SST', max: 80 }, { name: 'RELIGIOUS EDUCATION', max: 60 }, { name: 'AGRICULTURE', max: 60 }, { name: 'CREATIVE ART', max: 70 }],
            'Grade 6': [{ name: 'MATHS ACTIVITIES', max: 80 }, { name: 'ENGLISH ACTIVITIES', max: 100 }, { name: 'SCI & TECH', max: 80 }, { name: 'KISW LUGHA', max: 100 }, { name: 'SST', max: 80 }, { name: 'RELIGIOUS EDUCATION', max: 60 }, { name: 'AGRICULTURE', max: 60 }, { name: 'CREATIVE ART', max: 70 }]
        }
    };
    const fallback = [{ name: 'MATHEMATICS', max: 50 }, { name: 'ENGLISH', max: 50 }, { name: 'KISWAHILI', max: 50 }, { name: 'SCIENCE', max: 50 }];
    try {
        return configs[type]?.[grade] || configs['weekly']['Grade 1'] || fallback;
    } catch {
        return fallback;
    }
}

// ============================================
// GENERATE STUDENT ID
// ============================================
async function generateStudentId() {
    try {
        const lastStudent = await Student.findOne({}).sort({ studentId: -1 });
        if (!lastStudent) {
            return 'ST001';
        }
        const lastId = lastStudent.studentId;
        const num = parseInt(lastId.replace('ST', '')) + 1;
        return 'ST' + String(num).padStart(3, '0');
    } catch (error) {
        console.error('Error generating student ID:', error);
        return 'ST001';
    }
}

// ============================================
// STUDENT REPORT HTML GENERATOR
// ============================================
function generateStudentReportHTML(student, allAssessments = null) {
    const typeNames = { 'weekly': 'Weekly', 'monthly': 'Monthly', 'term': 'End of Term' };
    let assessments = student.assessments || [];
    if (assessments && typeof assessments === 'object' && !Array.isArray(assessments)) {
        assessments = Object.values(assessments);
    }
    if ((!assessments || assessments.length === 0) && student.subjects) {
        assessments = student.subjects;
    }
    if ((!assessments || assessments.length === 0) && student.marks) {
        assessments = student.marks;
    }
    const validAssessments = assessments.filter(a => a && typeof a === 'object');
    if (validAssessments.length === 0) {
        return `<html><body><h2>No Subject Data Found</h2><p>This student has no subject scores recorded yet.</p></body></html>`;
    }

    const subjectsWithPerf = validAssessments.map(a => {
        const subjectName = a.subject || a.name || a.subjectName || a.subj || 'Unknown Subject';
        const maxScore = a.maxScore || a.max || a.maximum || 100;
        const score = a.score || a.marks || a.value || 0;
        const perf = calculateAssessmentPerformance(score, maxScore);
        return { subject: subjectName, maxScore, score, percentage: perf.percentage, level: perf.level, color: perf.color, short: perf.short, rating: perf.rating };
    });

    const strengths = subjectsWithPerf.filter(s => s.percentage >= 50);
    const weaknesses = subjectsWithPerf.filter(s => s.percentage < 50);
    const avgPercentage = subjectsWithPerf.length > 0 ? subjectsWithPerf.reduce((sum, s) => sum + s.percentage, 0) / subjectsWithPerf.length : 0;
    const overallLevel = calculatePerformanceLevel(avgPercentage);
    const overallColor = getPerformanceColor(overallLevel);
    const overallShort = getPerformanceShort(overallLevel);
    const overallRating = getPerformanceRating(overallLevel);

    const totalScore = subjectsWithPerf.reduce((sum, s) => sum + s.score, 0);
    const exceedingCount = subjectsWithPerf.filter(s => s.percentage >= 75).length;
    const meetingCount = subjectsWithPerf.filter(s => s.percentage >= 50 && s.percentage < 75).length;
    const approachingCount = subjectsWithPerf.filter(s => s.percentage >= 26 && s.percentage < 50).length;
    const belowCount = subjectsWithPerf.filter(s => s.percentage < 26).length;

    const subjectsHtml = subjectsWithPerf.map(a => `
        <tr>
            <td style="padding:4px 8px;border:1px solid #ddd;font-weight:600;">${a.subject}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${a.maxScore}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#0A1628;">${a.score}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;">${a.percentage.toFixed(1)}%</td>
            <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">
                <span style="background:${a.color};color:white;padding:2px 10px;border-radius:50px;font-size:9px;font-weight:700;">${a.short} (${a.rating})</span>
            </td>
        </tr>
    `).join('');

    const strengthsHtml = strengths.length > 0 ? 
        strengths.map(s => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0;"><span>${s.subject}</span><span style="color:#28a745;font-weight:700;">${s.percentage.toFixed(1)}%</span></div>`).join('') :
        '<p style="color:#999;">No subjects meeting expectation yet.</p>';

    const weaknessesHtml = weaknesses.length > 0 ?
        weaknesses.map(s => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0;"><span>${s.subject}</span><span style="color:#dc3545;font-weight:700;">${s.percentage.toFixed(1)}%</span></div>`).join('') :
        '<p style="color:#28a745;font-weight:600;">🎉 All subjects are meeting expectations!</p>';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Student Report - ${student.studentName}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 15px; max-width: 100%; margin: 0 auto; background: white; }
                .header { text-align: center; border-bottom: 2px solid #D4A017; padding-bottom: 8px; margin-bottom: 10px; }
                .header h1 { color: #0A1628; font-size: 18px; }
                .header h1 .school-name { color: #D4A017; }
                .header p { color: #666; margin: 3px 0; font-size: 13px; }
                .student-info { background: #f8f9fc; padding: 8px 14px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #e8ecf1; }
                .student-info table { width: 100%; font-size: 11px; }
                .student-info td { padding: 3px 8px; }
                .student-info .label { font-weight: 600; color: #555; width: 120px; }
                .student-info .value { font-weight: 600; color: #0A1628; }
                .performance-box { text-align: center; padding: 8px 16px; border-radius: 6px; margin-bottom: 10px; }
                .performance-box .level { font-size: 22px; font-weight: 700; }
                .performance-box .score { font-size: 13px; color: #555; }
                .performance-box .badges { margin-top: 4px; display: flex; justify-content: center; gap: 4px; flex-wrap: wrap; }
                .badge { display: inline-block; padding: 2px 12px; border-radius: 50px; font-size: 9px; font-weight: 700; color: white; }
                .badge-exceeding { background: #28a745; }
                .badge-meeting { background: #17a2b8; }
                .badge-approaching { background: #d4a017; }
                .badge-below { background: #dc3545; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 8px 0; }
                table th { background: #0A1628; color: white; padding: 6px 10px; text-align: left; }
                table td { padding: 4px 10px; border-bottom: 1px solid #e8ecf1; }
                table tr:nth-child(even) { background: #fafbfc; }
                .analysis-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0; }
                .analysis-box { background: #f8f9fc; padding: 8px 14px; border-radius: 6px; border-left: 3px solid #28a745; }
                .analysis-box.weakness { border-left-color: #dc3545; }
                .analysis-box h4 { font-size: 13px; margin-bottom: 2px; }
                .summary-box { margin-top: 8px; padding: 8px 14px; background: #f8f9fc; border-radius: 6px; border: 1px solid #e8ecf1; }
                .summary-box p { font-size: 11px; color: #555; line-height: 1.6; }
                .summary-box p strong { color: #0A1628; }
                .footer { text-align: center; margin-top: 12px; padding-top: 8px; border-top: 1px solid #ddd; color: #999; font-size: 9px; }
                .no-print { display: none; }
                @media print { body { padding: 10px; } .no-print { display: none !important; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🏫 <span class="school-name">Changara Star Academy</span></h1>
                <p>Student Assessment Report - CBC Performance Analysis</p>
            </div>
            <div class="student-info">
                <table>
                    <tr><td class="label">Student Name:</td><td class="value">${student.studentName || 'N/A'}</td></tr>
                    ${student.admissionNumber ? `<tr><td class="label">Admission Number:</td><td class="value">${student.admissionNumber}</td></tr>` : ''}
                    <tr><td class="label">Grade:</td><td class="value">${student.grade || 'N/A'}</td></tr>
                    <tr><td class="label">Assessment Type:</td><td class="value">${typeNames[student.type] || student.type || 'Monthly'}</td></tr>
                    <tr><td class="label">Period:</td><td>${student.period || 'N/A'}</td></tr>
                    <tr><td class="label">Term:</td><td>${student.term || 'N/A'}</td></tr>
                    <tr><td class="label">Report Date:</td><td>${formatKenyaFullTime(new Date())}</td></tr>
                </table>
            </div>
            <div class="performance-box" style="background: ${overallColor}15; border: 2px solid ${overallColor};">
                <div class="level" style="color: ${overallColor};">${overallLevel} (${overallShort})</div>
                <div class="score">Total Score: ${totalScore} | Average: ${avgPercentage.toFixed(1)}% | Rating: ${overallRating}</div>
                <div class="badges">
                    <span class="badge badge-exceeding">✅ EE (4): ${exceedingCount}</span>
                    <span class="badge badge-meeting">📘 ME (3): ${meetingCount}</span>
                    <span class="badge badge-approaching">📗 AE (2): ${approachingCount}</span>
                    <span class="badge badge-below">📕 BE (1): ${belowCount}</span>
                </div>
            </div>
            <table>
                <thead><tr><th>Subject</th><th style="text-align:center;">Max</th><th style="text-align:center;">Score</th><th style="text-align:center;">%</th><th style="text-align:center;">Performance</th></tr></thead>
                <tbody>${subjectsHtml}</tbody>
            </table>
            <div class="analysis-grid">
                <div class="analysis-box"><h4 style="color:#28a745;">🏆 Strengths</h4>${strengthsHtml}</div>
                <div class="analysis-box weakness"><h4 style="color:#dc3545;">📚 Needs Improvement</h4>${weaknessesHtml}</div>
            </div>
            <div class="summary-box">
                <p><strong>Overall:</strong> ${student.studentName || 'The student'} is currently <strong style="color:${overallColor};">${overallLevel.toLowerCase()} (${overallShort})</strong> with an average of <strong>${avgPercentage.toFixed(1)}%</strong> (Rating: ${overallRating}/4).</p>
            </div>
            <div class="footer">
                <p>© 2026 Changara Star Academy - P.O Box 7, Cheptais | 📞 +254 721 556 252 | 📧 starchangara@gmail.com</p>
            </div>
            <div class="no-print" style="text-align:center;margin-top:10px;">
                <button onclick="window.print()" style="padding:8px 20px;background:#D4A017;color:#0A1628;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;">🖨️ Print / Save as PDF</button>
            </div>
        </body>
        </html>
    `;
}

// ============================================
// API ROUTES - CONTENT
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
        res.json({ success: true, message: 'Content updated successfully!', content });
    } catch (error) {
        console.error('Content update error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/content/notice', async (req, res) => {
    try {
        const content = await Content.getContent();
        content.noticeAlert = req.body.noticeAlert || '';
        content.noticeType = req.body.noticeType || 'staff';
        content.noticeDate = new Date();
        await content.save();
        res.json({ success: true, message: 'Notice updated successfully' });
    } catch (error) {
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
            return res.status(400).json({ success: false, message: 'Please provide all fields' });
        }
        const existing = await Admin.findOne({ $or: [{ username }, { email }] });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Admin already exists' });
        }
        const admin = new Admin({ username, email, password, fullName, role: 'Super Admin' });
        await admin.save();
        res.json({ success: true, message: 'Admin created successfully!', admin: { username: admin.username, email: admin.email, fullName: admin.fullName, role: admin.role } });
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
// API ROUTES - TEACHER
// ============================================

app.post('/api/teacher/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, employeeId, phoneNumber, department } = req.body;
        const existing = await Teacher.findOne({ $or: [{ email }, { employeeId }] });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email or Employee ID already exists' });
        }
        if (password && (password.length < 4 || password.length > 6)) {
            return res.status(400).json({ success: false, message: 'PIN must be 4-6 digits' });
        }
        const teacher = new Teacher({ firstName, lastName, email, password: password || '1234', employeeId, phoneNumber: phoneNumber || '', department: department || 'Teaching' });
        await teacher.save();
        res.json({ success: true, message: 'Staff registered successfully!', teacher: { id: teacher._id, firstName: teacher.firstName, lastName: teacher.lastName, employeeId: teacher.employeeId, email: teacher.email, department: teacher.department } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/teacher/checkin', async (req, res) => {
    try {
        const { employeeId, pin } = req.body;
        const teacher = await Teacher.findOne({ employeeId });
        if (!teacher) {
            return res.status(404).json({ success: false, message: '❌ Staff not found. Please contact admin.' });
        }
        if (teacher.password !== pin) {
            return res.status(401).json({ success: false, message: '❌ Invalid PIN. Please try again.' });
        }
        
        const kenyaNow = getKenyaTime();
        const kenyaToday = getKenyaDate();
        const kenyaHour = getKenyaHour();
        const dayOfWeek = kenyaNow.getDay();
        
        console.log('📍 Check-in at (Kenya time):', kenyaNow.toString());
        console.log('🕐 Hour (Kenya time):', kenyaHour);
        
        // Check if it's weekend
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return res.status(400).json({ success: false, message: '📅 Weekend! Check-in is only available on weekdays (Monday-Friday).' });
        }
        
        // Check if already checked in today
        const existingAttendance = teacher.attendance.find(a => {
            const aDate = new Date(a.date);
            aDate.setHours(0, 0, 0, 0);
            return aDate.getTime() === kenyaToday.getTime();
        });
        
        if (existingAttendance) {
            return res.status(400).json({ success: false, message: '⚠️ You already checked in today at ' + formatKenyaTime(existingAttendance.checkIn) });
        }
        
        // Check if it's too late to check in
        if (kenyaHour >= 17) {
            return res.status(400).json({ success: false, message: '⏰ Check-in is not allowed after 5:00 PM. Please try again tomorrow.' });
        }
        
        // ============================================
        // DEFINE STATUS HERE BEFORE USING IT
        // ============================================
        const isLate = kenyaHour > 7 || (kenyaHour === 7 && kenyaNow.getMinutes() > 0);
        const status = isLate ? 'Late' : 'Present';
        
        // Add attendance record with the defined status
        teacher.attendance.push({
            date: kenyaToday,
            checkIn: kenyaNow,
            status: status,  // status is now defined
            location: 'School',
            isLate: isLate,
            notes: isLate ? 'Late check-in' : 'On-time check-in'
        });
        
        await teacher.save();
        
        const message = isLate ? '⚠️ Check-in successful! (You are LATE - after 7:00 AM)' : '✅ Check-in successful! (On time)';
        const formattedTime = formatKenyaTime(kenyaNow);
        
        res.json({
            success: true,
            message: message,
            checkInTime: kenyaNow,
            checkInTimeFormatted: formattedTime,
            isLate: isLate,
            status: status,  // status is defined here too
            teacher: { name: `${teacher.firstName} ${teacher.lastName}`, employeeId: teacher.employeeId }
        });
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
app.post('/api/teacher/checkout', async (req, res) => {
    try {
        const { employeeId, pin } = req.body;
        const teacher = await Teacher.findOne({ employeeId });
        if (!teacher) {
            return res.status(404).json({ success: false, message: '❌ Staff not found. Please contact admin.' });
        }
        if (teacher.password !== pin) {
            return res.status(401).json({ success: false, message: '❌ Invalid PIN. Please try again.' });
        }
        
        const kenyaNow = getKenyaTime();
        const kenyaToday = getKenyaDate();
        const kenyaHour = getKenyaHour();
        
        console.log('📍 Check-out at (Kenya time):', kenyaNow.toString());
        console.log('🕐 Hour (Kenya time):', kenyaHour);
        
        // FIND today's attendance record FIRST
        const todayAttendance = teacher.attendance.find(a => {
            const aDate = new Date(a.date);
            aDate.setHours(0, 0, 0, 0);
            return aDate.getTime() === kenyaToday.getTime();
        });
        
        // Check if todayAttendance exists
        if (!todayAttendance) {
            return res.status(400).json({ success: false, message: '❌ No check-in found for today. Please check in first.' });
        }
        
        if (todayAttendance.checkOut) {
            return res.status(400).json({ success: false, message: '⚠️ You already checked out today at ' + formatKenyaTime(todayAttendance.checkOut) });
        }
        
        if (kenyaHour < 15) {
            return res.status(400).json({ success: false, message: '⏰ Check-out is only allowed after 3:00 PM. Please continue working.' });
        }
        
        // Update the record
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
            hoursWorked: hoursWorked,
            teacher: { name: `${teacher.firstName} ${teacher.lastName}`, employeeId: teacher.employeeId }
        });
    } catch (error) {
        console.error('Check-out error:', error);
        res.status(500).json({ success: false, message: error.message });
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
        res.json({ success: true, date: kenyaToday, total: todayAttendance.length, attendance: todayAttendance });
    } catch (error) {
        console.error('Error loading attendance:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
app.get('/api/teacher/attendance/:employeeId', async (req, res) => {
    try {
        const teacher = await Teacher.findOne({ employeeId: req.params.employeeId });
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        const totalDays = teacher.attendance.length;
        const presentDays = teacher.attendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
        const lateDays = teacher.attendance.filter(a => a.isLate === true).length;
        const absentDays = teacher.attendance.filter(a => a.status === 'Absent').length;
        res.json({
            success: true,
            teacher: { name: `${teacher.firstName} ${teacher.lastName}`, employeeId: teacher.employeeId, department: teacher.department },
            stats: { totalDays, presentDays, lateDays, absentDays, attendanceRate: totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(2) : 0 },
            attendance: teacher.attendance.sort((a, b) => b.date - a.date)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN TEACHER MANAGEMENT
// ============================================

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
        const existing = await Teacher.findOne({ _id: { $ne: req.params.id }, $or: [{ email }, { employeeId }] });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email or Employee ID already in use by another teacher' });
        }
        teacher.firstName = firstName || teacher.firstName;
        teacher.lastName = lastName || teacher.lastName;
        teacher.email = email || teacher.email;
        teacher.employeeId = employeeId || teacher.employeeId;
        teacher.phoneNumber = phoneNumber || teacher.phoneNumber;
        teacher.department = department || teacher.department;
        await teacher.save();
        res.json({ success: true, message: 'Teacher updated successfully!', teacher: { id: teacher._id, firstName: teacher.firstName, lastName: teacher.lastName, employeeId: teacher.employeeId, email: teacher.email, department: teacher.department } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/teachers/:id', async (req, res) => {
    try {
        const teacher = await Teacher.findByIdAndDelete(req.params.id);
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
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
// ADMIN ATTENDANCE ROUTES
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
        res.json({ success: true, today: { date: kenyaToday, total: totalTeachers, present: totalPresent, late: totalLate, absent: totalAbsent, attendanceRate: totalTeachers > 0 ? ((totalPresent / totalTeachers) * 100).toFixed(2) : 0 } });
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
        res.status(201).json({ success: true, message: 'Visitor checked in successfully!', visitor: { id: visitor._id, fullName: visitor.fullName, badgeNumber: visitor.badgeNumber, checkIn: visitor.checkIn, checkInTime: formatKenyaTime(visitor.checkIn) } });
    } catch (error) {
        console.error('Visitor check-in error:', error);
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
        res.json({ success: true, message: 'Visitor checked out successfully!', visitor: { id: visitor._id, fullName: visitor.fullName, badgeNumber: visitor.badgeNumber, checkOut: visitor.checkOut, checkOutTime: formatKenyaTime(visitor.checkOut), duration: duration + ' minutes' } });
    } catch (error) {
        console.error('Visitor check-out error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/visitors/today', async (req, res) => {
    try {
        const kenyaToday = getKenyaDate();
        const tomorrow = new Date(kenyaToday);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const visitors = await Visitor.find({ checkIn: { $gte: kenyaToday, $lt: tomorrow } }).sort({ checkIn: -1 });
        const active = visitors.filter(v => v.status === 'Checked In');
        const completed = visitors.filter(v => v.status === 'Checked Out');
        res.json({ success: true, date: kenyaToday, total: visitors.length, active: active.length, completed: completed.length, visitors: visitors.map(v => ({ ...v.toObject(), checkInTime: formatKenyaTime(v.checkIn), checkOutTime: v.checkOut ? formatKenyaTime(v.checkOut) : null })) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// STUDENT MANAGEMENT API ROUTES
// ============================================

// GET ALL STUDENTS
app.get('/api/students', async (req, res) => {
    try {
        const students = await Student.find({ isActive: true }).sort({ studentId: 1 });
        res.json({ success: true, students });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET SINGLE STUDENT
app.get('/api/students/:id', async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.id });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        res.json({ success: true, student });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ADD STUDENT (Auto-generates ID)
app.post('/api/students', async (req, res) => {
    try {
        const { name, grade, gender, type, guardian, pin } = req.body;

        if (!name || !grade || !gender) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name, Grade, and Gender are required' 
            });
        }

        const studentId = await generateStudentId();

        const student = new Student({
            studentId,
            name,
            grade,
            gender,
            type: type || 'Day Scholar',
            guardian: guardian || '',
            pin: pin || '1234',
            paid: 0,
            isActive: true
        });

        await student.save();

        res.status(201).json({
            success: true,
            message: `✅ Student ${studentId} added successfully!`,
            student
        });

    } catch (error) {
        console.error('Error adding student:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// UPDATE STUDENT
app.put('/api/students/:id', async (req, res) => {
    try {
        const { name, grade, gender, type, guardian, pin } = req.body;
        const student = await Student.findOne({ studentId: req.params.id });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (name) student.name = name;
        if (grade) student.grade = grade;
        if (gender) student.gender = gender;
        if (type) student.type = type;
        if (guardian) student.guardian = guardian;
        if (pin) student.pin = pin;
        student.updatedAt = new Date();

        await student.save();

        res.json({
            success: true,
            message: `✅ Student ${student.studentId} updated successfully!`,
            student
        });

    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE STUDENT (Soft delete)
app.delete('/api/students/:id', async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.id });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        student.isActive = false;
        await student.save();

        res.json({
            success: true,
            message: `✅ Student ${student.studentId} deleted successfully!`
        });

    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// CLEAR ALL STUDENTS
app.delete('/api/students/clear', async (req, res) => {
    try {
        await Student.deleteMany({});
        res.json({ success: true, message: 'All students cleared successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// STUDENT LOGIN
app.post('/api/student/login', async (req, res) => {
    try {
        const { studentId, pin } = req.body;

        if (!studentId || !pin) {
            return res.status(400).json({
                success: false,
                message: 'Student ID and PIN are required'
            });
        }

        const student = await Student.findOne({ studentId, isActive: true });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        if (student.pin !== pin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid PIN'
            });
        }

        res.json({
            success: true,
            message: 'Login successful',
            student: {
                studentId: student.studentId,
                name: student.name,
                grade: student.grade,
                gender: student.gender,
                type: student.type,
                guardian: student.guardian
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// STUDENT FEE MANAGEMENT ROUTES
// ============================================

// Get all students with fee details
app.get('/api/students/fees', async (req, res) => {
    try {
        const students = await Student.find({ isActive: true }).sort({ studentId: 1 });
        
        const studentFees = students.map(student => {
            const feeData = getFeeStructure(student.grade, student.type);
            const paid = student.paid || 0;
            const totalFees = feeData.total || 0;
            const balance = totalFees - paid;
            
            return {
                id: student.studentId,
                name: student.name,
                grade: student.grade,
                gender: student.gender,
                studentType: student.type,
                isBoarding: student.type === 'Boarder',
                totalFees: totalFees,
                paid: paid,
                balance: balance,
                status: balance === 0 ? 'paid' : balance < totalFees ? 'partial' : 'unpaid'
            };
        });
        
        const totalStudents = studentFees.length;
        const totalDayScholars = studentFees.filter(s => s.studentType === 'Day Scholar').length;
        const totalBoarders = studentFees.filter(s => s.studentType === 'Boarder').length;
        const totalPaid = studentFees.reduce((sum, s) => sum + s.paid, 0);
        const totalBalance = studentFees.reduce((sum, s) => sum + s.balance, 0);
        
        res.json({
            success: true,
            students: studentFees,
            totalStudents,
            totalDayScholars,
            totalBoarders,
            totalPaid,
            totalBalance
        });
    } catch (error) {
        console.error('Error fetching student fees:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single student fee details
app.get('/api/students/fees/:studentId', async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.studentId, isActive: true });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        const feeData = getFeeStructure(student.grade, student.type);
        const paid = student.paid || 0;
        const totalFees = feeData.total || 0;
        const balance = totalFees - paid;
        
        res.json({
            success: true,
            student: {
                id: student.studentId,
                name: student.name,
                grade: student.grade,
                gender: student.gender,
                studentType: student.type,
                isBoarding: student.type === 'Boarder'
            },
            fees: {
                total: totalFees,
                paid: paid,
                balance: balance,
                status: balance === 0 ? 'paid' : balance < totalFees ? 'partial' : 'unpaid'
            },
            feeBreakdown: feeData
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Record payment for student
app.post('/api/students/payment', async (req, res) => {
    try {
        const { studentId, amount, category, method, reference, notes } = req.body;
        
        if (!studentId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Student ID and valid amount are required' });
        }
        
        const student = await Student.findOne({ studentId, isActive: true });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        student.paid = (student.paid || 0) + amount;
        student.updatedAt = new Date();
        await student.save();
        
        res.json({
            success: true,
            message: `✅ Payment of KES ${amount.toLocaleString()} recorded for ${student.name}`,
            student: {
                id: student.studentId,
                name: student.name,
                paid: student.paid,
                balance: getFeeStructure(student.grade, student.type).total - student.paid
            }
        });
    } catch (error) {
        console.error('Error recording payment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// FEE STRUCTURE HELPER
// ============================================
function getFeeStructure(grade, type) {
    const dayFees = {
        'Playgroup': { term1: 2500, term2: 2500, term3: 2500, total: 7500 },
        'PP1': { term1: 3000, term2: 3000, term3: 3000, total: 9000 },
        'PP2': { term1: 3000, term2: 3000, term3: 3000, total: 9000 },
        'Grade 1': { term1: 3500, term2: 3500, term3: 3500, total: 10500 },
        'Grade 2': { term1: 3500, term2: 3500, term3: 3500, total: 10500 },
        'Grade 3': { term1: 4000, term2: 4000, term3: 4000, total: 12000 },
        'Grade 4': { term1: 4000, term2: 4000, term3: 4000, total: 12000 },
        'Grade 5': { term1: 4500, term2: 4500, term3: 4500, total: 13500 },
        'Grade 6': { term1: 4500, term2: 4500, term3: 4500, total: 13500 }
    };
    
    const boardingFees = {
        'Grade 3': { term1: 8000, term2: 8000, term3: 8000, total: 24000 },
        'Grade 4': { term1: 8000, term2: 8000, term3: 8000, total: 24000 },
        'Grade 5': { term1: 8500, term2: 8500, term3: 8500, total: 25500 },
        'Grade 6': { term1: 8500, term2: 8500, term3: 8500, total: 25500 }
    };
    
    if (type === 'Boarder' && boardingFees[grade]) {
        return boardingFees[grade];
    }
    
    return dayFees[grade] || { term1: 0, term2: 0, term3: 0, total: 0 };
}

// ============================================
// STUDENT ASSESSMENT ROUTES
// ============================================

// Get students for assessment by grade
app.get('/api/assessments/students/:grade', async (req, res) => {
    try {
        const { grade } = req.params;
        const students = await Student.find({ 
            grade: grade,
            isActive: true 
        }).sort({ studentId: 1 });
        
        res.json({
            success: true,
            students: students.map(s => ({
                studentId: s.studentId,
                name: s.name,
                grade: s.grade,
                gender: s.gender,
                type: s.type
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get student assessment by ID
app.get('/api/assessments/student/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        const assessment = await StudentAssessment.findOne({ studentId });
        
        if (!assessment) {
            return res.status(404).json({ success: false, message: 'Assessment not found for this student' });
        }
        
        res.json({ success: true, assessment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// SUBJECT CONFIG ROUTES - WITH PERIOD SUPPORT
// ============================================

// GET subject config (with optional period)
app.get('/api/assessments/subjects/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        const type = req.query.type || 'monthly';
        const period = req.query.period || '';
        
        console.log('📖 GET config for:', grade, type, 'period:', period);
        
        const db = mongoose.connection.db;
        const collection = db.collection('subjectconfigs_new');
        
        // Try to find with period first, then fallback to without period
        let config = await collection.findOne({ grade: grade, type: type, period: period });
        if (!config && period) {
            config = await collection.findOne({ grade: grade, type: type, period: '' });
        }
        if (!config) {
            const defaultSubjects = getDefaultSubjects(grade, type);
            config = {
                grade: grade,
                type: type,
                period: period || '',
                subjects: defaultSubjects,
                rankLevels: ['Below Expectation', 'Approaching Expectation', 'Meeting Expectation', 'Exceeding Expectation'],
                rubric: {
                    exceeding: { min: 75, max: 100, label: 'Exceeding Expectation', short: 'EE', rating: 4, color: '#28a745' },
                    meeting: { min: 50, max: 74, label: 'Meeting Expectation', short: 'ME', rating: 3, color: '#17a2b8' },
                    approaching: { min: 26, max: 49, label: 'Approaching Expectation', short: 'AE', rating: 2, color: '#d4a017' },
                    below: { min: 0, max: 25, label: 'Below Expectation', short: 'BE', rating: 1, color: '#dc3545' }
                },
                updatedAt: new Date()
            };
            await collection.insertOne(config);
            console.log('✅ Created default config for:', grade, type, period);
        }
        res.json({ success: true, config });
    } catch (error) {
        console.error('GET error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE subject config
app.delete('/api/assessments/subjects/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        const { type, period } = req.query;
        
        console.log('🗑️ DELETE config for:', grade, type, 'period:', period);
        
        if (!type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Type is required' 
            });
        }
        
        const db = mongoose.connection.db;
        const collection = db.collection('subjectconfigs_new');
        const query = { grade: grade, type: type };
        if (period) query.period = period;
        
        const result = await collection.deleteMany(query);
        console.log(`✅ Deleted ${result.deletedCount} configs for ${grade} (${type})`);
        
        res.json({ 
            success: true, 
            message: `Deleted config for ${grade} (${type})`,
            deleted: result.deletedCount
        });
    } catch (error) {
        console.log('Delete error:', error);
        res.json({ 
            success: true, 
            message: `Config for ${grade} cleared`,
            deleted: 0
        });
    }
});

// PUT (Create/Update) subject config - with period support
app.put('/api/assessments/subjects/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        const { type, period, subjects, rankLevels, rubric } = req.body;
        
        console.log('📥 SAVE config for:', grade, type, 'period:', period);
        console.log('   Subjects:', JSON.stringify(subjects));
        
        // Validate
        if (!grade) {
            return res.status(400).json({ success: false, message: 'Grade is required' });
        }
        if (!type) {
            return res.status(400).json({ success: false, message: 'Type is required' });
        }
        if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
            return res.status(400).json({ success: false, message: 'Subjects array is required' });
        }
        
        for (const s of subjects) {
            if (!s.name || typeof s.name !== 'string' || s.name.trim() === '') {
                return res.status(400).json({ success: false, message: 'Each subject must have a name' });
            }
            if (typeof s.max !== 'number' || s.max < 1) {
                return res.status(400).json({ success: false, message: 'Each subject must have a max score > 0' });
            }
        }
        
        // Clean subjects
        const cleanedSubjects = subjects.map(s => ({
            name: s.name.trim(),
            max: s.max
        }));
        
        // Use new collection
        const db = mongoose.connection.db;
        const collection = db.collection('subjectconfigs_new');
        
        // Build query
        const query = { grade: grade, type: type };
        if (period) query.period = period;
        
        // Delete existing
        await collection.deleteMany(query);
        console.log(`✅ Deleted existing config for ${grade} (${type}) ${period ? 'period: '+period : ''}`);
        
        // Insert new
        const newConfig = {
            grade: grade,
            type: type,
            period: period || '',
            subjects: cleanedSubjects,
            rankLevels: rankLevels || ['Below Expectation', 'Approaching Expectation', 'Meeting Expectation', 'Exceeding Expectation'],
            rubric: rubric || {
                exceeding: { min: 75, max: 100, label: 'Exceeding Expectation', short: 'EE', rating: 4, color: '#28a745' },
                meeting: { min: 50, max: 74, label: 'Meeting Expectation', short: 'ME', rating: 3, color: '#17a2b8' },
                approaching: { min: 26, max: 49, label: 'Approaching Expectation', short: 'AE', rating: 2, color: '#d4a017' },
                below: { min: 0, max: 25, label: 'Below Expectation', short: 'BE', rating: 1, color: '#dc3545' }
            },
            updatedAt: new Date()
        };
        await collection.insertOne(newConfig);
        console.log(`✅ Inserted new config for ${grade} (${type}) ${period ? 'period: '+period : ''}`);
        
        // Update existing assessments with new max scores and rubric
        const filter = { grade: grade, type: type };
        if (period) filter.period = period;
        
        const students = await StudentAssessment.find(filter);
        for (const student of students) {
            let updated = false;
            for (const assessment of student.assessments) {
                const subjectConfig = cleanedSubjects.find(s => s.name === assessment.subject);
                if (subjectConfig && assessment.maxScore !== subjectConfig.max) {
                    assessment.maxScore = subjectConfig.max;
                    updated = true;
                }
                // Recalculate percentage and performance for each assessment
                const perf = calculateAssessmentPerformance(assessment.score, assessment.maxScore);
                assessment.percentage = perf.percentage;
                assessment.performanceLevel = perf.level;
                assessment.rating = perf.rating;
                updated = true;
            }
            if (updated) {
                const overall = calculateStudentOverall(student.assessments);
                student.totalScore = overall.totalScore;
                student.averageScore = overall.averageScore;
                student.performanceLevel = overall.performanceLevel;
                student.overallRating = overall.overallRating;
                await student.save();
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Subject configuration saved successfully!', 
            config: newConfig
        });
    } catch (error) {
        console.error('❌ Save error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error saving subjects: ' + error.message 
        });
    }
});

// ============================================
// ASSESSMENT ROUTES - WITH AUTO RUBRIC CALCULATION
// ============================================

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
        
        const db = mongoose.connection.db;
        const collection = db.collection('subjectconfigs_new');
        const configFilter = { grade: grade, type: type || 'monthly' };
        if (period) configFilter.period = period;
        
        let config = await collection.findOne(configFilter);
        if (!config) {
            const defaultSubjects = getDefaultSubjects(grade, type || 'monthly');
            config = { grade: grade, type: type || 'monthly', period: period || '', subjects: defaultSubjects };
        }
        res.json({ success: true, students, subjectConfig: { [`${grade}_${type || 'monthly'}`]: config } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

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

app.post('/api/assessments', async (req, res) => {
    try {
        const { studentName, studentId, admissionNumber, grade, type, period, month, year, term, assessments } = req.body;
        
        if (!studentName || !grade || !assessments || !Array.isArray(assessments) || assessments.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid data. Need studentName, grade, and assessments array.' });
        }
        
        // Calculate rubric for each assessment
        const assessmentsWithRubric = assessments.map(a => {
            const perf = calculateAssessmentPerformance(a.score, a.maxScore);
            return {
                subject: a.subject,
                maxScore: a.maxScore,
                score: a.score,
                percentage: perf.percentage,
                performanceLevel: perf.level,
                rating: perf.rating
            };
        });
        
        const overall = calculateStudentOverall(assessmentsWithRubric);
        
        const student = new StudentAssessment({ 
            studentName, 
            studentId: studentId || '',
            admissionNumber: admissionNumber || '', 
            grade, 
            type: type || 'monthly', 
            period: period || '', 
            month: month || '', 
            year: year || '', 
            term: term || '', 
            assessments: assessmentsWithRubric, 
            totalScore: overall.totalScore, 
            averageScore: overall.averageScore, 
            performanceLevel: overall.performanceLevel,
            overallRating: overall.overallRating
        });
        
        await student.save();
        res.status(201).json({ success: true, message: 'Student assessment created successfully!', student });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/assessments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { studentName, studentId, admissionNumber, grade, type, period, month, year, term, assessments } = req.body;
        const student = await StudentAssessment.findById(id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        if (studentName) student.studentName = studentName;
        if (studentId) student.studentId = studentId;
        if (admissionNumber) student.admissionNumber = admissionNumber;
        if (grade) student.grade = grade;
        if (type) student.type = type;
        if (period) student.period = period;
        if (month) student.month = month;
        if (year) student.year = year;
        if (term) student.term = term;
        
        if (assessments && Array.isArray(assessments) && assessments.length > 0) {
            // Calculate rubric for each assessment
            const assessmentsWithRubric = assessments.map(a => {
                const perf = calculateAssessmentPerformance(a.score, a.maxScore);
                return {
                    subject: a.subject,
                    maxScore: a.maxScore,
                    score: a.score,
                    percentage: perf.percentage,
                    performanceLevel: perf.level,
                    rating: perf.rating
                };
            });
            student.assessments = assessmentsWithRubric;
            
            const overall = calculateStudentOverall(assessmentsWithRubric);
            student.totalScore = overall.totalScore;
            student.averageScore = overall.averageScore;
            student.performanceLevel = overall.performanceLevel;
            student.overallRating = overall.overallRating;
        }
        
        student.updatedAt = new Date();
        await student.save();
        res.json({ success: true, message: 'Student assessment updated successfully!', student });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/assessments/:id', async (req, res) => {
    try {
        const student = await StudentAssessment.findByIdAndDelete(req.params.id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        res.json({ success: true, message: 'Student assessment deleted successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/assessments/all', async (req, res) => {
    try {
        const students = await StudentAssessment.find().sort({ studentName: 1 });
        res.json({ success: true, students: students, count: students.length });
    } catch (error) {
        console.error('Error fetching all assessments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/assessments/search', async (req, res) => {
    try {
        const { name, grade, type } = req.query;
        let filter = {};
        
        if (name && name.trim() !== '') {
            filter.studentName = { $regex: name.trim(), $options: 'i' };
        }
        if (grade && grade.trim() !== '') {
            filter.grade = grade.trim();
        }
        if (type && type.trim() !== '') {
            filter.type = type.trim();
        }
        
        if (Object.keys(filter).length === 0) {
            const allStudents = await StudentAssessment.find().sort({ studentName: 1 });
            return res.json({ success: true, students: allStudents, count: allStudents.length });
        }
        
        const students = await StudentAssessment.find(filter).sort({ studentName: 1 });
        res.json({ success: true, students: students, count: students.length });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/assessments/download-report/:studentId', async (req, res) => {
    try {
        const student = await StudentAssessment.findById(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        const allAssessments = await StudentAssessment.find({ studentName: student.studentName }).sort({ createdAt: 1 });
        const html = generateStudentReportHTML(student, allAssessments);
        const options = { format: 'A4', border: { top: '0.5cm', right: '0.5cm', bottom: '0.5cm', left: '0.5cm' }, printBackground: true, landscape: false, type: 'pdf', timeout: 30000, quality: '100' };
        pdf.create(html, options).toBuffer((err, buffer) => {
            if (err) {
                console.error('PDF generation error:', err);
                return res.status(500).json({ success: false, message: 'Error generating PDF: ' + err.message });
            }
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="student_report_${student.studentName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf"`);
            res.setHeader('Content-Length', buffer.length);
            res.send(buffer);
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/assessments/generate-report/:studentId', async (req, res) => {
    try {
        const student = await StudentAssessment.findById(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        const allAssessments = await StudentAssessment.find({ studentName: student.studentName }).sort({ createdAt: 1 });
        const html = generateStudentReportHTML(student, allAssessments);
        res.json({ success: true, html });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/assessments/comprehensive-report/:studentName', async (req, res) => {
    try {
        const studentName = decodeURIComponent(req.params.studentName);
        const allAssessments = await StudentAssessment.find({ studentName: studentName }).sort({ createdAt: 1 });
        if (allAssessments.length === 0) {
            return res.status(404).json({ success: false, message: 'No assessments found' });
        }
        const latest = allAssessments[allAssessments.length - 1];
        const html = generateStudentReportHTML(latest, allAssessments);
        res.json({ success: true, html });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/assessments/copy', async (req, res) => {
    try {
        const { fromGrade, fromType, fromPeriod, fromMonth, fromYear, fromTerm, toGrade, toType, toPeriod, toMonth, toYear, toTerm } = req.body;
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
        
        const db = mongoose.connection.db;
        const collection = db.collection('subjectconfigs_new');
        const configFilter = { grade: toGrade, type: toType || 'monthly' };
        if (toPeriod) configFilter.period = toPeriod;
        
        let config = await collection.findOne(configFilter);
        if (!config) {
            const defaultSubjects = getDefaultSubjects(toGrade, toType || 'monthly');
            config = { grade: toGrade, type: toType || 'monthly', period: toPeriod || '', subjects: defaultSubjects };
        }
        let copiedCount = 0;
        for (const source of sourceStudents) {
            const existingFilter = { studentName: source.studentName, grade: toGrade, type: toType || 'monthly', period: toPeriod, month: toMonth, year: toYear, term: toTerm };
            const existing = await StudentAssessment.findOne(existingFilter);
            if (existing) continue;
            
            const newAssessments = config.subjects.map(subj => {
                const sourceAssessment = source.assessments.find(a => a.subject === subj.name);
                const score = sourceAssessment ? Math.min(sourceAssessment.score, subj.max) : 0;
                const perf = calculateAssessmentPerformance(score, subj.max);
                return { 
                    subject: subj.name, 
                    maxScore: subj.max, 
                    score: score,
                    percentage: perf.percentage,
                    performanceLevel: perf.level,
                    rating: perf.rating
                };
            });
            
            const overall = calculateStudentOverall(newAssessments);
            
            const newStudent = new StudentAssessment({ 
                studentName: source.studentName, 
                studentId: source.studentId || '',
                admissionNumber: source.admissionNumber || '', 
                grade: toGrade, 
                type: toType || 'monthly', 
                period: toPeriod || '', 
                month: toMonth, 
                year: toYear, 
                term: toTerm, 
                assessments: newAssessments, 
                totalScore: overall.totalScore, 
                averageScore: overall.averageScore, 
                performanceLevel: overall.performanceLevel,
                overallRating: overall.overallRating
            });
            await newStudent.save();
            copiedCount++;
        }
        res.json({ success: true, message: `Copied ${copiedCount} students successfully!`, count: copiedCount });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// REPORT ROUTES
// ============================================

app.get('/api/reports/staff/attendance', async (req, res) => {
    try {
        const { period, date, department } = req.query;
        let startDate, endDate;
        const selectedDate = date ? new Date(date) : getKenyaDate();
        if (period === 'daily') {
            startDate = new Date(selectedDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        } else if (period === 'weekly') {
            const day = selectedDate.getDay();
            const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(selectedDate);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
        } else if (period === 'monthly') {
            startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
        } else {
            startDate = getKenyaDate();
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        }
        let filter = {};
        if (department) {
            filter.department = department;
        }
        const teachers = await Teacher.find(filter);
        const report = teachers.map(teacher => {
            let totalDays = 0;
            let onTime = 0;
            let late = 0;
            let absent = 0;
            teacher.attendance.forEach(record => {
                const recordDate = new Date(record.date);
                if (recordDate >= startDate && recordDate < endDate) {
                    totalDays++;
                    if (record.status === 'Present' || record.status === 'Checked In' || record.status === 'Checked Out') {
                        if (record.isLate) {
                            late++;
                        } else {
                            onTime++;
                        }
                    } else {
                        absent++;
                    }
                }
            });
            return { name: `${teacher.firstName} ${teacher.lastName}`, employeeId: teacher.employeeId || 'N/A', department: teacher.department || 'N/A', totalDays, onTime, late, absent };
        });
        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/reports/visitors', async (req, res) => {
    try {
        const { period, date, purpose } = req.query;
        let startDate, endDate;
        const selectedDate = date ? new Date(date) : getKenyaDate();
        if (period === 'daily') {
            startDate = new Date(selectedDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        } else if (period === 'weekly') {
            const day = selectedDate.getDay();
            const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(selectedDate);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
        } else if (period === 'monthly') {
            startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
        } else {
            startDate = getKenyaDate();
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        }
        let filter = { checkIn: { $gte: startDate, $lt: endDate } };
        if (purpose) {
            filter.purpose = purpose;
        }
        const visitors = await Visitor.find(filter);
        const report = visitors.map(visitor => {
            const duration = visitor.checkOut ? Math.round((visitor.checkOut - visitor.checkIn) / 1000 / 60) : 0;
            return { fullName: visitor.fullName || `${visitor.firstName} ${visitor.lastName}`, firstName: visitor.firstName, lastName: visitor.lastName, badgeNumber: visitor.badgeNumber || 'N/A', purpose: visitor.purpose || 'N/A', personToVisit: visitor.personToVisit || 'N/A', checkIn: visitor.checkIn, checkOut: visitor.checkOut || null, checkInTime: visitor.checkIn ? formatKenyaTime(visitor.checkIn) : '-', checkOutTime: visitor.checkOut ? formatKenyaTime(visitor.checkOut) : '-', status: visitor.status || 'Checked In', duration: duration };
        });
        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// DOWNLOAD STAFF REPORT - PDF
// ============================================

app.get('/api/reports/staff/download-pdf', async (req, res) => {
    try {
        const { period, date, department } = req.query;
        let startDate, endDate;
        const selectedDate = date ? new Date(date) : getKenyaDate();
        let periodLabel = '';
        if (period === 'daily') {
            startDate = new Date(selectedDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            periodLabel = `Daily Report - ${formatKenyaDate(selectedDate)}`;
        } else if (period === 'weekly') {
            const day = selectedDate.getDay();
            const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(selectedDate);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
            periodLabel = `Weekly Report - ${formatKenyaDate(startDate)} to ${formatKenyaDate(endDate)}`;
        } else if (period === 'monthly') {
            startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            periodLabel = `Monthly Report - ${selectedDate.toLocaleString('en-KE', { month: 'long', year: 'numeric' })}`;
        } else {
            startDate = getKenyaDate();
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            periodLabel = `Daily Report - ${formatKenyaDate(startDate)}`;
        }
        let filter = {};
        if (department) {
            filter.department = department;
        }
        const teachers = await Teacher.find(filter);
        const report = teachers.map(teacher => {
            let totalDays = 0;
            let onTime = 0;
            let late = 0;
            let absent = 0;
            teacher.attendance.forEach(record => {
                const recordDate = new Date(record.date);
                if (recordDate >= startDate && recordDate < endDate) {
                    totalDays++;
                    if (record.status === 'Present' || record.status === 'Checked In' || record.status === 'Checked Out') {
                        if (record.isLate) {
                            late++;
                        } else {
                            onTime++;
                        }
                    } else {
                        absent++;
                    }
                }
            });
            return { name: `${teacher.firstName} ${teacher.lastName}`, employeeId: teacher.employeeId || 'N/A', department: teacher.department || 'N/A', totalDays, onTime, late, absent };
        });
        const title = 'Staff Attendance Report';
        const html = generateStaffReportHTML(report, title, periodLabel);
        const options = { format: 'A4', border: { top: '0.3cm', right: '0.3cm', bottom: '0.3cm', left: '0.3cm' }, printBackground: true, landscape: true, type: 'pdf', timeout: 30000, quality: '100' };
        pdf.create(html, options).toBuffer((err, buffer) => {
            if (err) {
                console.error('PDF generation error:', err);
                return res.status(500).json({ success: false, message: 'Error generating PDF: ' + err.message });
            }
            const filename = `staff_attendance_${period}_${new Date().toISOString().split('T')[0]}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buffer.length);
            res.send(buffer);
        });
    } catch (error) {
        console.error('Error downloading staff report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// DOWNLOAD VISITOR REPORT - PDF
// ============================================

app.get('/api/reports/visitors/download-pdf', async (req, res) => {
    try {
        const { period, date, purpose } = req.query;
        let startDate, endDate;
        const selectedDate = date ? new Date(date) : getKenyaDate();
        let periodLabel = '';
        if (period === 'daily') {
            startDate = new Date(selectedDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            periodLabel = `Daily Report - ${formatKenyaDate(selectedDate)}`;
        } else if (period === 'weekly') {
            const day = selectedDate.getDay();
            const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(selectedDate);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
            periodLabel = `Weekly Report - ${formatKenyaDate(startDate)} to ${formatKenyaDate(endDate)}`;
        } else if (period === 'monthly') {
            startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            periodLabel = `Monthly Report - ${selectedDate.toLocaleString('en-KE', { month: 'long', year: 'numeric' })}`;
        } else {
            startDate = getKenyaDate();
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            periodLabel = `Daily Report - ${formatKenyaDate(startDate)}`;
        }
        let filter = { checkIn: { $gte: startDate, $lt: endDate } };
        if (purpose) {
            filter.purpose = purpose;
        }
        const visitors = await Visitor.find(filter);
        const report = visitors.map(visitor => {
            const duration = visitor.checkOut ? Math.round((visitor.checkOut - visitor.checkIn) / 1000 / 60) : 0;
            return { fullName: visitor.fullName || `${visitor.firstName} ${visitor.lastName}`, firstName: visitor.firstName, lastName: visitor.lastName, badgeNumber: visitor.badgeNumber || 'N/A', purpose: visitor.purpose || 'N/A', personToVisit: visitor.personToVisit || 'N/A', checkIn: visitor.checkIn, checkOut: visitor.checkOut || null, checkInTime: visitor.checkIn ? formatKenyaTime(visitor.checkIn) : '-', checkOutTime: visitor.checkOut ? formatKenyaTime(visitor.checkOut) : '-', status: visitor.status || 'Checked In', duration: duration };
        });
        const title = 'Visitor Report';
        const html = generateVisitorReportHTML(report, title, periodLabel);
        const options = { format: 'A4', border: { top: '0.3cm', right: '0.3cm', bottom: '0.3cm', left: '0.3cm' }, printBackground: true, landscape: true, type: 'pdf', timeout: 30000, quality: '100' };
        pdf.create(html, options).toBuffer((err, buffer) => {
            if (err) {
                console.error('PDF generation error:', err);
                return res.status(500).json({ success: false, message: 'Error generating PDF: ' + err.message });
            }
            const filename = `visitor_attendance_${period}_${new Date().toISOString().split('T')[0]}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buffer.length);
            res.send(buffer);
        });
    } catch (error) {
        console.error('Error downloading visitor report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// DOWNLOAD CLASS/GRADE PDF REPORT
// ============================================
app.get('/api/assessments/download-class-pdf', async (req, res) => {
    try {
        const { grade, type, term, year, period } = req.query;
        
        if (!grade) {
            return res.status(400).json({ success: false, message: 'Grade is required' });
        }
        
        const filter = { grade: grade };
        if (type) filter.type = type;
        if (term) filter.term = term;
        if (year) filter.year = year;
        if (period) filter.period = period;
        
        const allStudents = await StudentAssessment.find(filter).sort({ studentName: 1, createdAt: -1 });
        
        const uniqueStudents = {};
        allStudents.forEach(student => {
            const key = student.studentName;
            if (!uniqueStudents[key] || new Date(student.createdAt) > new Date(uniqueStudents[key].createdAt)) {
                uniqueStudents[key] = student;
            }
        });
        
        const students = Object.values(uniqueStudents).sort((a, b) => a.studentName.localeCompare(b.studentName));
        
        if (students.length === 0) {
            return res.status(404).json({ success: false, message: 'No students found for this grade' });
        }
        
        const html = generateClassReportHTML(students, grade, type, term, year, period);
        
        const options = { 
            format: 'A4', 
            border: { top: '0.5cm', right: '0.5cm', bottom: '0.5cm', left: '0.5cm' }, 
            printBackground: true, 
            landscape: true, 
            type: 'pdf', 
            timeout: 30000, 
            quality: '100' 
        };
        
        pdf.create(html, options).toBuffer((err, buffer) => {
            if (err) {
                console.error('PDF generation error:', err);
                return res.status(500).json({ success: false, message: 'Error generating PDF: ' + err.message });
            }
            
            const periodLabel = period ? `_${period}` : '';
            const filename = `grade_report_${grade}_${type || 'monthly'}_${term || 'all'}_${year || '2026'}${periodLabel}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buffer.length);
            res.send(buffer);
        });
    } catch (error) {
        console.error('Error generating class PDF:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// GENERATE CLASS REPORT HTML - WITH RUBRIC
// ============================================
function generateClassReportHTML(students, grade, type, term, year, period) {
    const now = getKenyaTime();
    const typeNames = { 'weekly': 'Weekly', 'monthly': 'Monthly', 'term': 'End of Term' };
    const periodLabel = period ? ` - ${period}` : '';
    
    function shortenSubject(name) {
        const shortMap = {
            'MATHS ACTIVITIES': 'Maths',
            'ENGLISH ACTIVITIES': 'English',
            'SCI & TECH': 'Sci/Tech',
            'KISW LUGHA': 'Kisw',
            'RELIGIOUS EDUCATION': 'RE',
            'AGRICULTURE': 'Agric',
            'CREATIVE ART': 'C.Art',
            'MATHEMATICS': 'Maths',
            'KISWAHILI': 'Kisw',
            'SCIENCE': 'Science',
            'SOCIAL STUDIES': 'SST',
            'CREATIVE ARTS': 'C.Arts',
            'LIST/SPEAKING': 'Listening',
            'READING': 'Reading',
            'GRAMMAR': 'Grammar',
            'KUSOMA': 'Kusoma',
            'SARUFI': 'Sarufi',
            'ENVIRONMENTAL': 'Env',
            'C.R.E': 'CRE',
            'I.R.E': 'IRE',
            'LITERACY': 'Literacy',
            'NUMERACY': 'Numeracy',
            'PSYCHOMOTOR': 'Psychomotor',
            'LANGUAGE': 'Language',
            'LIST & SPEAKING': 'Listen/Speak',
            'READING ALOUD': 'Read Aloud',
            'KUSIKILIZA NA KUZUNGUMZA': 'Kusikiliza',
            'KUSOMA KWA SAUTI': 'Soma Sauti',
            'LUGHA': 'Lugha'
        };
        for (const [key, value] of Object.entries(shortMap)) {
            if (name.includes(key) || name === key) {
                return value;
            }
        }
        if (name.length > 12) {
            return name.substring(0, 10) + '...';
        }
        return name;
    }
    
    let totalStudents = students.length;
    let totalScoreSum = 0;
    let exceedingCount = 0, meetingCount = 0, approachingCount = 0, belowCount = 0;
    let allSubjects = [];
    
    students.forEach(student => {
        totalScoreSum += student.totalScore || 0;
        const level = student.performanceLevel || 'Approaching Expectation';
        if (level === 'Exceeding Expectation') exceedingCount++;
        else if (level === 'Meeting Expectation') meetingCount++;
        else if (level === 'Approaching Expectation') approachingCount++;
        else belowCount++;
        
        if (student.assessments && student.assessments.length > 0) {
            student.assessments.forEach(a => {
                if (!allSubjects.includes(a.subject)) {
                    allSubjects.push(a.subject);
                }
            });
        }
    });
    
    allSubjects.sort();
    const avgClassScore = totalStudents > 0 ? (totalScoreSum / totalStudents).toFixed(1) : 0;
    const sortedStudents = [...students].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    
    const subjectHeaders = allSubjects.map(subject => {
        const shortName = shortenSubject(subject);
        return `<th style="padding:2px 2px;border:1px solid #ddd;text-align:center;font-size:5.5px;background:#0A1628;color:white;font-weight:700;min-width:30px;max-width:42px;word-wrap:break-word;">${shortName}</th>`;
    }).join('');
    
    const maxScoresRow = allSubjects.map(subject => {
        let maxScore = 0;
        for (const student of students) {
            if (student.assessments) {
                const found = student.assessments.find(a => a.subject === subject);
                if (found) {
                    maxScore = found.maxScore;
                    break;
                }
            }
        }
        return `<td style="padding:1px 1px;border:1px solid #ddd;text-align:center;font-size:4.5px;color:#999;background:#f8f9fc;font-weight:600;">${maxScore}</td>`;
    }).join('');
    
    let rowsHtml = sortedStudents.map((student, index) => {
        const rank = index + 1;
        const avgScore = student.averageScore ? student.averageScore.toFixed(1) : '0';
        const level = student.performanceLevel || 'Approaching Expectation';
        const levelColor = getPerformanceColor(level);
        const shortLabel = getPerformanceShort(level);
        const rating = getPerformanceRating(level);
        
        let rankDisplay = rank;
        if (rank === 1) rankDisplay = '🥇 1';
        else if (rank === 2) rankDisplay = '🥈 2';
        else if (rank === 3) rankDisplay = '🥉 3';
        else rankDisplay = rank;
        
        let subjectScores = '';
        allSubjects.forEach(subject => {
            const assessment = student.assessments ? student.assessments.find(a => a.subject === subject) : null;
            if (assessment) {
                const percentage = assessment.percentage || (assessment.maxScore > 0 ? ((assessment.score / assessment.maxScore) * 100) : 0);
                let scoreColor = '#0A1628';
                if (percentage >= 75) scoreColor = '#28a745';
                else if (percentage >= 50) scoreColor = '#17a2b8';
                else if (percentage >= 26) scoreColor = '#d4a017';
                else scoreColor = '#dc3545';
                
                subjectScores += `
                    <td style="padding:1px 1px;border:1px solid #ddd;text-align:center;font-size:6.5px;font-weight:700;color:${scoreColor};">
                        ${assessment.score}
                        <span style="display:block;font-size:4.5px;font-weight:400;color:#999;">/${assessment.maxScore}</span>
                    </td>
                `;
            } else {
                subjectScores += `
                    <td style="padding:1px 1px;border:1px solid #ddd;text-align:center;font-size:6px;color:#ddd;">-</td>
                `;
            }
        });
        
        return `
            <tr style="${index % 2 === 0 ? 'background:#fafbfc;' : 'background:white;'}">
                <td style="padding:2px 2px;border:1px solid #ddd;text-align:center;font-size:6.5px;font-weight:700;color:${rank <= 3 ? '#D4A017' : '#666'};">
                    ${rankDisplay}
                </td>
                <td style="padding:2px 3px;border:1px solid #ddd;font-weight:600;font-size:6.5px;color:#0A1628;white-space:nowrap;">${student.studentName}</td>
                ${subjectScores}
                <td style="padding:2px 2px;border:1px solid #ddd;text-align:center;font-size:7px;font-weight:700;color:#D4A017;">${student.totalScore || 0}</td>
                <td style="padding:2px 2px;border:1px solid #ddd;text-align:center;font-size:6.5px;font-weight:700;color:#17a2b8;">${avgScore}</td>
                <td style="padding:2px 2px;border:1px solid #ddd;text-align:center;">
                    <span style="background:${levelColor};color:white;padding:1px 4px;border-radius:50px;font-weight:700;font-size:5.5px;display:inline-block;white-space:nowrap;min-width:42px;">
                        ${shortLabel} (${rating})
                    </span>
                </td>
            </tr>
        `;
    }).join('');
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${grade} - Assessment Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            padding: 3px; 
            max-width: 1100px; 
            margin: 0 auto; 
            font-size: 6px; 
            background: white;
        }
        .report-container {
            border: 2px solid #0A1628;
            border-radius: 4px;
            padding: 5px;
            background: white;
        }
        .header { 
            text-align: center; 
            border-bottom: 2px solid #D4A017; 
            padding-bottom: 3px; 
            margin-bottom: 4px; 
        }
        .header .school-name { 
            font-size: 14px; 
            font-weight: 900; 
            color: #0A1628;
            font-family: 'Georgia', serif;
            letter-spacing: 1px;
        }
        .header .school-name .gold { color: #D4A017; }
        .header .motto {
            color: #888;
            font-size: 6px;
            font-style: italic;
            letter-spacing: 1px;
        }
        .header .report-title {
            font-size: 9px;
            font-weight: 700;
            color: #0A1628;
        }
        .header .report-info { 
            font-size: 5px; 
            color: #999; 
        }
        .header .flag-strip {
            display: flex;
            height: 2.5px;
            width: 60px;
            margin: 2px auto 0;
            border-radius: 2px;
            overflow: hidden;
        }
        .header .flag-strip span { flex: 1; height: 100%; }
        .header .flag-strip .b { background: #000000; }
        .header .flag-strip .r { background: #BB0000; }
        .header .flag-strip .g { background: #006600; }
        .header .flag-strip .w { background: #FFFFFF; }
        
        .stats-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 1px;
            background: #0A1628;
            border-radius: 4px;
            padding: 3px 6px;
            margin-bottom: 4px;
            justify-content: center;
            align-items: center;
        }
        .stats-bar .stat-item {
            display: flex;
            align-items: center;
            gap: 2px;
            padding: 2px 8px;
            border-right: 1px solid rgba(255,255,255,0.08);
            color: white;
        }
        .stats-bar .stat-item:last-child { border-right: none; }
        .stats-bar .stat-item .num {
            font-size: 12px;
            font-weight: 700;
            color: #D4A017;
        }
        .stats-bar .stat-item .num.green { color: #28a745; }
        .stats-bar .stat-item .num.blue { color: #17a2b8; }
        .stats-bar .stat-item .num.orange { color: #d4a017; }
        .stats-bar .stat-item .num.red { color: #dc3545; }
        .stats-bar .stat-item .num.purple { color: #6f42c1; }
        .stats-bar .stat-item .num.gold { color: #D4A017; }
        .stats-bar .stat-item .num.cyan { color: #17a2b8; }
        .stats-bar .stat-item .label {
            font-size: 5px;
            color: rgba(255,255,255,0.5);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        
        .table-wrap { overflow-x: auto; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 5.5px; border: 1px solid #ddd; }
        table th { 
            background: #0A1628; color: white; padding: 2px 2px; text-align: center; 
            font-size: 5px; font-weight: 700; white-space: nowrap; border: 1px solid #1a2a4a;
        }
        table td { padding: 1px 2px; border: 1px solid #ddd; }
        .header-row td { background: #f8f9fc !important; font-weight: 600; color: #555; font-size: 4.5px; }
        
        .footer { 
            display: flex; justify-content: space-between; align-items: center;
            margin-top: 3px; padding-top: 3px; border-top: 1px solid #ddd;
            color: #999; font-size: 4.5px; 
        }
        .footer .left { text-align: left; }
        .footer .right { text-align: right; }
        .footer .contact { color: #ccc; }
        .footer .signature { display: flex; gap: 15px; margin-top: 1px; }
        .footer .signature .sig-line { display: inline-block; width: 60px; border-bottom: 1px solid #999; margin-top: 1px; }
        .footer .signature .sig-label { font-size: 4px; color: #999; }
        
        @media print { 
            body { padding: 2px; } 
            .stats-bar .stat-item { padding: 1px 5px; }
            .stats-bar .stat-item .num { font-size: 10px; }
            table th { font-size: 4.5px; padding: 1px 1px; }
            table td { padding: 1px 1px; font-size: 4.5px; }
            .report-container { border: 1px solid #ddd; padding: 3px; }
            .header .school-name { font-size: 12px; }
            .header .report-title { font-size: 8px; }
        }
        @page { margin: 3mm; size: A4 landscape; }
        .watermark {
            position: fixed; opacity: 0.012; font-size: 30px;
            top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg);
            pointer-events: none; z-index: 0; color: #0A1628;
            font-weight: 900; letter-spacing: 4px; white-space: nowrap;
        }
        .legend {
            display: flex; gap: 6px; justify-content: center; margin-top: 2px; font-size: 4.5px; flex-wrap: wrap;
        }
        .legend .item { display: flex; align-items: center; gap: 2px; }
        .legend .dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; }
        .legend .dot.exceeding { background: #28a745; }
        .legend .dot.meeting { background: #17a2b8; }
        .legend .dot.approaching { background: #d4a017; }
        .legend .dot.below { background: #dc3545; }
        .legend .rubric-label { font-weight: 600; font-size: 5px; }
        .legend .rubric-label.ee { color: #28a745; }
        .legend .rubric-label.me { color: #17a2b8; }
        .legend .rubric-label.ae { color: #d4a017; }
        .legend .rubric-label.be { color: #dc3545; }
    </style>
</head>
<body>
    <div class="watermark">CHANGARA STAR ACADEMY</div>
    
    <div class="report-container">
        <div class="header">
            <div class="school-name">🏫 <span class="gold">Changara</span> Star Academy</div>
            <div class="motto">"Assurance to Excellence"</div>
            <div class="flag-strip">
                <span class="b"></span><span class="r"></span>
                <span class="g"></span><span class="w"></span>
                <span class="b"></span><span class="r"></span>
                <span class="g"></span><span class="w"></span>
            </div>
            <div class="report-title">${grade} - ${typeNames[type] || type || 'Monthly'} Assessment Results</div>
            <div class="report-info">
                ${term ? term + ' | ' : ''} ${year || '2026'} ${periodLabel} | ${formatKenyaDate(now)}
            </div>
        </div>
        
        <div class="stats-bar">
            <div class="stat-item"><span class="num gold">${totalStudents}</span><span class="label">Students</span></div>
            <div class="stat-item"><span class="num green">${exceedingCount}</span><span class="label">EE (4)</span></div>
            <div class="stat-item"><span class="num blue">${meetingCount}</span><span class="label">ME (3)</span></div>
            <div class="stat-item"><span class="num orange">${approachingCount}</span><span class="label">AE (2)</span></div>
            <div class="stat-item"><span class="num red">${belowCount}</span><span class="label">BE (1)</span></div>
            <div class="stat-item"><span class="num purple">${avgClassScore}</span><span class="label">Class Avg</span></div>
            <div class="stat-item"><span class="num cyan">${allSubjects.length}</span><span class="label">Subjects</span></div>
        </div>
        
        <div class="legend">
            <span class="item"><span class="dot exceeding"></span> <span class="rubric-label ee">EE: Exceeding (75-100%)</span></span>
            <span class="item"><span class="dot meeting"></span> <span class="rubric-label me">ME: Meeting (50-74%)</span></span>
            <span class="item"><span class="dot approaching"></span> <span class="rubric-label ae">AE: Approaching (26-49%)</span></span>
            <span class="item"><span class="dot below"></span> <span class="rubric-label be">BE: Below (0-25%)</span></span>
            <span class="item" style="color:#D4A017;font-weight:700;">🏆 Rank: 1st 🥇, 2nd 🥈, 3rd 🥉</span>
        </div>
        
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th style="width:20px;">Rank</th>
                        <th style="min-width:60px;text-align:left;">Student</th>
                        ${subjectHeaders}
                        <th style="width:26px;">Total</th>
                        <th style="width:22px;">Avg</th>
                        <th style="width:50px;">Level</th>
                    </tr>
                    <tr class="header-row">
                        <td colspan="2" style="text-align:right;color:#0A1628;font-weight:700;">Max:</td>
                        ${maxScoresRow}
                        <td colspan="3" style="background:#f8f9fc;border:1px solid #ddd;"></td>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
        
        <div class="footer">
            <div class="left">
                <span class="contact">📞 +254 721 556 252 | 📧 starchangara@gmail.com</span>
            </div>
            <div class="right">
                <span>© ${new Date().getFullYear()} Changara Star Academy</span>
                <span style="color:#D4A017;font-weight:700;margin-left:4px;">🇰🇪</span>
                <div class="signature">
                    <div><div class="sig-line"></div><div class="sig-label">Principal's Signature</div></div>
                    <div><div class="sig-line"></div><div class="sig-label">Date</div></div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

// ============================================
// FIX PAST RECORDS - MANUAL API
// ============================================

app.post('/api/fix-past-times', async (req, res) => {
    try {
        await fixPastRecords();
        res.json({ success: true, message: '✅ Past records time fixed successfully!' });
    } catch (error) {
        console.error('Error fixing records:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
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
        res.json({ success: true, message: 'File uploaded successfully!', file: { filename: req.file.filename, originalname: req.file.originalname, path: `/${req.file.path.replace(/\\/g, '/')}`, size: req.file.size, type: fileType, icon: icon, mimetype: req.file.mimetype } });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.use('/uploads', express.static('uploads'));

// ============================================
// TEST ROUTE
// ============================================

app.get('/api/test', (req, res) => {
    const kenyaNow = getKenyaTime();
    res.json({ success: true, message: '🎉 Changara Star Academy is running!', data: { server: 'Online', kenyaTime: kenyaNow.toLocaleString(), kenyaTimeFormatted: formatKenyaFullTime(kenyaNow), timestamp: new Date().toISOString() } });
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
    console.log(`📚 Student API: http://localhost:${PORT}/api/students`);
    console.log(`💰 Fees API: http://localhost:${PORT}/api/students/fees`);
    console.log('='.repeat(50));
    console.log('✅ Server started successfully!');
});