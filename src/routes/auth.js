import express from "express";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { verifyToken } from "../middlewares/auth.middleware.js";
import User from "../models/User.js";

const router = express.Router();

const secret = process.env.JWT_SECRET || "DEV_SECRET";

const toSafeUser = (user) => {
  if (!user) return user;
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
};

const ensureSelf = (req, res, userId) => {
  if (!req.user?.id) return false;
  if (req.user.id.toString() !== userId.toString()) {
    res.status(403).json({ message: "Yetkisiz" });
    return false;
  }
  return true;
};

router.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email ve şifre gerekli" });
  }

  try {
    const hash = await bcryptjs.hash(password, 10);
    const user = await User.create({ ...req.body, password: hash });
    const token = jwt.sign({ id: user._id, email: user.email }, secret, { expiresIn: "7d" });
    return res.json({ user: toSafeUser(user), token });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "kullanici";
      return res.status(409).json({ message: `${field} zaten kullaniliyor` });
    }
    console.error("register error", err);
    return res.status(500).json({ message: "Kayit basarisiz" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email ve şifre gerekli" });
  }

  const user = await User.findOne({ email });
  if (!user || !user.password) {
    return res.status(401).json({ message: "Email veya şifre hatalı" });
  }

  const ok = await bcryptjs.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Email veya şifre hatalı" });

  const token = jwt.sign({ id: user._id, email: user.email }, secret, { expiresIn: "7d" });
  res.json({ user: toSafeUser(user), token });
});

router.get("/profile/:userId", verifyToken, async (req, res) => {
  if (!ensureSelf(req, res, req.params.userId)) return;
  const user = await User.findById(req.params.userId).select("-password");
  if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  res.json(user);
});

router.put("/profile/:userId", verifyToken, async (req, res) => {
  if (!ensureSelf(req, res, req.params.userId)) return;
  const { username, avatar, banner, email, phone, displayName } = req.body;
  const updates = {};
  if (username) updates.username = username;
  if (avatar) updates.avatar = avatar;
  if (banner) updates.banner = banner;
  if (email) updates.email = email;
  if (phone) updates.phone = phone;
  if (displayName) updates.displayName = displayName;

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    updates,
    { new: true }
  ).select("-password");

  if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });

  res.json(user);
});

router.post("/devices/register", verifyToken, async (req, res) => {
  const { userId, deviceId, name, location, userAgent } = req.body || {};
  if (!ensureSelf(req, res, userId)) return;
  if (!userId || !deviceId) {
    return res.status(400).json({ message: "userId ve deviceId gerekli" });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "Kullanici bulunamadi" });

  if (!user.devices) user.devices = [];
  const existing = user.devices.find((d) => d.deviceId === deviceId);
  if (existing) {
    existing.name = name || existing.name;
    existing.location = location || existing.location;
    existing.userAgent = userAgent || existing.userAgent;
    existing.lastActive = new Date();
  } else {
    user.devices.push({
      deviceId,
      name: name || "Unknown",
      location: location || "Unknown",
      userAgent: userAgent || "",
      lastActive: new Date()
    });
  }

  await user.save();
  res.json({ ok: true, devices: user.devices });
});

router.get("/devices/:userId", verifyToken, async (req, res) => {
  if (!ensureSelf(req, res, req.params.userId)) return;
  const user = await User.findById(req.params.userId).select("devices");
  if (!user) return res.status(404).json({ message: "Kullanici bulunamadi" });
  res.json(user.devices || []);
});

router.post("/devices/remove", verifyToken, async (req, res) => {
  const { userId, deviceId } = req.body || {};
  if (!ensureSelf(req, res, userId)) return;
  if (!userId || !deviceId) {
    return res.status(400).json({ message: "userId ve deviceId gerekli" });
  }
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "Kullanici bulunamadi" });
  user.devices = (user.devices || []).filter((d) => d.deviceId !== deviceId);
  await user.save();
  res.json({ ok: true, devices: user.devices });
});

router.post("/devices/logout-all", verifyToken, async (req, res) => {
  const { userId, keepDeviceId } = req.body || {};
  if (!ensureSelf(req, res, userId)) return;
  if (!userId) {
    return res.status(400).json({ message: "userId gerekli" });
  }
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "Kullanici bulunamadi" });
  user.devices = (user.devices || []).filter((d) => d.deviceId === keepDeviceId);
  await user.save();
  res.json({ ok: true, devices: user.devices });
});

export default router;
