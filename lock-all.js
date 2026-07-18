// lock-all.js - Permanently lock all check-in/out times
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://127.0.0.1:27017');

async function run() {
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');
        
        const db = client.db('schoolDB');
        let total = 0;
        
        // ============================================
        // LOCK TEACHERS
        // ============================================
        console.log('🔒 Locking teachers...');
        const teachers = await db.collection('teachers').find({}).toArray();
        
        console.log(`📚 Found ${teachers.length} teachers`);
        
        for (const teacher of teachers) {
            let changed = false;
            let recordCount = 0;
            
            for (const record of teacher.attendance || []) {
                if (!record.isLocked) {
                    record.isLocked = true;
                    record.lockedAt = new Date();
                    record.lockedBy = 'System';
                    changed = true;
                    recordCount++;
                }
            }
            
            if (changed) {
                await db.collection('teachers').updateOne(
                    { _id: teacher._id },
                    { $set: { attendance: teacher.attendance } }
                );
                total++;
                console.log(`  ✅ ${teacher.firstName} ${teacher.lastName} (${recordCount} records locked)`);
            }
        }
        
        console.log(`✅ Locked ${total} teacher records\n`);
        
        // ============================================
        // LOCK VISITORS
        // ============================================
        console.log('👤 Locking visitors...');
        const visitors = await db.collection('visitors').find({}).toArray();
        
        console.log(`📚 Found ${visitors.length} visitors`);
        let visitorTotal = 0;
        
        for (const visitor of visitors) {
            let changed = false;
            
            if (!visitor.isLocked) {
                visitor.isLocked = true;
                visitor.lockedAt = new Date();
                visitor.lockedBy = 'System';
                changed = true;
            }
            
            if (visitor.checkIn && !visitor.checkInLocked) {
                visitor.checkInLocked = true;
                changed = true;
            }
            
            if (visitor.checkOut && !visitor.checkOutLocked) {
                visitor.checkOutLocked = true;
                changed = true;
            }
            
            if (changed) {
                await db.collection('visitors').updateOne(
                    { _id: visitor._id },
                    { 
                        $set: {
                            isLocked: visitor.isLocked,
                            lockedAt: visitor.lockedAt,
                            lockedBy: visitor.lockedBy,
                            checkInLocked: visitor.checkInLocked,
                            checkOutLocked: visitor.checkOutLocked
                        }
                    }
                );
                visitorTotal++;
                console.log(`  ✅ ${visitor.firstName} ${visitor.lastName}`);
            }
        }
        
        console.log(`✅ Locked ${visitorTotal} visitors\n`);
        
        // ============================================
        // SUMMARY
        // ============================================
        console.log('='.repeat(50));
        console.log(`🔒 PERMANENTLY LOCKED: ${total + visitorTotal} records`);
        console.log('📚 Teachers: ' + total);
        console.log('👤 Visitors: ' + visitorTotal);
        console.log('='.repeat(50));
        console.log('\n✅ ALL CHECK-IN/OUT TIMES ARE PERMANENTLY LOCKED!');
        console.log('   No one can edit or modify these records.');
        
        await client.close();
    } catch (err) {
        console.error('❌ Error:', err.message);
        await client.close();
    }
}

run();