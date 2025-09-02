const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const { ensureDirectoryExistence } = require('./utilities');

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
  
  await ensureDirectoryExistence(attendanceDir);
  await ensureDirectoryExistence(locationsDir);
};

// Initialize directories
ensureAttendanceDirectories();

// Mark attendance
app.post('/api/attendance/mark', verifyToken, async (req, res) => {
  try {
    const { id, userId, userName, date, time, location, selfieData, status } = req.body;
    
    // Debug logging
    console.log('Attendance marking request:');
    console.log('req.user.userId:', req.user.userId, 'type:', typeof req.user.userId);
    console.log('body.userId:', userId, 'type:', typeof userId);
    console.log('Comparison result:', req.user.userId !== userId);
    console.log('Strict equality:', req.user.userId === userId);
    console.log('Loose equality:', req.user.userId == userId);
    
    // Verify the user making the request matches the attendance record
    // Use loose equality to handle potential type differences
    if (req.user.userId != userId) {
      console.log('Authorization failed - user ID mismatch');
      return res.status(403).json({ success: false, message: 'Unauthorized to mark attendance for this user' });
    }
    
    console.log('Authorization passed - proceeding with attendance marking');

    // Check if attendance already marked for today
    const attendanceDir = path.join(__dirname, '..', 'db', 'attendance');
    const attendanceFilePath = path.join(attendanceDir, 'records.json');
    
    // Ensure directory exists
    await ensureDirectoryExistence(attendanceDir);
    
    let attendanceRecords = [];
    
    try {
      const data = await fs.readFile(attendanceFilePath, 'utf8');
      attendanceRecords = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, start with empty array
      attendanceRecords = [];
    }

    // Check if user already marked attendance for this date
    const existingRecord = attendanceRecords.find(record => 
      record.userId === userId && record.date === date
    );

    if (existingRecord) {
      return res.status(400).json({ 
        success: false, 
        message: 'Attendance already marked for today' 
      });
    }

    // Create attendance record
    const attendanceRecord = {
      id,
      userId,
      userName,
      date,
      time,
      location,
      selfieData,
      status,
      timestamp: new Date().toISOString()
    };

    attendanceRecords.push(attendanceRecord);

    // Save to file
    await fs.writeFile(attendanceFilePath, JSON.stringify(attendanceRecords, null, 2));

    // Update user's current location
    await updateUserLocation(userId, userName, location);

    res.status(200).json({ 
      success: true, 
      message: 'Attendance marked successfully',
      record: attendanceRecord
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to mark attendance' });
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
    const { location } = req.body;
    const userId = req.user.userId;
    
    // Get user name
    const usersFilePath = path.join(__dirname, '..', 'db', 'users.json');
    const usersData = await fs.readFile(usersFilePath, 'utf8');
    const users = JSON.parse(usersData);
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    await updateUserLocation(userId, user.name, location);
    
    res.status(200).json({ success: true, message: 'Location updated successfully' });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
});

// Helper function to update user location
const updateUserLocation = async (userId, userName, location) => {
  try {
    const locationsDir = path.join(__dirname, '..', 'db', 'locations');
    const locationsFilePath = path.join(locationsDir, 'current.json');
    
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
    
    const locationRecord = {
      userId,
      userName,
      currentLocation: location,
      lastUpdated: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      // Update existing record
      locations[existingIndex] = locationRecord;
    } else {
      // Add new record
      locations.push(locationRecord);
    }
    
    await fs.writeFile(locationsFilePath, JSON.stringify(locations, null, 2));
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

module.exports = app;