const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

function calculatePerformanceLevel(percentage) {
    if (percentage >= 75) return 'Exceeding Expectation';
    if (percentage >= 41) return 'Meeting Expectation';
    if (percentage >= 21) return 'Approaching Expectation';
    return 'Below Expectation';
}

function getPerformanceRating(level) {
    const ratings = {
        'Exceeding Expectation': 4,
        'Meeting Expectation': 3,
        'Approaching Expectation': 2,
        'Below Expectation': 1
    };
    return ratings[level] || 2;
}

function calculateStudentOverall(assessments) {
    if (!assessments || assessments.length === 0) {
        return { totalScore: 0, averageScore: 0, performanceLevel: 'Approaching Expectation', overallRating: 2 };
    }
    
    let totalScore = 0;
    let totalMaxScore = 0;
    
    assessments.forEach(a => {
        totalScore += a.score || 0;
        totalMaxScore += a.maxScore || 0;
    });
    
    const avgPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    const performanceLevel = calculatePerformanceLevel(avgPercentage);
    
    return {
        totalScore: totalScore,
        averageScore: parseFloat(avgPercentage.toFixed(1)),
        performanceLevel: performanceLevel,
        overallRating: getPerformanceRating(performanceLevel)
    };
}

async function fixAllAssessments() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolDB');
        console.log('✅ Connected to MongoDB');
        
        const db = mongoose.connection.db;
        const collection = db.collection('students');
        
        // Get all students with assessments
        const allStudents = await collection.find({ assessments: { $exists: true, $ne: [] } }).toArray();
        console.log(`📚 Found ${allStudents.length} students with assessments`);
        
        if (allStudents.length === 0) {
            console.log('⚠️ No students with assessments found in the students collection');
            console.log('   Your assessment data might be in a different format.');
            console.log('   Let me check what fields exist...');
            
            // Show sample document structure
            const sample = await collection.findOne({});
            if (sample) {
                console.log('\n📄 Sample student document keys:', Object.keys(sample).join(', '));
                console.log('   Check if you have a field like: assessments, marks, results, etc.');
            }
            process.exit();
        }
        
        let fixed = 0;
        let skipped = 0;
        
        for (const student of allStudents) {
            const corrected = calculateStudentOverall(student.assessments);
            
            const needsFix = 
                student.totalScore !== corrected.totalScore ||
                Math.abs((student.averageScore || 0) - corrected.averageScore) > 0.01 ||
                student.performanceLevel !== corrected.performanceLevel ||
                student.overallRating !== corrected.overallRating;
            
            if (needsFix) {
                await collection.updateOne(
                    { _id: student._id },
                    { 
                        $set: {
                            totalScore: corrected.totalScore,
                            averageScore: corrected.averageScore,
                            performanceLevel: corrected.performanceLevel,
                            overallRating: corrected.overallRating,
                            updatedAt: new Date()
                        }
                    }
                );
                fixed++;
                console.log(`✅ Fixed: ${student.name || 'Unknown'} - Old: ${student.averageScore || 0}% → New: ${corrected.averageScore}% → ${corrected.performanceLevel}`);
            } else {
                skipped++;
            }
        }
        
        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total students with assessments: ${allStudents.length}`);
        console.log(`   ✅ Fixed: ${fixed}`);
        console.log(`   ⏭️  Skipped (already correct): ${skipped}`);
        
        process.exit();
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit();
    }
}

fixAllAssessments();