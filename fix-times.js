const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/schoolDB')
  .then(async () => {
    console.log('Connected to MongoDB');
    const db = mongoose.connection.db;
    const teachers = db.collection('teachers');
    
    const allTeachers = await teachers.find({}).toArray();
    let totalFixed = 0;
    
    console.log('Found', allTeachers.length, 'teachers');
    
    // Get current Kenya time as reference
    const now = new Date();
    const kenyaTimeString = now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    const kenyaNow = new Date(kenyaTimeString);
    const kenyaHour = kenyaNow.getHours();
    
    console.log('Current Kenya hour:', kenyaHour);
    
    for (const teacher of allTeachers) {
      if (teacher.attendance && teacher.attendance.length > 0) {
        let updated = false;
        for (const record of teacher.attendance) {
          // Fix check-in time
          if (record.checkIn) {
            const date = new Date(record.checkIn);
            const hours = date.getHours();
            let fixedDate = null;
            
            // If hour is between 0-5 (early morning), it should be 10-15 (midday)
            // Add 10 hours to fix
            if (hours >= 0 && hours < 6) {
              fixedDate = new Date(date.getTime() + (10 * 60 * 60 * 1000));
            } 
            // If hour is between 6-11 (morning), add 3 hours for Kenya time
            else if (hours >= 6 && hours < 12) {
              fixedDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
            }
            // If hour is between 12-23 (PM), it might be correct or need adjustment
            else if (hours >= 12 && hours < 18) {
              // These might be correct, check if they're before current hour
              if (hours < kenyaHour - 2) {
                // If it's more than 2 hours behind, add 3 hours
                fixedDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
              }
            }
            
            if (fixedDate) {
              record.checkIn = fixedDate;
              updated = true;
              console.log('Fixed check-in for:', teacher.firstName, teacher.lastName, 'from', date.toLocaleString(), 'to', fixedDate.toLocaleString());
            }
          }
          
          // Fix check-out time
          if (record.checkOut) {
            const date = new Date(record.checkOut);
            const hours = date.getHours();
            let fixedDate = null;
            
            if (hours >= 0 && hours < 6) {
              fixedDate = new Date(date.getTime() + (10 * 60 * 60 * 1000));
            } else if (hours >= 6 && hours < 12) {
              fixedDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
            } else if (hours >= 12 && hours < 18) {
              if (hours < kenyaHour - 2) {
                fixedDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
              }
            }
            
            if (fixedDate) {
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
    console.error('Error:', e);
    process.exit(1);
  });