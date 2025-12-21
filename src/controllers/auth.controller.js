import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import users from "../models/user.model.js"; // memory DB array

export const register = async (req, res) => {
  const { email, password, username } = req.body;

  if (!username) return res.status(400).json({ message: "Kullanıcı adı gerekli" });

  const userExists = users.find(u => u.email === email);
  if (userExists) return res.status(400).json({ message: "Bu email zaten var" });

  const hashedPassword = await bcryptjs.hash(password, 10);

  const user = {
    id: Date.now(),
    email,
    username,
    password: hashedPassword
  };

  users.push(user);

  res.json({ message: "Kayıt başarılı", user: { id: user.id, email: user.email, username: user.username } });
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ message: "Kullanıcı yok" });

  const isValid = await bcryptjs.compare(password, user.password);
  if (!isValid) return res.status(401).json({ message: "Şifre yanlış" });

  const token = jwt.sign(
    { id: user.id, email: user.email },
    "SECRET_KEY",
    { expiresIn: "1h" }
  );

  res.json({ message: "Giriş başarılı", token, user: { id: user.id, email: user.email, username: user.username } });
};
