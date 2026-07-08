const express = require('express');
const router = express.Router();
const sheets = require('../services/sheets');

// ============================================
// STUDENT LOGIN (Check In/Out)
// ============================================
router.post('/login', async (req, res) => {
  const { studentId, pin, action } = req.body;

  if (!studentId || !pin) {
    return res.json({
      success: false,
      message: '❌ Please enter Student ID and PIN'
    });
  }

  try {
    const studentData = await sheets.getSheetData('STUDENTS', 'A:E');
    const today = sheets.getToday();
    const now = sheets.getNow();

    let studentName = '';
    let studentFound = false;
    for (let i = 1; i < studentData.length; i++) {
      if (studentData[i][0] === studentId && studentData[i][4] === pin) {
        studentName = studentData[i][1];
        studentFound = true;
        break;
      }
    }

    if (!studentFound) {
      return res.json({
        success: false,
        message: '❌ Invalid Student ID or PIN'
      });
    }

    const attendanceData = await sheets.getSheetData('StudentAttendance', 'A:F');
    let hasActiveCheckIn = false;
    let hasCheckedOut = false;
    let checkOutRow = -1;

    for (let r = 1; r < attendanceData.length; r++) {
      if (!attendanceData[r] || !attendanceData[r][1]) continue;
      const recordDate = attendanceData[r][0]?.split('T')[0] || attendanceData[r][0];
      if (recordDate === today && attendanceData[r][1] === studentId) {
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
          message: `❌ ${studentName} already checked out today. Cannot check in again.`
        });
      }
      if (hasActiveCheckIn) {
        return res.json({
          success: false,
          message: `⚠️ ${studentName} already checked in today. Please check out first.`
        });
      }

      await sheets.appendRow('StudentAttendance', [today, studentId, studentName, now, '', status]);
      return res.json({
        success: true,
        message: `✅ ${studentName} checked in at ${now} (${status})`
      });
    }

    if (action === 'OUT') {
      if (!hasActiveCheckIn) {
        return res.json({
          success: false,
          message: `❌ No active check-in found for ${studentName} today.`
        });
      }

      await sheets.updateRange('StudentAttendance', `E${checkOutRow}`, [[now]]);
      return res.json({
        success: true,
        message: `✅ ${studentName} checked out at ${now}`
      });
    }

    res.json({ success: false, message: '❌ Invalid action' });
  } catch (error) {
    res.json({ success: false, message: `❌ Error: ${error.message}` });
  }
});

// ============================================
// GET ALL STUDENTS
// ============================================
router.get('/all', async (req, res) => {
  try {
    const data = await sheets.getSheetData('STUDENTS', 'A:H');
    const students = [];
    let totalMale = 0, totalFemale = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i] && data[i][0]) {
        const gender = data[i][5] || '';
        if (gender === 'Male') totalMale++;
        if (gender === 'Female') totalFemale++;

        students.push({
          id: data[i][0] || '',
          name: data[i][1] || '',
          grade: data[i][2] || '',
          guardian: data[i][3] || '',
          pin: data[i][4] || '1234',
          gender: gender,
          dateAdded: data[i][6] || '',
          isBoarding: data[i][7] === 'YES'
        });
      }
    }

    res.json({
      success: true,
      students,
      totalMale,
      totalFemale,
      totalStudents: students.length
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ============================================
// ADD STUDENT
// ============================================
router.post('/add', async (req, res) => {
  const { name, grade, guardian, pin, gender, isBoarding } = req.body;

  if (!name || !grade || !guardian) {
    return res.json({
      success: false,
      message: '❌ Please fill in all required fields'
    });
  }

  try {
    const data = await sheets.getSheetData('STUDENTS', 'A:H');

    for (let i = 1; i < data.length; i++) {
      if (!data[i] || !data[i][1]) continue;
      if (data[i][1].toLowerCase() === name.toLowerCase() && data[i][2] === grade) {
        return res.json({
          success: false,
          message: `⚠️ Student ${name} is already registered in ${grade}!`
        });
      }
    }

    let maxId = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].startsWith('ST')) {
        const num = parseInt(data[i][0].replace('ST', ''));
        if (!isNaN(num) && num > maxId) maxId = num;
      }
    }

    const studentId = 'ST' + String(maxId + 1).padStart(3, '0');
    const dateStr = sheets.getToday();
    const boardingStatus = isBoarding ? 'YES' : 'NO';

    await sheets.appendRow('STUDENTS', [studentId, name, grade, guardian, pin || '1234', gender || 'Male', dateStr, boardingStatus]);
    res.json({
      success: true,
      message: `✅ Student ${name} added successfully! ID: ${studentId}${isBoarding ? ' (Boarder)' : ' (Day Scholar)'}`
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ============================================
// DELETE STUDENT
// ============================================
router.delete('/delete', async (req, res) => {
  const { studentId } = req.body;

  try {
    const data = await sheets.getSheetData('STUDENTS', 'A:H');
    let rowToDelete = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === studentId) {
        rowToDelete = i + 1;
        break;
      }
    }

    if (rowToDelete === -1) {
      return res.json({
        success: false,
        message: '❌ Student not found'
      });
    }

    await sheets.clearRow('STUDENTS', rowToDelete);
    res.json({
      success: true,
      message: `✅ Student ${studentId} deleted successfully!`
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ============================================
// UPDATE STUDENT
// ============================================
router.put('/update', async (req, res) => {
  const { studentId, name, grade, guardian, pin, gender, isBoarding } = req.body;

  try {
    const data = await sheets.getSheetData('STUDENTS', 'A:H');
    let rowToUpdate = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === studentId) {
        rowToUpdate = i + 1;
        break;
      }
    }

    if (rowToUpdate === -1) {
      return res.json({
        success: false,
        message: '❌ Student not found'
      });
    }

    await sheets.updateRange('STUDENTS', `B${rowToUpdate}:H${rowToUpdate}`, [[name, grade, guardian, pin, gender, data[rowToUpdate-1][6] || '', isBoarding ? 'YES' : 'NO']]);
    res.json({
      success: true,
      message: `✅ Student ${name} updated successfully!`
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

module.exports = router;