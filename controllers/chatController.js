const Message = require('../models/Message');
const User = require('../models/User');
const AppError = require('../utils/AppError');

// Store recent message keys to prevent duplicates (in-memory cache)
const recentMessages = new Map(); // key: sender_receiver_message_hash, value: timestamp

// Clean up old entries every hour
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, timestamp] of recentMessages.entries()) {
    if (timestamp < oneHourAgo) {
      recentMessages.delete(key);
    }
  }
}, 60 * 60 * 1000);

// Helper function to generate message key
const generateMessageKey = (senderId, receiverId, message) => {
  return `${senderId}_${receiverId}_${message.trim()}`;
};

// @desc    Get chat messages between two users
// @route   GET /api/chat/messages/:userId
// @access  Private
const getMessages = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'name profilePicture')
      .populate('receiver', 'name profilePicture');

    // Mark messages as read
    const updateResult = await Message.updateMany(
      {
        sender: userId,
        receiver: currentUserId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    // Notify sender via Socket.IO that messages were read
    const io = req.app.get('io');
    if (io && updateResult.modifiedCount > 0) {
      io.to(userId.toString()).emit('messages-read', {
        byUser: currentUserId,
        chatWith: userId,
        readAt: new Date(),
        count: updateResult.modifiedCount
      });
    }

    res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send a new message (HTTP endpoint - alternative to socket)
// @route   POST /api/chat/messages
// @access  Private
const sendMessage = async (req, res, next) => {
  try {
    const { receiverId, message, tempId } = req.body;
    const senderId = req.user._id;

    if (!receiverId || !message) {
      throw new AppError('Receiver ID and message are required', 400);
    }

    // Check for duplicate message within last 5 seconds
    const messageKey = generateMessageKey(senderId, receiverId, message);
    if (recentMessages.has(messageKey)) {
      console.log('Duplicate message prevented via HTTP:', messageKey);
      return res.status(409).json({
        success: false,
        message: 'Duplicate message detected',
        duplicate: true
      });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      throw new AppError('Receiver not found', 404);
    }

    const newMessage = await Message.create({
      sender: senderId,
      receiver: receiverId,
      message,
      isRead: false,
    });

    // Add to recent messages cache
    recentMessages.set(messageKey, Date.now());
    // Remove after 5 seconds
    setTimeout(() => recentMessages.delete(messageKey), 5000);

    const populatedMessage = await Message.findById(newMessage._id)
      .populate('sender', 'name profilePicture')
      .populate('receiver', 'name profilePicture');

    // Emit real-time message via Socket.IO
    const io = req.app.get('io');
    if (io) {
      // Send to receiver
      io.to(receiverId.toString()).emit('new-message', {
        ...populatedMessage.toObject(),
        tempId: tempId
      });
      
      // Send confirmation to sender
      io.to(senderId.toString()).emit('message-sent', {
        ...populatedMessage.toObject(),
        tempId: tempId
      });
    }

    res.status(201).json({
      success: true,
      message: populatedMessage,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send message via Socket only (no HTTP save)
// @route   Socket event: 'send-message'
// @access  Private
const sendMessageViaSocket = async (socket, data, io) => {
  const { senderId, receiverId, message, tempId } = data;
  
  // Check for duplicate within last 5 seconds
  const messageKey = generateMessageKey(senderId, receiverId, message);
  if (recentMessages.has(messageKey)) {
    console.log('Duplicate message prevented via Socket:', messageKey);
    socket.emit('message-error', { 
      tempId, 
      error: 'Duplicate message detected',
      duplicate: true
    });
    return;
  }
  
  try {
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      socket.emit('message-error', { tempId, error: 'Receiver not found' });
      return;
    }

    const newMessage = await Message.create({
      sender: senderId,
      receiver: receiverId,
      message,
      isRead: false,
    });

    // Add to recent messages cache
    recentMessages.set(messageKey, Date.now());
    setTimeout(() => recentMessages.delete(messageKey), 5000);

    const populatedMessage = await Message.findById(newMessage._id)
      .populate('sender', 'name profilePicture')
      .populate('receiver', 'name profilePicture');

    // Send to receiver if online
    io.to(receiverId.toString()).emit('new-message', {
      ...populatedMessage.toObject(),
      tempId,
    });

    // Send confirmation to sender
    io.to(senderId.toString()).emit('message-sent', {
      ...populatedMessage.toObject(),
      tempId,
    });
    
    console.log(`Message sent via Socket: ${senderId} -> ${receiverId}`);
    
  } catch (error) {
    console.error('Error saving message via Socket:', error);
    socket.emit('message-error', { tempId, error: 'Failed to send message' });
  }
};

// @desc    Get chat list (all users you've chatted with)
// @route   GET /api/chat/list
// @access  Private
const getChatList = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    // Get all unique users that current user has chatted with
    const chatUsers = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: currentUserId }, { receiver: currentUserId }],
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$sender', currentUserId] },
              then: '$receiver',
              else: '$sender',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          _id: '$userInfo._id',
          name: '$userInfo.name',
          profilePicture: '$userInfo.profilePicture',
          lastActive: '$userInfo.lastActive',
        },
      },
    ]);

    // Get last message for each chat
    const chatListWithLastMessage = await Promise.all(
      chatUsers.map(async (chat) => {
        const lastMessage = await Message.findOne({
          $or: [
            { sender: currentUserId, receiver: chat._id },
            { sender: chat._id, receiver: currentUserId },
          ],
          isDeleted: false,
        })
          .sort({ createdAt: -1 })
          .limit(1);

        const unreadCount = await Message.countDocuments({
          sender: chat._id,
          receiver: currentUserId,
          isRead: false,
        });

        return {
          ...chat,
          lastMessage: lastMessage?.message || '',
          lastMessageTime: lastMessage?.createdAt || null,
          unreadCount,
        };
      })
    );

    // Sort by last message time (newest first)
    chatListWithLastMessage.sort((a, b) => {
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    });

    res.status(200).json({
      success: true,
      chats: chatListWithLastMessage,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark messages as read
// @route   PUT /api/chat/mark-read/:userId
// @access  Private
const markAsRead = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const result = await Message.updateMany(
      {
        sender: userId,
        receiver: currentUserId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    // Notify sender via Socket.IO that their messages were read
    const io = req.app.get('io');
    if (io && result.modifiedCount > 0) {
      io.to(userId.toString()).emit('messages-read', {
        senderId: userId,
        receiverId: currentUserId,
        readAt: new Date(),
        count: result.modifiedCount
      });
    }

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      count: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a message
// @route   DELETE /api/chat/messages/:messageId
// @access  Private
const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user._id;

    const message = await Message.findOne({
      _id: messageId,
      sender: currentUserId,
    });

    if (!message) {
      throw new AppError('Message not found or unauthorized', 404);
    }

    message.isDeleted = true;
    await message.save();

    // Notify receiver that message was deleted
    const io = req.app.get('io');
    if (io) {
      io.to(message.receiver.toString()).emit('message-deleted', {
        messageId: messageId,
        deletedBy: currentUserId
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMessages,
  sendMessage,
  sendMessageViaSocket, // Export for socket use
  getChatList,
  markAsRead,
  deleteMessage,
};