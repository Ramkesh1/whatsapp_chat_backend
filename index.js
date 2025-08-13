const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const SocketHandler = require('./utils/socketHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000', // <-- your frontend URL/port
    methods: ['GET', 'POST'],
    credentials: true
  }
});

new SocketHandler(io);

server.listen(5000, () => {
  console.log('Server running on port 5000');
});