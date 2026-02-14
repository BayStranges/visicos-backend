import express from "express";
import User from "../models/User.js";
import { getVapidPublicKey } from "../push.js";

const router = express.Router();

router.get("/vapid-public-key", (req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(500).json({ message: "Missing VAPID key" });
  return res.json({ publicKey: key });
});

router.post("/subscribe", async (req, res) => {
  const { userId, subscription, userAgent } = req.body || {};
  if (!userId || !subscription?.endpoint || !subscription?.keys) {
    return res.status(400).json({ message: "Invalid subscription" });
  }
  if (req.user?.id?.toString() !== userId.toString()) {
    return res.status(403).json({ message: "Yetkisiz" });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  const exists = user.pushSubscriptions?.some(
    (sub) => sub.endpoint === subscription.endpoint
  );

  if (!exists) {
    user.pushSubscriptions = [
      ...(user.pushSubscriptions || []),
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        userAgent: userAgent || "",
        createdAt: new Date()
      }
    ];
    await user.save();
  }

  return res.json({ ok: true });
});

router.post("/unsubscribe", async (req, res) => {
  const { userId, endpoint } = req.body || {};
  if (!userId || !endpoint) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  user.pushSubscriptions = (user.pushSubscriptions || []).filter(
    (sub) => sub.endpoint !== endpoint
  );
  await user.save();

  return res.json({ ok: true });
});

export default router;
