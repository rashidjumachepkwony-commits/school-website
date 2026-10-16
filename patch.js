// Patch the teacher-checkin.html to add form submit handler
const fs = require('fs');
const path = 'C:\\Users\\STARTECH AFRICA\\Desktop\\projects\\school-website\\teacher-checkin.html';
const content = fs.readFileSync(path, 'utf8');

// Find the position after the click event listeners and before the keydown handler
const searchStr = `        checkoutBtn.addEventListener('click', () => {
            document.getElementById('checkinForm').dataset.lastAction = 'checkout';
        });

        // ============================================
        // PRESS ENTER TO SUBMIT`;

const replacement = `        checkoutBtn.addEventListener('click', () => {
            document.getElementById('checkinForm').dataset.lastAction = 'checkout';
        });

        // Form submit handler for mobile "Go" key
        function handleFormSubmit(e) {
            e.preventDefault();
            const lastAction = document.getElementById('checkinForm').dataset.lastAction || 'checkin';
            handleAction(lastAction);
            return false;
        }

        // ============================================
        // PRESS ENTER TO SUBMIT`;

if (content.includes(searchStr)) {
    const newContent = content.replace(searchStr, replacement);
    fs.writeFileSync(path, newContent);
    console.log('Patched successfully');
} else {
    console.log('Search string not found');
    // Debug: show the area around the click handlers
    const idx = content.indexOf('checkoutBtn.addEventListener');
    if (idx > 0) {
        console.log('Found at index:', idx);
        console.log(content.substring(idx, idx + 500));
    }
}