import express from "express";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import DmRoom from "../models/DmRoom.js";

const router = express.Router();

router.post("/request", async (req, res) => {
  const { senderId, username } = req.body;

  const receiver = await User.findOne({ username });
  if (!receiver) return res.status(404).json({ message: "Kullanıcı bulunamadı" });

  const fr = await FriendRequest.create({
    sender: senderId,
    receiver: receiver._id,
    status: "pending"
  });

  res.json(fr);
});

router.get("/requests/:userId", async (req, res) => {
  const { userId } = req.params;

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

  res.json({ dmRoomId: dm._id });
});

export default router;
