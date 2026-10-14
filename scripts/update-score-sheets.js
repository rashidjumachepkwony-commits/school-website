const fs = require('fs');
const path = require('path');

const scoreSheetsDir = 'score-sheets';
const files = fs.readdirSync(scoreSheetsDir).filter(f => f.endsWith('.html') && f !== 'index.html');

for (const file of files) {
    const filePath = path.join(scoreSheetsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update head: add font-awesome and print styles
    if (!content.includes('font-awesome')) {
        content = content.replace(
            '<title>',
            '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">\n    <title>'
        );
    }
    
    // Add @media print to existing print styles if not present
    if (!content.includes('.no-print { display: none !important; }')) {
        content = content.replace(
            '@media print {',
            '@media print {\n            .no-print { display: none !important; }'
        );
    }
    
    // Add download bar after <body>
    if (!content.includes('download-bar')) {
        content = content.replace(
            '<body>',
            `<body>
    <div class="download-bar no-print">
        <div class="brand">
            <img src="/images/school-compound.jpg" alt="Changara Star Academy Logo" loading="lazy">
            <span>CHANGARA STAR ACADEMY</span>
        </div>
        <button class="download-btn no-print" onclick="downloadAsPDF()" aria-label="Download as PDF">
            <i class="fas fa-download"></i> Download as PDF
        </button>
    </div>`
        );
    }
    
    // Add downloadAsPDF function before </body>
    if (!content.includes('downloadAsPDF')) {
        const scriptTag = `
    <script>
        function downloadAsPDF() {
            window.print();
        }
        
        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                downloadAsPDF();
            }
        });
    </script>`;
        
        content = content.replace('</body>', scriptTag + '\n</body>');
    }
    
    fs.writeFileSync(filePath, content);
    console.log('Updated:', file);
}

console.log('All files updated!');