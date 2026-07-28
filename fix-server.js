// fix-server.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('📁 Reading server.js...');

// ============================================
// 1. REMOVE DUPLICATE ROUTES
// ============================================

console.log('\n🗑️ Removing duplicate routes...');

// Pattern 1: Remove duplicate /api/students/debug (keep the first one)
const debugRoute1 = /app\.get\s*\(\s*['"]\/api\/students\/debug['"]\s*,\s*async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{[^}]*\}[^;]*;/gs;
const debugMatches = content.match(debugRoute1);
if (debugMatches && debugMatches.length > 1) {
    // Keep the first match, remove the rest
    content = content.replace(debugRoute1, (match, index) => {
        return index === 0 ? match : '';
    });
    console.log('✅ Removed duplicate /api/students/debug');
}

// Pattern 2: Remove duplicate /api/holiday-assignments/id/:id
const holidayIdRoute = /app\.get\s*\(\s*['"]\/api\/holiday-assignments\/id\/:id['"]\s*,\s*async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{[^}]*\}[^;]*;/gs;
const holidayIdMatches = content.match(holidayIdRoute);
if (holidayIdMatches && holidayIdMatches.length > 1) {
    content = content.replace(holidayIdRoute, (match, index) => {
        return index === 0 ? match : '';
    });
    console.log('✅ Removed duplicate /api/holiday-assignments/id/:id');
}

// Pattern 3: Remove duplicate /api/holiday-assignments/test
const holidayTestRoute = /app\.get\s*\(\s*['"]\/api\/holiday-assignments\/test['"]\s*,\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{[^}]*\}[^;]*;/gs;
const holidayTestMatches = content.match(holidayTestRoute);
if (holidayTestMatches && holidayTestMatches.length > 1) {
    content = content.replace(holidayTestRoute, (match, index) => {
        return index === 0 ? match : '';
    });
    console.log('✅ Removed duplicate /api/holiday-assignments/test');
}

// Pattern 4: Remove duplicate /api/clerk/fees/update
const clerkFeesRoute = /app\.post\s*\(\s*['"]\/api\/clerk\/fees\/update['"]\s*,\s*async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{[^}]*\}[^;]*;/gs;
const clerkFeesMatches = content.match(clerkFeesRoute);
if (clerkFeesMatches && clerkFeesMatches.length > 1) {
    content = content.replace(clerkFeesRoute, (match, index) => {
        return index === 0 ? match : '';
    });
    console.log('✅ Removed duplicate /api/clerk/fees/update');
}

// ============================================
// 2. CHECK FOR MISSING ROUTES
// ============================================

console.log('\n📋 Checking for missing routes...');

const missingRoutes = [];

// Check if route exists
function routeExists(pattern) {
    return content.includes(pattern);
}

// Check each required route
if (!routeExists("app.get('/api/students/portal/fees'")) {
    missingRoutes.push('api/students/portal/fees');
}

if (!routeExists("app.get('/api/students/portal/assessments'")) {
    missingRoutes.push('api/students/portal/assessments');
}

if (!routeExists("app.get('/api/students/portal/assignments'")) {
    missingRoutes.push('api/students/portal/assignments');
}

if (!routeExists("app.get('/api/assessments/student-name/:name'")) {
    missingRoutes.push('api/assessments/student-name/:name');
}

if (!routeExists("app.get('/api/assessments/search'")) {
    missingRoutes.push('api/assessments/search');
}

if (!routeExists("app.get('/api/assessments/download-report/:studentId'")) {
    missingRoutes.push('api/assessments/download-report/:studentId');
}

if (!routeExists("app.get('/api/holiday-assignments/grade/'")) {
    missingRoutes.push('api/holiday-assignments/grade/:grade');
}

if (!routeExists("app.get('/api/holiday-assignments/download/:id'")) {
    missingRoutes.push('api/holiday-assignments/download/:id');
}

// ============================================
// 3. ADD MISSING ROUTES
// ============================================

if (missingRoutes.length > 0) {
    console.log(`\n➕ Adding ${missingRoutes.length} missing routes...`);
    
    // Find the position to insert new routes (before the 404 handler)
    const position = content.lastIndexOf("app.use((req, res) => {");
    
    if (position !== -1) {
        // Build the new routes
        let newRoutes = '\n\n// ============================================\n';
        newRoutes += '// STUDENT PORTAL - ADDED MISSING ROUTES\n';
        newRoutes += '// ============================================\n\n';
        
        // Add student portal fees route
        if (missingRoutes.includes('api/students/portal/fees')) {
            newRoutes += `// Get student fees with PIN verification
app.get('/api/students/portal/fees/:studentId', async (req, res) => {
    try {
        const { pin } = req.query;
        console.log(\`📡 GET /api/students/portal/fees/\${req.params.studentId}\`);
        
        const student = await Student.findOne({ 
            studentId: req.params.studentId, 
            isActive: true 
        });
        
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        if (pin && student.pin !== pin) {
            return res.status(401).json({ success: false, message: 'Invalid PIN' });
        }
        
        const feeData = getFeeStructure(student.grade, student.type);
        const paid = student.paid || 0;
        const totalFees = feeData.total || 0;
        const balance = totalFees - paid;
        const payments = await Payment.find({ studentId: student.studentId }).sort({ date: -1 });
        
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
            feeBreakdown: feeData,
            payments: payments
        });
    } catch (error) {
        console.error('❌ Error fetching student fee details:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});\n\n`;
        }
        
        // Add student portal assessments route
        if (missingRoutes.includes('api/students/portal/assessments')) {
            newRoutes += `// Get student assessments with PIN verification
app.get('/api/students/portal/assessments/:studentId', async (req, res) => {
    try {
        const { pin } = req.query;
        console.log(\`📡 GET /api/students/portal/assessments/\${req.params.studentId}\`);
        
        const student = await Student.findOne({ 
            studentId: req.params.studentId, 
            isActive: true 
        });
        
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        if (pin && student.pin !== pin) {
            return res.status(401).json({ success: false, message: 'Invalid PIN' });
        }
        
        const assessment = await StudentAssessment.findOne({ 
            studentName: student.name 
        }).sort({ createdAt: -1 });
        
        res.json({
            success: true,
            student: {
                id: student.studentId,
                name: student.name,
                grade: student.grade
            },
            assessment: assessment || null
        });
    } catch (error) {
        console.error('❌ Error fetching student assessments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});\n\n`;
        }
        
        // Add student portal assignments route
        if (missingRoutes.includes('api/students/portal/assignments')) {
            newRoutes += `// Get holiday assignments with PIN verification
app.get('/api/students/portal/assignments/:studentId', async (req, res) => {
    try {
        const { pin } = req.query;
        console.log(\`📡 GET /api/students/portal/assignments/\${req.params.studentId}\`);
        
        const student = await Student.findOne({ 
            studentId: req.params.studentId, 
            isActive: true 
        });
        
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        if (pin && student.pin !== pin) {
            return res.status(401).json({ success: false, message: 'Invalid PIN' });
        }
        
        const assignments = await HolidayAssignment.find({ 
            grade: student.grade, 
            isActive: true 
        }).sort({ createdAt: -1 });
        
        res.json({
            success: true,
            student: {
                id: student.studentId,
                name: student.name,
                grade: student.grade
            },
            assignments: assignments
        });
    } catch (error) {
        console.error('❌ Error fetching assignments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});\n\n`;
        }
        
        // Add assessment by name route
        if (missingRoutes.includes('api/assessments/student-name/:name')) {
            newRoutes += `// Get assessment by student name
app.get('/api/assessments/student-name/:name', async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        console.log(\`📡 GET /api/assessments/student-name/\${name}\`);
        
        const student = await StudentAssessment.findOne({ 
            studentName: { $regex: new RegExp('^' + name + '$', 'i') } 
        });
        
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        res.json({ success: true, student });
    } catch (error) {
        console.error('❌ Error in /api/assessments/student-name/:name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});\n\n`;
        }
        
        // Add assessment search route
        if (missingRoutes.includes('api/assessments/search')) {
            newRoutes += `// Search assessments
app.get('/api/assessments/search', async (req, res) => {
    try {
        const { name, grade, type } = req.query;
        console.log(\`📡 GET /api/assessments/search - name: \${name}, grade: \${grade}, type: \${type}\`);
        
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
        
        const students = await StudentAssessment.find(filter).sort({ studentName: 1 });
        res.json({ success: true, students, count: students.length });
    } catch (error) {
        console.error('❌ Search error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});\n\n`;
        }
        
        // Add download report route
        if (missingRoutes.includes('api/assessments/download-report/:studentId')) {
            newRoutes += `// Download student report with PIN verification
app.get('/api/assessments/download-report/:studentId', async (req, res) => {
    try {
        const { pin } = req.query;
        console.log(\`📡 GET /api/assessments/download-report/\${req.params.studentId}\`);
        
        const student = await StudentAssessment.findById(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        const studentRecord = await Student.findOne({ 
            studentId: student.studentId, 
            isActive: true 
        });
        
        if (studentRecord && pin && studentRecord.pin !== pin) {
            return res.status(401).json({ success: false, message: 'Invalid PIN' });
        }
        
        const recalculated = recalculateStudentData(student);
        const pdfBuffer = await generateStudentReportPDF(recalculated);
        
        const filename = \`student_report_\${recalculated.studentName.replace(/\\s/g, '_')}_\${new Date().toISOString().split('T')[0]}.pdf\`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', \`attachment; filename="\${filename}"\`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('❌ PDF generation error:', error);
        res.status(500).json({ success: false, message: 'Error generating PDF: ' + error.message });
    }
});\n\n`;
        }
        
        // Add holiday assignments by grade route
        if (missingRoutes.includes('api/holiday-assignments/grade/:grade')) {
            newRoutes += `// Get holiday assignments by grade (with PIN verification)
app.get('/api/holiday-assignments/grade/:grade', async (req, res) => {
    try {
        const grade = req.params.grade;
        const { pin, studentId } = req.query;
        console.log(\`📡 GET /api/holiday-assignments/grade/\${grade}\`);
        
        if (studentId && pin) {
            const student = await Student.findOne({ studentId, isActive: true });
            if (!student || student.pin !== pin) {
                return res.status(401).json({ success: false, message: 'Invalid PIN' });
            }
        }
        
        const assignments = await HolidayAssignment.find({ 
            grade: grade, 
            isActive: true 
        }).sort({ createdAt: -1 });
        
        res.json({ success: true, assignments });
    } catch (error) {
        console.error('❌ Error fetching assignments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});\n\n`;
        }
        
        // Add download holiday assignment route
        if (missingRoutes.includes('api/holiday-assignments/download/:id')) {
            newRoutes += `// Download holiday assignment (with PIN verification)
app.get('/api/holiday-assignments/download/:id', async (req, res) => {
    try {
        const { pin, studentId } = req.query;
        console.log(\`📥 GET /api/holiday-assignments/download/\${req.params.id}\`);
        
        if (studentId && pin) {
            const student = await Student.findOne({ studentId, isActive: true });
            if (!student || student.pin !== pin) {
                return res.status(401).json({ success: false, message: 'Invalid PIN' });
            }
        }
        
        const assignment = await HolidayAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        
        if (!assignment.fileData || assignment.fileData === '') {
            return res.status(404).json({ 
                success: false, 
                message: 'File data not found in database.'
            });
        }
        
        const fileBuffer = Buffer.from(assignment.fileData, 'base64');
        
        const mimeType = assignment.fileType === 'pdf' ? 'application/pdf' :
                         assignment.fileType === 'doc' || assignment.fileType === 'docx' ? 'application/msword' :
                         assignment.fileType === 'xls' || assignment.fileType === 'xlsx' ? 'application/vnd.ms-excel' :
                         assignment.fileType === 'jpg' || assignment.fileType === 'jpeg' ? 'image/jpeg' :
                         assignment.fileType === 'png' ? 'image/png' :
                         'application/octet-stream';
        
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', \`attachment; filename="\${assignment.fileName}"\`);
        res.setHeader('Content-Length', fileBuffer.length);
        res.send(fileBuffer);
    } catch (error) {
        console.error('❌ Download error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});\n\n`;
        }
        
        // Insert the new routes before the 404 handler
        content = content.slice(0, position) + newRoutes + content.slice(position);
        
        console.log(`✅ Added ${missingRoutes.length} missing routes`);
    } else {
        console.log('⚠️ Could not find 404 handler position. Please add routes manually.');
    }
} else {
    console.log('✅ All required routes are present!');
}

// ============================================
// 4. SAVE THE FILE
// ============================================

fs.writeFileSync(filePath, content);
console.log('\n📁 File updated: server.js');
console.log('✅ Done! Please restart your server.');

// Show summary
console.log('\n📊 Summary:');
console.log('  - Duplicate routes removed: ✅');
console.log(`  - Missing routes added: ${missingRoutes.length}`);
if (missingRoutes.length > 0) {
    console.log(`  - Added routes: ${missingRoutes.join(', ')}`);
}
console.log('\n⚠️ Please restart your server: node server.js');