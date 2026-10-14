// Script to add score sheets to CMS downloads
// Run this in the browser console on the admin dashboard while logged in

const scoreSheets = [
  { name: 'Play Group Score Sheet', file: '/score-sheets/Score_Sheet_Play_Group.html', category: 'academic', icon: '📊', description: 'Printable score sheet for Play Group - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'PP1 Score Sheet', file: '/score-sheets/Score_Sheet_PP1.html', category: 'academic', icon: '📊', description: 'Printable score sheet for PP1 - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'PP2 Score Sheet', file: '/score-sheets/Score_Sheet_PP2.html', category: 'academic', icon: '📊', description: 'Printable score sheet for PP2 - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'Grade 1 Score Sheet', file: '/score-sheets/Score_Sheet_Grade_1.html', category: 'academic', icon: '📊', description: 'Printable score sheet for Grade 1 - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'Grade 2 Score Sheet', file: '/score-sheets/Score_Sheet_Grade_2.html', category: 'academic', icon: '📊', description: 'Printable score sheet for Grade 2 - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'Grade 3 Score Sheet', file: '/score-sheets/Score_Sheet_Grade_3.html', category: 'academic', icon: '📊', description: 'Printable score sheet for Grade 3 - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'Grade 4 Score Sheet', file: '/score-sheets/Score_Sheet_Grade_4.html', category: 'academic', icon: '📊', description: 'Printable score sheet for Grade 4 - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'Grade 5 Score Sheet', file: '/score-sheets/Score_Sheet_Grade_5.html', category: 'academic', icon: '📊', description: 'Printable score sheet for Grade 5 - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'Grade 6 Score Sheet', file: '/score-sheets/Score_Sheet_Grade_6.html', category: 'academic', icon: '📊', description: 'Printable score sheet for Grade 6 - teachers fill in marks manually, then enter into system for auto-calculation of totals, averages, and ranks.' },
  { name: 'Score Sheets Index', file: '/score-sheets/index.html', category: 'academic', icon: '📋', description: 'Index page with links to all printable score sheets for Play Group to Grade 6.' }
];

async function addScoreSheetsToCMS() {
  try {
    // Get current content
    const response = await fetch('/api/content');
    const data = await response.json();
    
    if (!data.success) {
      console.error('Failed to fetch current content:', data);
      return;
    }
    
    let content = data.content || {};
    
    // Initialize downloads array if not exists
    if (!content.downloads) content.downloads = [];
    
    // Remove existing score sheets to avoid duplicates
    content.downloads = content.downloads.filter(d => 
      !d.file || (!d.file.startsWith('/score-sheets/Score_Sheet_') && !d.file.startsWith('/score-sheets/index'))
    );
    
    // Add new score sheets
    content.downloads = [...content.downloads, ...scoreSheets];
    
    // Update content
    const token = localStorage.getItem('adminToken');
    const updateResponse = await fetch('/api/content', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(content)
    });
    
    const result = await updateResponse.json();
    console.log('Update result:', result);
    
    if (result.success) {
      console.log('✅ Score sheets added to CMS downloads!');
      // Reload the downloads page to show new items
      location.reload();
    } else {
      console.error('❌ Failed to update:', result.error);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

addScoreSheetsToCMS();