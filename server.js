const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const logger = require('./logger');

// ============================================
// LOAD ENVIRONMENT VARIABLES FIRST
// ============================================
dotenv.config();

// ============================================
// CLOUDINARY CONFIGURATION
// ============================================
const cloudinary = require('cloudinary').v2;

console.log('🔍 Cloudinary Configuration Status:');
console.log('  Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing');
console.log('  API Key:', process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing');
console.log('  API Secret:', process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('✅ Cloudinary configured');

// Test Cloudinary connection
(async function testCloudinary() {
    try {
        const result = await cloudinary.api.ping();
        console.log('✅ Cloudinary connection test:', result.status || 'Success');
    } catch (error) {
        console.error('❌ Cloudinary connection failed:', error.message);
        console.log('⚠️ Please check your Cloudinary credentials in .env file');
    }
})();

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

let compression;
try {
    compression = require('compression');
} catch (error) {
    compression = null;
}
if (compression) {
    app.use(compression());
}

// ============================================
// SET TIME ZONE TO KENYA
// ============================================
process.env.TZ = 'Africa/Nairobi';

// ============================================
// HELPER FUNCTIONS
// ============================================
function getKenyaTime() {
    return new Date();
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
    return d.toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function formatKenyaFullTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + formatKenyaTime(date);
}

function formatKenyaDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', year: 'numeric', month: 'short', day: 'numeric' });
}

// ============================================
// PERFORMANCE RUBRIC - CBC CORRECT
// ============================================
// Exceeding Expectations (EE): 75-100% = Rating 4
// Meeting Expectations (ME): 41-74% = Rating 3
// Approaching Expectations (AE): 21-40% = Rating 2
// Below Expectations (BE): 0-20% = Rating 1

function calculatePerformanceLevel(percentage) {
    if (percentage >= 75) return 'Exceeding Expectation';
    if (percentage >= 41) return 'Meeting Expectation';
    if (percentage >= 21) return 'Approaching Expectation';
    return 'Below Expectation';
}

function getPerformanceColor(level) {
    const colors = {
        'Exceeding Expectation': '#1a8a3f',
        'Meeting Expectation': '#0d6efd',
        'Approaching Expectation': '#e6a800',
        'Below Expectation': '#dc3545'
    };
    return colors[level] || '#6c757d';
}

function getPerformanceShort(level) {
    const shorts = {
        'Exceeding Expectation': 'EE',
        'Meeting Expectation': 'ME',
        'Approaching Expectation': 'AE',
        'Below Expectation': 'BE'
    };
    return shorts[level] || 'AE';
}

function getPerformanceRating(level) {
    const ratings = {
        'Exceeding Expectation': 4,
        'Meeting Expectation': 3,
        'Approaching Expectation': 2,
        'Below Expectation': 1
    };
    return ratings[level] || 2;
}

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

// ============================================
// CBC STUDENT OVERALL - CORRECT METHOD
// ============================================
// Overall rating = AVERAGE of all subject ratings (EE=4, ME=3, AE=2, BE=1)
function calculateStudentOverall(assessments) {
    if (!assessments || assessments.length === 0) {
        return { 
            totalScore: 0, 
            averageScore: 0, 
            performanceLevel: 'Approaching Expectation', 
            overallRating: 2,
            levelDistribution: { EE: 0, ME: 0, AE: 0, BE: 0 }
        };
    }
    
    let totalScore = 0;
    let totalMaxScore = 0;
    let totalRating = 0;
    let subjectCount = 0;
    let levelDistribution = { EE: 0, ME: 0, AE: 0, BE: 0 };
    
    assessments.forEach(a => {
        // Ensure valid data
        const score = Math.min(a.score || 0, a.maxScore || 0);
        const maxScore = a.maxScore || 1;
        
        totalScore += score;
        totalMaxScore += maxScore;
        
        // Get rating for this subject
        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
        const level = calculatePerformanceLevel(percentage);
        const rating = getPerformanceRating(level);
        totalRating += rating;
        subjectCount++;
        
        // Track distribution
        const short = getPerformanceShort(level);
        levelDistribution[short] = (levelDistribution[short] || 0) + 1;
    });
    
    // Overall rating = AVERAGE of all subject ratings (CBC method)
    const overallRating = subjectCount > 0 ? parseFloat((totalRating / subjectCount).toFixed(1)) : 2;
    
    // Determine overall performance level based on average rating
    let performanceLevel = 'Approaching Expectation';
    if (overallRating >= 3.5) performanceLevel = 'Exceeding Expectation';
    else if (overallRating >= 2.5) performanceLevel = 'Meeting Expectation';
    else if (overallRating >= 1.5) performanceLevel = 'Approaching Expectation';
    else performanceLevel = 'Below Expectation';
    
    const avgPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    
    return {
        totalScore: totalScore,
        averageScore: parseFloat(avgPercentage.toFixed(1)),
        overallRating: overallRating,
        performanceLevel: performanceLevel,
        levelDistribution: levelDistribution,
        subjectCount: subjectCount
    };
}
// ============================================
// CLOUDINARY UPLOAD HELPER
// ============================================
async function uploadToCloudinary(fileBuffer, filename, folder = 'assignments') {
    return new Promise((resolve, reject) => {
        console.log(`📤 Uploading to Cloudinary: ${filename}`);
        console.log(`📁 Folder: ${folder}`);
        console.log(`📦 File size: ${fileBuffer.length} bytes`);
        
        const ext = filename.split('.').pop().toLowerCase();
        let resourceType = 'raw';
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
            resourceType = 'image';
        } else if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) {
            resourceType = 'video';
        } else if (['mp3', 'wav', 'ogg', 'aac'].includes(ext)) {
            resourceType = 'video';
        }
        
        cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: resourceType,
                public_id: `${Date.now()}_${filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_')}`,
                use_filename: true,
                unique_filename: true,
                timeout: 60000,
                type: 'upload'
            },
            (error, result) => {
                if (error) {
                    console.error('❌ Cloudinary upload error:', error);
                    reject(new Error(error.message || 'Cloudinary upload failed'));
                } else {
                    console.log('✅ Cloudinary upload success:', result.secure_url);
                    resolve(result);
                }
            }
        ).end(fileBuffer);
    });
}

// ============================================
// FUNCTION TO CHECK IF CLOUDINARY IS CONFIGURED
// ============================================
function isCloudinaryConfigured() {
    return process.env.CLOUDINARY_CLOUD_NAME && 
           process.env.CLOUDINARY_API_KEY && 
           process.env.CLOUDINARY_API_SECRET;
}

// ============================================
// STAFF REPORT PDF
// ============================================
function generateStaffReportPDF(report, periodLabel) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ 
                margin: 40, 
                size: 'A4',
                landscape: true
            });
            const chunks = [];
            
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            
            doc.fontSize(20)
               .font('Helvetica-Bold')
               .fillColor('#0A1628')
               .text('CHANGARA STAR ACADEMY', { align: 'center' });
            
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#D4A017')
               .text('"Assurance to Excellence"', { align: 'center' })
               .moveDown(0.3);
            
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor('#0A1628')
               .text('STAFF ATTENDANCE REPORT', { align: 'center' })
               .moveDown(0.3);
            
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#6c757d')
               .text(periodLabel || 'Attendance Report', { align: 'center' })
               .moveDown(0.5);
            
            const totalStaff = report.length;
            let totalOnTime = 0, totalLate = 0, totalAbsent = 0, totalDays = 0;
            report.forEach(s => { totalOnTime += s.onTime || 0; totalLate += s.late || 0; totalAbsent += s.absent || 0; totalDays += s.totalDays || 0; });
            
            const statsData = [
                { label: 'Total Staff', value: totalStaff, color: '#0A1628' },
                { label: 'On Time', value: totalOnTime, color: '#1a8a3f' },
                { label: 'Late', value: totalLate, color: '#e6a800' },
                { label: 'Absent', value: totalAbsent, color: '#dc3545' },
                { label: 'Attendance Rate', value: totalDays > 0 ? ((totalOnTime / totalDays) * 100).toFixed(1) + '%' : '0%', color: '#0d6efd' }
            ];
            
            const statsY = doc.y;
            const boxWidth = 140;
            statsData.forEach((stat, i) => {
                const x = 45 + (i * (boxWidth + 10));
                doc.roundedRect(x, statsY, boxWidth, 40, 6)
                   .fillColor('#f8f9fa')
                   .fill()
                   .strokeColor('#dee2e6')
                   .lineWidth(1)
                   .roundedRect(x, statsY, boxWidth, 40, 6)
                   .stroke();
                
                doc.fontSize(18)
                   .font('Helvetica-Bold')
                   .fillColor(stat.color)
                   .text(stat.value.toString(), x + 5, statsY + 5, { width: boxWidth - 10, align: 'center' });
                
                doc.fontSize(8)
                   .font('Helvetica-Bold')
                   .fillColor('#6c757d')
                   .text(stat.label, x + 5, statsY + 25, { width: boxWidth - 10, align: 'center' });
            });
            
            doc.moveDown(2.5);
            
            const tableTop = doc.y;
            const colWidths = [25, 160, 60, 60, 60, 60];
            const tableWidth = 425;
            
            doc.rect(45, tableTop, tableWidth, 22)
               .fillColor('#0A1628')
               .fill();
            
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('white')
               .text('#', 50, tableTop + 5)
               .text('Staff Name', 75, tableTop + 5)
               .text('Days', 235, tableTop + 5, { width: 45, align: 'center' })
               .text('On Time', 280, tableTop + 5, { width: 45, align: 'center' })
               .text('Late', 325, tableTop + 5, { width: 45, align: 'center' })
               .text('Absent', 370, tableTop + 5, { width: 45, align: 'center' });
            
            let rowY = tableTop + 22;
            report.forEach((s, index) => {
                if (rowY > 530) { doc.addPage(); rowY = 50; }
                doc.rect(45, rowY, tableWidth, 20)
                   .fillColor(index % 2 === 0 ? '#f8f9fa' : 'white')
                   .fill();
                
                doc.fontSize(9)
                   .font('Helvetica-Bold')
                   .fillColor('#0A1628')
                   .text((index + 1).toString(), 50, rowY + 5)
                   .text(s.name || 'N/A', 75, rowY + 5)
                   .text((s.totalDays || 0).toString(), 235, rowY + 5, { width: 45, align: 'center' })
                   .fillColor('#1a8a3f')
                   .text((s.onTime || 0).toString(), 280, rowY + 5, { width: 45, align: 'center' })
                   .fillColor('#e6a800')
                   .text((s.late || 0).toString(), 325, rowY + 5, { width: 45, align: 'center' })
                   .fillColor('#dc3545')
                   .text((s.absent || 0).toString(), 370, rowY + 5, { width: 45, align: 'center' });
                
                rowY += 20;
            });
            
            doc.moveDown(2);
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor('#6c757d')
               .text(`Generated: ${formatKenyaFullTime(new Date())}`, 45, 550, { align: 'left' })
               .text('CHANGARA STAR ACADEMY | P.O Box 7, Cheptais | 📞 +254 721 556 252', 45, 565, { align: 'center' });
            
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

// ============================================
// PROFESSIONAL CBC STUDENT REPORT - FIXED
// ============================================
function generateStudentReportPDF(student) {
    return new Promise((resolve, reject) => {
        try {
            // ============================================
            // RECALCULATE AND VALIDATE DATA
            // ============================================
            let validAssessments = [];
            
            if (student.assessments && student.assessments.length > 0) {
                validAssessments = student.assessments.map(a => {
                    // Ensure score doesn't exceed max
                    const score = Math.min(a.score || 0, a.maxScore || 0);
                    const maxScore = a.maxScore || 1;
                    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
                    const level = calculatePerformanceLevel(percentage);
                    const rating = getPerformanceRating(level);
                    
                    return {
                        subject: a.subject || 'Untitled',
                        maxScore: maxScore,
                        score: score,
                        percentage: parseFloat(percentage.toFixed(1)),
                        performanceLevel: level,
                        rating: rating,
                        short: getPerformanceShort(level)
                    };
                });
            }
            
            // Calculate CBC overall
            const cbcResult = calculateStudentOverall(validAssessments);
            
            // Update student object with validated data
            student.assessments = validAssessments;
            student.totalScore = cbcResult.totalScore;
            student.averageScore = cbcResult.averageScore;
            student.performanceLevel = cbcResult.performanceLevel;
            student.overallRating = cbcResult.overallRating;
            student.levelDistribution = cbcResult.levelDistribution;
            student.subjectCount = cbcResult.subjectCount;

            const doc = new PDFDocument({
                margin: 25,
                size: 'A4',
                layout: 'portrait'
            });
            const chunks = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const colors = {
                primary: '#0A1628',
                gold: '#C9A84C',
                goldLight: '#F5ECD7',
                success: '#1a8a3f',
                successLight: '#E8F5E9',
                info: '#0d6efd',
                infoLight: '#E3F2FD',
                warning: '#e6a800',
                warningLight: '#FFF8E1',
                danger: '#dc3545',
                dangerLight: '#FBE9E7',
                gray: '#6c757d',
                grayLight: '#f8f9fa',
                border: '#dee2e6',
                white: '#ffffff'
            };

            const level = student.performanceLevel || 'Approaching Expectation';
            const levelColors = {
                'Exceeding Expectation': { bg: '#E8F5E9', border: '#1a8a3f', text: '#1a8a3f', icon: '🌟' },
                'Meeting Expectation': { bg: '#E3F2FD', border: '#0d6efd', text: '#0d6efd', icon: '✅' },
                'Approaching Expectation': { bg: '#FFF8E1', border: '#e6a800', text: '#e6a800', icon: '📌' },
                'Below Expectation': { bg: '#FBE9E7', border: '#dc3545', text: '#dc3545', icon: '⚠️' }
            };
            const perfColors = levelColors[level] || levelColors['Approaching Expectation'];

            // ============================================
            // HEADER WITH LOGO
            // ============================================
            const logoY = 15;
            
            doc.fontSize(22)
                .font('Helvetica-Bold')
                .fillColor(colors.primary)
                .text('CHANGARA', 35, logoY, { align: 'left', width: 200 });
            
            doc.fontSize(18)
                .font('Helvetica-Bold')
                .fillColor(colors.gold)
                .text('STAR', 35, logoY + 28, { align: 'left', width: 200 });
            
            doc.fontSize(8)
                .font('Helvetica-Bold')
                .fillColor(colors.primary)
                .text('ACADEMY', 35, logoY + 50, { align: 'left', width: 200 });
            
            doc.fontSize(6)
                .font('Helvetica-Oblique')
                .fillColor(colors.gold)
                .text('"Nurturing Stars, Building Futures"', 35, logoY + 62, { width: 200 });

            doc.fontSize(14)
                .font('Helvetica-Bold')
                .fillColor(colors.primary)
                .text('CBC ASSESSMENT REPORT', 300, logoY + 10, { align: 'right', width: 270 });
            
            doc.fontSize(8)
                .font('Helvetica')
                .fillColor(colors.gray)
                .text(`${student.type || 'Monthly'} Assessment • ${student.term || ''} ${student.year || ''}`, 
                    300, logoY + 30, { align: 'right', width: 270 });

            doc.moveTo(30, logoY + 72)
                .lineTo(565, logoY + 72)
                .strokeColor(colors.gold)
                .lineWidth(2)
                .stroke();

            // ============================================
            // STUDENT INFORMATION
            // ============================================
            const infoY = logoY + 80;
            
            doc.roundedRect(30, infoY, 535, 30, 4)
                .fillColor(colors.grayLight)
                .fill()
                .strokeColor(colors.border)
                .lineWidth(0.5)
                .roundedRect(30, infoY, 535, 30, 4)
                .stroke();

            const infoData = [
                ['Student:', student.studentName || 'N/A'],
                ['Grade:', student.grade || 'N/A'],
                ['Admission:', student.studentId || 'N/A'],
                ['Term:', student.term || 'N/A'],
                ['Date:', formatKenyaDate(new Date())]
            ];

            const infoColWidth = 200;
            const infoXStart = 40;

            infoData.forEach((item, i) => {
                const col = i % 3;
                const row = Math.floor(i / 3);
                const x = infoXStart + (col * infoColWidth);
                const y = infoY + 6 + (row * 14);

                doc.fontSize(7)
                    .font('Helvetica-Bold')
                    .fillColor(colors.gray)
                    .text(item[0], x, y);

                doc.fontSize(7)
                    .font('Helvetica')
                    .fillColor(colors.primary)
                    .text(item[1], x + 50, y, { width: 140 });
            });

            // ============================================
            // PERFORMANCE RUBRIC
            // ============================================
            const rubricY = infoY + 38;
            
            doc.fontSize(6)
                .font('Helvetica-Bold')
                .fillColor(colors.primary)
                .text('RUBRIC:', 30, rubricY);

            const rubricData = [
                { label: 'EE (4)', range: '75-100%', color: colors.success, bg: colors.successLight },
                { label: 'ME (3)', range: '41-74%', color: colors.info, bg: colors.infoLight },
                { label: 'AE (2)', range: '21-40%', color: colors.warning, bg: colors.warningLight },
                { label: 'BE (1)', range: '0-20%', color: colors.danger, bg: colors.dangerLight }
            ];

            let rubricX = 80;
            rubricData.forEach((item) => {
                doc.roundedRect(rubricX, rubricY - 2, 100, 16, 3)
                    .fillColor(item.bg)
                    .fill()
                    .strokeColor(item.color)
                    .lineWidth(0.5)
                    .roundedRect(rubricX, rubricY - 2, 100, 16, 3)
                    .stroke();

                doc.fontSize(5)
                    .font('Helvetica-Bold')
                    .fillColor(item.color)
                    .text(item.label, rubricX + 3, rubricY + 1, { width: 50, align: 'left' });

                doc.fontSize(4)
                    .font('Helvetica')
                    .fillColor(colors.gray)
                    .text(item.range, rubricX + 55, rubricY + 2, { width: 42, align: 'right' });

                rubricX += 108;
            });

            // ============================================
            // PERFORMANCE SUMMARY
            // ============================================
            const perfY = rubricY + 22;
            doc.roundedRect(30, perfY, 535, 30, 4)
                .fillColor(perfColors.bg)
                .fill()
                .strokeColor(perfColors.border)
                .lineWidth(1.5)
                .roundedRect(30, perfY, 535, 30, 4)
                .stroke();

            doc.fontSize(14)
                .font('Helvetica-Bold')
                .fillColor(perfColors.text)
                .text(`${perfColors.icon} ${level}`, 40, perfY + 6);

            const totalScore = student.totalScore || 0;
            const avgScore = student.averageScore !== undefined && student.averageScore !== null ? student.averageScore.toFixed(1) : '0';
            const rating = student.overallRating || 2;
            const subjects = student.subjectCount || 0;

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor(colors.primary)
                .text(`Total: ${totalScore}  •  Avg: ${avgScore}%  •  CBC Rating: ${rating}/4  •  Subjects: ${subjects}`, 250, perfY + 8);

            // ============================================
            // LEVEL DISTRIBUTION
            // ============================================
            const distY = perfY + 36;
            const dist = student.levelDistribution || { EE: 0, ME: 0, AE: 0, BE: 0 };
            const total = subjects || 1;
            
            doc.fontSize(6)
                .font('Helvetica-Bold')
                .fillColor(colors.primary)
                .text('CBC LEVEL DISTRIBUTION:', 30, distY);

            const distData = [
                { label: 'EE', count: dist.EE || 0, color: colors.success, bg: colors.successLight },
                { label: 'ME', count: dist.ME || 0, color: colors.info, bg: colors.infoLight },
                { label: 'AE', count: dist.AE || 0, color: colors.warning, bg: colors.warningLight },
                { label: 'BE', count: dist.BE || 0, color: colors.danger, bg: colors.dangerLight }
            ];

            let distX = 150;
            distData.forEach((item) => {
                const pct = Math.round((item.count / total) * 100);
                doc.roundedRect(distX, distY - 2, 80, 16, 3)
                    .fillColor(item.bg)
                    .fill()
                    .strokeColor(item.color)
                    .lineWidth(0.5)
                    .roundedRect(distX, distY - 2, 80, 16, 3)
                    .stroke();

                doc.fontSize(8)
                    .font('Helvetica-Bold')
                    .fillColor(item.color)
                    .text(item.count.toString(), distX + 4, distY);

                doc.fontSize(5)
                    .font('Helvetica')
                    .fillColor(colors.gray)
                    .text(item.label + ' ' + pct + '%', distX + 22, distY + 1);

                distX += 88;
            });

            // ============================================
            // SUBJECT ASSESSMENT TABLE
            // ============================================
            const tableY = distY + 22;

            doc.fontSize(7)
                .font('Helvetica-Bold')
                .fillColor(colors.primary)
                .text('SUBJECT ASSESSMENT', 30, tableY);

            const tableTop = tableY + 8;
            doc.roundedRect(30, tableTop, 535, 14, 3)
                .fillColor(colors.primary)
                .fill();

            const headers = ['Subject', 'Max', 'Score', '%', 'Level (Rating)'];
            const colWidths = [170, 40, 40, 55, 190];
            let headerX = 40;

            doc.fontSize(6)
                .font('Helvetica-Bold')
                .fillColor('white');

            headers.forEach((h, i) => {
                const align = i === 0 ? 'left' : 'center';
                doc.text(h, headerX, tableTop + 3, { width: colWidths[i] - 5, align: align });
                headerX += colWidths[i];
            });

            let rowY = tableTop + 14;
            let rowIndex = 0;

            const sortedAssessments = [...(student.assessments || [])].sort((a, b) => {
                const pA = a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0;
                const pB = b.maxScore > 0 ? (b.score / b.maxScore) * 100 : 0;
                return pB - pA;
            });

            // Max 10 subjects to fit on one page
            const displayAssessments = sortedAssessments.slice(0, 10);

            displayAssessments.forEach((a) => {
                const percentage = a.maxScore > 0 ? ((a.score / a.maxScore) * 100) : 0;
                const level2 = calculatePerformanceLevel(percentage);
                const levelColor2 = getPerformanceColor(level2);
                const short2 = getPerformanceShort(level2);
                const rating2 = getPerformanceRating(level2);

                const bgColor = rowIndex % 2 === 0 ? '#ffffff' : colors.grayLight;
                doc.roundedRect(30, rowY, 535, 12, 1)
                    .fillColor(bgColor)
                    .fill()
                    .strokeColor(colors.border)
                    .lineWidth(0.3)
                    .roundedRect(30, rowY, 535, 12, 1)
                    .stroke();

                let xPos = 40;
                doc.fontSize(6)
                    .font('Helvetica');

                doc.fillColor(colors.primary)
                    .font('Helvetica-Bold')
                    .text(a.subject, xPos, rowY + 2, { width: colWidths[0] - 5 });
                xPos += colWidths[0];

                doc.font('Helvetica')
                    .fillColor(colors.gray)
                    .text(a.maxScore.toString(), xPos, rowY + 2, { width: colWidths[1] - 5, align: 'center' });
                xPos += colWidths[1];

                doc.fillColor(colors.primary)
                    .font('Helvetica-Bold')
                    .text(a.score.toString(), xPos, rowY + 2, { width: colWidths[2] - 5, align: 'center' });
                xPos += colWidths[2];

                const pctColor = percentage >= 75 ? colors.success : 
                                 (percentage >= 41 ? colors.info : 
                                 (percentage >= 21 ? colors.warning : colors.danger));
                doc.fillColor(pctColor)
                    .font('Helvetica-Bold')
                    .text(percentage.toFixed(0) + '%', xPos, rowY + 2, { width: colWidths[3] - 5, align: 'center' });
                xPos += colWidths[3];

                doc.fillColor(levelColor2)
                    .font('Helvetica-Bold')
                    .text(`${short2} (${rating2})`, xPos, rowY + 2, { width: colWidths[4] - 5 });

                rowY += 12;
                rowIndex++;
            });

            // ============================================
            // STRENGTHS & AREAS FOR IMPROVEMENT
            // ============================================
            const swY = rowY + 10;
            
            if (swY < 700 && displayAssessments.length > 0) {
                const allAssessments = student.assessments || [];
                
                const strengths = allAssessments
                    .filter(a => a.maxScore > 0 && ((a.score / a.maxScore) * 100) >= 50)
                    .sort((a, b) => ((b.score / b.maxScore) * 100) - ((a.score / a.maxScore) * 100))
                    .slice(0, 3);

                const weaknesses = allAssessments
                    .filter(a => a.maxScore > 0 && ((a.score / a.maxScore) * 100) < 41)
                    .sort((a, b) => ((a.score / a.maxScore) * 100) - ((b.score / b.maxScore) * 100))
                    .slice(0, 3);

                doc.roundedRect(30, swY, 260, 32, 4)
                    .fillColor(colors.successLight)
                    .fill()
                    .strokeColor(colors.success)
                    .lineWidth(0.5)
                    .roundedRect(30, swY, 260, 32, 4)
                    .stroke();

                doc.fontSize(6)
                    .font('Helvetica-Bold')
                    .fillColor(colors.success)
                    .text('🌟 Strengths', 38, swY + 3);

                if (strengths.length > 0) {
                    let strengthsY = swY + 13;
                    strengths.forEach((s) => {
                        const pct = ((s.score / s.maxScore) * 100).toFixed(0);
                        doc.fontSize(5)
                            .font('Helvetica')
                            .fillColor(colors.primary)
                            .text(`✓ ${s.subject}: ${pct}%`, 38, strengthsY);
                        strengthsY += 9;
                    });
                } else {
                    doc.fontSize(5)
                        .font('Helvetica-Oblique')
                        .fillColor(colors.gray)
                        .text('Continue building on your progress', 38, swY + 13);
                }

                doc.roundedRect(305, swY, 260, 32, 4)
                    .fillColor(colors.dangerLight)
                    .fill()
                    .strokeColor(colors.danger)
                    .lineWidth(0.5)
                    .roundedRect(305, swY, 260, 32, 4)
                    .stroke();

                doc.fontSize(6)
                    .font('Helvetica-Bold')
                    .fillColor(colors.danger)
                    .text('📈 Areas for Improvement', 313, swY + 3);

                if (weaknesses.length > 0) {
                    let weaknessesY = swY + 13;
                    weaknesses.forEach((s) => {
                        const pct = ((s.score / s.maxScore) * 100).toFixed(0);
                        doc.fontSize(5)
                            .font('Helvetica')
                            .fillColor(colors.primary)
                            .text(`→ ${s.subject}: ${pct}%`, 313, weaknessesY);
                        weaknessesY += 9;
                    });
                } else {
                    doc.fontSize(5)
                        .font('Helvetica-Bold')
                        .fillColor(colors.success)
                        .text('🎉 All subjects meeting expectations!', 313, swY + 13);
                }
            }

            // ============================================
            // TEACHER'S COMMENTS
            // ============================================
            const feedbackY = (swY + 40 > 720) ? 720 : swY + 40;
            
            if (feedbackY < 730) {
                doc.fontSize(6)
                    .font('Helvetica-Bold')
                    .fillColor(colors.primary)
                    .text('📝 Teacher\'s Comments', 30, feedbackY);

                doc.roundedRect(30, feedbackY + 5, 535, 28, 4)
                    .fillColor(colors.grayLight)
                    .fill()
                    .strokeColor(colors.border)
                    .lineWidth(0.5)
                    .roundedRect(30, feedbackY + 5, 535, 28, 4)
                    .stroke();

                const feedbackText = generateTeacherFeedback(student);
                doc.fontSize(6)
                    .font('Helvetica')
                    .fillColor(colors.primary)
                    .text(feedbackText, 38, feedbackY + 11, { width: 520, align: 'left' });
            }

            // ============================================
            // FOOTER
            // ============================================
            const footerY = 760;
            doc.moveTo(30, footerY)
                .lineTo(565, footerY)
                .strokeColor(colors.gold)
                .lineWidth(1.5)
                .stroke();

            doc.fontSize(6)
                .font('Helvetica')
                .fillColor(colors.gray)
                .text(`Generated: ${formatKenyaFullTime(new Date())}`, 30, footerY + 6, { align: 'left' })
                .text('Parent Signature: ___________________', 30, footerY + 16, { align: 'left' });

            doc.fontSize(5)
                .font('Helvetica-Oblique')
                .fillColor(colors.gray)
                .text(`© ${new Date().getFullYear()} Changara Star Academy • "Nurturing Stars, Building Futures" • P.O Box 7, Cheptais`, 
                      30, footerY + 28, { align: 'center' });

            doc.end();
        } catch (error) {
            console.error('PDF generation error:', error);
            reject(error);
        }
    });
}
// ============================================
// HELPER: Generate Teacher Feedback
// ============================================
function generateTeacherFeedback(student) {
    const level = student.performanceLevel || 'Approaching Expectation';
    
    let feedback = '';
    
    if (level === 'Exceeding Expectation') {
        feedback = `Excellent performance! ${student.studentName || 'The student'} is demonstrating outstanding mastery of the learning outcomes. `;
    } else if (level === 'Meeting Expectation') {
        feedback = `Good progress! ${student.studentName || 'The student'} is meeting the expected learning outcomes. `;
    } else if (level === 'Approaching Expectation') {
        feedback = `${student.studentName || 'The student'} is making progress and approaching the expected learning outcomes. `;
    } else {
        feedback = `${student.studentName || 'The student'} needs additional support to meet the expected learning outcomes. `;
    }
    
    const strengths = (student.assessments || [])
        .filter(a => a.maxScore > 0 && ((a.score / a.maxScore) * 100) >= 50)
        .sort((a, b) => ((b.score / b.maxScore) * 100) - ((a.score / a.maxScore) * 100));
    
    if (strengths.length > 0) {
        feedback += `Strong performance in ${strengths.slice(0, 3).map(s => s.subject).join(', ')}. `;
    }
    
    const weaknesses = (student.assessments || [])
        .filter(a => a.maxScore > 0 && ((a.score / a.maxScore) * 100) < 41)
        .sort((a, b) => ((a.score / a.maxScore) * 100) - ((b.score / b.maxScore) * 100));
    
    if (weaknesses.length > 0) {
        feedback += `Areas for improvement: ${weaknesses.slice(0, 3).map(s => s.subject).join(', ')}. `;
    }
    
    if (level === 'Exceeding Expectation' || level === 'Meeting Expectation') {
        feedback += `Continue the excellent work. We are proud of your progress!`;
    } else {
        feedback += `With continued effort and practice, we are confident you will achieve the expected learning outcomes.`;
    }
    
    return feedback;
}

// ============================================
// PROFESSIONAL CLASS REPORT - CBC STYLE - FIXED
// ============================================
function generateClassReportPDF(students, grade, type, term, year, period) {
    return new Promise((resolve, reject) => {
        try {
            // ============================================
            // RECALCULATE ALL STUDENTS WITH CBC METHOD
            // ============================================
            students = students.map(s => {
                if (s.assessments && s.assessments.length > 0) {
                    // Validate and clean each assessment
                    s.assessments = s.assessments.map(a => {
                        const score = Math.min(a.score || 0, a.maxScore || 0);
                        const maxScore = a.maxScore || 1;
                        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
                        const level = calculatePerformanceLevel(percentage);
                        const rating = getPerformanceRating(level);
                        return {
                            subject: a.subject || 'Untitled',
                            maxScore: maxScore,
                            score: score,
                            percentage: parseFloat(percentage.toFixed(1)),
                            performanceLevel: level,
                            rating: rating
                        };
                    });
                    
                    // Calculate CBC overall (average of ratings)
                    const cbcResult = calculateStudentOverall(s.assessments);
                    s.totalScore = cbcResult.totalScore;
                    s.averageScore = cbcResult.averageScore;
                    s.performanceLevel = cbcResult.performanceLevel;
                    s.overallRating = cbcResult.overallRating;
                    s.levelDistribution = cbcResult.levelDistribution;
                }
                return s;
            });

            const doc = new PDFDocument({ 
                margin: 20, 
                size: 'A4',
                landscape: true
            });
            const chunks = [];
            
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            
            // ============================================
            // HEADER WITH LOGO
            // ============================================
            doc.fontSize(18)
                .font('Helvetica-Bold')
                .fillColor('#0A1628')
                .text('CHANGARA', 30, 15, { align: 'left', width: 150 });
            
            doc.fontSize(14)
                .font('Helvetica-Bold')
                .fillColor('#C9A84C')
                .text('STAR', 30, 33, { align: 'left', width: 150 });
            
            doc.fontSize(7)
                .font('Helvetica-Bold')
                .fillColor('#0A1628')
                .text('ACADEMY', 30, 48, { align: 'left', width: 150 });
            
            doc.fontSize(5)
                .font('Helvetica-Oblique')
                .fillColor('#C9A84C')
                .text('"Nurturing Stars, Building Futures"', 30, 57, { width: 150 });

            doc.fontSize(12)
                .font('Helvetica-Bold')
                .fillColor('#0A1628')
                .text(`${grade} - ${type || 'Monthly'} Assessment Results`, 190, 22, { align: 'center', width: 400 });
            
            doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#6c757d')
                .text(`${term || ''} ${year || ''} ${period ? '- ' + period : ''}`, 190, 38, { align: 'center', width: 400 });

            doc.moveTo(30, 65)
                .lineTo(770, 65)
                .strokeColor('#C9A84C')
                .lineWidth(1.5)
                .stroke();

            // ============================================
            // STATISTICS CARDS
            // ============================================
            const totalStudents = students.length;
            let exceeding = 0, meeting = 0, approaching = 0, below = 0;
            let totalAvg = 0;
            
            students.forEach(s => {
                const level = s.performanceLevel || 'Approaching Expectation';
                if (level === 'Exceeding Expectation') exceeding++;
                else if (level === 'Meeting Expectation') meeting++;
                else if (level === 'Approaching Expectation') approaching++;
                else below++;
                totalAvg += s.averageScore || 0;
            });
            
            const avgClass = totalStudents > 0 ? (totalAvg / totalStudents).toFixed(1) : 0;
            
            const stats = [
                { label: 'STUDENTS', value: totalStudents, color: '#0A1628' },
                { label: 'EE (4)', value: exceeding, color: '#1a8a3f' },
                { label: 'ME (3)', value: meeting, color: '#0d6efd' },
                { label: 'AE (2)', value: approaching, color: '#e6a800' },
                { label: 'BE (1)', value: below, color: '#dc3545' },
                { label: 'CLASS AVG', value: avgClass + '%', color: '#6f42c1' }
            ];
            
            const statsY = 72;
            const boxWidth = 115;
            stats.forEach((stat, i) => {
                const x = 35 + (i * (boxWidth + 8));
                doc.roundedRect(x, statsY, boxWidth, 30, 4)
                   .fillColor('#f8f9fa')
                   .fill()
                   .strokeColor('#dee2e6')
                   .lineWidth(0.5)
                   .roundedRect(x, statsY, boxWidth, 30, 4)
                   .stroke();
                
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .fillColor(stat.color)
                   .text(stat.value.toString(), x + 5, statsY + 3, { width: boxWidth - 10, align: 'center' });
                
                doc.fontSize(5)
                   .font('Helvetica-Bold')
                   .fillColor('#6c757d')
                   .text(stat.label, x + 5, statsY + 20, { width: boxWidth - 10, align: 'center' });
            });

            // ============================================
            // RUBRIC LEGEND
            // ============================================
            const legendY = statsY + 38;
            doc.fontSize(6)
               .font('Helvetica-Bold')
               .fillColor('#6c757d')
               .text('EE: Exceeding (75-100%)   ME: Meeting (41-74%)   AE: Approaching (21-40%)   BE: Below (0-20%)', 35, legendY);

            // ============================================
            // GET ALL SUBJECTS - ONLY FROM VALID STUDENTS
            // ============================================
            let allSubjects = [];
            students.forEach(s => {
                if (s.assessments && s.assessments.length > 0) {
                    s.assessments.forEach(a => {
                        if (a.subject && a.subject !== 'Untitled' && !allSubjects.includes(a.subject)) {
                            allSubjects.push(a.subject);
                        }
                    });
                }
            });
            allSubjects.sort();
            
            // If no subjects found, use default
            if (allSubjects.length === 0) {
                allSubjects = ['MATH', 'ENG', 'KIS', 'SCI', 'SST', 'CRE'];
            }
            
            // ============================================
            // TABLE HEADER
            // ============================================
            const tableTop = legendY + 12;
            const rankColWidth = 28;
            const nameColWidth = 80;
            const totalColWidth = 42;
            const avgColWidth = 42;
            const levelColWidth = 55;
            const subjectColWidth = Math.min(34, (730 - rankColWidth - nameColWidth - totalColWidth - avgColWidth - levelColWidth) / Math.max(1, allSubjects.length));
            
            // Calculate max scores for each subject
            const subjectMaxScores = {};
            allSubjects.forEach(subject => {
                let maxScore = 0;
                students.forEach(s => {
                    if (s.assessments) {
                        const found = s.assessments.find(a => a.subject === subject);
                        if (found && found.maxScore > maxScore) {
                            maxScore = found.maxScore;
                        }
                    }
                });
                subjectMaxScores[subject] = maxScore || 50; // Default max if not found
            });
            
            // Header background
            doc.rect(30, tableTop, 740, 16)
               .fillColor('#0A1628')
               .fill();
            
            let headerX = 35;
            doc.fontSize(6)
               .font('Helvetica-Bold')
               .fillColor('white');
            
            doc.text('Rank', headerX, tableTop + 4, { width: rankColWidth - 5, align: 'center' });
            headerX += rankColWidth;
            
            doc.text('Student', headerX, tableTop + 4, { width: nameColWidth - 5 });
            headerX += nameColWidth;
            
            allSubjects.forEach(subject => {
                const shortName = subject.length > 8 ? subject.substring(0, 6) + '..' : subject;
                doc.text(shortName, headerX + 2, tableTop + 4, { width: subjectColWidth - 4, align: 'center' });
                headerX += subjectColWidth;
            });
            
            doc.text('Total', headerX, tableTop + 4, { width: totalColWidth - 5, align: 'center' });
            headerX += totalColWidth;
            
            doc.text('Avg', headerX, tableTop + 4, { width: avgColWidth - 5, align: 'center' });
            headerX += avgColWidth;
            
            doc.text('Level', headerX, tableTop + 4, { width: levelColWidth - 5, align: 'center' });

            // ============================================
            // MAX SCORES ROW
            // ============================================
            let maxRowY = tableTop + 16;
            doc.rect(30, maxRowY, 740, 12)
               .fillColor('#f8f9fa')
               .fill();
            
            let maxX = 35;
            doc.fontSize(5)
               .font('Helvetica-Bold')
               .fillColor('#6c757d');
            
            doc.text('Max', maxX, maxRowY + 3, { width: rankColWidth - 5, align: 'center' });
            maxX += rankColWidth;
            maxX += nameColWidth;
            
            allSubjects.forEach(subject => {
                const maxScore = subjectMaxScores[subject] || 50;
                doc.text(maxScore.toString(), maxX + 2, maxRowY + 3, { width: subjectColWidth - 4, align: 'center' });
                maxX += subjectColWidth;
            });
            
            doc.text('', maxX, maxRowY + 3, { width: totalColWidth - 5, align: 'center' });
            maxX += totalColWidth;
            doc.text('', maxX, maxRowY + 3, { width: avgColWidth - 5, align: 'center' });
            maxX += avgColWidth;
            doc.text('', maxX, maxRowY + 3, { width: levelColWidth - 5, align: 'center' });

            // ============================================
            // STUDENT DATA ROWS
            // ============================================
            const sortedStudents = [...students].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
            let rowY = maxRowY + 12;
            let rowIndex = 0;
            
            // Max rows that fit on one page
            const maxRows = 28;
            const displayStudents = sortedStudents.slice(0, maxRows);
            
            displayStudents.forEach((student) => {
                const bgColor = rowIndex % 2 === 0 ? '#fafafa' : 'white';
                doc.rect(30, rowY, 740, 14)
                   .fillColor(bgColor)
                   .fill();
                
                let x = 35;
                const level = student.performanceLevel || 'Approaching Expectation';
                const levelColor = getPerformanceColor(level);
                const short = getPerformanceShort(level);
                const rating = student.overallRating || 2;
                const avgScore = student.averageScore ? student.averageScore.toFixed(1) : '0';
                const rank = rowIndex + 1;
                
                // Rank
                doc.fontSize(6)
                   .font('Helvetica-Bold')
                   .fillColor(rank <= 3 ? '#C9A84C' : '#6c757d')
                   .text(rank <= 3 ? ['🏆', '🥈', '🥉'][rank - 1] : rank.toString(), x, rowY + 2, { width: rankColWidth - 5, align: 'center' });
                x += rankColWidth;
                
                // Student Name - Clean the name (remove any prefixes like "0-1-")
                let cleanName = student.studentName || 'N/A';
                // Remove any number-prefix like "0-1-", "0-0-", etc.
                cleanName = cleanName.replace(/^[\d-]+/, '').trim();
                doc.fillColor('#0A1628')
                   .font('Helvetica-Bold')
                   .text(cleanName, x, rowY + 2, { width: nameColWidth - 5 });
                x += nameColWidth;
                
                // Subject scores
                allSubjects.forEach(subject => {
                    const assessment = student.assessments ? student.assessments.find(a => a.subject === subject) : null;
                    if (assessment) {
                        const percentage = assessment.maxScore > 0 ? ((assessment.score / assessment.maxScore) * 100) : 0;
                        let color = '#28a745';
                        if (percentage < 21) color = '#dc3545';
                        else if (percentage < 41) color = '#e6a800';
                        else if (percentage < 75) color = '#0d6efd';
                        doc.fillColor(color)
                           .font('Helvetica-Bold')
                           .text(assessment.score.toString(), x + 2, rowY + 2, { width: subjectColWidth - 4, align: 'center' });
                    } else {
                        doc.fillColor('#dee2e6')
                           .text('-', x + 2, rowY + 2, { width: subjectColWidth - 4, align: 'center' });
                    }
                    x += subjectColWidth;
                });
                
                // Total Score
                doc.fillColor('#C9A84C')
                   .font('Helvetica-Bold')
                   .text((student.totalScore || 0).toString(), x, rowY + 2, { width: totalColWidth - 5, align: 'center' });
                x += totalColWidth;
                
                // Average
                doc.fillColor('#0d6efd')
                   .text(avgScore + '%', x, rowY + 2, { width: avgColWidth - 5, align: 'center' });
                x += avgColWidth;
                
                // Performance Level with Rating
                const levelColors = {
                    'Exceeding Expectation': '#28a745',
                    'Meeting Expectation': '#0d6efd',
                    'Approaching Expectation': '#e6a800',
                    'Below Expectation': '#dc3545'
                };
                doc.fillColor(levelColors[level] || '#6c757d')
                   .text(`${short} (${rating})`, x, rowY + 2, { width: levelColWidth - 5, align: 'center' });
                
                rowY += 14;
                rowIndex++;
            });

            // If there are more students than fit, show count
            if (sortedStudents.length > maxRows) {
                doc.fontSize(6)
                   .font('Helvetica-Oblique')
                   .fillColor('#6c757d')
                   .text(`... and ${sortedStudents.length - maxRows} more students`, 35, rowY + 4);
                rowY += 18;
            }

            // ============================================
            // FOOTER
            // ============================================
            const footerY = Math.max(rowY + 16, 540);
            
            doc.moveTo(30, footerY)
                .lineTo(770, footerY)
                .strokeColor('#C9A84C')
                .lineWidth(1)
                .stroke();

            doc.fontSize(6)
                .font('Helvetica')
                .fillColor('#6c757d')
                .text(`Generated: ${formatKenyaFullTime(new Date())}`, 35, footerY + 6, { align: 'left' })
                .text('© 2026 Changara Star Academy • "Nurturing Stars, Building Futures" • P.O Box 7, Cheptais', 
                      35, footerY + 16, { align: 'center' });
            
            doc.end();
        } catch (error) {
            console.error('Class report generation error:', error);
            reject(error);
        }
    });
}

// ============================================
// FIX PAST RECORDS
// ============================================
async function fixPastRecords() {
    return { fixed: 0 };
}

// ============================================
// CONNECT TO MONGODB
// ============================================
async function connectToMongoDB(attempt = 1) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolDB';
    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            retryWrites: true
        });
        console.log('✅ MongoDB Connected');
        if (process.env.AUTO_FIX_PAST_RECORDS !== 'false') {
            setTimeout(fixPastRecords, 2000);
        }
    } catch (err) {
        const maxAttempts = 8;
        console.error(`❌ MongoDB connection attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
        if (attempt < maxAttempts) {
            const delayMs = Math.min(10000, 1000 * attempt);
            console.log(`Retrying MongoDB connection in ${delayMs / 1000}s...`);
            setTimeout(() => connectToMongoDB(attempt + 1), delayMs);
        } else {
            console.error('Server will continue without MongoDB until a connection is available.');
        }
    }
}

connectToMongoDB();

// ============================================
// FILE UPLOAD SETUP
// ============================================
const uploadDirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads/images'),
    path.join(__dirname, 'uploads/videos'),
    path.join(__dirname, 'uploads/audio'),
    path.join(__dirname, 'uploads/assignments')
];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const isAssignmentUpload = req.originalUrl.includes('holiday-assignments');
        if (isAssignmentUpload) {
            cb(null, path.join(__dirname, 'uploads/assignments'));
            return;
        }

        let folder = path.join(__dirname, 'uploads');
        if (file.mimetype.startsWith('image/')) {
            folder = path.join(__dirname, 'uploads/images');
        } else if (file.mimetype.startsWith('video/')) {
            folder = path.join(__dirname, 'uploads/videos');
        } else if (file.mimetype.startsWith('audio/')) {
            folder = path.join(__dirname, 'uploads/audio');
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
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('File type not allowed.'), false);
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
    heroSubtitle: { type: String, default: 'Your trusted partner in quality education' },
    heroButtonText: { type: String, default: 'Learn More' },
    heroButtonLink: { type: String, default: '/about.html' },
    heroVideo: { type: String, default: '' },
    applyButtonText: { type: String, default: 'Apply Now' },
    homeCarousel: [{ badge: { type: String, default: 'Featured' }, title: { type: String, default: 'Welcome to our school' }, body: { type: String, default: 'Explore the latest updates from Changara Star Academy.' }, link: { type: String, default: '' } }],
    homeFeatures: [{ icon: { type: String, default: '📚' }, title: { type: String, default: 'Quality Education' }, description: { type: String, default: 'Holistic education that nurtures talent.' } }],
    homeStats: [{ number: { type: String, default: '500+' }, label: { type: String, default: 'Students' } }],
    homeNews: [{ title: { type: String, default: 'Latest News' }, content: { type: String, default: 'Stay updated with our latest announcements.' }, date: { type: Date, default: Date.now } }],
    aboutMission: { type: String, default: 'To provide quality education that nurtures talent, builds character, and prepares students for a successful future.' },
    aboutVision: { type: String, default: 'To be a center of excellence in education.' },
    aboutValues: { type: String, default: 'Excellence, Integrity, Respect, Innovation' },
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
    seoDescription: { type: String, default: 'Changara Star Academy - Excellence in Education.' },
    seoKeywords: { type: String, default: 'school, education, academy, Kenya' },
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

// Subject Config Schema
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

// Holiday Assignment Schema
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
    cloudinaryPublicId: { type: String, default: '' },
    fileData: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: '' },
    deletedReason: { type: String, default: '' },
    lastAccessed: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'holidayassignments' });

const HolidayAssignment = mongoose.model('HolidayAssignment', holidayAssignmentSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: 'School Fees' },
    method: { type: String, default: 'MPESA' },
    reference: { type: String, default: '' },
    notes: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    categories: { type: Map, of: Number, default: {} }
});

const Payment = mongoose.model('Payment', paymentSchema);

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDefaultSubjects(grade, type) {
    const fallback = [
        { name: 'MATHEMATICS', max: 50 }, 
        { name: 'ENGLISH', max: 50 }, 
        { name: 'KISWAHILI', max: 50 }, 
        { name: 'SCIENCE', max: 50 }, 
        { name: 'SOCIAL STUDIES', max: 50 }, 
        { name: 'CREATIVE ARTS', max: 50 }
    ];
    return fallback;
}

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
    if (type === 'Boarder' || type === 'boarder') {
        return boardingFees[grade] || dayFees[grade] || { term1: 0, term2: 0, term3: 0, total: 0 };
    }
    return dayFees[grade] || { term1: 0, term2: 0, term3: 0, total: 0 };
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
            if (key === 'homeCarousel' && Array.isArray(req.body.homeCarousel)) {
                content.homeCarousel = req.body.homeCarousel;
            } else if (key === 'homeFeatures' && Array.isArray(req.body.homeFeatures)) {
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
        if (!firstName || !lastName || !email || !password || !employeeId) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }
        const existing = await Teacher.findOne({ $or: [{ email }, { employeeId }] });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Teacher already exists' });
        }
        const teacher = new Teacher({
            firstName,
            lastName,
            email,
            password,
            employeeId,
            phoneNumber: phoneNumber || '',
            department: department || 'Teaching'
        });
        await teacher.save();
        res.status(201).json({ success: true, message: 'Teacher registered successfully!', teacher: { id: teacher._id, employeeId: teacher.employeeId, name: `${teacher.firstName} ${teacher.lastName}` } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/teacher/checkin', async (req, res) => {
    try {
        const { employeeId, pin } = req.body;
        const teacher = await Teacher.findOne({ employeeId });
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Staff not found. Please contact admin.' });
        }
        if (teacher.password !== pin) {
            return res.status(401).json({ success: false, message: 'Invalid PIN. Please try again.' });
        }
        const kenyaNow = getKenyaTime();
        const kenyaToday = getKenyaDate();
        const kenyaHour = getKenyaHour();
        const dayOfWeek = kenyaNow.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return res.status(400).json({ success: false, message: 'Weekend! Check-in is only available on weekdays (Monday-Friday).' });
        }
        const existingAttendance = teacher.attendance.find(a => {
            const aDate = new Date(a.date);
            aDate.setHours(0, 0, 0, 0);
            return aDate.getTime() === kenyaToday.getTime();
        });
        if (existingAttendance) {
            return res.status(400).json({ success: false, message: 'You already checked in today at ' + formatKenyaTime(existingAttendance.checkIn) });
        }
        if (kenyaHour >= 17) {
            return res.status(400).json({ success: false, message: 'Check-in is not allowed after 5:00 PM. Please try again tomorrow.' });
        }
        const isLate = kenyaHour > 7 || (kenyaHour === 7 && kenyaNow.getMinutes() > 0);
        const status = isLate ? 'Late' : 'Present';
        teacher.attendance.push({
            date: kenyaToday,
            checkIn: kenyaNow,
            status: status,
            location: 'School',
            isLate: isLate,
            notes: isLate ? 'Late check-in' : 'On-time check-in'
        });
        await teacher.save();
        const message = isLate ? 'Check-in successful! (You are LATE - after 7:00 AM)' : 'Check-in successful! (On time)';
        const formattedTime = formatKenyaTime(kenyaNow);
        res.json({
            success: true,
            message: message,
            checkInTime: kenyaNow,
            checkInTimeFormatted: formattedTime,
            isLate: isLate,
            status: status,
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
            return res.status(404).json({ success: false, message: 'Staff not found. Please contact admin.' });
        }
        if (teacher.password !== pin) {
            return res.status(401).json({ success: false, message: 'Invalid PIN. Please try again.' });
        }
        const kenyaNow = getKenyaTime();
        const kenyaToday = getKenyaDate();
        const todayAttendance = teacher.attendance.find(a => {
            const aDate = new Date(a.date);
            aDate.setHours(0, 0, 0, 0);
            return aDate.getTime() === kenyaToday.getTime();
        });
        if (!todayAttendance) {
            return res.status(400).json({ success: false, message: 'No check-in found for today. Please check in first.' });
        }
        if (todayAttendance.checkOut) {
            return res.status(400).json({ success: false, message: 'You already checked out today at ' + formatKenyaTime(todayAttendance.checkOut) });
        }
        todayAttendance.checkOut = kenyaNow;
        todayAttendance.notes = (todayAttendance.notes || '') + ' Checked out';
        const checkInTime = new Date(todayAttendance.checkIn);
        const hoursWorked = ((kenyaNow - checkInTime) / (1000 * 60 * 60)).toFixed(2);
        todayAttendance.hoursWorked = parseFloat(hoursWorked);
        todayAttendance.status = todayAttendance.isLate ? 'Late' : 'Present';
        await teacher.save();
        res.json({
            success: true,
            message: 'Check-out successful!',
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
        const attended = totalPresent + totalLate;
        res.json({ success: true, today: { date: kenyaToday, total: totalTeachers, present: totalPresent, late: totalLate, absent: totalAbsent, attendanceRate: totalTeachers > 0 ? ((attended / totalTeachers) * 100).toFixed(2) : 0 } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// VISITOR ROUTES
// ============================================

app.post('/api/visitor/checkin', async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, idNumber, email, purpose, purposeDetails, personToVisit, department, hostName, notes } = req.body;
        if (!firstName || !lastName || !phoneNumber || !idNumber || !purpose || !personToVisit) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }
        const badgeNumber = `V${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const kenyaNow = getKenyaTime();
        const visitor = new Visitor({
            firstName: firstName.trim(), lastName: lastName.trim(), phoneNumber: phoneNumber.trim(), idNumber: idNumber.trim(),
            email: email || '', purpose, purposeDetails: purposeDetails || '', personToVisit: personToVisit.trim(),
            department: department || '', hostName: hostName || '', notes: notes || '', badgeNumber, checkIn: kenyaNow, status: 'Checked In'
        });
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

app.get('/api/students', async (req, res) => {
    try {
        const students = await Student.find({ isActive: true }).sort({ studentId: 1 });
        res.json({ success: true, students });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

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

app.post('/api/students', async (req, res) => {
    try {
        const { name, grade, gender, type, guardian, pin } = req.body;
        if (!name || !grade || !gender) {
            return res.status(400).json({ success: false, message: 'Name, Grade, and Gender are required' });
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
            message: `Student ${studentId} added successfully!`,
            student
        });
    } catch (error) {
        console.error('Error adding student:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

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
            message: `Student ${student.studentId} updated successfully!`,
            student
        });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

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
            message: `Student ${student.studentId} deleted successfully!`
        });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/students/clear', async (req, res) => {
    try {
        await Student.deleteMany({});
        res.json({ success: true, message: 'All students cleared successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

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
            message: `Payment of KES ${amount.toLocaleString()} recorded for ${student.name}`,
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
// STUDENT ASSESSMENT ROUTES - COMPLETE FIXED
// ============================================

app.get('/api/assessments/students/:grade', async (req, res) => {
    try {
        const { grade } = req.params;
        const students = await Student.find({ grade: grade, isActive: true }).sort({ studentId: 1 });
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

// ============================================
// SUBJECT CONFIG ROUTES (WORKING)
// ============================================

app.get('/api/assessments/subjects/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        const type = req.query.type || 'monthly';
        const period = req.query.period || '';
        const db = mongoose.connection.db;
        const collection = db.collection('subjectconfigs_new');
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
                    exceeding: { min: 75, max: 100, label: 'Exceeding Expectation', short: 'EE', rating: 4, color: '#1a8a3f' },
                    meeting: { min: 41, max: 74, label: 'Meeting Expectation', short: 'ME', rating: 3, color: '#0d6efd' },
                    approaching: { min: 21, max: 40, label: 'Approaching Expectation', short: 'AE', rating: 2, color: '#e6a800' },
                    below: { min: 0, max: 20, label: 'Below Expectation', short: 'BE', rating: 1, color: '#dc3545' }
                },
                updatedAt: new Date()
            };
            await collection.insertOne(config);
            console.log('Created default config for:', grade, type, period);
        }
        res.json({ success: true, config });
    } catch (error) {
        console.error('GET error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/assessments/subjects/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        const { type, period } = req.query;
        if (!type) {
            return res.status(400).json({ success: false, message: 'Type is required' });
        }
        const db = mongoose.connection.db;
        const collection = db.collection('subjectconfigs_new');
        const query = { grade: grade, type: type };
        if (period) query.period = period;
        const result = await collection.deleteMany(query);
        console.log(`Deleted ${result.deletedCount} configs for ${grade} (${type})`);
        res.json({ success: true, message: `Deleted config for ${grade} (${type})`, deleted: result.deletedCount });
    } catch (error) {
        console.log('Delete error:', error);
        res.json({ success: true, message: `Config for ${grade} cleared`, deleted: 0 });
    }
});

app.put('/api/assessments/subjects/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        const { type, period, subjects, rankLevels, rubric } = req.body;
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
        const cleanedSubjects = subjects.map(s => ({
            name: s.name.trim(),
            max: s.max
        }));
        const db = mongoose.connection.db;
        const collection = db.collection('subjectconfigs_new');
        const query = { grade: grade, type: type };
        if (period) query.period = period;
        await collection.deleteMany(query);
        const newConfig = {
            grade: grade,
            type: type,
            period: period || '',
            subjects: cleanedSubjects,
            rankLevels: rankLevels || ['Below Expectation', 'Approaching Expectation', 'Meeting Expectation', 'Exceeding Expectation'],
            rubric: rubric || {
                exceeding: { min: 75, max: 100, label: 'Exceeding Expectation', short: 'EE', rating: 4, color: '#1a8a3f' },
                meeting: { min: 41, max: 74, label: 'Meeting Expectation', short: 'ME', rating: 3, color: '#0d6efd' },
                approaching: { min: 21, max: 40, label: 'Approaching Expectation', short: 'AE', rating: 2, color: '#e6a800' },
                below: { min: 0, max: 20, label: 'Below Expectation', short: 'BE', rating: 1, color: '#dc3545' }
            },
            updatedAt: new Date()
        };
        await collection.insertOne(newConfig);
        console.log(`Inserted new config for ${grade} (${type}) ${period ? 'period: '+period : ''}`);
        
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
        res.json({ success: true, message: 'Subject configuration saved successfully!', config: newConfig });
    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ success: false, message: 'Error saving subjects: ' + error.message });
    }
});

// ============================================
// ASSESSMENT ROUTES
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

// ============================================
// DOWNLOAD STUDENT REPORT - FIXED
// ============================================
app.get('/api/assessments/download-report/:studentId', async (req, res) => {
    try {
        const student = await StudentAssessment.findById(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        // ============================================
        // RECALCULATE AND VALIDATE DATA
        // ============================================
        let validAssessments = [];
        
        if (student.assessments && student.assessments.length > 0) {
            validAssessments = student.assessments.map(a => {
                // Ensure score doesn't exceed max
                const score = Math.min(a.score || 0, a.maxScore || 0);
                const maxScore = a.maxScore || 1;
                const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
                const level = calculatePerformanceLevel(percentage);
                const rating = getPerformanceRating(level);
                
                return {
                    subject: a.subject || 'Untitled',
                    maxScore: maxScore,
                    score: score,
                    percentage: parseFloat(percentage.toFixed(1)),
                    performanceLevel: level,
                    rating: rating
                };
            });
        }
        
        // Calculate CBC overall
        const cbcResult = calculateStudentOverall(validAssessments);
        
        // Update student object with validated data
        student.assessments = validAssessments;
        student.totalScore = cbcResult.totalScore;
        student.averageScore = cbcResult.averageScore;
        student.performanceLevel = cbcResult.performanceLevel;
        student.overallRating = cbcResult.overallRating;
        student.levelDistribution = cbcResult.levelDistribution;
        student.subjectCount = cbcResult.subjectCount;
        
        // Generate PDF
        const pdfBuffer = await generateStudentReportPDF(student);
        
        const filename = `student_report_${student.studentName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ success: false, message: 'Error generating PDF: ' + error.message });
    }
});
app.get('/api/assessments/generate-report/:studentId', async (req, res) => {
    try {
        const student = await StudentAssessment.findById(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        // ✅ RECALCULATE before generating PDF
        if (student.assessments) {
            student.assessments = student.assessments.map(a => {
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
        }
        const overall = calculateStudentOverall(student.assessments || []);
        student.totalScore = overall.totalScore;
        student.averageScore = overall.averageScore;
        student.performanceLevel = overall.performanceLevel;
        student.overallRating = overall.overallRating;
        
        const pdfBuffer = await generateStudentReportPDF(student);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="student_report_${student.studentName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ success: false, message: 'Error generating PDF: ' + error.message });
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
        
        // ✅ RECALCULATE before generating PDF
        if (latest.assessments) {
            latest.assessments = latest.assessments.map(a => {
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
        }
        const overall = calculateStudentOverall(latest.assessments || []);
        latest.totalScore = overall.totalScore;
        latest.averageScore = overall.averageScore;
        latest.performanceLevel = overall.performanceLevel;
        latest.overallRating = overall.overallRating;
        
        const pdfBuffer = await generateStudentReportPDF(latest);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="comprehensive_report_${studentName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ success: false, message: 'Error generating PDF: ' + error.message });
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
// DOWNLOAD CLASS REPORT
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
        const pdfBuffer = await generateClassReportPDF(students, grade, type, term, year, period);
        
        const periodLabel = period ? `_${period}` : '';
        const filename = `grade_report_${grade}_${type || 'monthly'}_${term || 'all'}_${year || '2026'}${periodLabel}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error generating class PDF:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// HOLIDAY ASSIGNMENTS - COMPLETE ROUTES
// ============================================

// GET all assignments
app.get('/api/holiday-assignments/all', async (req, res) => {
    try {
        console.log('📡 GET /api/holiday-assignments/all');
        const assignments = await HolidayAssignment.find({}).sort({ createdAt: -1 });
        console.log(`📚 Found ${assignments.length} assignments`);
        res.json({ success: true, assignments });
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET assignments by grade
app.get('/api/holiday-assignments/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        console.log(`📡 GET /api/holiday-assignments/${grade}`);
        
        if (grade === 'all') {
            const assignments = await HolidayAssignment.find({}).sort({ createdAt: -1 });
            return res.json({ success: true, assignments });
        }
        
        const assignments = await HolidayAssignment.find({ grade: grade }).sort({ createdAt: -1 });
        console.log(`📚 Found ${assignments.length} assignments for grade ${grade}`);
        res.json({ success: true, assignments });
    } catch (error) {
        console.error('Error fetching assignments by grade:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET single assignment by ID
app.get('/api/holiday-assignments/id/:id', async (req, res) => {
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

// POST - Upload assignment (Stored in Database as Base64)
app.post('/api/holiday-assignments', upload.single('file'), async (req, res) => {
    try {
        console.log('📤 POST /api/holiday-assignments');
        console.log('Body:', req.body);
        console.log('File:', req.file);
        
        const { title, grade, subject, description } = req.body;
        
        if (!title || !grade) {
            return res.status(400).json({ success: false, message: 'Title and Grade are required' });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload a file' });
        }
        
        // Read file and convert to Base64
        const fileBuffer = fs.readFileSync(req.file.path);
        const base64File = fileBuffer.toString('base64');
        
        console.log(`📄 File read: ${req.file.originalname}, Size: ${fileBuffer.length} bytes`);
        console.log(`📄 Base64 size: ${base64File.length} characters`);
        
        const fileName = req.file.originalname;
        const fileType = fileName.split('.').pop().toLowerCase();
        const fileSize = req.file.size;
        
        // Save to database - file is stored as Base64 in MongoDB
        const assignment = new HolidayAssignment({
            title,
            grade,
            subject: subject || '',
            description: description || '',
            fileName,
            fileUrl: `/api/holiday-assignments/download/${Date.now()}_${fileName}`,
            fileType,
            fileSize,
            uploadedBy: req.body.uploadedBy || 'Admin',
            cloudinaryPublicId: '',
            fileData: base64File,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        await assignment.save();
        
        // Delete local file after saving to database
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log('🗑️ Local file deleted (stored in database)');
        }
        
        console.log('✅ Assignment saved to database:', assignment._id);
        console.log(`📁 File stored in MongoDB (${base64File.length} chars)`);
        
        res.status(201).json({
            success: true,
            message: 'Assignment uploaded successfully! (Stored in database)',
            assignment: {
                id: assignment._id,
                title: assignment.title,
                grade: assignment.grade,
                fileName: assignment.fileName,
                fileUrl: `/api/holiday-assignments/download/${assignment._id}`,
                storedIn: 'MongoDB (Base64)',
                fileSize: assignment.fileSize
            }
        });
    } catch (error) {
        console.error('❌ Error uploading assignment:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
});

// PUT - Update assignment
app.put('/api/holiday-assignments/:id', upload.single('file'), async (req, res) => {
    try {
        console.log('📝 Update request for:', req.params.id);
        
        const assignment = await HolidayAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }

        const { title, grade, subject, description, isActive } = req.body;
        
        if (title) assignment.title = title;
        if (grade) assignment.grade = grade;
        if (subject !== undefined) assignment.subject = subject;
        if (description !== undefined) assignment.description = description;
        if (isActive !== undefined) assignment.isActive = isActive === 'true' || isActive === true;

        if (req.file) {
            console.log('📄 New file uploaded:', req.file.originalname);
            
            const oldFilename = path.basename(assignment.fileUrl);
            const oldFilePath = path.join(__dirname, 'uploads', 'assignments', oldFilename);
            
            const fileBuffer = fs.readFileSync(req.file.path);
            let fileUrl = '';
            let cloudinaryPublicId = '';
            
            if (isCloudinaryConfigured()) {
                try {
                    if (assignment.cloudinaryPublicId) {
                        try {
                            await cloudinary.uploader.destroy(assignment.cloudinaryPublicId);
                            console.log('🗑️ Deleted old file from Cloudinary');
                        } catch (e) {
                            console.log('⚠️ Could not delete old file from Cloudinary:', e.message);
                        }
                    }
                    
                    const cloudinaryResult = await uploadToCloudinary(fileBuffer, req.file.originalname, 'assignments');
                    fileUrl = cloudinaryResult.secure_url;
                    cloudinaryPublicId = cloudinaryResult.public_id;
                    console.log('✅ Uploaded new file to Cloudinary:', fileUrl);
                    
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                        console.log('🗑️ Deleted old local file');
                    }
                    
                    if (fs.existsSync(req.file.path)) {
                        fs.unlinkSync(req.file.path);
                        console.log('🗑️ Temp file deleted');
                    }
                } catch (cloudinaryError) {
                    console.error('⚠️ Cloudinary upload failed:', cloudinaryError.message);
                    fileUrl = `/uploads/assignments/${req.file.filename}`;
                    console.log('📁 Using local file:', fileUrl);
                }
            } else {
                fileUrl = `/uploads/assignments/${req.file.filename}`;
                console.log('📁 Cloudinary not configured, using local file:', fileUrl);
            }
            
            assignment.fileUrl = fileUrl;
            assignment.cloudinaryPublicId = cloudinaryPublicId || '';
            assignment.fileName = req.file.originalname;
            assignment.fileType = req.file.originalname.split('.').pop().toLowerCase();
            assignment.fileSize = req.file.size;
        }

        assignment.updatedAt = new Date();
        await assignment.save();

        console.log('✅ Assignment updated successfully:', assignment._id);
        res.json({ 
            success: true, 
            message: 'Assignment updated successfully!', 
            assignment 
        });
    } catch (error) {
        console.error('❌ Error updating assignment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DOWNLOAD assignment file - FROM DATABASE
app.get('/api/holiday-assignments/download/:id', async (req, res) => {
    try {
        console.log('📥 GET /api/holiday-assignments/download/', req.params.id);
        
        let assignment = await HolidayAssignment.findById(req.params.id);
        
        if (!assignment) {
            assignment = await HolidayAssignment.findOne({ 
                fileUrl: { $regex: req.params.id } 
            });
        }
        
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        
        console.log('📄 Assignment found:', assignment.title);
        console.log('📁 File name:', assignment.fileName);
        console.log('📊 File data size:', assignment.fileData ? assignment.fileData.length : 0);
        
        if (!assignment.fileData || assignment.fileData === '') {
            return res.status(404).json({ 
                success: false, 
                message: 'File data not found in database. Please re-upload.',
                details: {
                    title: assignment.title,
                    fileName: assignment.fileName
                }
            });
        }
        
        const fileBuffer = Buffer.from(assignment.fileData, 'base64');
        console.log(`📄 File size: ${fileBuffer.length} bytes`);
        
        const mimeType = assignment.fileType === 'pdf' ? 'application/pdf' :
                         assignment.fileType === 'doc' ? 'application/msword' :
                         assignment.fileType === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                         assignment.fileType === 'jpg' || assignment.fileType === 'jpeg' ? 'image/jpeg' :
                         assignment.fileType === 'png' ? 'image/png' :
                         'application/octet-stream';
        
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${assignment.fileName}"`);
        res.setHeader('Content-Length', fileBuffer.length);
        res.send(fileBuffer);
        
    } catch (error) {
        console.error('❌ Download error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE - Delete assignment with confirmation
app.delete('/api/holiday-assignments/:id', async (req, res) => {
    try {
        const { confirm } = req.query;
        if (confirm !== 'yes') {
            return res.status(400).json({ 
                success: false, 
                message: '⚠️ Deletion requires confirmation. Use ?confirm=yes to proceed.' 
            });
        }
        
        const assignment = await HolidayAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        
        console.log('🗑️ DELETING assignment:', assignment.title);
        console.log('  Grade:', assignment.grade);
        console.log('  File:', assignment.fileName);
        console.log('  Cloudinary ID:', assignment.cloudinaryPublicId || 'None');
        
        if (assignment.cloudinaryPublicId && isCloudinaryConfigured()) {
            try {
                await cloudinary.uploader.destroy(assignment.cloudinaryPublicId);
                console.log('🗑️ Deleted from Cloudinary:', assignment.cloudinaryPublicId);
            } catch (cloudinaryError) {
                console.error('Cloudinary delete error:', cloudinaryError);
            }
        }
        
        const filename = path.basename(assignment.fileUrl);
        const filePath = path.join(__dirname, 'uploads', 'assignments', filename);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('🗑️ Local file deleted:', filePath);
        }
        
        await HolidayAssignment.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Assignment deleted successfully!' });
    } catch (error) {
        console.error('Error deleting assignment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// SOFT DELETE - Mark as inactive
app.delete('/api/holiday-assignments/soft/:id', async (req, res) => {
    try {
        const assignment = await HolidayAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        
        assignment.isActive = false;
        assignment.deletedAt = new Date();
        assignment.deletedBy = req.headers['x-user'] || 'Unknown';
        await assignment.save();
        
        console.log('🔵 Soft deleted assignment:', assignment.title);
        
        res.json({ 
            success: true, 
            message: 'Assignment moved to trash. It can be restored.',
            assignment
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// RESTORE - Bring back soft deleted assignment
app.post('/api/holiday-assignments/restore/:id', async (req, res) => {
    try {
        const assignment = await HolidayAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        
        assignment.isActive = true;
        assignment.deletedAt = null;
        assignment.deletedBy = '';
        await assignment.save();
        
        res.json({ 
            success: true, 
            message: 'Assignment restored successfully!',
            assignment
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET assignments with filters (search)
app.get('/api/holiday-assignments/search', async (req, res) => {
    try {
        const { grade, title, subject } = req.query;
        let filter = {};
        
        if (grade) filter.grade = grade;
        if (subject) filter.subject = { $regex: subject, $options: 'i' };
        if (title) filter.title = { $regex: title, $options: 'i' };
        
        const assignments = await HolidayAssignment.find(filter).sort({ createdAt: -1 });
        res.json({ success: true, assignments, count: assignments.length });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET all grades that have assignments
app.get('/api/holiday-assignments/grades/list', async (req, res) => {
    try {
        const grades = await HolidayAssignment.distinct('grade');
        res.json({ success: true, grades });
    } catch (error) {
        console.error('Error fetching grades:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET assignment statistics
app.get('/api/holiday-assignments/stats', async (req, res) => {
    try {
        const total = await HolidayAssignment.countDocuments();
        const byGrade = await HolidayAssignment.aggregate([
            { $group: { _id: '$grade', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        
        const recent = await HolidayAssignment.find({})
            .sort({ createdAt: -1 })
            .limit(5);
        
        res.json({
            success: true,
            stats: {
                total,
                byGrade,
                recent: recent.map(a => ({
                    id: a._id,
                    title: a.title,
                    grade: a.grade,
                    createdAt: a.createdAt
                }))
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// TEST ROUTE FOR HOLIDAY ASSIGNMENTS
// ============================================

app.get('/api/holiday-assignments/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Holiday assignment routes are working!',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// STAFF & VISITOR REPORTS
// ============================================

// GET staff attendance report
app.get('/api/reports/staff/attendance', async (req, res) => {
    try {
        console.log('📡 GET /api/reports/staff/attendance');
        const { period, date, department } = req.query;
        
        const query = { isActive: true };
        if (department) query.department = department;
        
        const teachers = await Teacher.find(query);
        const report = [];
        let targetDate = null;
        
        if (date) {
            targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
        } else {
            targetDate = getKenyaDate();
        }
        
        let weekStart = null, weekEnd = null, monthStart = null, monthEnd = null;
        
        if (period === 'weekly') {
            weekStart = new Date(targetDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);
        } else if (period === 'monthly') {
            monthStart = new Date(targetDate);
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            monthEnd = new Date(monthStart);
            monthEnd.setMonth(monthEnd.getMonth() + 1);
        }
        
        for (const teacher of teachers) {
            let attendance = teacher.attendance || [];
            
            if (period === 'daily' && targetDate) {
                attendance = attendance.filter(a => {
                    const aDate = new Date(a.date);
                    aDate.setHours(0, 0, 0, 0);
                    return aDate.getTime() === targetDate.getTime();
                });
            } else if (period === 'weekly' && weekStart) {
                attendance = attendance.filter(a => {
                    const aDate = new Date(a.date);
                    return aDate >= weekStart && aDate < weekEnd;
                });
            } else if (period === 'monthly' && monthStart) {
                attendance = attendance.filter(a => {
                    const aDate = new Date(a.date);
                    return aDate >= monthStart && aDate < monthEnd;
                });
            }
            
            const totalDays = attendance.length;
            const onTime = attendance.filter(a => a.isLate === false).length;
            const late = attendance.filter(a => a.isLate === true).length;
            
            let absent = 0;
            if (period === 'daily' && targetDate) {
                absent = totalDays === 0 ? 1 : 0;
            }
            
            report.push({
                name: `${teacher.firstName} ${teacher.lastName}`,
                employeeId: teacher.employeeId,
                department: teacher.department || 'Teaching',
                totalDays: totalDays || 0,
                onTime: onTime || 0,
                late: late || 0,
                absent: absent || 0
            });
        }
        
        res.json({ success: true, report });
    } catch (error) {
        console.error('Error generating staff report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET staff report PDF download
app.get('/api/reports/staff/download-pdf', async (req, res) => {
    try {
        const { period, date, department } = req.query;
        
        const query = { isActive: true };
        if (department) query.department = department;
        
        const teachers = await Teacher.find(query);
        const report = [];
        let targetDate = null;
        
        if (date) {
            targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
        } else {
            targetDate = getKenyaDate();
        }
        
        let weekStart = null, weekEnd = null, monthStart = null, monthEnd = null;
        
        if (period === 'weekly') {
            weekStart = new Date(targetDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);
        } else if (period === 'monthly') {
            monthStart = new Date(targetDate);
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            monthEnd = new Date(monthStart);
            monthEnd.setMonth(monthEnd.getMonth() + 1);
        }
        
        for (const teacher of teachers) {
            let attendance = teacher.attendance || [];
            
            if (period === 'daily' && targetDate) {
                attendance = attendance.filter(a => {
                    const aDate = new Date(a.date);
                    aDate.setHours(0, 0, 0, 0);
                    return aDate.getTime() === targetDate.getTime();
                });
            } else if (period === 'weekly' && weekStart) {
                attendance = attendance.filter(a => {
                    const aDate = new Date(a.date);
                    return aDate >= weekStart && aDate < weekEnd;
                });
            } else if (period === 'monthly' && monthStart) {
                attendance = attendance.filter(a => {
                    const aDate = new Date(a.date);
                    return aDate >= monthStart && aDate < monthEnd;
                });
            }
            
            const totalDays = attendance.length;
            const onTime = attendance.filter(a => a.isLate === false).length;
            const late = attendance.filter(a => a.isLate === true).length;
            
            let absent = 0;
            if (period === 'daily' && targetDate) {
                absent = totalDays === 0 ? 1 : 0;
            }
            
            report.push({
                name: `${teacher.firstName} ${teacher.lastName}`,
                employeeId: teacher.employeeId,
                department: teacher.department || 'Teaching',
                totalDays: totalDays || 0,
                onTime: onTime || 0,
                late: late || 0,
                absent: absent || 0
            });
        }
        
        const periodLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
        const pdfBuffer = await generateStaffReportPDF(report, `${periodLabel} Staff Attendance Report - ${date || 'Today'}`);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="staff_attendance_report_${period}_${date || 'today'}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error generating staff PDF:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET visitor report
app.get('/api/reports/visitors', async (req, res) => {
    try {
        console.log('📡 GET /api/reports/visitors');
        const { period, date, purpose } = req.query;
        
        let query = {};
        let targetDate = null;
        
        if (date) {
            targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
            const nextDay = new Date(targetDate);
            nextDay.setDate(nextDay.getDate() + 1);
            query.checkIn = { $gte: targetDate, $lt: nextDay };
        } else {
            targetDate = getKenyaDate();
            const nextDay = new Date(targetDate);
            nextDay.setDate(nextDay.getDate() + 1);
            query.checkIn = { $gte: targetDate, $lt: nextDay };
        }
        
        if (purpose) query.purpose = purpose;
        
        let visitors = await Visitor.find(query).sort({ checkIn: -1 });
        
        if (period === 'weekly' && targetDate) {
            const weekStart = new Date(targetDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            visitors = visitors.filter(v => v.checkIn >= weekStart);
        } else if (period === 'monthly' && targetDate) {
            const monthStart = new Date(targetDate);
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            visitors = visitors.filter(v => v.checkIn >= monthStart);
        }
        
        const report = visitors.map(v => ({
            fullName: `${v.firstName} ${v.lastName}`,
            firstName: v.firstName,
            lastName: v.lastName,
            badgeNumber: v.badgeNumber,
            purpose: v.purpose,
            personToVisit: v.personToVisit,
            checkIn: v.checkIn,
            checkOut: v.checkOut,
            status: v.status,
            duration: v.checkOut ? Math.round((v.checkOut - v.checkIn) / 1000 / 60) : 0,
            checkInTime: formatKenyaTime(v.checkIn),
            checkOutTime: v.checkOut ? formatKenyaTime(v.checkOut) : null
        }));
        
        res.json({ success: true, report });
    } catch (error) {
        console.error('Error generating visitor report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET visitor report PDF download
app.get('/api/reports/visitors/download-pdf', async (req, res) => {
    try {
        const { period, date, purpose } = req.query;
        
        let query = {};
        let targetDate = null;
        
        if (date) {
            targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
            const nextDay = new Date(targetDate);
            nextDay.setDate(nextDay.getDate() + 1);
            query.checkIn = { $gte: targetDate, $lt: nextDay };
        } else {
            targetDate = getKenyaDate();
            const nextDay = new Date(targetDate);
            nextDay.setDate(nextDay.getDate() + 1);
            query.checkIn = { $gte: targetDate, $lt: nextDay };
        }
        
        if (purpose) query.purpose = purpose;
        
        let visitors = await Visitor.find(query).sort({ checkIn: -1 });
        
        if (period === 'weekly' && targetDate) {
            const weekStart = new Date(targetDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            visitors = visitors.filter(v => v.checkIn >= weekStart);
        } else if (period === 'monthly' && targetDate) {
            const monthStart = new Date(targetDate);
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            visitors = visitors.filter(v => v.checkIn >= monthStart);
        }
        
        const report = visitors.map(v => ({
            fullName: `${v.firstName} ${v.lastName}`,
            firstName: v.firstName,
            lastName: v.lastName,
            badgeNumber: v.badgeNumber,
            purpose: v.purpose,
            personToVisit: v.personToVisit,
            checkIn: v.checkIn,
            checkOut: v.checkOut,
            status: v.status,
            duration: v.checkOut ? Math.round((v.checkOut - v.checkIn) / 1000 / 60) : 0,
            checkInTime: formatKenyaTime(v.checkIn),
            checkOutTime: v.checkOut ? formatKenyaTime(v.checkOut) : null
        }));
        
        const doc = new PDFDocument({ margin: 40, size: 'A4', landscape: true });
        const chunks = [];
        
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            const periodLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="visitor_report_${period}_${date || 'today'}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
        });
        doc.on('error', (err) => {
            console.error('PDF error:', err);
            res.status(500).json({ success: false, message: 'Error generating PDF' });
        });
        
        // Header
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#0A1628')
           .text('CHANGARA STAR ACADEMY', { align: 'center' });
        
        doc.fontSize(12)
           .font('Helvetica-Oblique')
           .fillColor('#D4A017')
           .text('"Assurance to Excellence"', { align: 'center' })
           .moveDown(0.5);
        
        const periodLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#0A1628')
           .text(`VISITOR REPORT - ${periodLabel.toUpperCase()}`, { align: 'center' });
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#6c757d')
           .text(`Date: ${date || formatKenyaDate(new Date())}`, { align: 'center' })
           .moveDown(1);
        
        // Table
        const tableTop = doc.y;
        const colWidths = [25, 130, 60, 80, 80, 70, 70, 60];
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        
        doc.rect(40, tableTop, tableWidth, 22)
           .fillColor('#0A1628')
           .fill();
        
        const headers = ['#', 'Visitor', 'Badge', 'Purpose', 'Person', 'Check In', 'Check Out', 'Duration'];
        let headerX = 45;
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor('white');
        
        headers.forEach((h, i) => {
            const align = i === 0 || i === headers.length - 1 ? 'center' : 'left';
            doc.text(h, headerX, tableTop + 5, { width: colWidths[i] - 5, align: align });
            headerX += colWidths[i];
        });
        
        let rowY = tableTop + 22;
        report.slice(0, 20).forEach((v, index) => {
            if (rowY > 500) { doc.addPage(); rowY = 50; }
            
            doc.rect(40, rowY, tableWidth, 18)
               .fillColor(index % 2 === 0 ? '#f8f9fa' : 'white')
               .fill();
            
            let xPos = 45;
            doc.fontSize(7)
               .font('Helvetica')
               .fillColor('#0A1628');
            
            doc.text((index + 1).toString(), xPos, rowY + 3, { width: colWidths[0] - 5, align: 'center' });
            xPos += colWidths[0];
            
            doc.text(v.fullName || 'Unknown', xPos, rowY + 3, { width: colWidths[1] - 5 });
            xPos += colWidths[1];
            
            doc.text(v.badgeNumber || '-', xPos, rowY + 3, { width: colWidths[2] - 5 });
            xPos += colWidths[2];
            
            doc.text(v.purpose || '-', xPos, rowY + 3, { width: colWidths[3] - 5 });
            xPos += colWidths[3];
            
            doc.text(v.personToVisit || '-', xPos, rowY + 3, { width: colWidths[4] - 5 });
            xPos += colWidths[4];
            
            doc.text(v.checkInTime || '-', xPos, rowY + 3, { width: colWidths[5] - 5 });
            xPos += colWidths[5];
            
            doc.text(v.checkOutTime || '-', xPos, rowY + 3, { width: colWidths[6] - 5 });
            xPos += colWidths[6];
            
            doc.text(v.duration > 0 ? v.duration + 'm' : '-', xPos, rowY + 3, { width: colWidths[7] - 5, align: 'center' });
            
            rowY += 18;
        });
        
        // Summary
        const totalVisitors = report.length;
        const active = report.filter(v => v.status === 'Checked In').length;
        const completed = report.filter(v => v.status === 'Checked Out').length;
        const totalDuration = report.reduce((sum, v) => sum + (v.duration || 0), 0);
        const avgDuration = totalVisitors > 0 ? Math.round(totalDuration / totalVisitors) : 0;
        
        doc.moveDown(1);
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#0A1628')
           .text(`Total Visitors: ${totalVisitors}`, 40, rowY + 5)
           .text(`Active: ${active}`, 200, rowY + 5)
           .text(`Completed: ${completed}`, 350, rowY + 5)
           .text(`Avg Duration: ${avgDuration} min`, 500, rowY + 5);
        
        doc.end();
    } catch (error) {
        console.error('Error generating visitor PDF:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CLERK DASHBOARD API ROUTES
// ============================================

app.get('/api/clerk/students/fees', async (req, res) => {
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

app.get('/api/clerk/students/fees/:studentId', async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.studentId, isActive: true });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        const feeData = getFeeStructure(student.grade, student.type);
        const paid = student.paid || 0;
        const totalFees = feeData.total || 0;
        const balance = totalFees - paid;
        const payments = await Payment.find({ studentId: student.studentId }).sort({ date: -1 });
        res.json({ success: true, student: { id: student.studentId, name: student.name, grade: student.grade, gender: student.gender, studentType: student.type, isBoarding: student.type === 'Boarder' }, fees: { total: totalFees, paid: paid, balance: balance, status: balance === 0 ? 'paid' : balance < totalFees ? 'partial' : 'unpaid' }, feeBreakdown: feeData, payments: payments });
    } catch (error) {
        console.error('Error fetching student fee details:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/clerk/payments/record', async (req, res) => {
    try {
        const { studentId, payments, method, reference, notes } = req.body;
        if (!studentId) {
            return res.status(400).json({ success: false, message: 'Student ID is required' });
        }
        const student = await Student.findOne({ studentId, isActive: true });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        let totalAmount = 0;
        const categoryList = [];
        for (const [category, amount] of Object.entries(payments)) {
            if (amount > 0) {
                totalAmount += amount;
                categoryList.push({ category, amount });
            }
        }
        if (totalAmount === 0) {
            return res.status(400).json({ success: false, message: 'Please enter at least one payment amount' });
        }
        student.paid = (student.paid || 0) + totalAmount;
        await student.save();
        const payment = new Payment({
            studentId: student.studentId,
            studentName: student.name,
            amount: totalAmount,
            category: 'Multiple Categories',
            method: method || 'MPESA',
            reference: reference || '',
            notes: notes || '',
            categories: payments,
            date: new Date()
        });
        await payment.save();
        res.json({ success: true, message: `Payment of KES ${totalAmount.toLocaleString()} recorded for ${student.name}`, totalAmount: totalAmount, categories: categoryList, date: payment.date });
    } catch (error) {
        console.error('Error recording payment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/clerk/payments/all', async (req, res) => {
    try {
        const payments = await Payment.find().sort({ date: -1 });
        res.json({ success: true, payments: payments });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/clerk/payments/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { amount, category, method, reference, notes } = req.body;
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        const oldAmount = payment.amount;
        const amountDiff = amount - oldAmount;
        payment.amount = amount || payment.amount;
        payment.category = category || payment.category;
        payment.method = method || payment.method;
        payment.reference = reference || payment.reference;
        payment.notes = notes || payment.notes;
        await payment.save();
        if (amountDiff !== 0) {
            const student = await Student.findOne({ studentId: payment.studentId });
            if (student) {
                student.paid = (student.paid || 0) + amountDiff;
                await student.save();
            }
        }
        res.json({ success: true, message: 'Payment updated successfully!' });
    } catch (error) {
        console.error('Error updating payment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/clerk/payments/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        const student = await Student.findOne({ studentId: payment.studentId });
        if (student) {
            student.paid = Math.max(0, (student.paid || 0) - payment.amount);
            await student.save();
        }
        await Payment.findByIdAndDelete(paymentId);
        res.json({ success: true, message: 'Payment deleted successfully!' });
    } catch (error) {
        console.error('Error deleting payment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/clerk/fees/structure', async (req, res) => {
    try {
        const grades = ['Playgroup', 'PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
        const feeStructure = {};
        grades.forEach(grade => {
            feeStructure[grade] = getFeeStructure(grade, 'Day Scholar');
        });
        feeStructure['boarding'] = {
            'Full Boarding': { term1: 8000, term2: 8000, term3: 8000, total: 24000 }
        };
        res.json({ success: true, fees: feeStructure });
    } catch (error) {
        console.error('Error fetching fees structure:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/clerk/fees/update', async (req, res) => {
    try {
        const { fees, type } = req.body;
        if (!global.feesStructure) {
            global.feesStructure = {};
        }
        if (type === 'boarding') {
            global.feesStructure.boarding = fees;
        } else {
            global.feesStructure.day = fees;
        }
        res.json({ success: true, message: 'Fees structure updated successfully!' });
    } catch (error) {
        console.error('Error updating fees:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/clerk/reports/fees-structure', async (req, res) => {
    try {
        const grades = ['Playgroup', 'PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            const filename = `fees_structure_${new Date().toISOString().split('T')[0]}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
        });
        doc.on('error', (err) => {
            console.error('PDF error:', err);
            res.status(500).json({ success: false, message: 'Error generating PDF' });
        });
        
        doc.rect(0, 0, 595, 5).fillColor('#D4A017').fill();
        doc.moveDown(1);
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#0A1628').text('CHANGARA STAR ACADEMY', { align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor('#D4A017').text('"Assurance to Excellence"', { align: 'center' }).moveDown();
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0A1628').text('FEES STRUCTURE', { align: 'center' }).moveDown();
        doc.fontSize(9).font('Helvetica').fillColor('#333').text(`Academic Year ${new Date().getFullYear()}`, { align: 'center' }).moveDown(1);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0A1628').text('DAY SCHOLAR FEES', { underline: true }).moveDown(0.3);
        grades.forEach(grade => {
            const fees = getFeeStructure(grade, 'Day Scholar');
            doc.fontSize(8).font('Helvetica').fillColor('#333').text(`${grade}: Term 1: KES ${fees.term1.toLocaleString()} | Term 2: KES ${fees.term2.toLocaleString()} | Term 3: KES ${fees.term3.toLocaleString()} | Total: KES ${fees.total.toLocaleString()}`);
            doc.moveDown(0.2);
        });
        doc.moveDown(1);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0A1628').text('BOARDING FEES (Grades 3-6)', { underline: true }).moveDown(0.3);
        const boardingGrades = ['Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
        boardingGrades.forEach(grade => {
            const fees = getFeeStructure(grade, 'Boarder');
            doc.fontSize(8).font('Helvetica').fillColor('#333').text(`${grade}: Term 1: KES ${fees.term1.toLocaleString()} | Term 2: KES ${fees.term2.toLocaleString()} | Term 3: KES ${fees.term3.toLocaleString()} | Total: KES ${fees.total.toLocaleString()}`);
            doc.moveDown(0.2);
        });
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#dc3545').text('N/B: NO CASH IS ALLOWED IN SCHOOL', { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(7).font('Helvetica').fillColor('#6c757d').text(`Generated: ${formatKenyaFullTime(new Date())}`, { align: 'center' });
        doc.end();
    } catch (error) {
        console.error('Error generating fees structure PDF:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/clerk/reports/fee/:type', async (req, res) => {
    try {
        const { type } = req.params;
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
                totalFees: totalFees,
                paid: paid,
                balance: balance,
                status: balance === 0 ? 'Paid' : balance < totalFees ? 'Partial' : 'Unpaid'
            };
        });
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            const filename = `fee_report_${type}_${new Date().toISOString().split('T')[0]}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
        });
        doc.on('error', (err) => {
            console.error('PDF error:', err);
            res.status(500).json({ success: false, message: 'Error generating PDF' });
        });
        
        doc.rect(0, 0, 595, 5).fillColor('#D4A017').fill();
        doc.moveDown(1);
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#0A1628').text('CHANGARA STAR ACADEMY', { align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor('#D4A017').text('"Assurance to Excellence"', { align: 'center' }).moveDown();
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0A1628').text('FEE REPORT', { align: 'center' }).moveDown();
        doc.fontSize(9).font('Helvetica').fillColor('#6c757d').text(`Type: ${type}`, { align: 'center' }).moveDown(0.3);
        doc.fontSize(8).font('Helvetica').fillColor('#333').text(`Total Students: ${studentFees.length}`, { align: 'center' });
        doc.fontSize(8).font('Helvetica').fillColor('#333').text(`Total Fees: KES ${studentFees.reduce((s, i) => s + i.totalFees, 0).toLocaleString()}`, { align: 'center' });
        doc.fontSize(8).font('Helvetica').fillColor('#333').text(`Total Paid: KES ${studentFees.reduce((s, i) => s + i.paid, 0).toLocaleString()}`, { align: 'center' });
        doc.fontSize(8).font('Helvetica').fillColor('#333').text(`Total Balance: KES ${studentFees.reduce((s, i) => s + i.balance, 0).toLocaleString()}`, { align: 'center' }).moveDown(0.5);
        
        studentFees.forEach((s, i) => {
            if (doc.y > 700) { doc.addPage(); }
            doc.fontSize(7).font('Helvetica').fillColor('#333').text(`${i+1}. ${s.name} (${s.id}) - ${s.grade} - ${s.studentType} - Total: KES ${s.totalFees.toLocaleString()}, Paid: KES ${s.paid.toLocaleString()}, Balance: KES ${s.balance.toLocaleString()}`);
            doc.moveDown(0.15);
        });
        doc.moveDown(2);
        doc.fontSize(7).font('Helvetica').fillColor('#6c757d').text(`Report Date: ${formatKenyaFullTime(new Date())}`, { align: 'center' }).text('CHANGARA STAR ACADEMY | P.O Box 7, Cheptais | 📞 +254 721 556 252', { align: 'center' });
        doc.end();
    } catch (error) {
        console.error('Error generating fee report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// FIX PAST RECORDS - MANUAL API
// ============================================

app.post('/api/fix-past-times', async (req, res) => {
    res.status(410).json({ success: false, message: 'Bulk time shifting has been retired to protect record accuracy.' });
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

// ============================================
// TEST ROUTE
// ============================================

app.get('/api/test', (req, res) => {
    const kenyaNow = getKenyaTime();
    res.json({ success: true, message: 'Changara Star Academy is running!', data: { server: 'Online', kenyaTime: kenyaNow.toLocaleString(), kenyaTimeFormatted: formatKenyaFullTime(kenyaNow), timestamp: new Date().toISOString(), cloudinaryConfigured: isCloudinaryConfigured() } });
});

// ============================================
// FIX ALL TIMES - ADD 3 HOURS
// ============================================

app.post('/api/fix-times-add-3', async (req, res) => {
    return res.status(410).json({ success: false, message: 'Bulk time shifting has been retired to protect record accuracy.' });
});

// ============================================
// VISITOR REGISTER VIEWS
// ============================================

app.get('/api/visitors', async (req, res) => {
    try {
        let query = {};
        if (req.query.date) {
            const start = new Date(`${req.query.date}T00:00:00`);
            if (Number.isNaN(start.getTime())) return res.status(400).json({ success: false, message: 'Date must use YYYY-MM-DD format' });
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            query = { checkIn: { $gte: start, $lt: end } };
        } else if (req.query.period === 'daily') {
            const start = getKenyaDate();
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            query = { checkIn: { $gte: start, $lt: end } };
        }
        const visitors = await Visitor.find(query).sort({ checkIn: -1 });
        res.json({ success: true, count: visitors.length, visitors });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/visitors/weekly', async (req, res) => {
    try {
        const today = getKenyaDate();
        const start = new Date(today);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        const visitors = await Visitor.find({ checkIn: { $gte: start, $lt: end } }).sort({ checkIn: -1 });
        res.json({ success: true, count: visitors.length, visitors });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/visitors/monthly', async (req, res) => {
    try {
        const start = getKenyaDate();
        start.setDate(1);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        const visitors = await Visitor.find({ checkIn: { $gte: start, $lt: end } }).sort({ checkIn: -1 });
        res.json({ success: true, count: visitors.length, visitors });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/visitors/:id', async (req, res) => {
    try {
        const visitor = await Visitor.findByIdAndDelete(req.params.id);
        if (!visitor) return res.status(404).json({ success: false, message: 'Visitor record not found' });
        res.json({ success: true, message: 'Visitor record deleted' });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Invalid visitor record ID' });
    }
});

// ============================================
// FIX ASSIGNMENT PATHS (ONE-TIME MIGRATION)
// ============================================

app.get('/api/fix-assignment-paths', async (req, res) => {
    try {
        const assignments = await HolidayAssignment.find({});
        let fixed = 0;
        let missing = 0;
        
        for (const a of assignments) {
            if (a.fileUrl && a.fileUrl.includes('cloudinary.com')) {
                continue;
            }
            
            const filename = path.basename(a.fileUrl);
            const filePath = path.join(__dirname, 'uploads', 'assignments', filename);
            
            if (fs.existsSync(filePath)) {
                const newUrl = '/uploads/assignments/' + filename;
                if (a.fileUrl !== newUrl) {
                    a.fileUrl = newUrl;
                    await a.save();
                    fixed++;
                    console.log(`✅ Fixed: ${a.title} -> ${newUrl}`);
                }
            } else {
                missing++;
                console.log(`❌ File missing: ${a.title} - ${filename}`);
            }
        }
        
        res.json({ 
            success: true, 
            message: `Fixed ${fixed} assignments, ${missing} files missing`,
            fixed: fixed,
            missing: missing,
            total: assignments.length
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// MIGRATE LOCAL ASSIGNMENTS TO CLOUDINARY
// ============================================

app.post('/api/migrate-to-cloudinary', async (req, res) => {
    try {
        if (!isCloudinaryConfigured()) {
            return res.status(400).json({ success: false, message: 'Cloudinary is not configured' });
        }
        
        const assignments = await HolidayAssignment.find({
            $or: [
                { fileUrl: { $not: { $regex: /cloudinary\.com/ } } },
                { cloudinaryPublicId: { $exists: false } }
            ]
        });
        
        let migrated = 0;
        let failed = 0;
        
        for (const a of assignments) {
            try {
                const filename = path.basename(a.fileUrl);
                const filePath = path.join(__dirname, 'uploads', 'assignments', filename);
                
                if (fs.existsSync(filePath)) {
                    const fileBuffer = fs.readFileSync(filePath);
                    const cloudinaryResult = await uploadToCloudinary(fileBuffer, a.fileName || filename, 'assignments');
                    
                    a.fileUrl = cloudinaryResult.secure_url;
                    a.cloudinaryPublicId = cloudinaryResult.public_id;
                    await a.save();
                    
                    migrated++;
                    console.log(`✅ Migrated: ${a.title} -> ${a.fileUrl}`);
                } else {
                    failed++;
                    console.log(`❌ File not found: ${a.title} - ${filename}`);
                }
            } catch (error) {
                failed++;
                console.error(`❌ Migration failed for ${a.title}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            message: `Migrated ${migrated} assignments to Cloudinary, ${failed} failed`,
            migrated: migrated,
            failed: failed,
            total: assignments.length
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// REGISTER STATIC FILES
// ============================================

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// DEBUG - LIST ALL REGISTERED ROUTES (FIXED)
// ============================================
try {
    console.log('\n📋 REGISTERED ROUTES:');
    if (app._router && app._router.stack) {
        app._router.stack.forEach(function(r) {
            if (r.route && r.route.path) {
                const methods = Object.keys(r.route.methods).join(',').toUpperCase();
                console.log(`  ${methods} ${r.route.path}`);
            }
        });
    } else {
        console.log('  Router not yet initialized');
    }
    console.log('='.repeat(50) + '\n');
} catch (error) {
    console.log('⚠️ Could not list routes:', error.message);
}

// 404 handler - MUST BE LAST
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
    console.log('CHANGARA STAR ACADEMY');
    console.log('='.repeat(50));
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Kenya Time: ${kenyaNow.toLocaleString()}`);
    console.log(`Test API: http://localhost:${PORT}/api/test`);
    console.log(`Cloudinary: ${isCloudinaryConfigured() ? '✅ Configured' : '❌ Not configured'}`);
    console.log('='.repeat(50));
    console.log('Server started successfully!');
});