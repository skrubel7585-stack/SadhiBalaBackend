const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const userRoutes = require('./routes/userRoutes');
const errorHandler = require('./middleware/errorMiddleware');
const Message = require('./models/Message');
const User = require('./models/User');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  pingTimeout: 60000, // Increase ping timeout for better connection stability
  pingInterval: 25000,
});

// Make io accessible to routes
app.set('io', io);

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS with proper configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Store online users and message processing queue
const onlineUsers = new Map();
const processingMessages = new Map(); // Better duplicate prevention with timestamp
const recentMessages = new Map(); // Store recent message hashes

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  
  for (const [key, timestamp] of processingMessages.entries()) {
    if (timestamp < fiveMinutesAgo) {
      processingMessages.delete(key);
    }
  }
  
  for (const [key, timestamp] of recentMessages.entries()) {
    if (timestamp < fiveMinutesAgo) {
      recentMessages.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Helper function to generate unique message key
const generateMessageKey = (senderId, receiverId, message) => {
  return `${senderId}_${receiverId}_${message.trim().substring(0, 100)}`;
};

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
// app.use('/api/users', userRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    onlineUsers: onlineUsers.size,
  });
});

// Root route handler
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Matrimonial App API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      chat: '/api/chat',
      health: '/health'
    }
  });
});

// Get online users stats (for debugging)
app.get('/api/online-users', (req, res) => {
  const users = Array.from(onlineUsers.keys());
  res.json({
    success: true,
    count: users.length,
    users: users
  });
});

// ==================== SOCKET.IO CONNECTION ====================
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  // User joins their room and track online status
  socket.on('user-connected', async (userId) => {
    socket.join(userId.toString());
    socket.userId = userId;
    
    const existingUser = onlineUsers.get(userId.toString());
    if (existingUser && existingUser.socketId !== socket.id) {
      // Disconnect old socket if exists
      const oldSocket = io.sockets.sockets.get(existingUser.socketId);
      if (oldSocket) {
        oldSocket.emit('session-expired', { message: 'Logged in from another device' });
        oldSocket.disconnect();
      }
    }
    
    onlineUsers.set(userId.toString(), {
      socketId: socket.id,
      lastActive: new Date(),
      connectedAt: new Date()
    });
    
    // Update user's online status in database
    try {
      await User.findByIdAndUpdate(userId, { 
        lastActive: new Date(),
        isOnline: true 
      });
    } catch (error) {
      console.error('Error updating user status:', error);
    }
    
    console.log(`📱 User ${userId} is online. Total online: ${onlineUsers.size}`);
    
    // Broadcast online status to all connected users
    io.emit('user-status-change', {
      userId: userId,
      status: 'online',
      lastActive: new Date()
    });
    
    // Send current online users list to the new user
    socket.emit('online-users-list', {
      users: Array.from(onlineUsers.keys())
    });
  });

  // Send real-time message (ONLY VIA SOCKET)
  socket.on('send-message', async (data) => {
    const { senderId, receiverId, message, tempId } = data;
    
    // Validate input
    if (!senderId || !receiverId || !message || message.trim().length === 0) {
      socket.emit('message-error', { 
        tempId, 
        error: 'Invalid message data' 
      });
      return;
    }
    
    // Create unique message key to prevent duplicates
    const messageKey = generateMessageKey(senderId, receiverId, message);
    
    // Check for duplicate within last 10 seconds
    if (processingMessages.has(messageKey)) {
      console.log('⚠️ Duplicate message prevented:', messageKey);
      socket.emit('message-error', { 
        tempId, 
        error: 'Duplicate message detected',
        duplicate: true
      });
      return;
    }
    
    // Check for very recent duplicate (within 2 seconds)
    if (recentMessages.has(messageKey)) {
      console.log('⚠️ Very recent duplicate prevented:', messageKey);
      socket.emit('message-error', { 
        tempId, 
        error: 'Please wait before sending again',
        duplicate: true
      });
      return;
    }
    
    processingMessages.set(messageKey, Date.now());
    recentMessages.set(messageKey, Date.now());
    
    // Remove from processing after 10 seconds
    setTimeout(() => {
      processingMessages.delete(messageKey);
    }, 10000);
    
    // Remove from recent after 2 seconds
    setTimeout(() => {
      recentMessages.delete(messageKey);
    }, 2000);
    
    try {
      // Check if receiver exists
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        socket.emit('message-error', { 
          tempId, 
          error: 'Receiver not found' 
        });
        processingMessages.delete(messageKey);
        return;
      }
      
      // Save message to database
      const newMessage = await Message.create({
        sender: senderId,
        receiver: receiverId,
        message: message.trim(),
        isRead: false,
        createdAt: new Date()
      });

      const populatedMessage = await Message.findById(newMessage._id)
        .populate('sender', 'name profilePicture email')
        .populate('receiver', 'name profilePicture email');

      // Emit to receiver if online
      const receiverOnline = onlineUsers.has(receiverId.toString());
      if (receiverOnline) {
        io.to(receiverId.toString()).emit('new-message', {
          ...populatedMessage.toJSON(),
          tempId,
        });
        console.log(`📨 Message sent to online user: ${receiverId}`);
      } else {
        console.log(`📨 Message saved for offline user: ${receiverId}`);
      }

      // Emit to sender for confirmation
      io.to(senderId.toString()).emit('message-sent', {
        ...populatedMessage.toJSON(),
        tempId,
      });
      
      console.log(`✅ Message sent: ${senderId} -> ${receiverId}`);
      
    } catch (error) {
      console.error('❌ Error saving message:', error);
      processingMessages.delete(messageKey);
      socket.emit('message-error', { 
        tempId, 
        error: 'Failed to send message. Please try again.' 
      });
    }
  });

  // Mark messages as read in real-time
  socket.on('mark-read', async (data) => {
    const { senderId, receiverId } = data;
    
    if (!senderId || !receiverId) {
      return;
    }
    
    try {
      const result = await Message.updateMany(
        {
          sender: senderId,
          receiver: receiverId,
          isRead: false,
        },
        {
          isRead: true,
          readAt: new Date(),
        }
      );

      // Notify sender that messages were read
      const senderOnline = onlineUsers.has(senderId.toString());
      if (senderOnline && result.modifiedCount > 0) {
        io.to(senderId.toString()).emit('messages-read', { 
          senderId, 
          receiverId,
          readAt: new Date(),
          count: result.modifiedCount
        });
      }
      
      if (result.modifiedCount > 0) {
        console.log(`📖 Messages marked as read: ${senderId} -> ${receiverId} (${result.modifiedCount})`);
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  });

  // User typing indicator with debounce
  let typingTimeout;
  socket.on('typing', (data) => {
    const { senderId, receiverId, isTyping, userName } = data;
    const receiverOnline = onlineUsers.has(receiverId.toString());
    
    if (receiverOnline) {
      if (isTyping) {
        // Clear previous timeout
        if (typingTimeout) clearTimeout(typingTimeout);
        
        // Auto stop typing after 3 seconds of no activity
        typingTimeout = setTimeout(() => {
          io.to(receiverId.toString()).emit('user-typing', { 
            senderId, 
            isTyping: false,
            userName 
          });
        }, 3000);
      }
      
      io.to(receiverId.toString()).emit('user-typing', { 
        senderId, 
        isTyping,
        userName 
      });
    }
  });

  // Get chat history (for mobile when reconnecting)
  socket.on('get-chat-history', async (data) => {
    const { userId, otherUserId } = data;
    
    try {
      const messages = await Message.find({
        $or: [
          { sender: userId, receiver: otherUserId },
          { sender: otherUserId, receiver: userId }
        ],
        isDeleted: false
      })
      .sort({ createdAt: 1 })
      .populate('sender', 'name profilePicture')
      .populate('receiver', 'name profilePicture')
      .limit(50); // Limit to last 50 messages
      
      socket.emit('chat-history', {
        messages,
        otherUserId
      });
    } catch (error) {
      console.error('Error fetching chat history:', error);
      socket.emit('chat-history-error', { error: 'Failed to fetch history' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    if (socket.userId) {
      const userInfo = onlineUsers.get(socket.userId.toString());
      
      // Only remove if this is the same socket
      if (userInfo && userInfo.socketId === socket.id) {
        onlineUsers.delete(socket.userId.toString());
        
        // Update user's online status in database
        try {
          await User.findByIdAndUpdate(socket.userId, { 
            lastActive: new Date(),
            isOnline: false 
          });
        } catch (error) {
          console.error('Error updating user status:', error);
        }
        
        console.log(`📱 User ${socket.userId} disconnected. Online: ${onlineUsers.size}`);
        
        // Broadcast offline status
        io.emit('user-status-change', {
          userId: socket.userId,
          status: 'offline',
          lastActive: new Date()
        });
      }
    }
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot find ${req.originalUrl} on this server`,
  });
});

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const serverInstance = server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 API URL: http://localhost:${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`📍 Socket.IO running on port ${PORT}\n`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`❌ Unhandled Rejection Error: ${err.message}`);
  console.log(err.stack);
  // Don't exit in production, just log
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️ Keeping server running despite unhandled rejection');
  } else {
    serverInstance.close(() => process.exit(1));
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log(`❌ Uncaught Exception Error: ${err.message}`);
  console.log(err.stack);
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️ Keeping server running despite uncaught exception');
  } else {
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Closing server...');
  serverInstance.close(() => {
    console.log('💤 Server closed');
    process.exit(0);
  });
});