import mongoose from "mongoose";

const ReactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  emoji: String
});

const MessageSchema = new mongoose.Schema(
  {
    dmRoom: { type: mongoose.Schema.Types.ObjectId, ref: "DmRoom" },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: String,

    // 🔥 BUNU EKLE
    replyTo: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
      username: String,
      content: String
    },

    readBy: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    ],

    reactions: [ReactionSchema],

    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model("Message", MessageSchema);
