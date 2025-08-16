const express = require('express');
const router = express.Router();
const ChatController = require('../controller/chatController');
const { uploadMulter } = require('../utils/s3bucket');
const  authenticateToken  = require('../middleware/authMiddleware');





// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get user's chat list
router.get('/list', ChatController.getChatList);

// Get messages for a specific chat
router.get('/:chatId/messages', ChatController.getMessages);

// Send text message
router.post('/message', ChatController.sendMessage);



// Upload file and send message
router.post('/upload', uploadMulter.single('file'), ChatController.uploadFile);

// Create new chat
router.post('/create', ChatController.createChat);

// Mark messages as read
router.post('/mark-read', ChatController.markAsRead);

// Update message status
router.post('/status', ChatController.updateMessageStatus);

// Search users
router.get('/users/search', ChatController.searchUsers);






module.exports = router;