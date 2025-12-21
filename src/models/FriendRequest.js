import mongoose from "mongoose";

export default mongoose.model("FriendRequest",
  new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, default: "pending" }
  }, { timestamps: true })
);
