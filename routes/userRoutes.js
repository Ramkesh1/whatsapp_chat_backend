
const authMiddleware = require('../middleware/authMiddleware')
const userController = require('../controller/userControllers')
const express = require('express')
const path = require('path'); // Make sure this is included
const fs = require('fs');
const {uploadMulter}= require("../utils/s3bucket")



const router = express.Router()

router.post ("/login" , userController.sendOtp)

router.post ("/verify-otp" , userController.verifyOtp)



// Get current user profile
router.get('/profile', userController.getProfile);

// Update user profile
router.put('/profile', userController.updateProfile);

// Upload and update profile picture
router.post('/avatar', userController.updateAvatar);

// Search users
router.get('/search', userController.searchUsers);

// Get user by ID
router.get('/:userId', userController.getUserById);

// Get online users
router.get('/online/list', userController.getOnlineUsers);

// Update online status
router.post('/status', userController.updateOnlineStatus);


module.exports = router;
