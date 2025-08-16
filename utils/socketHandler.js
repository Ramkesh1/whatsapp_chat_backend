const jwt = require('jsonwebtoken');
const {executeQuery}= require('../dbConfig/connnection');

class SocketHandler {
    constructor(io) {
        this.io = io;
        this.connectedUsers = new Map(); // userId -> socketId
        this.userSockets = new Map(); // socketId -> userId
        this.typingUsers = new Map(); // chatId -> Set of userIds
        
        this.initialize();
    }

    initialize() {
        this.io.use(this.authenticateSocket.bind(this));
        this.io.on('connection', this.handleConnection.bind(this));
    }

    // Socket authentication middleware
    async authenticateSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                throw new Error('No token provided');
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            const [users] = await executeQuery('SELECT * FROM users WHERE id = ?', [decoded.id]);
            
            if (users.length === 0) {
                throw new Error('User not found');
            }

            // FIXED: Store first user from array as object
            socket.user = users[0];
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    }

    // Handle new connection
    async handleConnection(socket) {
        const userId = socket.user.id; // Now this will work
        console.log(`User ${socket.user.name} connected with socket ${socket.id}`);

        // Store user connection
        this.connectedUsers.set(userId, socket.id);
        this.userSockets.set(socket.id, userId);

        // Update user online status
        await this.updateUserOnlineStatus(userId, true);

        // Join user to their chat rooms
        await this.joinUserRooms(socket, userId);

        // Notify other users about online status
        this.broadcastUserStatus(userId, true);

        // Handle socket events
        this.handleSocketEvents(socket);

        // Handle disconnect
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    // Join user to their chat rooms
    async joinUserRooms(socket, userId) {
        try {
            const [chats] = await executeQuery(
                `SELECT DISTINCT c.id FROM chats c 
                 JOIN chat_participants cp ON c.id = cp.chat_id 
                 WHERE cp.user_id = ? AND cp.is_active = TRUE`,
                [userId]
            );

            if (!chats || chats.length === 0) return;

            const chatArray = Array.isArray(chats) ? chats : [chats];

            for (const chat of chatArray) {
                socket.join(`chat_${chat.id}`);
            }
        } catch (error) {
            console.error('Error joining rooms:', error);
        }
    }

    // Handle socket events
    handleSocketEvents(socket) {
        const userId = socket.user.id; // FIXED: Now consistent

        // Send message event
        socket.on('send_message', (data) => this.handleSendMessage(socket, data));

        // Typing events
        socket.on('typing_start', (data) => this.handleTypingStart(socket, data));
        socket.on('typing_stop', (data) => this.handleTypingStop(socket, data));

        // Message status events
        socket.on('message_delivered', (data) => this.handleMessageStatus(socket, data, 'delivered'));
        socket.on('message_read', (data) => this.handleMessageStatus(socket, data, 'read'));

        // Join chat room (for new chats)
        socket.on('join_chat', (data) => this.handleJoinChat(socket, data));

        // Leave chat room
        socket.on('leave_chat', (data) => this.handleLeaveChat(socket, data));

        // Get online users
        socket.on('get_online_users', async (data) => {
            try {
                const { chatId } = data;
                
                // Get all participants in chat
                const [participants] = await executeQuery(
                    'SELECT user_id FROM chat_participants WHERE chat_id = ? AND is_active = TRUE',
                    [chatId]
                );

                if (!participants || participants.length === 0) {
                    socket.emit('online_users_list', {
                        chatId: chatId,
                        onlineUsers: []
                    });
                    return;
                }

                const participantArray = Array.isArray(participants) ? participants : [participants];
                
                // Filter online users
                const onlineUserIds = participantArray
                    .filter(p => this.connectedUsers.has(p.user_id))
                    .map(p => p.user_id);

                socket.emit('online_users_list', {
                    chatId: chatId,
                    onlineUsers: onlineUserIds
                });
                
                console.log(`Online users for chat ${chatId}:`, onlineUserIds);
                
            } catch (error) {
                console.error('Get online users error:', error);
                socket.emit('online_users_list', {
                    chatId: data.chatId,
                    onlineUsers: []
                });
            }
        });
    }

    // Handle send message
    async handleSendMessage(socket, data) {
        try {
            const { chatId, message } = data;
            const userId = socket.user.id;

            // Verify user is participant
            const [participants] = await executeQuery(
                'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ? AND is_active = TRUE',
                [chatId, userId]
            );

            if (participants.length === 0) {
                socket.emit('error', { message: 'Access denied' });
                return;
            }

            // Broadcast message to all participants in the chat room EXCEPT sender
            socket.to(`chat_${chatId}`).emit('new_message', {
                ...message,
                chatId
            });

            // Update message status for online users (excluding sender)
            await this.updateMessageStatusForOnlineUsers(chatId, message.id, userId);

        } catch (error) {
            console.error('Send message error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    }

    // Handle typing start
    handleTypingStart(socket, data) {
        const { chatId } = data;
        const userId = socket.user.id;

        if (!this.typingUsers.has(chatId)) {
            this.typingUsers.set(chatId, new Set());
        }

        this.typingUsers.get(chatId).add(userId);

        // Broadcast typing status to others in the chat
        socket.to(`chat_${chatId}`).emit('typing_start', {
            userId,
            chatId,
            userName: socket.user.name
        });
    }

    // Handle typing stop
    handleTypingStop(socket, data) {
        const { chatId } = data;
        const userId = socket.user.id;

        if (this.typingUsers.has(chatId)) {
            this.typingUsers.get(chatId).delete(userId);
            
            if (this.typingUsers.get(chatId).size === 0) {
                this.typingUsers.delete(chatId);
            }
        }

        // Broadcast typing stop to others in the chat
        socket.to(`chat_${chatId}`).emit('typing_stop', {
            userId,
            chatId
        });
    }

    // Handle message status update
    async handleMessageStatus(socket, data, status) {
        try {
            const { messageId, chatId } = data;
            const userId = socket.user.id;

            // Update status in database
            await executeQuery(
                `INSERT INTO message_status (message_id, user_id, status) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE status = ?, status_time = NOW()`,
                [messageId, userId, status, status]
            );

            // Get message sender to notify them
            const [messages] = await executeQuery(
                'SELECT sender_id FROM messages WHERE id = ?',
                [messageId]
            );

            if (messages.length > 0) {
                const senderId = messages[0].sender_id;
                const senderSocketId = this.connectedUsers.get(senderId);
                
                if (senderSocketId) {
                    this.io.to(senderSocketId).emit('message_status_update', {
                        messageId,
                        status,
                        userId
                    });
                }
            }

        } catch (error) {
            console.error('Message status update error:', error);
        }
    }

    // Handle join chat
    handleJoinChat(socket, data) {
        const { chatId } = data;
        socket.join(`chat_${chatId}`);
        console.log(`User ${socket.user.id} joined chat ${chatId}`);
    }

    // Handle leave chat
    handleLeaveChat(socket, data) {
        const { chatId } = data;
        socket.leave(`chat_${chatId}`);
        console.log(`User ${socket.user.id} left chat ${chatId}`);
    }

    // Handle disconnect
    async handleDisconnect(socket) {
        const userId = this.userSockets.get(socket.id);
        
        if (userId) {
            console.log(`User ${socket.user.name} disconnected`);
            
            // Remove from connected users
            this.connectedUsers.delete(userId);
            this.userSockets.delete(socket.id);

            // Update user online status
            await this.updateUserOnlineStatus(userId, false);

            // Clean up typing status
            this.cleanupTypingStatus(userId);

            // Notify other users about offline status
            this.broadcastUserStatus(userId, false);
        }
    }

    // Update user online status in database
    async updateUserOnlineStatus(userId, isOnline) {
        try {
            await executeQuery(
                'UPDATE users SET is_online = ?, last_seen = NOW() WHERE id = ?',
                [isOnline, userId]
            );
        } catch (error) {
            console.error('Update online status error:', error);
        }
    }

    // Broadcast user status to relevant chats
    async broadcastUserStatus(userId, isOnline) {
        try {
            // Get all chats where this user is a participant
            const [chats] = await executeQuery(
                `SELECT DISTINCT c.id FROM chats c 
                 JOIN chat_participants cp ON c.id = cp.chat_id 
                 WHERE cp.user_id = ? AND cp.is_active = TRUE`,
                [userId]
            );

            if (!chats || chats.length === 0) return;

            const chatArray = Array.isArray(chats) ? chats : [chats];

            for (const chat of chatArray) {
                const roomName = `chat_${chat.id}`;
                
                // Broadcast to all users in the room
                this.io.to(roomName).emit(
                    isOnline ? 'user_connected' : 'user_disconnected',
                    { 
                        userId: userId, 
                        isOnline: isOnline,
                        chatId: chat.id 
                    }
                );
                
                console.log(`Broadcasting ${isOnline ? 'connected' : 'disconnected'} for user ${userId} to chat ${chat.id}`);
            }
        } catch (error) {
            console.error('Broadcast user status error:', error);
        }
    }

    // Update message status for online users
    async updateMessageStatusForOnlineUsers(chatId, messageId, senderId = null) {
        try {
            const [participants] = await executeQuery(
                'SELECT user_id FROM chat_participants WHERE chat_id = ? AND is_active = TRUE',
                [chatId]
            );

            if (!participants || participants.length === 0) return;

            const participantArray = Array.isArray(participants) ? participants : [participants];

            // Update status to delivered for online users (excluding sender)
            for (const participant of participantArray) {
                if (participant.user_id !== senderId && this.connectedUsers.has(participant.user_id)) {
                    await executeQuery(
                        `INSERT INTO message_status (message_id, user_id, status) 
                         VALUES (?, ?, 'delivered') 
                         ON DUPLICATE KEY UPDATE status = 'delivered', status_time = NOW()`,
                        [messageId, participant.user_id]
                    );
                }
            }
        } catch (error) {
            console.error('Update message status error:', error);
        }
    }

    // Clean up typing status for disconnected user
    cleanupTypingStatus(userId) {
        for (const [chatId, typingSet] of this.typingUsers.entries()) {
            if (typingSet.has(userId)) {
                typingSet.delete(userId);
                
                // Broadcast typing stop
                this.io.to(`chat_${chatId}`).emit('typing_stop', {
                    userId,
                    chatId
                });

                // Clean up empty sets
                if (typingSet.size === 0) {
                    this.typingUsers.delete(chatId);
                }
            }
        }
    }

    // Get connected users count
    getConnectedUsersCount() {
        return this.connectedUsers.size;
    }

    // Get online users in a chat
    async getOnlineUsersInChat(chatId) {
        try {
            const [participants] = await executeQuery(
                'SELECT user_id FROM chat_participants WHERE chat_id = ? AND is_active = TRUE',
                [chatId]
            );

            if (!participants || participants.length === 0) return [];

            const participantArray = Array.isArray(participants) ? participants : [participants];

            const onlineUsers = participantArray.filter(p => 
                this.connectedUsers.has(p.user_id)
            ).map(p => p.user_id);

            return onlineUsers;
        } catch (error) {
            console.error('Get online users error:', error);
            return [];
        }
    }
}

module.exports = SocketHandler;