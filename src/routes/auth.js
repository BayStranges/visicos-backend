import express from "express";
import bcryptjs from "bcryptjs";
import User from "../models/User.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email ve şifre gerekli" });
  }

  const hash = await bcryptjs.hash(password, 10);
  try {
    const user = await User.create({ ...req.body, password: hash });
    res.json(user);
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "kullanıcı";
      return res.status(409).json({ message: `${field} zaten kullanılıyor` });
    }
    throw err;
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

  res.json(user);
});

router.get("/profile/:userId", async (req, res) => {
  const user = await User.findById(req.params.userId).select("-password");
  if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  res.json(user);
});

router.put("/profile/:userId", async (req, res) => {
  const { username, avatar, banner } = req.body;
  const updates = {};
  if (username) updates.username = username;
  if (avatar) updates.avatar = avatar;
  if (banner) updates.banner = banner;

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    updates,
    { new: true }
  ).select("-password");

  if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });

  res.json(user);
});

export default router;
