import express from "express";
import DmRoom from "../models/DmRoom.js";
import Message from "../models/Message.js";

const router = express.Router();

/**
 * DM LIST
 * GET /api/dm/list/:userId
 */
router.get("/list/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const rooms = await DmRoom.find({ users: userId }).populate("users", "username avatar");

    const result = [];

    for (const room of rooms) {
      const lastMessage = await Message.findOne({ dmRoom: room._id })
        .sort({ createdAt: -1 })
        .populate("sender", "username avatar");

      const unreadCount = await Message.countDocuments({
        dmRoom: room._id,
        sender: { $ne: userId },     // kendi mesajın sayılmasın
        readBy: { $ne: userId },     // okunmamış
        deleted: { $ne: true }       // silinmiş sayılmasın
      });

      result.push({
        ...room.toObject(),
        lastMessage,
        unreadCount
      });
    }

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "DM listesi alınamadı" });
  }
});

/**
 * DM MESSAGES + okundu işaretle
 * GET /api/dm/:roomId/:userId
 */
router.get("/:roomId/:userId", async (req, res) => {
  try {
    const { roomId, userId } = req.params;

    await Message.updateMany(
      { dmRoom: roomId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    const messages = await Message.find({ dmRoom: roomId })
      .sort({ createdAt: 1 })
      .populate("sender", "username avatar");

    res.json(messages);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Mesajlar alınamadı" });
  }
});

/**
 * DM CLOSE
 * POST /api/dm/close
 */
router.post("/close", async (req, res) => {
  try {
    const { roomId, userId } = req.body;
    if (!roomId || !userId) {
      return res.status(400).json({ message: "roomId ve userId gerekli" });
    }

    const room = await DmRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: "DM bulunamadi" });
    const hasUser = room.users.some((u) => u.toString() === userId.toString());
    if (!hasUser) return res.status(403).json({ message: "Yetkisiz" });

    await Message.deleteMany({ dmRoom: roomId });
    await DmRoom.deleteOne({ _id: roomId });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "DM kapatilamadi" });
  }
});

/**
 * DM INVITE
 * POST /api/dm/invite
 */
router.post("/invite", async (req, res) => {
  try {
    const { roomId, userId } = req.body;
    if (!roomId || !userId) {
      return res.status(400).json({ message: "roomId ve userId gerekli" });
    }

    const room = await DmRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: "DM bulunamadi" });
    const hasUser = room.users.some((u) => u.toString() === userId.toString());
    if (!hasUser) return res.status(403).json({ message: "Yetkisiz" });

    const baseUrl = process.env.FRONTEND_URL || req.headers.origin || "http://localhost:5173";
    res.json({ link: `${baseUrl}/dm/${roomId}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Davet olusturulamadi" });
  }
});

export default router;
