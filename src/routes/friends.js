import express from "express";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import DmRoom from "../models/DmRoom.js";
import Message from "../models/Message.js";
import { sendPushToUser } from "../push.js";

const router = express.Router();

router.post("/request", async (req, res) => {
  const { username } = req.body;
  const senderId = req.user?.id;

  const receiver = await User.findOne({ username });
  if (!receiver) return res.status(404).json({ message: "Kullanıcı bulunamadı" });

  const sender = await User.findById(senderId).select("username");

  const fr = await FriendRequest.create({
    sender: senderId,
    receiver: receiver._id,
    status: "pending"
  });

  await sendPushToUser(receiver._id, {
    title: "Yeni arkadas istegi",
    body: sender?.username
      ? `${sender.username} sana arkadas istegi gonderdi.`
      : "Yeni arkadas istegi aldin.",
    url: "/friends"
  });

  res.json(fr);
});

router.get("/requests/:userId", async (req, res) => {
  const { userId } = req.params;
  if (req.user?.id?.toString() !== userId.toString()) {
    return res.status(403).json({ message: "Yetkisiz" });
  }

  const list = await FriendRequest.find({ receiver: userId, status: "pending" })
    .populate("sender", "username");

  res.json(list);
});

router.post("/accept", async (req, res) => {
  const { requestId } = req.body;

  const fr = await FriendRequest.findById(requestId);
  if (!fr) return res.status(404).json({ message: "İstek yok" });

  fr.status = "accepted";
  await fr.save();

  let dm = await DmRoom.findOne({ users: { $all: [fr.sender, fr.receiver] } });
  if (!dm) dm = await DmRoom.create({ users: [fr.sender, fr.receiver] });

  const receiver = await User.findById(fr.receiver).select("username");
  await sendPushToUser(fr.sender, {
    title: "Arkadas istegi kabul edildi",
    body: receiver?.username
      ? `${receiver.username} istegini kabul etti.`
      : "Arkadas istegin kabul edildi.",
    url: "/friends"
  });

  res.json({ dmRoomId: dm._id });
});

router.post("/remove", async (req, res) => {
  const { userId, targetId, roomId } = req.body;
  if (!userId || !targetId) {
    return res.status(400).json({ message: "userId ve targetId gerekli" });
  }

  let room = null;
  if (roomId) {
    room = await DmRoom.findById(roomId);
  }
  if (!room) {
    room = await DmRoom.findOne({ users: { $all: [userId, targetId] } });
  }
  if (!room) return res.status(404).json({ message: "DM bulunamadi" });

  await Message.deleteMany({ dmRoom: room._id });
  await DmRoom.deleteOne({ _id: room._id });

  await FriendRequest.deleteMany({
    $or: [
      { sender: userId, receiver: targetId },
      { sender: targetId, receiver: userId }
    ]
  });

  res.json({ ok: true });
});

export default router;
