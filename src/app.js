import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoute from "./routes/auth.js";
import friendsRoute from "./routes/friends.js";
import dmRoute from "./routes/dm.js";
import uploadRoute from "./routes/upload.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoute);
app.use("/api/friends", friendsRoute);
app.use("/api/dm", dmRoute);
app.use("/api/upload", uploadRoute);

export default app;
