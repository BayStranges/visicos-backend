import express from "express";
import bcryptjs from "bcryptjs";
import User from "../models/User.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const hash = await bcryptjs.hash(req.body.password, 10);
  const user = await User.create({ ...req.body, password: hash });
  res.json(user);
});

router.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(404).end();

  const ok = await bcryptjs.compare(req.body.password, user.password);
  if (!ok) return res.status(401).end();

  res.json(user);
});

router.get("/profile/:userId", async (req, res) => {
  const user = await User.findById(req.params.userId).select("-password");
  if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  res.json(user);
});

router.put("/profile/:userId", async (req, res) => {
  const { username, avatar } = req.body;
  const updates = {};
  if (username) updates.username = username;
  if (avatar) updates.avatar = avatar;

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    updates,
    { new: true }
  ).select("-password");

  if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });

  res.json(user);
});

export default router;
