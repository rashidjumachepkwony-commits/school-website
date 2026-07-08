const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// SIMPLE TEST ROUTES
// ============================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running!' });
});

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Changara Star Academy API',
    endpoints: {
      health: '/api/health',
      visitor_checkin: '/api/visitor/checkin (POST)',
      visitor_checkout: '/api/visitor/checkout (POST)',
      visitor_today: '/api/visitor/today (GET)'
    }
  });
});

// ============================================
// VISITOR ROUTES (Simple version)
// ============================================

// Visitor Check-In
app.post('/api/visitor/checkin', (req, res) => {
  const { id, name, phone, purpose } = req.body;
  
  if (!id || !name) {
    return res.json({
      success: false,
      message: '❌ Please enter Visitor ID and Name'
    });
  }

  res.json({
    success: true,
    message: `✅ ${name} checked in successfully!`,
    data: { id, name, phone, purpose, time: new Date().toLocaleTimeString() }
  });
});

// Visitor Check-Out
app.post('/api/visitor/checkout', (req, res) => {
  const { id } = req.body;
  
  if (!id) {
    return res.json({
      success: false,
      message: '❌ Please enter Visitor ID'
    });
  }

  res.json({
    success: true,
    message: `✅ Visitor ${id} checked out successfully!`,
    time: new Date().toLocaleTimeString()
  });
});

// Get Today's Visitors
app.get('/api/visitor/today', (req, res) => {
  res.json({
    success: true,
    visitors: [
      { id: 'V001', name: 'John Doe', phone: '0712345678', purpose: 'Meeting', status: 'PRESENT' },
      { id: 'V002', name: 'Jane Smith', phone: '0723456789', purpose: 'Enrollment', status: 'CHECKED OUT' }
    ],
    total: 2
  });
});

// Visitor Stats
app.get('/api/visitor/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      todayVisitors: 5,
      checkedOut: 3,
      pendingCheckout: 2
    }
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`📊 Test: http://localhost:${PORT}/api/health`);
});