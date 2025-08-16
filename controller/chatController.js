const {executeQuery }= require('../dbConfig/connnection');
const { upload, getFileType, BUCKET_NAME } = require('../utils/s3bucket');

class ChatController {
    // Get user's chat list with last message and unread count
    static async getChatList(req, res) {
        try {
            const userId = req.user.id;
            console.log('userId: ', userId);

            const query = `
                SELECT DISTINCT
                    c.id,
                    c.type,
                    c.name as group_name,
                    c.avatar as group_avatar,
                    c.created_at,
                    
                    -- For private chats, get other participant's info
                    CASE 
                        WHEN c.type = 'private' THEN u.name
                        ELSE c.name
                    END as chat_name,
                    
                    CASE 
                        WHEN c.type = 'private' THEN u.avatar
                        ELSE c.avatar
                    END as chat_avatar,
                    
                    CASE 
                        WHEN c.type = 'private' THEN u.id
                        ELSE NULL
                    END as participant_id,
                    
                    CASE 
                        WHEN c.type = 'private' THEN u.is_online
                        ELSE FALSE
                    END as is_online,
                    
                    -- Last message info
                    lm.content as last_message,
                    lm.message_type as last_message_type,
                    lm.created_at as last_message_time,
                    lm.sender_id as last_sender_id,
                    sender.name as last_sender_name,
                    
                    -- Unread count
                    COALESCE(unread.unread_count, 0) as unread_count
                    
                FROM chats c
                JOIN chat_participants cp ON c.id = cp.chat_id
                
                -- For private chats, join with other participant
                LEFT JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id != ? AND c.type = 'private'
                LEFT JOIN users u ON cp2.user_id = u.id
                
                -- Get last message
                LEFT JOIN (
                    SELECT 
                        m1.chat_id,
                        m1.content,
                        m1.message_type,
                        m1.created_at,
                        m1.sender_id
                    FROM messages m1
                    WHERE m1.created_at = (
                        SELECT MAX(m2.created_at)
                        FROM messages m2
                        WHERE m2.chat_id = m1.chat_id AND m2.is_deleted = FALSE
                    ) AND m1.is_deleted = FALSE
                ) lm ON c.id = lm.chat_id
                
                LEFT JOIN users sender ON lm.sender_id = sender.id
                
                -- Get unread count
                LEFT JOIN (
                    SELECT 
                        m.chat_id,
                        COUNT(*) as unread_count
                    FROM messages m
                    WHERE m.id NOT IN (
                        SELECT ms.message_id 
                        FROM message_status ms 
                        WHERE ms.user_id = ? AND ms.status = 'read'
                    )
                    AND m.sender_id != ?
                    AND m.is_deleted = FALSE
                    GROUP BY m.chat_id
                ) unread ON c.id = unread.chat_id
                
                WHERE cp.user_id = ? AND cp.is_active = TRUE
                ORDER BY lm.created_at DESC, c.created_at DESC
            `;

            const chats = await executeQuery(query, [userId, userId, userId, userId]);
           
          

            res.json({
                success: true,
                data: chats.map(chat => ({
                    id: chat.id,
                    type: chat.type,
                    name: chat.chat_name,
                    avatar: chat.chat_avatar,
                    participantId: chat.participant_id,
                    isOnline: chat.is_online,
                    lastMessage: chat.last_message,
                    lastMessageType: chat.last_message_type,
                    lastMessageTime: chat.last_message_time,
                    lastSenderId: chat.last_sender_id,
                    lastSenderName: chat.last_sender_name,
                    unreadCount: chat.unread_count
                }))
            });

        } catch (error) {
            console.error('Get chat list error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get chat list'
            });
        }
    }

    // Get messages for a specific chat
    static async getMessages(req, res) {
        try {
            const userId = req.user.id;
            const { chatId } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

            // Check if user is participant of this chat
            const [participants] = await executeQuery(
                'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ? AND is_active = TRUE',
                [chatId, userId]
            );

            if (participants.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            // Get messages
            const query = `
                SELECT 
                    m.id,
                    m.chat_id,
                    m.sender_id,
                    m.message_type,
                    m.content,
                    m.file_url,
                    m.file_name,
                    m.file_size,
                    m.reply_to,
                    m.created_at,
                    u.name as sender_name,
                    u.avatar as sender_avatar,
                    
                    -- Reply message info
                    rm.content as reply_content,
                    ru.name as reply_sender_name,
                    
                    -- Message status for current user
                    COALESCE(ms.status, 'sent') as message_status
                    
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                LEFT JOIN messages rm ON m.reply_to = rm.id
                LEFT JOIN users ru ON rm.sender_id = ru.id
                LEFT JOIN message_status ms ON m.id = ms.message_id AND ms.user_id = ?
                
                WHERE m.chat_id = ? AND m.is_deleted = FALSE
                ORDER BY m.created_at DESC
                LIMIT ? OFFSET ?
            `;

            const messages = await executeQuery(query, [userId, chatId, limit, offset]);

            // Reverse to show oldest first
            const formattedMessages = messages.reverse().map(msg => ({
                id: msg.id,
                chatId: msg.chat_id,
                senderId: msg.sender_id,
                senderName: msg.sender_name,
                senderAvatar: msg.sender_avatar,
                type: msg.message_type,
                text: msg.content,
                fileUrl: msg.file_url,
                fileName: msg.file_name,
                fileSize: msg.file_size,
                replyTo: msg.reply_to,
                replyContent: msg.reply_content,
                replySenderName: msg.reply_sender_name,
                timestamp: msg.created_at,
                status: msg.message_status
            }));

            res.json({
                success: true,
                data: formattedMessages,
                pagination: {
                    page,
                    limit,
                    total: formattedMessages.length
                }
            });

        } catch (error) {
            console.error('Get messages error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get messages'
            });
        }
    }

    // Send text message
    static async sendMessage(req, res) {
        try {
            const userId = req.user.id;
            const { chatId, text, type = 'text', replyTo } = req.body;

            // Check if user is participant
            const participants = await executeQuery(
                'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ? AND is_active = TRUE',
                [chatId, userId]
            );

            
            if (participants.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            // Insert message
            const result = await executeQuery(
                `INSERT INTO messages (chat_id, sender_id, message_type, content, reply_to) 
                 VALUES (?, ?, ?, ?, ?)`,
                [chatId, userId, type, text, replyTo || null]
            );

            const messageId = result.insertId;

            // Get all participants for status tracking
            const allParticipants = await executeQuery(
                'SELECT user_id FROM chat_participants WHERE chat_id = ? AND is_active = TRUE',
                [chatId]
            );

            // Insert message status for all participants (except sender)
            for (const participant of allParticipants) {
                if (participant.user_id !== userId) {
                    await executeQuery(
                        'INSERT INTO message_status (message_id, user_id, status) VALUES (?, ?, ?)',
                        [messageId, participant.user_id, 'sent']
                    );
                }
            }

            // Get complete message data
            const messageData = await executeQuery(
                `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
                 FROM messages m 
                 JOIN users u ON m.sender_id = u.id 
                 WHERE m.id = ?`,
                [messageId]
            );

            const message = messageData[0];
            const formattedMessage = {
                id: message.id,
                chatId: message.chat_id,
                senderId: message.sender_id,
                senderName: message.sender_name,
                senderAvatar: message.sender_avatar,
                type: message.message_type,
                text: message.content,
                timestamp: message.created_at,
                status: 'sent'
            };

            res.json({
                success: true,
                data: formattedMessage
            });

        } catch (error) {
            console.error('Send message error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send message'
            });
        }
    }

    // Upload file and send message
    static async uploadFile(req, res) {
        try {
            const userId = req.user.id;
            const { chatId } = req.body;

            if (!chatId) {
                return res.status(400).json({
                    success: false,
                    message: 'Chat ID is required'
                });
            }

            // Check if user is participant
            const [participants] = await executeQuery(
                'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ? AND is_active = TRUE',
                [chatId, userId]
            );

            if (participants.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            // File is already uploaded to S3 by multer-s3
            const file = req.file;
            if (!file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const fileType = getFileType(file.mimetype);
            const fileUrl = file.location; // S3 URL
            
            // Insert message
            const [result] = await executeQuery(
                `INSERT INTO messages (chat_id, sender_id, message_type, content, file_url, file_name, file_size) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [chatId, userId, fileType, req.body.caption || '', fileUrl, file.originalname, file.size]
            );

            const messageId = result.insertId;

            // Get all participants for status tracking
            const [allParticipants] = await executeQuery(
                'SELECT user_id FROM chat_participants WHERE chat_id = ? AND is_active = TRUE',
                [chatId]
            );

            // Insert message status for all participants (except sender)
            for (const participant of allParticipants) {
                if (participant.user_id !== userId) {
                    await executeQuery(
                        'INSERT INTO message_status (message_id, user_id, status) VALUES (?, ?, ?)',
                        [messageId, participant.user_id, 'sent']
                    );
                }
            }

            // Get complete message data
            const [messageData] = await executeQuery(
                `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
                 FROM messages m 
                 JOIN users u ON m.sender_id = u.id 
                 WHERE m.id = ?`,
                [messageId]
            );

            const message = messageData[0];
            const formattedMessage = {
                id: message.id,
                chatId: message.chat_id,
                senderId: message.sender_id,
                senderName: message.sender_name,
                senderAvatar: message.sender_avatar,
                type: message.message_type,
                text: message.content,
                fileUrl: message.file_url,
                fileName: message.file_name,
                fileSize: message.file_size,
                timestamp: message.created_at,
                status: 'sent'
            };

            res.json({
                success: true,
                data: formattedMessage
            });

        } catch (error) {
            console.error('Upload file error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to upload file'
            });
        }
    }

    // Create new chat
    static async createChat(req, res) {
        try {
            const userId = req.user.id;
            const { participantId, type = 'private', name, description } = req.body;

            if (type === 'private') {
                // Check if private chat already exists
                const existingChatQuery = `
                    SELECT c.id FROM chats c
                    JOIN chat_participants cp1 ON c.id = cp1.chat_id
                    JOIN chat_participants cp2 ON c.id = cp2.chat_id
                    WHERE c.type = 'private' 
                    AND cp1.user_id = ? 
                    AND cp2.user_id = ? 
                    AND cp1.is_active = TRUE 
                    AND cp2.is_active = TRUE
                `;

                const [existingChat] = await executeQuery(existingChatQuery, [userId, participantId]);

                if (existingChat.length > 0) {
                    return res.json({
                        success: true,
                        data: { id: existingChat[0].id },
                        message: 'Chat already exists'
                    });
                }
            }

            // Create new chat
            const [result] = await executeQuery(
                'INSERT INTO chats (type, name, description, created_by) VALUES (?, ?, ?, ?)',
                [type, name, description, userId]
            );

            const chatId = result.insertId;

            // Add creator as participant
            await executeQuery(
                'INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?, ?, ?)',
                [chatId, userId, type === 'group' ? 'admin' : 'member']
            );

            // Add other participant for private chat
            if (type === 'private' && participantId) {
                await executeQuery(
                    'INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?, ?, ?)',
                    [chatId, participantId, 'member']
                );
            }

            res.json({
                success: true,
                data: { id: chatId },
                message: 'Chat created successfully'
            });

        } catch (error) {
            console.error('Create chat error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create chat'
            });
        }
    }

    // Mark messages as read
    static async markAsRead(req, res) {
        try {
            const userId = req.user.id;
            const { chatId } = req.body;

            // Update message status to read for unread messages
            await executeQuery(
                `UPDATE message_status SET status = 'read', status_time = NOW()
                 WHERE user_id = ? 
                 AND message_id IN (
                     SELECT id FROM messages WHERE chat_id = ? AND sender_id != ?
                 )
                 AND status != 'read'`,
                [userId, chatId, userId]
            );

            res.json({
                success: true,
                message: 'Messages marked as read'
            });

        } catch (error) {
            console.error('Mark as read error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark messages as read'
            });
        }
    }

    // Update message status (delivered/read)
    static async updateMessageStatus(req, res) {
        try {
            const userId = req.user.id;
            const { messageId, status } = req.body;

            await executeQuery(
                `INSERT INTO message_status (message_id, user_id, status) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE status = ?, status_time = NOW()`,
                [messageId, userId, status, status]
            );

            res.json({
                success: true,
                message: 'Status updated'
            });

        } catch (error) {
            console.error('Update message status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update status'
            });
        }
    }

    // Search users
    static async searchUsers(req, res) {
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
                SELECT id, name, email, avatar, bio, is_online
                FROM users 
                WHERE (name LIKE ? OR email LIKE ?) 
                AND id != ?
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
    }
}






module.exports = ChatController;