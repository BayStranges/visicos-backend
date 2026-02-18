import mediasoup from "mediasoup";

const rooms = new Map();
let worker = null;
let transportConfigWarned = false;

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 1000 }
  }
];

const createWorker = async () => {
  if (worker) return worker;
  worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: Number(process.env.MEDIASOUP_RTC_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_RTC_MAX_PORT || 49999)
  });
  worker.on("died", () => {
    worker = null;
  });
  return worker;
};

const getRoom = async (roomId) => {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const w = await createWorker();
  const router = await w.createRouter({ mediaCodecs });
  const room = {
    router,
    peers: new Map()
  };
  rooms.set(roomId, room);
  return room;
};

const buildTransportOptions = () => {
  const listenIp = process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0";
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || null;
  const isProd = process.env.NODE_ENV === "production";
  if (!transportConfigWarned && !announcedIp) {
    transportConfigWarned = true;
    console.warn(
      `[sfu] MEDIASOUP_ANNOUNCED_IP is not set. ` +
      `Media may fail across different networks. listenIp=${listenIp}`
    );
    if (isProd) {
      console.warn(
        "[sfu] In production, set MEDIASOUP_ANNOUNCED_IP to your public server IP or domain."
      );
    }
  }
  return {
    listenIps: [{ ip: listenIp, announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000
  };
};

export const createSfuHandlers = (io, socket) => {
  const ensureSocketUser = (userId, cb) => {
    if (!socket.userId || socket.userId.toString() !== userId.toString()) {
      console.warn("[sfu] unauthorized", {
        socketId: socket.id,
        socketUserId: socket.userId?.toString?.(),
        payloadUserId: userId?.toString?.()
      });
      cb?.({ error: "unauthorized" });
      return false;
    }
    return true;
  };
  let currentRoomId = null;
  let currentPeer = null;

  const ensurePeer = async (roomId, userId) => {
    const room = await getRoom(roomId);
    let peer = room.peers.get(userId);
    if (!peer) {
      peer = {
        id: userId,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map()
      };
      room.peers.set(userId, peer);
    }
    return { room, peer };
  };

  const cleanupPeer = async (roomId, userId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const peer = room.peers.get(userId);
    if (!peer) return;

    for (const consumer of peer.consumers.values()) {
      try { consumer.close(); } catch {}
    }
    for (const producer of peer.producers.values()) {
      try { producer.close(); } catch {}
    }
    for (const transport of peer.transports.values()) {
      try { transport.close(); } catch {}
    }

    room.peers.delete(userId);
    if (room.peers.size === 0) {
      rooms.delete(roomId);
    }
  };

  socket.on("sfu-join", async ({ roomId, userId }, cb) => {
    try {
      console.log("[sfu] join", { socketId: socket.id, roomId, userId });
      if (!roomId || !userId) return cb?.({ error: "missing params" });
      if (!ensureSocketUser(userId, cb)) return;
      currentRoomId = roomId;
      const { room, peer } = await ensurePeer(roomId, userId);
      currentPeer = peer;
      socket.join(roomId);

      const producers = [];
      for (const p of room.peers.values()) {
        if (p.id === userId) continue;
        for (const producer of p.producers.values()) {
          producers.push({ producerId: producer.id, kind: producer.kind, userId: p.id });
        }
      }

      cb?.({
        rtpCapabilities: room.router.rtpCapabilities,
        producers
      });
    } catch (err) {
      console.error("[sfu] join failed", {
        socketId: socket.id,
        roomId,
        userId,
        error: err?.message
      });
      cb?.({ error: "join failed" });
    }
  });

  socket.on("sfu-create-transport", async ({ roomId, userId, direction }, cb) => {
    try {
      console.log("[sfu] create-transport", {
        socketId: socket.id,
        roomId,
        userId,
        direction
      });
      if (!ensureSocketUser(userId, cb)) return;
      const { room, peer } = await ensurePeer(roomId, userId);
      const transport = await room.router.createWebRtcTransport(buildTransportOptions());
      peer.transports.set(transport.id, transport);

      transport.on("dtlsstatechange", (state) => {
        if (state === "closed") transport.close();
      });

      cb?.({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        direction
      });
    } catch (err) {
      console.error("[sfu] create-transport failed", {
        socketId: socket.id,
        roomId,
        userId,
        direction,
        error: err?.message
      });
      cb?.({ error: "transport failed" });
    }
  });

  socket.on("sfu-connect-transport", async ({ roomId, userId, transportId, dtlsParameters }, cb) => {
    try {
      console.log("[sfu] connect-transport", {
        socketId: socket.id,
        roomId,
        userId,
        transportId
      });
      if (!ensureSocketUser(userId, cb)) return;
      const { room, peer } = await ensurePeer(roomId, userId);
      const transport = peer.transports.get(transportId);
      if (!transport) return cb?.({ error: "transport not found" });
      await transport.connect({ dtlsParameters });
      cb?.({ ok: true });
    } catch (err) {
      console.error("[sfu] connect-transport failed", {
        socketId: socket.id,
        roomId,
        userId,
        transportId,
        error: err?.message
      });
      cb?.({ error: "connect failed" });
    }
  });

  socket.on("sfu-produce", async ({ roomId, userId, transportId, kind, rtpParameters }, cb) => {
    try {
      console.log("[sfu] produce", {
        socketId: socket.id,
        roomId,
        userId,
        transportId,
        kind
      });
      if (!ensureSocketUser(userId, cb)) return;
      const { room, peer } = await ensurePeer(roomId, userId);
      const transport = peer.transports.get(transportId);
      if (!transport) return cb?.({ error: "transport not found" });
      const producer = await transport.produce({ kind, rtpParameters });
      peer.producers.set(producer.id, producer);

      producer.on("transportclose", () => {
        peer.producers.delete(producer.id);
      });

      socket.to(roomId).emit("sfu-new-producer", {
        producerId: producer.id,
        kind: producer.kind,
        userId
      });

      cb?.({ id: producer.id });
    } catch (err) {
      console.error("[sfu] produce failed", {
        socketId: socket.id,
        roomId,
        userId,
        transportId,
        kind,
        error: err?.message
      });
      cb?.({ error: "produce failed" });
    }
  });

  socket.on("sfu-consume", async ({ roomId, userId, transportId, producerId, rtpCapabilities }, cb) => {
    try {
      console.log("[sfu] consume", {
        socketId: socket.id,
        roomId,
        userId,
        transportId,
        producerId
      });
      if (!ensureSocketUser(userId, cb)) return;
      const { room, peer } = await ensurePeer(roomId, userId);
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        return cb?.({ error: "cannot consume" });
      }
      const transport = peer.transports.get(transportId);
      if (!transport) return cb?.({ error: "transport not found" });
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true
      });
      peer.consumers.set(consumer.id, consumer);

      consumer.on("transportclose", () => {
        peer.consumers.delete(consumer.id);
      });
      consumer.on("producerclose", () => {
        peer.consumers.delete(consumer.id);
        socket.emit("sfu-producer-closed", { producerId });
      });

      cb?.({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters
      });
    } catch (err) {
      console.error("[sfu] consume failed", {
        socketId: socket.id,
        roomId,
        userId,
        transportId,
        producerId,
        error: err?.message
      });
      cb?.({ error: "consume failed" });
    }
  });

  socket.on("sfu-resume", async ({ consumerId }, cb) => {
    try {
      console.log("[sfu] resume", { socketId: socket.id, consumerId });
      if (!currentPeer) return cb?.({ error: "no peer" });
      const consumer = currentPeer.consumers.get(consumerId);
      if (!consumer) return cb?.({ error: "consumer not found" });
      await consumer.resume();
      cb?.({ ok: true });
    } catch (err) {
      console.error("[sfu] resume failed", {
        socketId: socket.id,
        consumerId,
        error: err?.message
      });
      cb?.({ error: "resume failed" });
    }
  });

  socket.on("sfu-leave", async ({ roomId, userId }) => {
    console.log("[sfu] leave", { socketId: socket.id, roomId, userId });
    if (!socket.userId || socket.userId.toString() !== userId.toString()) return;
    await cleanupPeer(roomId, userId);
  });

  socket.on("disconnect", async () => {
    console.log("[sfu] disconnect", { socketId: socket.id, roomId: currentRoomId, userId: socket.userId });
    if (currentRoomId && socket.userId) {
      await cleanupPeer(currentRoomId, socket.userId);
    }
  });
};
