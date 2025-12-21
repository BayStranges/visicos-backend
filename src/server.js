import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import app from "./app.js";
import { connectDB } from "./config/db.js";

import Message from "./models/Message.js";
import DmRoom from "./models/DmRoom.js";

dotenv.config();
await connectDB();

const server = http.createServer(app);

const allowedOrigins = [
  "https://visicos-frontend.vercel.app",
  "http://localhost:5173"
];

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true }
});

const onlineUsers = new Set();

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  /* ================= USER ================= */
  socket.on("user-online", (userId) => {
    socket.userId = userId;
    socket.join(userId);
    onlineUsers.add(userId.toString());
    io.emit("online-users", Array.from(onlineUsers));
  });

  /* ================= DM JOIN ================= */
  socket.on("join-dm", async ({ roomId, userId }) => {
    if (!roomId || !userId) return;

    socket.userId = userId;
    socket.join(roomId);

    await Message.updateMany(
      { dmRoom: roomId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    io.to(userId).emit("messages-read", { roomId });
  });

  /* ================= WEBRTC SIGNALING ================= */

  socket.on("webrtc-offer", ({ roomId, offer }) => {
    console.log("[webrtc] offer", {
      socketId: socket.id,
      roomId,
      hasOffer: !!offer
    });
    socket.to(roomId).emit("webrtc-offer", { offer, roomId });
  });

  socket.on("webrtc-answer", ({ roomId, answer }) => {
    console.log("[webrtc] answer", {
      socketId: socket.id,
      roomId,
      hasAnswer: !!answer
    });
    socket.to(roomId).emit("webrtc-answer", { answer });
  });

  socket.on("webrtc-ice", ({ roomId, candidate }) => {
    console.log("[webrtc] ice", {
      socketId: socket.id,
      roomId,
      hasCandidate: !!candidate,
      candidateType: candidate?.type
    });
    socket.to(roomId).emit("webrtc-ice", { candidate });
  });

  socket.on("call-ended", (roomId) => {
    console.log("[webrtc] call-ended", { socketId: socket.id, roomId });
    socket.to(roomId).emit("call-ended");
  });

  socket.on("start-call", ({ roomId, from }) => {
    console.log("[webrtc] start-call", { socketId: socket.id, roomId, from });
    socket.to(roomId).emit("incoming-call", { from });
  });

  socket.on("call-rejected", ({ roomId }) => {
    console.log("[webrtc] call-rejected", { socketId: socket.id, roomId });
    socket.to(roomId).emit("call-rejected");
  });

  socket.on("call-accepted", ({ roomId }) => {
    console.log("[webrtc] call-accepted", { socketId: socket.id, roomId });
    socket.to(roomId).emit("call-accepted");
  });
  
  /* ================= TYPING ================= */
  socket.on("typing", ({ roomId, username }) => {
    socket.to(roomId).emit("typing", username);
  });

  socket.on("stop-typing", (roomId) => {
    socket.to(roomId).emit("stop-typing");
  });

  /* ================= MESSAGE ================= */
  socket.on("send-message", async ({ roomId, senderId, content, replyTo }) => {
    if (!roomId || !senderId || !content?.trim()) return;

    let message = await Message.create({
      dmRoom: roomId,
      sender: senderId,
      content: content.trim(),
      replyTo: replyTo || null,
      readBy: [senderId]
    });

    message = await message.populate("sender", "username avatar");

    io.to(roomId).emit("receive-message", message);

    const room = await DmRoom.findById(roomId);
    if (!room) return;

    const socketsInRoom = await io.in(roomId).fetchSockets();

    for (const u of room.users) {
      const targetId = u.toString();
      if (targetId === senderId.toString()) continue;

      const isInRoom = socketsInRoom.some(
        (s) => s.userId === targetId
      );

      if (isInRoom) {
        await Message.updateOne(
          { _id: message._id },
          { $addToSet: { readBy: targetId } }
        );
        io.to(targetId).emit("messages-read", { roomId });
      } else {
        io.to(targetId).emit("new-message", { roomId, message });
      }
    }
  });

  /* ================= DELETE ================= */
  socket.on("delete-message", async ({ messageId, userId }) => {
    const msg = await Message.findById(messageId).populate("sender", "username");
    if (!msg) return;
    if (msg.sender._id.toString() !== userId.toString()) return;

    msg.deleted = true;
    msg.content = "";
    msg.reactions = [];
    await msg.save();

    io.to(msg.dmRoom.toString()).emit("message-deleted", msg);
  });

  /* ================= EDIT ================= */
  socket.on("edit-message", async ({ messageId, userId, content }) => {
    const msg = await Message.findById(messageId).populate("sender", "username");
    if (!msg || msg.deleted) return;
    if (msg.sender._id.toString() !== userId.toString()) return;

    msg.content = content.trim();
    msg.edited = true;
    await msg.save();

    io.to(msg.dmRoom.toString()).emit("message-edited", msg);
  });

  /* ================= REACTION ================= */
  socket.on("react-message", async ({ messageId, userId, emoji }) => {
    const msg = await Message.findById(messageId);
    if (!msg) return;

    const idx = msg.reactions.findIndex(
      (r) => r.user.toString() === userId && r.emoji === emoji
    );

    if (idx >= 0) msg.reactions.splice(idx, 1);
    else msg.reactions.push({ user: userId, emoji });

    await msg.save();

    io.to(msg.dmRoom.toString()).emit("message-reacted", {
      messageId,
      reactions: msg.reactions
    });
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId.toString());
      io.emit("online-users", Array.from(onlineUsers));
    }
    console.log("socket disconnected:", socket.userId || socket.id);
  });
});

server.listen(3001, () => {
  console.log("backend listening on 3001");
});
