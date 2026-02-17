import express from "express";
import mongoose from "mongoose";
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

    if (req.user?.id?.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Yetkisiz" });
    }

    const rooms = await DmRoom.find({ users: userId, hiddenFor: { $ne: userId } }).populate("users", "username avatar");
    if (!rooms.length) return res.json([]);

    const roomIds = rooms.map((r) => r._id);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const lastMessagesRaw = await Message.aggregate([
      { $match: { dmRoom: { $in: roomIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$dmRoom", message: { $first: "$$ROOT" } } }
    ]);

    const lastMessages = await Message.populate(
      lastMessagesRaw.map((m) => m.message),
      { path: "sender", select: "username avatar" }
    );

    const lastMap = new Map();
    for (const msg of lastMessages) {
      lastMap.set(msg.dmRoom.toString(), msg);
    }

    const unreadAgg = await Message.aggregate([
      {
        $match: {
          dmRoom: { $in: roomIds },
          sender: { $ne: userObjectId },
          readBy: { $ne: userObjectId },
          deleted: { $ne: true }
        }
      },
      { $group: { _id: "$dmRoom", count: { $sum: 1 } } }
    ]);

    const unreadMap = new Map(unreadAgg.map((u) => [u._id.toString(), u.count]));

    const result = rooms.map((room) => ({
      ...room.toObject(),
      lastMessage: lastMap.get(room._id.toString()) || null,
      unreadCount: unreadMap.get(room._id.toString()) || 0
    }));

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "DM listesi alinamadi" });
  }
});


/**
 * DM MESSAGES + okundu işaretle
 * GET /api/dm/:roomId/:userId
 */
router.get("/:roomId/:userId", async (req, res) => {
  try {
    const { roomId, userId } = req.params;
    if (req.user?.id?.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Yetkisiz" });
    }

    const room = await DmRoom.findById(roomId).select("_id users hiddenFor");
    if (!room) return res.status(404).json({ message: "DM bulunamadi" });
    const hasUser = room.users.some((u) => u.toString() === userId.toString());
    if (!hasUser) return res.status(403).json({ message: "Yetkisiz" });

    await DmRoom.updateOne({ _id: roomId }, { $pull: { hiddenFor: userId } });

    const limit = Math.min(parseInt(req.query.limit || "200", 10), 200);
    const before = req.query.before ? new Date(req.query.before) : null;

    await Message.updateMany(
      { dmRoom: roomId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    const query = { dmRoom: roomId };
    if (before && !Number.isNaN(before.getTime())) {
      query.createdAt = { $lt: before };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: 1 })
      .limit(limit)
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
    if (req.user?.id?.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Yetkisiz" });
    }

    const room = await DmRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: "DM bulunamadi" });
    const hasUser = room.users.some((u) => u.toString() === userId.toString());
    if (!hasUser) return res.status(403).json({ message: "Yetkisiz" });

    await DmRoom.updateOne({ _id: roomId }, { $addToSet: { hiddenFor: userId } });

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
    if (req.user?.id?.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Yetkisiz" });
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
