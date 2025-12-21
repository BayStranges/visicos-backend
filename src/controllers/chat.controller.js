import messages from "../models/message.model.js";
import users from "../models/user.model.js";

export const sendDM = (req, res) => {
  const { toEmail, text } = req.body;
  const fromUser = req.user;

  const toUser = users.find(u => u.email === toEmail);
  if (!toUser) return res.status(404).json({ message: "Alıcı bulunamadı" });

  const msg = {
    id: Date.now(),
    fromId: fromUser.id,
    fromEmail: fromUser.email,
    toId: toUser.id,
    toEmail: toUser.email,
    text
  };

  messages.push(msg);
  res.json({ message: "Mesaj gönderildi" });
};

export const getMessages = (req, res) => {
  const userId = req.user.id;
  const userMessages = messages.filter(
    m => m.fromId === userId || m.toId === userId
  );
  res.json(userMessages);
};
