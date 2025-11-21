const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const winston = require('winston');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 4008;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'chat-service' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

app.use(cors());
app.use(express.json());

// Store active support agents
const supportAgents = new Map();
const userQueues = new Map();

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'chat-service',
    activeConnections: io.sockets.sockets.size,
    supportAgents: supportAgents.size,
  });
});

app.get('/api/chat/stats', (req, res) => {
  res.json({
    totalConnections: io.sockets.sockets.size,
    supportAgents: supportAgents.size,
    usersInQueue: userQueues.size,
  });
});

io.on('connection', (socket) => {
  logger.info('New connection', { socketId: socket.id });

  // User joins as support agent
  socket.on('join:support', (data) => {
    supportAgents.set(socket.id, {
      name: data.name || 'Support Agent',
      status: 'available',
      connectedAt: new Date(),
    });
    socket.join('support-agents');
    logger.info('Support agent joined', { socketId: socket.id, name: data.name });
    
    io.emit('support:status', {
      available: supportAgents.size,
    });
  });

  // User requests support
  socket.on('request:support', (data) => {
    userQueues.set(socket.id, {
      userId: data.userId,
      userName: data.userName || 'Guest User',
      campaignId: data.campaignId,
      message: data.message,
      timestamp: new Date(),
    });

    logger.info('Support requested', { userId: data.userId, socketId: socket.id });

    // Notify support agents
    io.to('support-agents').emit('support:request', {
      socketId: socket.id,
      userId: data.userId,
      userName: data.userName,
      message: data.message,
      campaignId: data.campaignId,
    });

    // Confirm to user
    socket.emit('support:queued', {
      position: userQueues.size,
      estimatedWait: userQueues.size * 2, // 2 minutes per user
    });
  });

  // Support agent accepts request
  socket.on('accept:request', (data) => {
    const userSocketId = data.userSocketId;
    const userInfo = userQueues.get(userSocketId);

    if (userInfo) {
      // Create private room for conversation
      const roomId = `chat-${socket.id}-${userSocketId}`;
      socket.join(roomId);
      io.sockets.sockets.get(userSocketId)?.join(roomId);

      // Notify both parties
      io.to(roomId).emit('chat:started', {
        roomId,
        supportAgent: supportAgents.get(socket.id).name,
        user: userInfo.userName,
      });

      userQueues.delete(userSocketId);
      logger.info('Chat started', { roomId, supportAgent: socket.id, user: userSocketId });
    }
  });

  // Send message in chat
  socket.on('chat:message', (data) => {
    const { roomId, message, sender } = data;

    io.to(roomId).emit('chat:message', {
      roomId,
      message,
      sender,
      timestamp: new Date(),
    });

    logger.info('Message sent', { roomId, sender });
  });

  // Typing indicator
  socket.on('chat:typing', (data) => {
    socket.to(data.roomId).emit('chat:typing', {
      userId: data.userId,
      userName: data.userName,
    });
  });

  // End chat
  socket.on('chat:end', (data) => {
    io.to(data.roomId).emit('chat:ended', {
      endedBy: data.endedBy,
      timestamp: new Date(),
    });

    logger.info('Chat ended', { roomId: data.roomId });
  });

  // Quick message templates for support
  socket.on('send:template', (data) => {
    const templates = {
      greeting: 'Hello! How can I assist you today with your donation?',
      payment: 'I can help you with payment-related issues. Could you provide your transaction ID?',
      campaign: 'Let me check the campaign details for you.',
      thanks: 'Thank you for using CareForAll! Have a great day!',
    };

    io.to(data.roomId).emit('chat:message', {
      roomId: data.roomId,
      message: templates[data.template] || templates.greeting,
      sender: 'support',
      timestamp: new Date(),
    });
  });

  socket.on('disconnect', () => {
    if (supportAgents.has(socket.id)) {
      supportAgents.delete(socket.id);
      io.emit('support:status', {
        available: supportAgents.size,
      });
      logger.info('Support agent disconnected', { socketId: socket.id });
    }

    if (userQueues.has(socket.id)) {
      userQueues.delete(socket.id);
      logger.info('User disconnected from queue', { socketId: socket.id });
    }

    logger.info('Connection closed', { socketId: socket.id });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Chat Service running on port ${PORT}`);
  logger.info('Real-time chat support enabled with Socket.io');
});

module.exports = { app, io };
