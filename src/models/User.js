import mongoose from "mongoose";

export default mongoose.model("User",
  new mongoose.Schema({
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    password: String,
    avatar: String
  })
);
