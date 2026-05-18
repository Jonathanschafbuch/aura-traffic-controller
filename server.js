const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { RtcTokenBuilder, RtcRole } = require('agora-token'); // 🛡️ NEW: Agora Token Library

const app = express();
app.use(cors());

// 🛡️ NEW: AGORA TOKEN GENERATOR ROUTE
// This route generates a secure 1-hour token for a specific channel name
app.get('/api/get-token', (req, res) => {
  const channelName = req.query.channelName;
  if (!channelName) {
    return res.status(400).json({ error: 'Channel name is required' });
  }

  // Ensure these are set in your Render Environment Variables
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  
  if (!appId || !appCertificate) {
    return res.status(500).json({ error: 'Server missing Agora credentials in Environment Variables.' });
  }

  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600; // 1 Hour
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channelName, 0, role, privilegeExpiredTs
    );
    res.json({ token });
  } catch (error) {
    console.error("Token generation failed:", error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// The instantaneous RAM array
let waitingQueue = [];

// 🛡️ NEW: Memory map to track when an IP last requested a match (Anti-Spam)
const requestCooldowns = new Map();

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
  
  // Get the user's IP Address for Rate Limiting
  const userIP = socket.handshake.address;

  socket.on('request_match', () => {
    const now = Date.now();
    const lastRequest = requestCooldowns.get(userIP);

    // 🛑 NEW: RATE LIMIT - Deny if they requested a match less than 2 seconds ago
    if (lastRequest && (now - lastRequest) < 2000) {
      console.log(`[SHIELD] Blocked spam match request from ${userIP}`);
      return; 
    }

    // Update their last request timestamp
    requestCooldowns.set(userIP, now);

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

  // 🚀 NEW: Listen for the Flame Reaction and forward it to the specific room
  socket.on('send_reaction', (reactionType) => {
     if (socket.currentRoom) {
        // Use broadcast so it goes to the OTHER person in the room, not back to the sender
        socket.broadcast.to(socket.currentRoom).emit('receive_reaction', reactionType);
     }
  });

  socket.on('disconnect', () => {
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    
    // Clean up memory to prevent RAM leaks over time
    requestCooldowns.delete(userIP);
    
    console.log(`❌ Node Disconnected: ${socket.id}. Queue size: ${waitingQueue.length}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Aura Traffic Controller active on port ${PORT}`);
});
