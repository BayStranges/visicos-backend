import { friendRequests, friends } from "../models/friend.model.js";

// Arkadaş isteği gönder
export const sendRequest = (req, res) => {
  const { toId } = req.body;
  const fromId = req.user.id;

  // Aynı istek zaten var mı kontrol
  const exists = friendRequests.find(r => r.from === fromId && r.to === toId);
  if (exists) return res.status(400).json({ message: "İstek zaten gönderilmiş" });

  friendRequests.push({ from: fromId, to: toId });
  res.json({ message: "Arkadaşlık isteği gönderildi" });
};

// Arkadaş isteğini kabul et
export const acceptRequest = (req, res) => {
  const { fromId } = req.body;
  const toId = req.user.id;

  const index = friendRequests.findIndex(r => r.from === fromId && r.to === toId);
  if (index === -1) return res.status(404).json({ message: "İstek bulunamadı" });

  // İstek kabul edildi, friends listesine ekle
  friends.push({ user1: fromId, user2: toId });

  // İstek silinsin
  friendRequests.splice(index, 1);

  res.json({ message: "Arkadaşlık kabul edildi" });
};

// Kullanıcının arkadaşlarını listele
export const listFriends = (req, res) => {
  const userId = req.user.id;
  const userFriends = friends
    .filter(f => f.user1 === userId || f.user2 === userId)
    .map(f => (f.user1 === userId ? f.user2 : f.user1));

  res.json({ friends: userFriends });
};
