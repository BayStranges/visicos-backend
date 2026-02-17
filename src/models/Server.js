import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["text", "voice"], required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  { timestamps: true }
);

const serverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    cover: { type: String, default: "" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    inviteCode: { type: String, default: "", index: true },
    inviteCreatedAt: { type: Date, default: null },
    categories: [categorySchema],
    channels: [channelSchema]
  },
  { timestamps: true }
);

export default mongoose.model("Server", serverSchema);
