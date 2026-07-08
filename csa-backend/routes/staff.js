const express = require('express');
const router = express.Router();
const sheets = require('../services/sheets');

// ============================================
// STAFF LOGIN (Check In/Out)
// ============================================
router.post('/login', async (req, res) => {
  const { staffId, pin, action } = req.body;

  if (!staffId || !pin) {
    return res.status(400).json({
      success: false,
      message: '❌ Please enter Staff ID and PIN'
    });
  }

  try {
    const staffData = await sheets.getSheetData('STAFF', 'A:D');
    const today = sheets.getToday();
    const now = sheets.getNow();

    let staffName = '';
    let staffFound = false;
    for (let i = 1; i < staffData.length; i++) {
      if (staffData[i][0] === staffId && staffData[i][3] === pin) {
        staffName = staffData[i][1];
        staffFound = true;
        break;
      }
    }

    if (!staffFound) {
      return res.json({
        success: false,
        message: '❌ Invalid Staff ID or PIN'
      });
    }

    const attendanceData = await sheets.getSheetData('Attendance', 'A:F');
    let hasActiveCheckIn = false;
    let hasCheckedOut = false;
    let checkOutRow = -1;

    for (let r = 1; r < attendanceData.length; r++) {
      if (!attendanceData[r] || !attendanceData[r][1]) continue;
      const recordDate = attendanceData[r][0]?.split('T')[0] || attendanceData[r][0];
      if (recordDate === today && attendanceData[r][1] === staffId) {
        if (attendanceData[r][4] && attendanceData[r][4].trim() !== '') {
          hasCheckedOut = true;
          continue;
        }
        hasActiveCheckIn = true;
        checkOutRow = r + 1;
        break;
      }
    }

    const currentHour = parseInt(now.split(':')[0]);
    const status = currentHour < 7 ? 'ON TIME' : 'LATE';

    if (action === 'IN') {
      if (hasCheckedOut) {
        return res.json({
          success: false,
          message: `❌ ${staffName} already checked out today. Cannot check in again.`
        });
      }
      if (hasActiveCheckIn) {
        return res.json({
          success: false,
          message: `⚠️ ${staffName} already checked in today. Please check out first.`
        });
      }

      await sheets.appendRow('Attendance', [today, staffId, staffName, now, '', status]);
      return res.json({
        success: true,
        message: `✅ ${staffName} checked in successfully at ${now} (${status})`
      });
    }

    if (action === 'OUT') {
      if (!hasActiveCheckIn) {
        return res.json({
          success: false,
          message: `❌ No active check-in found for ${staffName} today.`
        });
      }

      await sheets.updateRange('Attendance', `E${checkOutRow}:F${checkOutRow}`, [[now, 'COMPLETED']]);
      return res.json({
        success: true,
        message: `✅ ${staffName} checked out successfully at ${now}`
      });
    }

    res.json({ success: false, message: '❌ Invalid action' });
  } catch (error) {
    console.error('Staff login error:', error);
    res.json({ success: false, message: `❌ Error: ${error.message}` });
  }
});

// ============================================
// GET ALL STAFF
// ============================================
router.get('/all', async (req, res) => {
  try {
    const data = await sheets.getSheetData('STAFF', 'A:H');
    const staff = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i] && data[i][0]) {
        staff.push({
          id: data[i][0] || '',
          name: data[i][1] || '',
          position: data[i][2] || '',
          pin: data[i][3] || '1234',
          email: data[i][4] || '',
          phone: data[i][5] || '',
          dateAdded: data[i][6] || '',
          status: data[i][7] || 'ACTIVE'
        });
      }
    }
    res.json({ success: true, staff, total: staff.length });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ============================================
// ADD STAFF
// ============================================
router.post('/add', async (req, res) => {
  const { staffId, name, position, pin, email, phone } = req.body;

  if (!staffId || !name || !position) {
    return res.json({ success: false, message: '❌ Please fill in all required fields' });
  }

  try {
    const staffData = await sheets.getSheetData('STAFF', 'A:H');
    for (let i = 1; i < staffData.length; i++) {
      if (staffData[i][0] === staffId) {
        return res.json({ success: false, message: `⚠️ Staff ID ${staffId} already exists!` });
      }
      if (staffData[i][4] === email) {
        return res.json({ success: false, message: `⚠️ Email ${email} is already registered!` });
      }
    }

    const dateStr = sheets.getToday();
    await sheets.appendRow('STAFF', [staffId, name, position, pin || '1234', email || '', phone || '', dateStr, 'ACTIVE']);
    res.json({ success: true, message: `✅ Staff ${name} added successfully! ID: ${staffId}` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ============================================
// GENERATE STAFF ID
// ============================================
router.get('/generate-id', async (req, res) => {
  try {
    const data = await sheets.getSheetData('STAFF', 'A:A');
    let maxId = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].startsWith('STF')) {
        const num = parseInt(data[i][0].replace('STF', ''));
        if (!isNaN(num) && num > maxId) maxId = num;
      }
    }
    const newId = 'STF' + String(maxId + 1).padStart(3, '0');
    res.json({ success: true, staffId: newId });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

module.exports = router;