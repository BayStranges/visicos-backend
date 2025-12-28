import express from "express";
import Server from "../models/Server.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, cover = "", ownerId } = req.body;

  if (!name?.trim() || !ownerId) {
    return res.status(400).json({ message: "name ve ownerId gerekli" });
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

  const list = await Server.find({ members: userId })
    .sort({ createdAt: -1 })
    .select("name cover owner createdAt");

  res.json(list);
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const server = await Server.findById(id)
    .populate("owner", "username avatar")
    .populate("members", "username avatar");
  if (!server) return res.status(404).json({ message: "Sunucu bulunamadi" });
  res.json(server);
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

  server.categories.push({ name: name.trim() });
  await server.save();

  res.json(server.categories[server.categories.length - 1]);
});

router.patch("/:id/channels/:channelId", async (req, res) => {
  const { id, channelId } = req.params;
  const { categoryId = null } = req.body;

  const server = await Server.findById(id);
  if (!server) return res.status(404).json({ message: "Sunucu bulunamadi" });

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

export default router;
