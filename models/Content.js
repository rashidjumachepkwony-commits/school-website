const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  // Hero Section
  heroTitle: { type: String, default: 'Welcome to Changara Star Academy' },
  heroSubtitle: { type: String, default: 'Your trusted partner in quality education and school management' },
  
  // About Section
  aboutTitle: { type: String, default: 'About Changara Star Academy' },
  aboutMission: { type: String, default: 'To provide quality education that nurtures talent, builds character, and prepares students for a successful future.' },
  aboutVision: { type: String, default: 'To be a center of excellence in education, producing well-rounded individuals who contribute positively to society.' },
  aboutValues: { type: String, default: 'Excellence, Integrity, Respect, Innovation, Community Engagement' },
  aboutCommitment: { type: String, default: 'Changara Star Academy is dedicated to providing a safe, nurturing, and stimulating environment.' },
  
  // Features
  features: [{
    icon: String,
    title: String,
    description: String
  }],
  
  // Stats
  stats: {
    students: { type: String, default: '500+' },
    staff: { type: String, default: '50+' },
    attendance: { type: String, default: '98%' },
    years: { type: String, default: '15+' }
  },
  
  // Contact Info
  contact: {
    address: { type: String, default: 'Nairobi, Kenya' },
    phone: { type: String, default: '+254 700 000 000' },
    email: { type: String, default: 'info@changarastaracademy.co.ke' },
    workingHours: { type: String, default: 'Monday - Friday: 7:00 AM - 6:00 PM' }
  },
  
  // Footer
  footerText: { type: String, default: 'Committed to providing quality education and fostering excellence.' },
  
  // Metadata
  lastUpdated: { type: Date, default: Date.now },
  updatedBy: { type: String }
}, {
  timestamps: true
});

// Singleton - only one content document
contentSchema.statics.getContent = async function() {
  let content = await this.findOne();
  if (!content) {
    content = await this.create({});
  }
  return content;
};

module.exports = mongoose.model('Content', contentSchema);