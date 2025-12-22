import express from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

import authRoute from "./routes/auth.js";
import friendsRoute from "./routes/friends.js";
import dmRoute from "./routes/dm.js";
import uploadRoute from "./routes/upload.js";
import pushRoute from "./routes/push.js";

dotenv.config();

const app = express();

const allowedOrigins = [
  "https://visicos-frontend.vercel.app",
  "http://localhost:5173"
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(express.json());
const uploadDir = process.env.UPLOAD_DIR || "uploads";
app.use("/uploads", express.static(uploadDir));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoute);
app.use("/api/friends", friendsRoute);
app.use("/api/dm", dmRoute);
app.use("/api/upload", uploadRoute);
app.use("/api/push", pushRoute);

export default app;
