import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["text", "voice"], required: true }
  },
  { timestamps: true }
);

const serverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    cover: { type: String, default: "" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    channels: [channelSchema]
  },
  { timestamps: true }
);

export default mongoose.model("Server", serverSchema);
