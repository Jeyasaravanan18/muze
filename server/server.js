const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const socketToUser = new Map();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join', (data) => {
    const { roomId, userId, userName, isHost } = data;
    socketToUser.set(socket.id, { userId, userName, roomId });
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { hostId: isHost ? userId : null, state: null, members: new Map() });
    }

    const room = rooms.get(roomId);
    if (isHost && !room.hostId) room.hostId = userId;
    room.members.set(userId, { userId, userName, isHost });

    console.log(`User ${userName} (${userId}) joined room ${roomId}`);
    socket.to(roomId).emit('presence', { type: 'PRESENCE', roomId, senderId: userId, senderName: userName, isHost, timestamp: Date.now() });
    socket.to(roomId).emit('join', data);
  });

  const relayEvent = (eventName) => {
    socket.on(eventName, (payload) => {
      const user = socketToUser.get(socket.id);
      if (!user) return;
      
      socket.to(user.roomId).emit(eventName, payload);
    });
  };

  ['play', 'pause', 'seek', 'change_song', 'sync_state', 'sync_request', 'chat', 'reaction', 'queue_add', 'queue_update'].forEach(relayEvent);

  socket.on('webrtc_offer', (payload) => { socket.to(payload.roomId).emit('webrtc_offer', payload); });
  socket.on('webrtc_answer', (payload) => { socket.to(payload.roomId).emit('webrtc_answer', payload); });
  socket.on('webrtc_ice_candidate', (payload) => { socket.to(payload.roomId).emit('webrtc_ice_candidate', payload); });

  socket.on('disconnect', () => {
    const user = socketToUser.get(socket.id);
    if (user) {
      console.log(`User ${user.userName} disconnected`);
      socketToUser.delete(socket.id);
      const room = rooms.get(user.roomId);
      if (room) {
        room.members.delete(user.userId);
        socket.to(user.roomId).emit('leave', { type: 'LEAVE', roomId: user.roomId, senderId: user.userId, senderName: user.userName, timestamp: Date.now() });
        if (room.members.size === 0) rooms.delete(user.roomId);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => { console.log(`Signaling server running on port ${PORT}`); });

