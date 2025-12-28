import mongoose from "mongoose";

const channelMessageSchema = new mongoose.Schema(
  {
    server: { type: mongoose.Schema.Types.ObjectId, ref: "Server", required: true },
    channel: { type: mongoose.Schema.Types.ObjectId, required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model("ChannelMessage", channelMessageSchema);
