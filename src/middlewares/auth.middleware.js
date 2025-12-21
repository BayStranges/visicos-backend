import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token yok" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, "SECRET_KEY"); // secret key backend’dekiyle aynı olmalı
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token geçersiz" });
  }
};
