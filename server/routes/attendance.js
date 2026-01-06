const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const { ensureDirectoryExistence } = require('./utilities');
const { sendNotificationToAdmins } = require('./push');

require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Middleware to check admin access
const requireAdmin = async (req, res, next) => {
  try {
    const usersFilePath = path.join(__dirname, '..', 'db', 'users.json');
    const usersData = await fs.readFile(usersFilePath, 'utf8');
    const users = JSON.parse(usersData);
    const user = users.find(u => u.id === req.user.userId);
    
    if (!user || !user.routeAccess.includes('Admin')) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error checking admin access' });
  }
};

// Ensure attendance directories exist
const ensureAttendanceDirectories = async () => {
  const attendanceDir = path.join(__dirname, '..', 'db', 'attendance');
  const locationsDir = path.join(__dirname, '..', 'db', 'locations');
  
  // Create directories directly since ensureDirectoryExistence expects file paths
  try {
    await fs.mkdir(attendanceDir, { recursive: true });
    console.log('✅ Attendance directory created/verified:', attendanceDir);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error('❌ Failed to create attendance directory:', error);
    }
  }
  
  try {
    await fs.mkdir(locationsDir, { recursive: true });
    console.log('✅ Locations directory created/verified:', locationsDir);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error('❌ Failed to create locations directory:', error);
    }
  }
};

// Initialize directories
ensureAttendanceDirectories();

// Mark attendance
app.post('/api/attendance/mark', verifyToken, async (req, res) => {
  try {
    const { id, userId, userName, date, time, location, selfieData, status } = req.body;
    
    // Comprehensive debug logging for production debugging
    console.log('=== ATTENDANCE MARKING REQUEST START ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Environment Check:', {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET_SET: process.env.JWT_SECRET ? 'YES' : 'NO',
      JWT_SECRET_VALUE: process.env.JWT_SECRET || 'USING_DEFAULT',
      PORT: process.env.PORT
    });
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request body:', JSON.stringify({
      id: id ? 'present' : 'missing',
      userId: userId,
      userName: userName ? 'present' : 'missing',
      date: date,
      time: time,
      location: location ? 'present' : 'missing',
      selfieData: selfieData ? `present (${selfieData.length} chars)` : 'missing',
      status: status
    }, null, 2));
    console.log('JWT decoded user:', JSON.stringify(req.user, null, 2));
    console.log('User ID comparison:');
    console.log('  req.user.userId:', req.user.userId, 'type:', typeof req.user.userId);
    console.log('  body.userId:', userId, 'type:', typeof userId);
    console.log('  Strict equality (===):', req.user.userId === userId);
    console.log('  Loose equality (==):', req.user.userId == userId);
    console.log('  String comparison:', String(req.user.userId) === String(userId));
    console.log('  Number comparison:', Number(req.user.userId) === Number(userId));
    
    // Verify the user making the request matches the attendance record
    // Handle potential type differences between JWT token and request body
    const jwtUserId = req.user.userId;
    const requestUserId = userId;
    const userIdMatch = (Number(jwtUserId) === Number(requestUserId)) || (String(jwtUserId) === String(requestUserId));
    
    console.log('Authorization check:');
    console.log('  JWT User ID (converted to number):', Number(jwtUserId));
    console.log('  Request User ID (converted to number):', Number(requestUserId));
    console.log('  User ID match result:', userIdMatch);
    
    if (!userIdMatch) {
      console.log('❌ AUTHORIZATION FAILED - User ID mismatch');
      console.log('  Expected:', jwtUserId, '(type:', typeof jwtUserId, ')');
      console.log('  Received:', requestUserId, '(type:', typeof requestUserId, ')');
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to mark attendance for this user',
        debug: {
          expectedUserId: jwtUserId,
          receivedUserId: requestUserId,
          expectedType: typeof jwtUserId,
          receivedType: typeof requestUserId
        }
      });
    }
    
    console.log('✅ AUTHORIZATION PASSED - Proceeding with attendance marking');

    // Validate required fields
    const requiredFields = { id, userId, userName, date, time, location, selfieData, status };
    const missingFields = [];
    
    for (const [field, value] of Object.entries(requiredFields)) {
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      console.log('❌ VALIDATION FAILED - Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields: missingFields
      });
    }
    
    // Validate location object structure
    if (!location.latitude || !location.longitude) {
      console.log('❌ VALIDATION FAILED - Invalid location data');
      return res.status(400).json({
        success: false,
        message: 'Location must include latitude and longitude',
        receivedLocation: location
      });
    }
    
    console.log('✅ VALIDATION PASSED - All required fields present');

    // Check if attendance already marked for today
    const attendanceDir = path.join(__dirname, '..', 'db', 'attendance');
    const attendanceFilePath = path.join(attendanceDir, 'records.json');
    
    console.log('📁 Checking attendance directory:', attendanceDir);
    
    // Ensure directory exists
    try {
      await ensureDirectoryExistence(attendanceDir);
      console.log('✅ Attendance directory ensured');
    } catch (error) {
      console.log('❌ Failed to ensure attendance directory:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to access attendance storage',
        error: error.message
      });
    }
    
    let attendanceRecords = [];
    
    try {
      console.log('📖 Reading attendance records from:', attendanceFilePath);
      const data = await fs.readFile(attendanceFilePath, 'utf8');
      attendanceRecords = JSON.parse(data);
      console.log('✅ Successfully loaded', attendanceRecords.length, 'existing attendance records');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 Attendance file does not exist, starting with empty array');
        attendanceRecords = [];
      } else {
        console.log('❌ Failed to read attendance records:', error.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to read attendance records',
          error: error.message
        });
      }
    }

    // Check if user already marked attendance for this date
    console.log('🔍 Checking for existing attendance record for user', userId, 'on date', date);
    const existingRecord = attendanceRecords.find(record => 
      Number(record.userId) === Number(userId) && record.date === date
    );

    if (existingRecord) {
      console.log('❌ DUPLICATE ATTENDANCE - User already marked attendance for today');
      console.log('  Existing record:', JSON.stringify(existingRecord, null, 2));
      return res.status(400).json({ 
        success: false, 
        message: 'Attendance already marked for today',
        existingRecord: {
          id: existingRecord.id,
          time: existingRecord.time,
          status: existingRecord.status
        }
      });
    }
    
    console.log('✅ No existing attendance found - proceeding with new record');

    // Create attendance record
    const attendanceRecord = {
      id,
      userId: Number(userId), // Ensure userId is stored as number for consistency
      userName,
      date,
      time,
      location,
      selfieData,
      status,
      timestamp: new Date().toISOString()
    };

    console.log('📝 Creating new attendance record:', JSON.stringify({
      id: attendanceRecord.id,
      userId: attendanceRecord.userId,
      userName: attendanceRecord.userName,
      date: attendanceRecord.date,
      time: attendanceRecord.time,
      status: attendanceRecord.status,
      timestamp: attendanceRecord.timestamp,
      locationPresent: !!attendanceRecord.location,
      selfieDataLength: attendanceRecord.selfieData ? attendanceRecord.selfieData.length : 0
    }, null, 2));

    attendanceRecords.push(attendanceRecord);

    // Save to file
    try {
      console.log('💾 Saving attendance records to file...');
      await fs.writeFile(attendanceFilePath, JSON.stringify(attendanceRecords, null, 2));
      console.log('✅ Attendance records saved successfully');
    } catch (error) {
      console.log('❌ Failed to save attendance records:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to save attendance record',
        error: error.message
      });
    }

    // Update user's current location
    try {
      console.log('📍 Updating user location...');
      await updateUserLocation(userId, userName, location);
      console.log('✅ User location updated successfully');
    } catch (error) {
      console.log('⚠️ Failed to update user location (attendance still recorded):', error.message);
      // Don't fail the entire request if location update fails
    }

    // Send push notification to admins about attendance marking
    try {
      console.log('📱 Sending push notification to admins...');
      
      // Format date and time in DD/MM/YYYY HH:MM:SS AM format
      const attendanceDate = new Date(attendanceRecord.timestamp);
      const formattedDate = attendanceDate.toLocaleDateString('en-GB'); // DD/MM/YYYY format
      const formattedTime = attendanceDate.toLocaleTimeString('en-US', { 
        hour12: true, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }); // HH:MM:SS AM/PM format
      
      const notificationPayload = {
        title: 'Attendance Marked',
        message: `${userName} marked attendance as ${status.toUpperCase()} on ${formattedDate} at ${formattedTime}`,
        data: {
          url: '/admin/attendance',
          endpoint: 'attendance',
          id: attendanceRecord.id,
          userId: userId,
          userName: userName,
          date: formattedDate,
          time: formattedTime,
          status: status
        }
      };
      
      sendNotificationToAdmins(notificationPayload);
      console.log('✅ Push notification sent to admins successfully');
    } catch (notificationError) {
      console.log('⚠️ Failed to send push notification to admins:', notificationError.message);
      // Don't fail the entire request if notification fails
    }

    console.log('🎉 ATTENDANCE MARKED SUCCESSFULLY');
    console.log('=== ATTENDANCE MARKING REQUEST END ===');
    
    res.status(200).json({ 
      success: true, 
      message: 'Attendance marked successfully',
      record: {
        id: attendanceRecord.id,
        userId: attendanceRecord.userId,
        userName: attendanceRecord.userName,
        date: attendanceRecord.date,
        time: attendanceRecord.time,
        status: attendanceRecord.status,
        timestamp: attendanceRecord.timestamp
      }
    });
  } catch (error) {
    console.log('❌ CRITICAL ERROR in attendance marking:');
    console.log('  Error message:', error.message);
    console.log('  Error stack:', error.stack);
    console.log('  Error name:', error.name);
    console.log('  Request body at time of error:', JSON.stringify(req.body, null, 2));
    console.log('  User from JWT at time of error:', JSON.stringify(req.user, null, 2));
    console.log('=== ATTENDANCE MARKING REQUEST END (ERROR) ===');
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark attendance - server error',
      error: {
        message: error.message,
        name: error.name,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Check if attendance marked for today
app.post('/api/attendance/check-today', verifyToken, async (req, res) => {
  try {
    const { date, userId } = req.body;
    
    // Verify the user making the request matches the userId
    if (req.user.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const attendanceFilePath = path.join(__dirname, '..', 'db', 'attendance', 'records.json');
    
    try {
      const data = await fs.readFile(attendanceFilePath, 'utf8');
      const attendanceRecords = JSON.parse(data);
      
      const hasMarked = attendanceRecords.some(record => 
        record.userId === userId && record.date === date
      );
      
      res.status(200).json({ success: true, hasMarked });
    } catch (error) {
      // File doesn't exist, so no attendance marked
      res.status(200).json({ success: true, hasMarked: false });
    }
  } catch (error) {
    console.error('Error checking today attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to check attendance' });
  }
});

// Get attendance history for a user
app.post('/api/attendance/history', verifyToken, async (req, res) => {
  try {
    const { userId, month, year } = req.body;
    
    // Verify the user making the request matches the userId
    if (req.user.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const attendanceFilePath = path.join(__dirname, '..', 'db', 'attendance', 'records.json');
    
    try {
      const data = await fs.readFile(attendanceFilePath, 'utf8');
      const attendanceRecords = JSON.parse(data);
      
      // Filter records for the specific user and month/year
      const filteredRecords = attendanceRecords.filter(record => {
        if (record.userId !== userId) return false;
        
        const recordDate = new Date(record.date);
        const recordMonth = (recordDate.getMonth() + 1).toString().padStart(2, '0');
        const recordYear = recordDate.getFullYear().toString();
        
        return recordMonth === month && recordYear === year;
      });
      
      // Sort by date (newest first)
      filteredRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      res.status(200).json({ success: true, records: filteredRecords });
    } catch (error) {
      // File doesn't exist, return empty array
      res.status(200).json({ success: true, records: [] });
    }
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance history' });
  }
});

// Admin: Get all attendance records for a specific date
app.post('/api/attendance/admin/records', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { date, userId } = req.body;
    
    const attendanceFilePath = path.join(__dirname, '..', 'db', 'attendance', 'records.json');
    
    try {
      const data = await fs.readFile(attendanceFilePath, 'utf8');
      const attendanceRecords = JSON.parse(data);
      
      // Filter records for the specific date and optionally by user
      let filteredRecords = attendanceRecords.filter(record => record.date === date);
      
      if (userId) {
        filteredRecords = filteredRecords.filter(record => record.userId === parseInt(userId));
      }
      
      // Sort by time
      filteredRecords.sort((a, b) => a.time.localeCompare(b.time));
      
      res.status(200).json({ success: true, records: filteredRecords });
    } catch (error) {
      // File doesn't exist, return empty array
      res.status(200).json({ success: true, records: [] });
    }
  } catch (error) {
    console.error('Error fetching admin attendance records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance records' });
  }
});

// Admin: Get all user locations
app.get('/api/attendance/admin/locations', verifyToken, requireAdmin, async (req, res) => {
  try {
    const locationsFilePath = path.join(__dirname, '..', 'db', 'locations', 'current.json');
    
    try {
      const data = await fs.readFile(locationsFilePath, 'utf8');
      const locations = JSON.parse(data);
      
      res.status(200).json({ success: true, locations });
    } catch (error) {
      // File doesn't exist, return empty array
      res.status(200).json({ success: true, locations: [] });
    }
  } catch (error) {
    console.error('Error fetching user locations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user locations' });
  }
});

// Update user location (continuous tracking)
app.post('/api/attendance/location/update', verifyToken, async (req, res) => {
  try {
    const { location, source } = req.body;
    const userId = req.user.userId;
    
    // Get user name
    const usersFilePath = path.join(__dirname, '..', 'db', 'users.json');
    const usersData = await fs.readFile(usersFilePath, 'utf8');
    const users = JSON.parse(usersData);
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Log background tracking updates for monitoring
    if (source === 'background' || source === 'service-worker') {
      console.log(`📍 Background location update from user ${user.name} (${userId}):`, {
        source,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp
      });
    }
    
    await updateUserLocation(userId, user.name, location, source);
    
    res.status(200).json({ 
      success: true, 
      message: 'Location updated successfully',
      source: source || 'foreground'
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
});

// Helper function to update user location
const updateUserLocation = async (userId, userName, location, source = 'foreground') => {
  try {
    const locationsDir = path.join(__dirname, '..', 'db', 'locations');
    const locationsFilePath = path.join(locationsDir, 'current.json');
    const historyFilePath = path.join(locationsDir, 'history.json');
    
    // Ensure directory exists
    await ensureDirectoryExistence(locationsDir);
    
    let locations = [];
    
    try {
      const data = await fs.readFile(locationsFilePath, 'utf8');
      locations = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, start with empty array
      locations = [];
    }
    
    // Find existing location record for user
    const existingIndex = locations.findIndex(loc => loc.userId === userId);
    const now = new Date().toISOString();
    
    const locationRecord = {
      userId,
      userName,
      currentLocation: location,
      lastUpdated: now,
      source: source,
      isBackgroundTracking: source === 'background' || source === 'service-worker'
    };
    
    if (existingIndex >= 0) {
      // Update existing record
      locations[existingIndex] = locationRecord;
    } else {
      // Add new record
      locations.push(locationRecord);
    }
    
    await fs.writeFile(locationsFilePath, JSON.stringify(locations, null, 2));
    
    // Also store in history for tracking patterns
    let history = [];
    try {
      const historyData = await fs.readFile(historyFilePath, 'utf8');
      history = JSON.parse(historyData);
    } catch (error) {
      // File doesn't exist, start with empty array
      history = [];
    }
    
    // Add to history (keep last 1000 entries per user to prevent file from growing too large)
    const historyRecord = {
      userId,
      userName,
      location,
      timestamp: now,
      source,
      isBackgroundTracking: source === 'background' || source === 'service-worker'
    };
    
    history.push(historyRecord);
    
    // Keep only last 1000 entries per user
    const userHistory = history.filter(h => h.userId === userId);
    if (userHistory.length > 1000) {
      // Remove oldest entries for this user
      const otherUsersHistory = history.filter(h => h.userId !== userId);
      const recentUserHistory = userHistory.slice(-1000);
      history = [...otherUsersHistory, ...recentUserHistory];
    }
    
    await fs.writeFile(historyFilePath, JSON.stringify(history, null, 2));
    
  } catch (error) {
    console.error('Error updating user location:', error);
    throw error;
  }
};

// Get users list (for admin)
app.get('/api/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const usersFilePath = path.join(__dirname, '..', 'db', 'users.json');
    const usersData = await fs.readFile(usersFilePath, 'utf8');
    const users = JSON.parse(usersData);
    
    // Return user info including role information
    const usersList = users.map(user => ({
      id: user.id,
      name: user.name,
      username: user.username,
      routeAccess: user.routeAccess || [],
      isAdmin: user.routeAccess && user.routeAccess.includes('Admin')
    }));
    
    res.status(200).json({ success: true, users: usersList });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// Admin endpoint to update attendance status
app.post('/api/attendance/admin/update-status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { recordId, newStatus } = req.body;
    
    if (!recordId || !newStatus) {
      return res.status(400).json({ success: false, message: 'Record ID and new status are required' });
    }
    
    if (!['present', 'absent', 'half_day'].includes(newStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be present, absent, or half_day' });
    }
    
    const attendanceDir = path.join(__dirname, '..', 'db', 'attendance');
    const attendanceFilePath = path.join(attendanceDir, 'records.json');
    
    let attendanceRecords = [];
    
    try {
      const data = await fs.readFile(attendanceFilePath, 'utf8');
      attendanceRecords = JSON.parse(data);
    } catch (error) {
      return res.status(404).json({ success: false, message: 'No attendance records found' });
    }
    
    // Find and update the record
    const recordIndex = attendanceRecords.findIndex(record => record.id === recordId);
    
    if (recordIndex === -1) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    
    // Update the status
    attendanceRecords[recordIndex].status = newStatus;
    attendanceRecords[recordIndex].lastModified = new Date().toISOString();
    attendanceRecords[recordIndex].modifiedBy = req.user.userId;
    
    // Save the updated records
    await fs.writeFile(attendanceFilePath, JSON.stringify(attendanceRecords, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Attendance status updated successfully',
      updatedRecord: attendanceRecords[recordIndex]
    });
    
  } catch (error) {
    console.error('Error updating attendance status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Admin endpoint to calculate salary
app.post('/api/attendance/admin/calculate-salary', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId, monthlySalary, weeklyOffDays, month, additions = [], deductions = [] } = req.body;
    
    if (!userId || !monthlySalary || !weeklyOffDays || !month || !Array.isArray(weeklyOffDays)) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID, monthly salary, weekly off days array, and month are required' 
      });
    }
    
    const attendanceDir = path.join(__dirname, '..', 'db', 'attendance');
    const attendanceFilePath = path.join(attendanceDir, 'records.json');
    
    let attendanceRecords = [];
    
    try {
      const data = await fs.readFile(attendanceFilePath, 'utf8');
      attendanceRecords = JSON.parse(data);
    } catch (error) {
      return res.status(404).json({ success: false, message: 'No attendance records found' });
    }
    
    // Filter records for the specific user and month
    const userRecords = attendanceRecords.filter(record => 
      record.userId === parseInt(userId) && record.date.startsWith(month)
    );
    
    // Calculate attendance statistics
    const presentDays = userRecords.filter(record => record.status === 'present').length;
    const halfDays = userRecords.filter(record => record.status === 'half_day').length;
    const absentDays = userRecords.filter(record => record.status === 'absent').length;
    
    // Calculate weekly off days count for the month
    const year = parseInt(month.split('-')[0]);
    const monthNum = parseInt(month.split('-')[1]);
    const totalDaysInMonth = new Date(year, monthNum, 0).getDate();
    
    let weeklyOffDaysCount = 0;
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const date = new Date(year, monthNum - 1, day);
      const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.
      if (weeklyOffDays.includes(dayOfWeek)) {
        weeklyOffDaysCount++;
      }
    }
    
    // Get total working days in the month (excluding weekly offs)
    const totalWorkingDays = totalDaysInMonth - weeklyOffDaysCount;
    
    // Calculate daily salary
    const dailySalary = parseFloat(monthlySalary) / totalWorkingDays;
    
    // Calculate earned salary
    const presentDaysSalary = presentDays * dailySalary;
    const halfDaysSalary = halfDays * (dailySalary * 0.5);
    const totalEarnedSalary = presentDaysSalary + halfDaysSalary;
    
    // Calculate deductions
    const absentDaysDeduction = absentDays * dailySalary;
    const halfDaysDeduction = halfDays * (dailySalary * 0.5);
    
    // Calculate total additions and deductions
    const totalAdditions = additions.reduce((sum, addition) => sum + (parseFloat(addition.amount) || 0), 0);
    const totalDeductions = deductions.reduce((sum, deduction) => sum + (parseFloat(deduction.amount) || 0), 0);
    
    // Calculate final salary (earned salary + additions - attendance deductions - custom deductions)
    const finalSalary = totalEarnedSalary + totalAdditions - absentDaysDeduction - halfDaysDeduction - totalDeductions;
    
    const salaryCalculation = {
      userId: parseInt(userId),
      month,
      monthlySalary: parseFloat(monthlySalary),
      weeklyOffDays: weeklyOffDays,
      weeklyOffDaysCount: weeklyOffDaysCount,
      totalWorkingDays,
      dailySalary: Math.round(dailySalary * 100) / 100,
      attendance: {
        presentDays,
        halfDays,
        absentDays,
        totalRecorded: userRecords.length
      },
      salary: {
        presentDaysSalary: Math.round(presentDaysSalary * 100) / 100,
        halfDaysSalary: Math.round(halfDaysSalary * 100) / 100,
        totalEarnedSalary: Math.round(totalEarnedSalary * 100) / 100,
        absentDaysDeduction: Math.round(absentDaysDeduction * 100) / 100,
        halfDaysDeduction: Math.round(halfDaysDeduction * 100) / 100,
        totalAdditions: Math.round(totalAdditions * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        finalSalary: Math.round(finalSalary * 100) / 100
      },
      additions: additions,
      deductions: deductions,
      calculatedAt: new Date().toISOString(),
      calculatedBy: req.user.userId
    };
    
    // Save salary calculation to a separate file
    const salaryDir = path.join(__dirname, '..', 'db', 'salary');
    const salaryFilePath = path.join(salaryDir, 'calculations.json');
    await ensureDirectoryExistence(salaryFilePath);
    let salaryCalculations = [];
    
    try {
      const data = await fs.readFile(salaryFilePath, 'utf8');
      salaryCalculations = JSON.parse(data);
    } catch (error) {
      salaryCalculations = [];
    }
    
    // Remove any existing calculation for the same user and month
    salaryCalculations = salaryCalculations.filter(calc => 
      !(calc.userId === parseInt(userId) && calc.month === month)
    );
    
    // Add the new calculation with unique ID and user name
    const usersFilePath = path.join(__dirname, '..', 'db', 'users.json');
    let userName = 'Unknown User';
    try {
      const usersData = await fs.readFile(usersFilePath, 'utf8');
      const users = JSON.parse(usersData);
      const user = users.find(u => u.id === parseInt(userId));
      if (user) {
        userName = user.name;
      }
    } catch (error) {
      console.error('Error fetching user name:', error);
    }
    
    salaryCalculation.id = `salary_${userId}_${month}_${Date.now()}`;
    salaryCalculation.userName = userName;
    salaryCalculations.push(salaryCalculation);
    
    // Save the calculations
    await fs.writeFile(salaryFilePath, JSON.stringify(salaryCalculations, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Salary calculated successfully',
      calculation: salaryCalculation
    });
    
  } catch (error) {
    console.error('Error calculating salary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Admin endpoint to get stored salary calculations
app.get('/api/attendance/admin/stored-salaries', verifyToken, requireAdmin, async (req, res) => {
  try {
    const salaryDir = path.join(__dirname, '..', 'db', 'salary');
    const salaryFilePath = path.join(salaryDir, 'calculations.json');
    
    let salaryCalculations = [];
    
    try {
      const data = await fs.readFile(salaryFilePath, 'utf8');
      salaryCalculations = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, return empty array
      salaryCalculations = [];
    }
    
    // Sort by calculation date (newest first)
    salaryCalculations.sort((a, b) => new Date(b.calculatedAt) - new Date(a.calculatedAt));
    
    res.json({ 
      success: true, 
      salaries: salaryCalculations
    });
    
  } catch (error) {
    console.error('Error fetching stored salaries:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Admin endpoint to update salary slip visibility for users
app.post('/api/attendance/admin/salary-slip-visibility', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId, month, isVisible } = req.body;
    
    if (!userId || !month || typeof isVisible !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    const visibilityDir = path.join(__dirname, '..', 'db', 'salary-visibility');
    await fs.mkdir(visibilityDir, { recursive: true });
    
    const visibilityFilePath = path.join(visibilityDir, 'visibility.json');
    
    let visibilityData = {};
    
    try {
      const data = await fs.readFile(visibilityFilePath, 'utf8');
      visibilityData = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, start with empty object
      visibilityData = {};
    }
    
    // Create a unique key for user-month combination
    const visibilityKey = `${userId}_${month}`;
    
    if (isVisible) {
      visibilityData[visibilityKey] = {
        userId,
        month,
        isVisible: true,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.userId
      };
    } else {
      // Remove the entry if setting to not visible
      delete visibilityData[visibilityKey];
    }
    
    // Save the updated visibility data
    await fs.writeFile(visibilityFilePath, JSON.stringify(visibilityData, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Salary slip visibility updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating salary slip visibility:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// User endpoint to fetch visible salary slip
app.post('/api/attendance/user/visible-salary-slip', verifyToken, async (req, res) => {
  try {
    const { userId, month } = req.body;
    
    // Ensure user can only access their own salary slip or admin can access any
    if (req.user.userId !== userId) {
      // Check if user is admin by fetching user data
      const usersFilePath = path.join(__dirname, '..', 'db', 'users.json');
      const usersData = await fs.readFile(usersFilePath, 'utf8');
      const users = JSON.parse(usersData);
      const user = users.find(u => u.id === req.user.userId);
      
      if (!user || !user.routeAccess.includes('Admin')) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    
    if (!userId || !month) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    // Check if salary slip is visible for this user and month
    const visibilityDir = path.join(__dirname, '..', 'db', 'salary-visibility');
    const visibilityFilePath = path.join(visibilityDir, 'visibility.json');
    
    let visibilityData = {};
    
    try {
      const data = await fs.readFile(visibilityFilePath, 'utf8');
      visibilityData = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, no salary slips are visible
      return res.json({ success: true, salarySlip: null });
    }
    
    const visibilityKey = `${userId}_${month}`;
    
    if (!visibilityData[visibilityKey] || !visibilityData[visibilityKey].isVisible) {
      return res.json({ success: true, salarySlip: null });
    }
    
    // Fetch the actual salary slip data
    const salaryDir = path.join(__dirname, '..', 'db', 'salary');
    const salaryFilePath = path.join(salaryDir, 'calculations.json');
    
    let salaryCalculations = [];
    
    try {
      const data = await fs.readFile(salaryFilePath, 'utf8');
      salaryCalculations = JSON.parse(data);
    } catch (error) {
      return res.json({ success: true, salarySlip: null });
    }
    
    // Find the salary slip for this user and month
    const salarySlip = salaryCalculations.find(salary => 
      salary.userId === userId && salary.month === month
    );
    
    res.json({ 
      success: true, 
      salarySlip: salarySlip || null
    });
    
  } catch (error) {
    console.error('Error fetching visible salary slip:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Admin endpoint to get all salary slip visibility states
app.get('/api/attendance/admin/salary-slip-visibility', verifyToken, requireAdmin, async (req, res) => {
  try {
    const visibilityDir = path.join(__dirname, '..', 'db', 'salary-visibility');
    const visibilityFilePath = path.join(visibilityDir, 'visibility.json');
    
    let visibilityData = {};
    
    try {
      const data = await fs.readFile(visibilityFilePath, 'utf8');
      visibilityData = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, return empty object
      visibilityData = {};
    }
    
    res.json({ 
      success: true, 
      visibilityData: visibilityData
    });
    
  } catch (error) {
    console.error('Error fetching salary slip visibility:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Admin endpoint to delete attendance record
app.delete('/api/attendance/admin/delete-record', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { recordId } = req.body;
    
    if (!recordId) {
      return res.status(400).json({ success: false, message: 'Record ID is required' });
    }
    
    const attendanceDir = path.join(__dirname, '..', 'db', 'attendance');
    const attendanceFilePath = path.join(attendanceDir, 'records.json');
    
    let attendanceRecords = [];
    
    try {
      const data = await fs.readFile(attendanceFilePath, 'utf8');
      attendanceRecords = JSON.parse(data);
    } catch (error) {
      return res.status(404).json({ success: false, message: 'No attendance records found' });
    }
    
    // Find the record to delete
    const recordIndex = attendanceRecords.findIndex(record => record.id === recordId);
    
    if (recordIndex === -1) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    
    // Remove the record
    const deletedRecord = attendanceRecords.splice(recordIndex, 1)[0];
    
    // Save the updated records
    await fs.writeFile(attendanceFilePath, JSON.stringify(attendanceRecords, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Attendance record deleted successfully',
      deletedRecord: deletedRecord
    });
    
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Test endpoint for debugging JWT authentication in production
app.get('/api/test-auth', (req, res) => {
  console.log('=== AUTH TEST ENDPOINT ===');
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET_SET: process.env.JWT_SECRET ? 'YES' : 'NO',
    JWT_SECRET_LENGTH: (process.env.JWT_SECRET || 'your-secret-key-here').length,
    FRONTEND_URL: process.env.FRONTEND_URL
  });
  
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  console.log('Token present:', !!token);
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('Token decoded successfully:', { userId: decoded.userId, username: decoded.username });
      res.json({
        success: true,
        message: 'Authentication working',
        user: req.user ? { id: req.user.id, username: req.user.username } : 'No user attached',
        tokenValid: true,
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      console.log('Token verification failed:', error.message);
      res.status(401).json({
        success: false,
        message: 'Token verification failed',
        error: error.message,
        environment: process.env.NODE_ENV || 'development'
      });
    }
  } else {
    res.status(401).json({
      success: false,
      message: 'No token provided',
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// Submit mandatory documents
app.post('/api/docs/submit', verifyToken, async (req, res) => {
  try {
    const { userId, days } = req.body;

    // Verify user matches token
    if (req.user.userId !== userId && req.user.userId !== Number(userId)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const docsDir = path.join(__dirname, '..', 'db', 'mandatory-docs');
    await fs.mkdir(docsDir, { recursive: true });

    for (const day of days) {
      const dayDir = path.join(docsDir, userId.toString(), day.date);
      await fs.mkdir(dayDir, { recursive: true });

      // Helper to save base64
      const saveBase64 = async (base64Data, filename) => {
        if (!base64Data) return;
        // Handle data URI scheme if present
        const base64Image = base64Data.includes(';base64,') 
          ? base64Data.split(';base64,').pop() 
          : base64Data;
        
        await fs.writeFile(path.join(dayDir, filename), base64Image, { encoding: 'base64' });
      };

      if (day.stockRegister) await saveBase64(day.stockRegister, 'stock-register.jpg');
      if (day.cashBook) await saveBase64(day.cashBook, 'cash-book.jpg');
      
      if (day.bankSlips && Array.isArray(day.bankSlips)) {
        for (let i = 0; i < day.bankSlips.length; i++) {
          if (day.bankSlips[i]) {
            await saveBase64(day.bankSlips[i], `bank-slip-${i+1}.jpg`);
          }
        }
      }
      
      // Save metadata
      // Create a clean metadata object without the large base64 strings
      const metadata = {
        date: day.date,
        submittedAt: new Date().toISOString(),
        files: {
          stockRegister: !!day.stockRegister,
          cashBook: !!day.cashBook,
          bankSlipsCount: day.bankSlips ? day.bankSlips.length : 0
        }
      };
      
      await fs.writeFile(path.join(dayDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    }

    res.status(200).json({ success: true, message: 'Documents submitted successfully' });

  } catch (error) {
    console.error('Error submitting documents:', error);
    res.status(500).json({ success: false, message: 'Failed to submit documents' });
  }
});

// Check document status for multiple dates
app.post('/api/docs/status', verifyToken, async (req, res) => {
  try {
    const { userId, dates } = req.body;
    
    // Authorization check
    // Allow user to check their own, or admin to check any
    let isAuthorized = false;
    
    if (req.user.userId === userId || req.user.userId === Number(userId)) {
      isAuthorized = true;
    } else {
       // Check if admin
       const usersFilePath = path.join(__dirname, '..', 'db', 'users.json');
       try {
         const usersData = await fs.readFile(usersFilePath, 'utf8');
         const users = JSON.parse(usersData);
         const requestUser = users.find(u => u.id === req.user.userId);
         if (requestUser && requestUser.routeAccess && requestUser.routeAccess.includes('Admin')) {
            isAuthorized = true;
         }
       } catch (e) {
         console.error('Error reading users file for auth check:', e);
       }
    }
    
    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const docsDir = path.join(__dirname, '..', 'db', 'mandatory-docs');
    const results = {};

    if (Array.isArray(dates)) {
      for (const date of dates) {
        const dayDir = path.join(docsDir, userId.toString(), date);
        try {
          await fs.access(path.join(dayDir, 'metadata.json'));
          results[date] = true; // Submitted
        } catch (e) {
          results[date] = false; // Not submitted
        }
      }
    }

    res.status(200).json({ success: true, status: results });

  } catch (error) {
    console.error('Error checking docs status:', error);
    res.status(500).json({ success: false, message: 'Failed to check status' });
  }
});

module.exports = app;