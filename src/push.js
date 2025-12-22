import webpush from "web-push";
import User from "./models/User.js";

const publicKey = process.env.VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";

if (publicKey && privateKey) {
  webpush.setVapidDetails(
    "mailto:support@nexora.app",
    publicKey,
    privateKey
  );
}

export const getVapidPublicKey = () => publicKey;

export const sendPushToUser = async (userId, payload) => {
  if (!publicKey || !privateKey) return;
  if (!userId) return;

  const user = await User.findById(userId).select("pushSubscriptions");
  if (!user?.pushSubscriptions?.length) return;

  const nextSubs = [];

  for (const sub of user.pushSubscriptions) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
        },
        JSON.stringify(payload)
      );
      nextSubs.push(sub);
    } catch (err) {
      const status = err?.statusCode || err?.status;
      if (status && status !== 404 && status !== 410) {
        nextSubs.push(sub);
      }
    }
  }

  if (nextSubs.length !== user.pushSubscriptions.length) {
    user.pushSubscriptions = nextSubs;
    await user.save();
  }
};
