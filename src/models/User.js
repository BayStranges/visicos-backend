import mongoose from "mongoose";

export default mongoose.model("User",
  new mongoose.Schema({
    username: { type: String, unique: true },
    displayName: String,
    email: { type: String, unique: true },
    password: String,
    avatar: String,
    banner: String,
    phone: String,
    pushSubscriptions: [
      {
        endpoint: String,
        keys: {
          p256dh: String,
          auth: String
        },
        userAgent: String,
        createdAt: Date
      }
    ],
    devices: [
      {
        deviceId: String,
        name: String,
        location: String,
        userAgent: String,
        lastActive: Date
      }
    ]
  })
);
