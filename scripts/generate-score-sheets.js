#!/usr/bin/env node
/**
 * Score Sheet Generator for Changara Star Academy
 *
 * Generates printable score sheets for all classes from Play Group to Grade 6.
 * Teachers fill in marks manually, then enter into the system for auto-calculation.
 *
 * Run: node scripts/generate-score-sheets.js
 * Output: dist/score-sheets/
 */

const fs = require('fs');
const path = require('path');

// Class configurations from admin-academics.html
const GRADE_CONFIGS = {
    'Play Group': {
        subjects: [
            { name: 'MATH', max: 10 },
            { name: 'LANG', max: 10 },
            { name: 'LIT', max: 10 },
            { name: 'KUS', max: 10 },
            { name: 'ENVI/CRE', max: 10 },
            { name: 'C/A', max: 10 }
        ]
    },
    'PP1': {
        subjects: [
            { name: 'MATH', max: 10 },
            { name: 'LANG', max: 10 },
            { name: 'LIT', max: 10 },
            { name: 'KIS', max: 10 },
            { name: 'KUS', max: 10 },
            { name: 'ENV', max: 10 },
            { name: 'CRE/I.R.E', max: 10 },
            { name: 'C/A', max: 10 }
        ]
    },
    'PP2': {
        subjects: [
            { name: 'MATH', max: 10 },
            { name: 'LANG', max: 10 },
            { name: 'LIT', max: 10 },
            { name: 'KIS', max: 10 },
            { name: 'KUS', max: 10 },
            { name: 'ENV', max: 10 },
            { name: 'CRE/I.R.E', max: 10 },
            { name: 'C/A', max: 10 }
        ]
    },
    'Grade 1': {
        subjects: [
            { name: 'MATH', max: 30 },
            { name: 'LIST/SPEAKING', max: 20 },
            { name: 'READING', max: 20 },
            { name: 'GRAMMAR', max: 20 },
            { name: 'KUSOMA', max: 20 },
            { name: 'SARUFI', max: 20 },
            { name: 'ENV', max: 30 },
            { name: 'C.R.E', max: 20 },
            { name: 'CREATIVE ARTS', max: 20 }
        ]
    },
    'Grade 2': {
        subjects: [
            { name: 'LIST & SPEAKING', max: 20 },
            { name: 'READING ALOUD', max: 20 },
            { name: 'GRAMMAR', max: 20 },
            { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 20 },
            { name: 'KUSOMA KWA SAUTI', max: 20 },
            { name: 'LUGHA', max: 20 },
            { name: 'MATH', max: 30 },
            { name: 'ENVIRONMENTAL', max: 30 },
            { name: 'C/A', max: 20 },
            { name: 'RE', max: 20 }
        ]
    },
    'Grade 3': {
        subjects: [
            { name: 'LIST & SPEAKING', max: 20 },
            { name: 'READING ALOUD', max: 20 },
            { name: 'GRAMMAR', max: 20 },
            { name: 'KUSIKILIZA NA KUZUNGUMZA', max: 20 },
            { name: 'KUSOMA KWA SAUTI', max: 20 },
            { name: 'SARUFI', max: 20 },
            { name: 'MATHS', max: 30 },
            { name: 'ENVIRONMENTAL', max: 30 },
            { name: 'C.R.E', max: 20 },
            { name: 'I.R.E', max: 20 },
            { name: 'C/A', max: 20 }
        ]
    },
    'Grade 4': {
        subjects: [
            { name: 'MATHS ACTIVITIES', max: 30 },
            { name: 'ENGLISH ACTIVITIES', max: 50 },
            { name: 'SCI & TECH', max: 30 },
            { name: 'KISW LUGHA', max: 50 },
            { name: 'SST', max: 20 },
            { name: 'RELIGIOUS EDUCATION', max: 20 },
            { name: 'AGRICULTURE', max: 20 },
            { name: 'CREATIVE ART', max: 35 }
        ]
    },
    'Grade 5': {
        subjects: [
            { name: 'MATHS ACTIVITIES', max: 30 },
            { name: 'ENGLISH ACTIVITIES', max: 50 },
            { name: 'SCI & TECH', max: 30 },
            { name: 'KISW LUGHA', max: 50 },
            { name: 'SST', max: 20 },
            { name: 'RELIGIOUS EDUCATION', max: 20 },
            { name: 'AGRICULTURE', max: 20 },
            { name: 'CREATIVE ART', max: 35 }
        ]
    },
    'Grade 6': {
        subjects: [
            { name: 'MATHS ACTIVITIES', max: 50 },
            { name: 'ENGLISH ACTIVITIES', max: 50 },
            { name: 'SCI & TECH', max: 30 },
            { name: 'KISW LUGHA', max: 50 },
            { name: 'SST', max: 20 },
            { name: 'RELIGIOUS EDUCATION', max: 20 },
            { name: 'AGRICULTURE', max: 20 },
            { name: 'CREATIVE ART', max: 35 }
        ]
    }
};

// Output directory
const OUTPUT_DIR = path.join(__dirname, '..', 'score-sheets');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate HTML for a score sheet
function generateScoreSheetHTML(className, config) {
    const subjects = config.subjects;
    const subjectCount = subjects.length;

    // Calculate column widths
    const colWidthStudent = 12;
    const colWidthSubject = Math.max(8, Math.min(15, Math.floor((100 - colWidthStudent - 24) / subjectCount)));
    const colWidthTotal = 8;
    const colWidthAverage = 8;
    const colWidthRank = 6;

    const subjectHeaders = subjects.map(s => `
        <th class="subject-col" style="width: ${colWidthSubject}%;" title="Max: ${s.max}">
            <div class="subject-name">${escapeHtml(s.name)}</div>
            <div class="subject-max">Max: ${s.max}</div>
        </th>
    `).join('');

    const emptyRow = subjects.map(() => '<td class="score-cell"></td>').join('');

    // Generate 40 empty rows for student entries
    const rows = Array.from({ length: 40 }, (_, i) => `
        <tr>
            <td class="num-cell">${i + 1}</td>
            <td class="name-cell"><input type="text" class="student-name-input" placeholder="Student Name"></td>
            ${emptyRow}
            <td class="total-cell"></td>
            <td class="avg-cell"></td>
            <td class="rank-cell"></td>
        </tr>
    `).join('');

    const currentDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Score Sheet - ${className} - Changara Star Academy</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page {
            size: A4 landscape;
            margin: 15mm 10mm 15mm 10mm;
        }
        body {
            font-family: 'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif;
            font-size: 9px;
            line-height: 1.2;
            color: #000;
            background: white;
        }
        .header {
            text-align: center;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 2px solid #001f5c;
        }
        .school-name {
            font-size: 18px;
            font-weight: 800;
            color: #001f5c;
            letter-spacing: 1px;
        }
        .school-motto {
            font-size: 10px;
            color: #d4a017;
            font-style: italic;
            margin-top: 2px;
        }
        .sheet-title {
            font-size: 14px;
            font-weight: 700;
            color: #001f5c;
            margin-top: 6px;
            text-transform: uppercase;
        }
        .sheet-meta {
            display: flex;
            justify-content: space-between;
            margin-top: 6px;
            font-size: 9px;
            color: #555;
        }
        .meta-item { display: flex; gap: 4px; }
        .meta-label { font-weight: 600; }
        .meta-value { font-weight: 400; }

        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #ccc; padding: 3px 2px; text-align: center; vertical-align: middle; }
        th { background: #001f5c; color: white; font-weight: 700; font-size: 8px; }
        .num-cell { width: 4%; background: #f5f5f5; font-weight: 600; }
        .name-cell { width: ${colWidthStudent}%; background: #fafafa; text-align: left; padding-left: 4px; }
        .subject-col { background: #e8f0fe; }
        .subject-name { font-weight: 700; font-size: 7px; line-height: 1.1; }
        .subject-max { font-size: 6px; color: #666; }
        .score-cell { background: #fdfdfd; min-height: 18px; }
        .total-cell { background: #fff8e1; font-weight: 600; }
        .avg-cell { background: #e8f5e9; font-weight: 600; }
        .rank-cell { background: #f3e5f5; font-weight: 600; }

        .student-name-input {
            width: 100%;
            border: none;
            background: transparent;
            font-family: inherit;
            font-size: 8px;
            text-align: left;
            outline: none;
        }

        .footer {
            margin-top: 10px;
            font-size: 7px;
            color: #888;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 4px;
        }
        .footer-note { background: #fff3e0; padding: 2px 6px; border-radius: 3px; }

        .instructions {
            margin-top: 8px;
            padding: 6px;
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 7px;
            line-height: 1.4;
        }
        .instructions strong { color: #001f5c; }

        @media print {
            .student-name-input { border-bottom: 1px dotted #ccc; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="school-name">CHANGARA STAR ACADEMY</div>
        <div class="school-motto">Assurance to Excellence</div>
        <div class="sheet-title">Score Sheet \u2014 ${escapeHtml(className)}</div>
        <div class="sheet-meta">
            <div class="meta-item"><span class="meta-label">Term:</span> <span class="meta-value">____________________</span></div>
            <div class="meta-item"><span class="meta-label">Assessment:</span> <span class="meta-value">____________________</span></div>
            <div class="meta-item"><span class="meta-label">Date:</span> <span class="meta-value">${currentDate}</span></div>
            <div class="meta-item"><span class="meta-label">Teacher:</span> <span class="meta-value">____________________</span></div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th class="num-cell" rowspan="2">No.</th>
                <th class="name-cell" rowspan="2">Student Name</th>
                ${subjectHeaders}
                <th class="total-cell" rowspan="2" style="width: ${colWidthTotal}%;">Total</th>
                <th class="avg-cell" rowspan="2" style="width: ${colWidthAverage}%;">Avg</th>
                <th class="rank-cell" rowspan="2" style="width: ${colWidthRank}%;">Rank</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>

    <div class="instructions">
        <strong>Instructions for Teachers:</strong>
        1. Write each student\u2019s name in the <strong>Student Name</strong> column.<br>
        2. Enter marks for each subject in the corresponding cell. Max scores are shown for reference.<br>
        3. <strong>Do NOT calculate</strong> Total, Average, or Rank \u2014 the system calculates these automatically when marks are entered online.<br>
        4. Bring this sheet to the admin portal for digital entry.<br>
        5. Use blue/black pen. Write clearly.
    </div>

    <div class="footer">
        <div>Changara Star Academy \u2014 Score Sheet</div>
        <div class="footer-note">Generated: ${new Date().toISOString().split('T')[0]}</div>
        <div>Page 1 of 1</div>
    </div>
</body>
</html>`;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, "\\'");
}

// Generate HTML files for all classes
function generateAllScoreSheets() {
    console.log('Generating score sheets...\n');

    for (const [className, config] of Object.entries(GRADE_CONFIGS)) {
        const html = generateScoreSheetHTML(className, config);
        const fileName = `Score_Sheet_${className.replace(/\s+/g, '_')}.html`;
        const filePath = path.join(OUTPUT_DIR, fileName);
        fs.writeFileSync(filePath, html);
        console.log(`  ${fileName} (${config.subjects.length} subjects)`);
    }

    // Also generate a combined index file
    const indexHtml = generateIndexPage();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);
    console.log(`  index.html`);

    console.log(`\nAll score sheets generated in: ${OUTPUT_DIR}`);
    console.log('\nTo convert to PDF, open each .html in a browser and print to PDF (A4 Landscape).');
}

function generateIndexPage() {
    const cards = Object.entries(GRADE_CONFIGS).map(([className, config]) => `
        <div class="card">
            <h3>${escapeHtml(className)}</h3>
            <p>${config.subjects.length} subjects</p>
            <a href="Score_Sheet_${className.replace(/\s+/g, '_')}.html" target="_blank" class="btn">Open Score Sheet</a>
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Score Sheets - Changara Star Academy</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; background: #f5f5f5; }
        h1 { color: #001f5c; text-align: center; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; margin-top: 30px; }
        .card { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .card h3 { color: #001f5c; margin-bottom: 8px; }
        .card p { color: #666; margin-bottom: 15px; }
        .btn { display: inline-block; padding: 8px 16px; background: #d4a017; color: #001f5c; text-decoration: none; border-radius: 4px; font-weight: 600; }
        .btn:hover { background: #f5c842; }
        .note { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <h1>\uD83D\uDCCB Score Sheets \u2014 All Classes</h1>
    <p style="text-align:center; color:#666;">Changara Star Academy \u2014 Printable score sheets for manual mark entry</p>
    <div class="grid">${cards}</div>
    <div class="note">
        <p>Open each sheet in a new tab and print to PDF (A4 Landscape, margins 15mm/10mm).</p>
        <p>Teachers fill in marks manually, then enter into the admin portal for automatic Total/Average/Rank calculation.</p>
    </div>
</body>
</html>`;
}

// Run
generateAllScoreSheets();