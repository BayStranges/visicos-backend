import mongoose from "mongoose";

const serverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    cover: { type: String, default: "" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

export default mongoose.model("Server", serverSchema);
