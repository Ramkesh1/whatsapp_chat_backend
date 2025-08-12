
const crypto = require('crypto');
const moment = require('moment');
const sendMail = require('../utils/nodeMailer'); // you need a mail utility
const { executeQuery } = require('../dbConfig/connnection');
const jwt=require("jsonwebtoken")
const mysecret ="mywhatsappchattingapp"
const decodeToken  = require("../utils/tokenDecode")



exports.sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) return next(new ErrorHandler('Email is required', 400));

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = moment().add(10, 'minutes').format('YYYY-MM-DD HH:mm:ss');

    // Insert OTP to DB
    const insertQuery = `INSERT INTO email_otp_verification (email, otp, expires_at) VALUES (?, ?, ?)`;
    await executeQuery(insertQuery, [email, otp, expiresAt]);

    // Send OTP via email
    await sendMail({
      to: email,
      subject: 'Your OTP for Login',
      text: `Your OTP is: ${otp}`,
    });

    res.json({
      success: true,
      message: 'OTP sent successfully',
    });

  } catch (error) {
    console.log(error);
    return next(error);
  }
};


exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return next(new ErrorHandler('Email and OTP are required', 400));
    }

    const query = `SELECT * FROM email_otp_verification 
                   WHERE email = ? AND otp = ? 
                   ORDER BY created_at DESC LIMIT 1`;

    const [record] = await executeQuery(query, [email, otp]);

    if (!record) {
      return next(new ErrorHandler('Invalid OTP', 400));
    }

    const now = new Date();
    const expiry = new Date(record.expires_at);
    if (now > expiry) {
      return next(new ErrorHandler('OTP has expired', 400));
    }

    // Check if user exists
    const [user] = await executeQuery(`SELECT * FROM users WHERE email = ?`, [email]);

    let userId;
    if (!user) {
      // If not exist, register the user
      const name = email.split('@')[0];
      const profile_picture = null;
      const insertUserQuery = `INSERT INTO users (name, email, is_online, created_at) VALUES (?, ?, ?, NOW())`;
      const result = await executeQuery(insertUserQuery, [name, email, true]);
      userId = result.insertId;
    } else {

        
      userId = user.id;
    }

    const token = jwt.sign({ id: userId }, mysecret, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      message: 'OTP verified and user logged in',
    });

  } catch (error) {
    console.log(error);
    return next(error);
  }
};



// Get current user profile
exports.getProfile = async (req, res) => {
    try {

      console.log();
        const userId = decodeToken(req);
        console.log('userId: ', userId);


        const users = await executeQuery(
            'SELECT id, email, name, avatar, phone, bio, is_online, last_seen, created_at FROM users WHERE id = ?',
            [userId.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: users[0],
            message:"Data SuccessFull"

        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get profile'
        });
    }
};

// Update user profile
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, bio, phone } = req.body;

        await executeQuery(
            'UPDATE users SET name = ?, bio = ?, phone = ? WHERE id = ?',
            [name, bio, phone, userId]
        );

        const [users] = await executeQuery(
            'SELECT id, email, name, avatar, phone, bio, is_online, last_seen, created_at FROM users WHERE id = ?',
            [userId]
        );

        res.json({
            success: true,
            data: users[0],
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
};

// Upload and update profile picture
exports.updateAvatar = async (req, res) => {
    try {
        const userId = req.user.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const avatarUrl = file.location;

        await executeQuery(
            'UPDATE users SET avatar = ? WHERE id = ?',
            [avatarUrl, userId]
        );

        res.json({
            success: true,
            data: { avatar: avatarUrl },
            message: 'Avatar updated successfully'
        });

    } catch (error) {
        console.error('Update avatar error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update avatar'
        });
    }
};

// Search users for starting new chats
exports.searchUsers = async (req, res) => {
    try {
        const { q: query } = req.query;
        const userId = req.user.id;

        if (!query || query.length < 2) {
            return res.json({
                success: true,
                data: []
            });
        }

        const searchQuery = `
            SELECT id, name, email, avatar, bio, is_online, last_seen
            FROM users 
            WHERE (name LIKE ? OR email LIKE ?) 
            AND id != ?
            ORDER BY is_online DESC, name ASC
            LIMIT 20
        `;

        const searchTerm = `%${query}%`;
        const [users] = await executeQuery(searchQuery, [searchTerm, searchTerm, userId]);

        res.json({
            success: true,
            data: users
        });

    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search users'
        });
    }
};

// Get user by ID
exports.getUserById = async (req, res) => {
    try {
        const { userId } = req.params;

        const [users] = await executeQuery(
            'SELECT id, name, email, avatar, bio, is_online, last_seen FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: users[0]
        });

    } catch (error) {
        console.error('Get user by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user'
        });
    }
};

// Get online users
exports.getOnlineUsers = async (req, res) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT DISTINCT u.id, u.name, u.email, u.avatar, u.bio
            FROM users u
            JOIN chat_participants cp1 ON u.id = cp1.user_id
            JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id
            WHERE u.is_online = TRUE 
            AND u.id != ?
            AND cp2.user_id = ?
            AND cp1.is_active = TRUE
            AND cp2.is_active = TRUE
            ORDER BY u.name ASC
        `;

        const [users] = await executeQuery(query, [userId, userId]);

        res.json({
            success: true,
            data: users
        });

    } catch (error) {
        console.error('Get online users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get online users'
        });
    }
};

// Update user online status
exports.updateOnlineStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const { isOnline } = req.body;

        await executeQuery(
            'UPDATE users SET is_online = ?, last_seen = NOW() WHERE id = ?',
            [isOnline, userId]
        );

        res.json({
            success: true,
            message: 'Status updated successfully'
        });

    } catch (error) {
        console.error('Update online status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update status'
        });
    }
};










