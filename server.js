const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } 
});

// The instantaneous RAM array
let waitingQueue = [];

// 🧊 AURA ICEBREAKER MATRIX
const icebreakers = [
  "If you could have any superpower for 24 hours, what would it be?",
  "What is the weirdest food combination you actually enjoy?",
  "Would you rather live 100 years in the future or 100 years in the past?",
  "What's your absolute go-to song when you get the aux cord?",
  "If you won $10 million today, what is the first thing you're buying?",
  "What is the most useless talent you possess?",
  "Is a hotdog considered a sandwich? Defend your answer."
];

io.on('connection', (socket) => {
  console.log(`🔌 Node Connected: ${socket.id}`);

  socket.on('request_match', () => {
    if (waitingQueue.length > 0) {
      const partnerSocket = waitingQueue.shift(); // Pull the oldest person out of line
      const roomName = `room_${partnerSocket.id}_${socket.id}`;

      // 1. Put BOTH users inside a private Socket.io Room
      partnerSocket.join(roomName);
      socket.join(roomName);
      
      // 2. Save the room name to their socket profile so they remember where they are
      partnerSocket.currentRoom = roomName;
      socket.currentRoom = roomName;

      const randomQuestion = icebreakers[Math.floor(Math.random() * icebreakers.length)];

      // 3. Broadcast to the Room
      io.to(roomName).emit('match_found', { roomName, question: randomQuestion });
      console.log(`🎯 Matched -> ${roomName} | Icebreaker: "${randomQuestion}"`);
    } else {
      waitingQueue.push(socket);
      console.log(`⏳ Node ${socket.id} entered the queue. Queue size: ${waitingQueue.length}`);
    }
  });

  // 🔄 When either user clicks "Next Question", pick a new one and send it to BOTH
  socket.on('cycle_icebreaker', () => {
    if (socket.currentRoom) {
      const newQuestion = icebreakers[Math.floor(Math.random() * icebreakers.length)];
      io.to(socket.currentRoom).emit('icebreaker_updated', newQuestion);
      console.log(`🔄 Icebreaker cycled in ${socket.currentRoom}`);
    }
  });

  socket.on('disconnect', () => {
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    console.log(`❌ Node Disconnected: ${socket.id}. Queue size: ${waitingQueue.length}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Aura Traffic Controller active on port ${PORT}`);
});
