const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getMessages,
  sendMessage,
  getChatList,
  markAsRead,
  deleteMessage,
} = require('../controllers/chatController');

// All chat routes are protected
router.use(protect);

router.get('/list', getChatList);
router.get('/messages/:userId', getMessages);
router.post('/messages', sendMessage);
router.put('/mark-read/:userId', markAsRead);
router.delete('/messages/:messageId', deleteMessage);

module.exports = router;