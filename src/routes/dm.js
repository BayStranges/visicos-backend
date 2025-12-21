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

export default router;
