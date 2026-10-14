const scoreSheets = [
  { name: 'Score Sheets for All Classes', file: '/score-sheets-index.html', category: 'academic', icon: '📊', description: 'Printable score sheets for Play Group to Grade 6 with student names pre-populated from school register.' }
];

async function addScoreSheetsToCMS() {
  try {
    const response = await fetch('/api/content');
    const data = await response.json();
    if (!data.success) { console.error('Failed to fetch content:', data); return; }
    
    let content = data.content || {};
    if (!content.downloads) content.downloads = [];
    
    // Remove ALL score sheet entries
    content.downloads = content.downloads.filter(d => 
      !d.file || (!d.file.includes('score-sheet') && !d.file.includes('score-sheets'))
    );
    
    // Add single entry
    content.downloads = [...content.downloads, ...scoreSheets];
    
    const token = localStorage.getItem('adminToken');
    const updateResponse = await fetch('/api/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(content)
    });
    
    const result = await updateResponse.json();
    console.log('Result:', result);
    if (result.success) { console.log('Cleaned up!'); location.reload(); }
    else { console.error('Failed:', result.error); }
  } catch (err) { console.error('Error:', err); }
}

addScoreSheetsToCMS();