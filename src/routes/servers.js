import express from "express";
import crypto from "crypto";
import Server from "../models/Server.js";
import User from "../models/User.js";
import ChannelMessage from "../models/ChannelMessage.js";

const router = express.Router();

const asId = (v) => (v ? v.toString() : "");
const isOwner = (server, userId) => asId(server?.owner) === asId(userId);
const isMember = (server, userId) =>
  !!server?.members?.some((u) => asId(u) === asId(userId));

const ensureMember = (req, res, server, userId) => {
  if (!userId) {
    res.status(403).json({ message: "Yetkisiz" });
    return false;
  }
  if (!isOwner(server, userId) && !isMember(server, userId)) {
    res.status(403).json({ message: "Yetkisiz" });
    return false;
  }
  return true;
};

const ensureOwner = (req, res, server, userId) => {
  if (!userId || !isOwner(server, userId)) {
    res.status(403).json({ message: "Yetkisiz" });
    return false;
  }
  return true;
};

const syncOwnerMembership = async (server) => {
  if (!server?.owner) return;
  if (!isMember(server, server.owner)) {
    server.members = [...(server.members || []), server.owner];
    await server.save();
  }
};

const makeInviteCode = () => crypto.randomBytes(4).toString("hex").toUpperCase();

const uniqueInviteCode = async () => {
  for (let i = 0; i < 10; i += 1) {
    const code = makeInviteCode();
    const exists = await Server.exists({ inviteCode: code });
    if (!exists) return code;
  }
  throw new Error("Davet kodu olusturulamadi");
};

router.post("/", async (req, res) => {
  const { name, cover = "", ownerId } = req.body;

  if (!name?.trim() || !ownerId) {
    return res.status(400).json({ message: "name ve ownerId gerekli" });
  }
  if (req.user?.id?.toString() !== ownerId.toString()) {
    return res.status(403).json({ message: "Yetkisiz" });
  }

  const owner = await User.findById(ownerId).select("_id");
  if (!owner) {
    return res.status(404).json({ message: "Kullanici bulunamadi" });
  }

  const server = await Server.create({
    name: name.trim(),
    cover,
    owner: ownerId,
    members: [ownerId],
    categories: [],
    channels: []
  });

  res.json(server);
});

router.get("/list/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ message: "userId gerekli" });
  if (req.user?.id?.toString() !== userId.toString()) {
    return res.status(403).json({ message: "Yetkisiz" });
  }

  const list = await Server.find({ members: userId })
    .sort({ createdAt: -1 })
    .select("name cover owner createdAt");
  const ownerList = await Server.find({ owner: userId })
    .sort({ createdAt: -1 })
    .select("name cover owner createdAt");

  const seen = new Set();
  const merged = [...list, ...ownerList].filter((srv) => {
    const id = asId(srv._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  res.json(merged);
});

router.get("/invite/:code", async (req, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ message: "Davet kodu gerekli" });

  const server = await Server.findOne({ inviteCode: code }).select("_id name cover owner");
  if (!server) return res.status(404).json({ message: "Gecersiz davet kodu" });

  res.json({
    serverId: server._id,
    name: server.name,
    cover: server.cover
  });
});

router.post("/invite/:code/join", async (req, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  const userId = req.user?.id;
  if (!userId) return res.status(403).json({ message: "Yetkisiz" });
  if (!code) return res.status(400).json({ message: "Davet kodu gerekli" });

  const server = await Server.findOne({ inviteCode: code });
  if (!server) return res.status(404).json({ message: "Gecersiz davet kodu" });

  if (!isOwner(server, userId) && !isMember(server, userId)) {
    server.members.push(userId);
    await server.save();
  } else {
    await syncOwnerMembership(server);
  }

  res.json({
    joined: true,
    serverId: server._id
  });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const server = await Server.findById(id)
    .populate("owner", "username avatar")
    .populate("members", "username avatar");
  if (!server) return res.status(404).json({ message: "Sunucu bulunamadi" });
  if (!ensureMember(req, res, server, req.user?.id)) return;
  await syncOwnerMembership(server);
  res.json(server);
});

router.get("/:id/channels/:channelId/messages", async (req, res) => {
  const { id, channelId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || "100", 10), 200);

  const server = await Server.findById(id).select("_id channels members owner");
  if (!server) return res.status(404).json({ message: "Sunucu bulunamadi" });
  if (!ensureMember(req, res, server, req.user?.id)) return;
  await syncOwnerMembership(server);

  const channelExists = server.channels.id(channelId);
  if (!channelExists) return res.status(404).json({ message: "Kanal bulunamadi" });

  const messages = await ChannelMessage.find({ server: id, channel: channelId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .populate("sender", "username avatar");

  res.json(messages);
});

router.post("/:id/channels", async (req, res) => {
  const { id } = req.params;
  const { name, type, categoryId = null } = req.body;

  if (!name?.trim() || !type) {
    return res.status(400).json({ message: "name ve type gerekli" });
  }

  if (!["text", "voice"].includes(type)) {
    return res.status(400).json({ message: "Gecersiz kanal tipi" });
  }

  const server = await Server.findById(id);
  if (!server) return res.status(404).json({ message: "Sunucu bulunamadi" });
  if (!ensureOwner(req, res, server, req.user?.id)) return;

  let category = null;
  if (categoryId) {
    category = server.categories.id(categoryId);
    if (!category) {
      return res.status(400).json({ message: "Kategori bulunamadi" });
    }
  }

  server.channels.push({ name: name.trim(), type, categoryId: category?._id || null });
  await server.save();

  res.json(server.channels[server.channels.length - 1]);
});

router.post("/:id/categories", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: "name gerekli" });
  }

  const server = await Server.findById(id);
  if (!server) return res.status(404).json({ message: "Sunucu bulunamadi" });
  if (!ensureOwner(req, res, server, req.user?.id)) return;

  server.categories.push({ name: name.trim() });
  await server.save();

  res.json(server.categories[server.categories.length - 1]);
});

router.patch("/:id/channels/:channelId", async (req, res) => {
  const { id, channelId } = req.params;
  const { categoryId = null } = req.body;

  const server = await Server.findById(id);
  if (!server) return res.status(404).json({ message: "Sunucu bulunamadi" });
  if (!ensureOwner(req, res, server, req.user?.id)) return;

  const channel = server.channels.id(channelId);
  if (!channel) return res.status(404).json({ message: "Kanal bulunamadi" });

  if (categoryId) {
    const category = server.categories.id(categoryId);
    if (!category) {
      return res.status(400).json({ message: "Kategori bulunamadi" });
    }
    channel.categoryId = category._id;
  } else {
    channel.categoryId = null;
  }

  await server.save();
  res.json(channel);
});

router.post("/:id/invite", async (req, res) => {
  const { id } = req.params;
  const server = await Server.findById(id).select("_id owner members inviteCode inviteCreatedAt name");
  if (!server) return res.status(404).json({ message: "Sunucu bulunamadi" });
  if (!ensureOwner(req, res, server, req.user?.id)) return;

  await syncOwnerMembership(server);
  const code = await uniqueInviteCode();
  server.inviteCode = code;
  server.inviteCreatedAt = new Date();
  await server.save();

  res.json({
    code,
    serverId: server._id,
    serverName: server.name
  });
});

export default router;
