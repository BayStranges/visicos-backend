import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import app from "./app.js";
import { connectDB } from "./config/db.js";

import Message from "./models/Message.js";
import DmRoom from "./models/DmRoom.js";
import ChannelMessage from "./models/ChannelMessage.js";
import ServerModel from "./models/Server.js";
import { sendPushToUser } from "./push.js";
import { createSfuHandlers } from "./sfu.js";

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

const onlineUsers = new Map();
const voiceChannelMembers = new Map();
const socketSecret = process.env.JWT_SECRET || "DEV_SECRET";

const emitOnlineUsers = () => {
  io.emit("online-users", Array.from(onlineUsers.keys()));
};

const trackUserOnline = (userId, socketId) => {
  const key = userId.toString();
  const set = onlineUsers.get(key) || new Set();
  set.add(socketId);
  onlineUsers.set(key, set);
  emitOnlineUsers();
};

const trackUserOffline = (userId, socketId) => {
  const key = userId.toString();
  const set = onlineUsers.get(key);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(key);
  } else {
    onlineUsers.set(key, set);
  }
  emitOnlineUsers();
};

const upsertVoiceMember = (channelId, userId) => {
  const key = channelId.toString();
  const set = voiceChannelMembers.get(key) || new Set();
  set.add(userId.toString());
  voiceChannelMembers.set(key, set);
};

const removeVoiceMember = (channelId, userId) => {
  const key = channelId.toString();
  const set = voiceChannelMembers.get(key);
  if (!set) return;
  set.delete(userId.toString());
  if (set.size === 0) {
    voiceChannelMembers.delete(key);
  } else {
    voiceChannelMembers.set(key, set);
  }
};

const emitVoiceChannelMembers = (channelId) => {
  const key = channelId.toString();
  const set = voiceChannelMembers.get(key) || new Set();
  io.emit("voice-channel-members", {
    channelId: key,
    members: Array.from(set)
  });
};

io.use((socket, next) => {
  const headerAuth = socket.handshake.headers?.authorization || "";
  const bearer = headerAuth.startsWith("Bearer ") ? headerAuth.slice(7) : null;
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    bearer;
  if (!token) return next(new Error("unauthorized"));
  try {
    const decoded = jwt.verify(token, socketSecret);
    socket.userId = decoded.id;
    return next();
  } catch (err) {
    return next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);
  createSfuHandlers(io, socket);

  /* ================= USER ================= */
  socket.on("user-online", () => {
    if (!socket.userId) return;
    socket.join(socket.userId.toString());
    trackUserOnline(socket.userId, socket.id);
  });

  /* ================= DM JOIN ================= */
  socket.on("join-dm", async ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    if (socket.userId?.toString() !== userId.toString()) return;

    const room = await DmRoom.findById(roomId).select("users");
    if (!room) return;
    const isMember = room.users.some((u) => u.toString() === userId.toString());
    if (!isMember) return;

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
    if (socket.userId?.toString() !== senderId.toString()) return;

    const room = await DmRoom.findById(roomId);
    if (!room) return;
    const isMember = room.users.some((u) => u.toString() === senderId.toString());
    if (!isMember) return;

    let message = await Message.create({
      dmRoom: roomId,
      sender: senderId,
      content: content.trim(),
      replyTo: replyTo || null,
      readBy: [senderId]
    });

    message = await message.populate("sender", "username avatar");

    io.to(roomId).emit("receive-message", message);

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
        await sendPushToUser(targetId, {
          title: message?.sender?.username
            ? `New message from ${message.sender.username}`
            : "New message",
          body: message?.content?.slice(0, 140) || "Open Nexora to read",
          url: `/dm/${roomId}`
        });
      }
    }
  });

  /* ================= CHANNEL ================= */
  socket.on("join-channel", async ({ channelId, userId }) => {
    if (!channelId || !userId) return;
    if (socket.userId?.toString() !== userId.toString()) return;

    const server = await ServerModel.findOne({
      "channels._id": channelId,
      $or: [{ members: userId }, { owner: userId }]
    }).select("_id");
    if (!server) return;

    socket.join(`channel:${channelId}`);
  });

  socket.on("leave-channel", ({ channelId }) => {
    if (!channelId) return;
    socket.leave(`channel:${channelId}`);
  });

  socket.on("join-voice-channel", async ({ channelId, userId }) => {
    if (!channelId || !userId) return;
    if (socket.userId?.toString() !== userId.toString()) return;

    const server = await ServerModel.findOne({
      "channels._id": channelId,
      $or: [{ members: userId }, { owner: userId }]
    }).select("channels");
    if (!server) return;

    const channel = server.channels.id(channelId);
    if (!channel || channel.type !== "voice") return;

    upsertVoiceMember(channelId, userId);
    emitVoiceChannelMembers(channelId);
  });

  socket.on("leave-voice-channel", ({ channelId, userId }) => {
    if (!channelId || !userId) return;
    if (socket.userId?.toString() !== userId.toString()) return;
    removeVoiceMember(channelId, userId);
    emitVoiceChannelMembers(channelId);
  });

  socket.on("get-voice-channel-members", async ({ serverId, userId }, cb) => {
    try {
      if (!serverId || !userId) return cb?.({ error: "missing params" });
      if (socket.userId?.toString() !== userId.toString()) return cb?.({ error: "unauthorized" });

      const server = await ServerModel.findById(serverId).select("channels members owner");
      if (!server) return cb?.({ error: "not found" });
      const hasAccess =
        server.owner?.toString() === userId.toString() ||
        server.members?.some((m) => m.toString() === userId.toString());
      if (!hasAccess) return cb?.({ error: "unauthorized" });

      const presence = {};
      for (const ch of server.channels || []) {
        if (ch.type !== "voice") continue;
        const key = ch._id.toString();
        presence[key] = Array.from(voiceChannelMembers.get(key) || []);
      }
      cb?.({ presence });
    } catch {
      cb?.({ error: "presence failed" });
    }
  });

  socket.on("send-channel-message", async ({ serverId, channelId, senderId, content }) => {
    if (!serverId || !channelId || !senderId || !content?.trim()) return;
    if (socket.userId?.toString() !== senderId.toString()) return;

    const server = await ServerModel.findOne({
      _id: serverId,
      "channels._id": channelId,
      $or: [{ members: senderId }, { owner: senderId }]
    }).select("_id");
    if (!server) return;

    let message = await ChannelMessage.create({
      server: serverId,
      channel: channelId,
      sender: senderId,
      content: content.trim()
    });

    message = await message.populate("sender", "username avatar");

    io.to(`channel:${channelId}`).emit("channel-message", message);
  });

  /* ================= DELETE ================= */
  socket.on("delete-message", async ({ messageId, userId }) => {
    const msg = await Message.findById(messageId).populate("sender", "username");
    if (!msg) return;
    if (socket.userId?.toString() !== userId.toString()) return;
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
    if (socket.userId?.toString() !== userId.toString()) return;
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
    if (socket.userId?.toString() !== userId.toString()) return;

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
      trackUserOffline(socket.userId, socket.id);
      const user = socket.userId.toString();
      const affected = [];
      for (const [channelId, set] of voiceChannelMembers.entries()) {
        if (!set.has(user)) continue;
        set.delete(user);
        if (set.size === 0) voiceChannelMembers.delete(channelId);
        else voiceChannelMembers.set(channelId, set);
        affected.push(channelId);
      }
      for (const channelId of affected) {
        emitVoiceChannelMembers(channelId);
      }
    }
    console.log("socket disconnected:", socket.userId || socket.id);
  });
});

server.listen(3001, () => {
  console.log("backend listening on 3001");
});
