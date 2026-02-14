import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token yok" });

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET || "DEV_SECRET";

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token gecersiz" });
  }
};
