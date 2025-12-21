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
