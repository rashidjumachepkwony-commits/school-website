const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolDB')
  .then(async () => {
    const db = mongoose.connection.db;
    
    // Get ALL assignments
    const assignments = await db.collection('holidayassignments').find({}).toArray();
    
    console.log('📚 Total assignments found:', assignments.length);
    
    // Find assignments NOT on Cloudinary (including those with cloudinaryPublicId = "None")
    const toMigrate = assignments.filter(a => {
        const isCloudinary = a.fileUrl && a.fileUrl.includes('cloudinary.com');
        const hasValidId = a.cloudinaryPublicId && 
                           a.cloudinaryPublicId !== 'None' && 
                           a.cloudinaryPublicId !== '' &&
                           a.cloudinaryPublicId !== null;
        return !isCloudinary && !hasValidId;
    });
    
    console.log('📚 Assignments to migrate:', toMigrate.length);
    
    if (toMigrate.length === 0) {
        console.log('✅ All assignments are already on Cloudinary!');
        process.exit();
        return;
    }
    
    let migrated = 0;
    let failed = 0;
    
    for (const a of toMigrate) {
        console.log('\n---');
        console.log('📄 Processing:', a.title);
        console.log('   File URL:', a.fileUrl);
        console.log('   Cloudinary ID:', a.cloudinaryPublicId || 'None');
        
        // Check if local file exists
        const filename = path.basename(a.fileUrl);
        const filePath = path.join(__dirname, 'uploads', 'assignments', filename);
        
        console.log('   Looking for file:', filePath);
        
        if (!fs.existsSync(filePath)) {
            console.log('❌ File missing:', filename);
            failed++;
            continue;
        }
        
        const fileStats = fs.statSync(filePath);
        console.log('   File size:', fileStats.size, 'bytes');
        
        try {
            console.log('📤 Uploading to Cloudinary...');
            const fileBuffer = fs.readFileSync(filePath);
            
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    {
                        folder: 'assignments',
                        resource_type: 'raw',
                        public_id: Date.now() + '_' + filename.replace(/\.[^.]+$/, '')
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(fileBuffer);
            });
            
            // Update database
            await db.collection('holidayassignments').updateOne(
                { _id: a._id },
                { 
                    $set: { 
                        fileUrl: result.secure_url,
                        cloudinaryPublicId: result.public_id
                    }
                }
            );
            
            console.log('✅ Migrated:', a.title);
            console.log('   URL:', result.secure_url);
            migrated++;
            
            // Delete local file after successful migration
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('🗑️ Deleted local file');
            }
        } catch (error) {
            console.error('❌ Failed:', error.message);
            failed++;
        }
    }
    
    console.log('\n📊 Summary:');
    console.log('   ✅ Migrated:', migrated);
    console.log('   ❌ Failed:', failed);
    process.exit();
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit();
  });