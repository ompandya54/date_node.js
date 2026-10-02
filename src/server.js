import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';
import { setupSocketIO } from './socket/chat.socket.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

// Create HTTP server wrapping Express app
const server = http.createServer(app);

// Attach Socket.IO for real-time chat
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Initialize Socket.IO event listeners
setupSocketIO(io);

// Connect to Database & Start HTTP + Socket Server
const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      console.log(`\n==================================================`);
      console.log(`💖 Gandhinagar Dating App Backend API`);
      console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`🔗 Local HTTP URL:       http://localhost:${PORT}`);
      console.log(`⚡ Real-Time Socket.io:  ws://localhost:${PORT}`);
      console.log(`📱 Flutter Emulator:     http://10.0.2.2:${PORT}`);
      console.log(`🏥 Health check:        http://localhost:${PORT}/api/health`);
      console.log(`==================================================\n`);
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
