import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();
const uploadDir = process.env.UPLOAD_DIR || "uploads";
fs.mkdirSync(uploadDir, { recursive: true });

const normalize = (name = "") =>
  name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_") || "file";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const safe = normalize(base);
    cb(null, `${Date.now()}-${safe}${ext}`);
  }
});

const upload = multer({ storage });

router.post("/", upload.single("file"), (req, res) => {
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname
  });
});

export default router;
