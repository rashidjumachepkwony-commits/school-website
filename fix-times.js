// Save as fix-all-times.js
const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/schoolDB')
  .then(async () => {
    const db = mongoose.connection.db;
    const teachers = db.collection('teachers');
    
    const allTeachers = await teachers.find({}).toArray();
    let totalFixed = 0;
    
    for (const teacher of allTeachers) {
      if (teacher.attendance && teacher.attendance.length > 0) {
        let updated = false;
        for (const record of teacher.attendance) {
          // Fix check-in time
          if (record.checkIn) {
            const date = new Date(record.checkIn);
            // Get the hour in UTC
            const utcHours = date.getUTCHours();
            // If UTC hour is 21 (9 PM), it should be 9 AM in Kenya (UTC+3)
            // Subtract 12 hours to fix
            if (utcHours >= 12 && utcHours <= 23) {
              const fixedDate = new Date(date.getTime() - (12 * 60 * 60 * 1000));
              record.checkIn = fixedDate;
              updated = true;
              console.log('Fixed check-in for:', teacher.firstName, teacher.lastName, 'from', date.toLocaleString(), 'to', fixedDate.toLocaleString());
            }
          }
          // Fix check-out time
          if (record.checkOut) {
            const date = new Date(record.checkOut);
            const utcHours = date.getUTCHours();
            if (utcHours >= 12 && utcHours <= 23) {
              const fixedDate = new Date(date.getTime() - (12 * 60 * 60 * 1000));
              record.checkOut = fixedDate;
              updated = true;
              console.log('Fixed check-out for:', teacher.firstName, teacher.lastName, 'from', date.toLocaleString(), 'to', fixedDate.toLocaleString());
            }
          }
        }
        if (updated) {
          await teachers.updateOne(
            { _id: teacher._id },
            { $set: { attendance: teacher.attendance } }
          );
          totalFixed++;
        }
      }
    }
    
    console.log('Total teachers fixed:', totalFixed);
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });