const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // Allows your Cloudflare site to connect
});

// The instantaneous RAM array (The OmeTV secret)
let waitingQueue = [];

io.on('connection', (socket) => {
  console.log(`🔌 Node Connected: ${socket.id}`);

  socket.on('request_match', () => {
    // 1. If someone is already waiting, pair them up instantly!
    if (waitingQueue.length > 0) {
      const partnerSocket = waitingQueue.shift(); // Pull the oldest person out of line

      // Generate a unique, private Agora room
      const roomName = `room_${partnerSocket.id}_${socket.id}`;

      // Instantly push the room name down the tunnel to BOTH users
      io.to(partnerSocket.id).emit('match_found', roomName);
      socket.emit('match_found', roomName);

      console.log(`🎯 Matched ${partnerSocket.id} with ${socket.id} -> ${roomName}`);
    } else {
      // 2. If the queue is empty, wait in line.
      waitingQueue.push(socket);
      console.log(`⏳ Node ${socket.id} entered the queue. Queue size: ${waitingQueue.length}`);
    }
  });

  // 3. THE GHOST FIX: If a user closes the tab or skips, remove them from the queue instantly!
  socket.on('disconnect', () => {
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    console.log(`❌ Node Disconnected: ${socket.id}. Queue size: ${waitingQueue.length}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Aura Traffic Controller active on port ${PORT}`);
});
