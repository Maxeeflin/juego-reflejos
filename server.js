// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// servir carpeta public
app.use(express.static("public"));

/* Rooms structure:
rooms = {
  ROOMCODE: {
    code,
    hostSocketId,
    capacity: 2 or 3,
    players: { socketId: { name, finished: false, points: 0 } },
    started: false
  }
}
*/
const rooms = {};

function makeCode(len = 6) {
  return crypto.randomBytes(len).toString("base64").replace(/[^A-Z0-9]/gi, "").slice(0, len).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.on("create_room", ({ numPlayers, name }, cb) => {
    let code;
    do {
      code = makeCode(6);
    } while (rooms[code]);

    rooms[code] = {
      code,
      hostSocketId: socket.id,
      capacity: numPlayers,
      players: {},
      started: false,
    };

    rooms[code].players[socket.id] = { name: name || "Host", finished: false, points: 0 };
    socket.join(code);

    cb({ ok: true, code, room: rooms[code] });
    io.to(code).emit("room_update", roomSummary(code));
  });

  socket.on("join_room", ({ code, name }, cb) => {
    code = (code || "").toUpperCase();
    const room = rooms[code];
    if (!room) {
      cb({ ok: false, error: "Sala no encontrada" });
      return;
    }
    if (room.started) {
      cb({ ok: false, error: "La partida ya ha empezado" });
      return;
    }
    if (Object.keys(room.players).length >= room.capacity) {
      cb({ ok: false, error: "Sala llena" });
      return;
    }

    room.players[socket.id] = { name: name || "Player", finished: false, points: 0 };
    socket.join(code);

    cb({ ok: true, code, room: roomSummary(code) });
    io.to(code).emit("room_update", roomSummary(code));
  });

  socket.on("start_game", ({ code }, cb) => {
    const room = rooms[code];
    if (!room) {
      cb && cb({ ok: false, error: "Sala no encontrada" });
      return;
    }
    if (socket.id !== room.hostSocketId) {
      cb && cb({ ok: false, error: "Solo el host puede empezar" });
      return;
    }
    room.started = true;
    // reset players finished/points
    for (const sid of Object.keys(room.players)) {
      room.players[sid].finished = false;
      room.players[sid].points = 0;
    }
    io.to(code).emit("game_started", { code });
    io.to(code).emit("room_update", roomSummary(code));
    cb && cb({ ok: true });
  });

  // client notifies when it finished its 3 rounds
  socket.on("player_finished", ({ code, totalPoints }, cb) => {
    const room = rooms[code];
    if (!room) {
      cb && cb({ ok: false, error: "Sala no encontrada" });
      return;
    }
    if (!room.players[socket.id]) {
      cb && cb({ ok: false, error: "No perteneces a la sala" });
      return;
    }
    room.players[socket.id].finished = true;
    room.players[socket.id].points = totalPoints || 0;

    io.to(code).emit("room_update", roomSummary(code));

    // check if everybody finished
    const allFinished = Object.values(room.players).length === room.capacity &&
      Object.values(room.players).every(p => p.finished);

    if (allFinished) {
      // gather results
      const results = Object.values(room.players).map((p) => ({ name: p.name, points: p.points }));
      // emit game_over to room
      io.to(code).emit("game_over", { results });
      // la sala NO se borra
    }

    cb && cb({ ok: true });
  });

  // reiniciar la partida sin borrar la sala
  socket.on("restart_game", ({ code }, cb) => {
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false });

    // reset players finished/points
    for (const sid of Object.keys(room.players)) {
      room.players[sid].finished = false;
      room.players[sid].points = 0;
    }

    room.started = true;

    io.to(code).emit("game_started", { code });
    io.to(code).emit("room_update", roomSummary(code));

    cb && cb({ ok: true });
  });

  socket.on("leave_room", ({ code }, cb) => {
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false });
    delete room.players[socket.id];
    socket.leave(code);
    if (Object.keys(room.players).length === 0) delete rooms[code];
    else io.to(code).emit("room_update", roomSummary(code));
    cb && cb({ ok: true });
  });

  socket.on("disconnect", () => {
    for (const code of Object.keys(rooms)) {
      if (rooms[code].players[socket.id]) {
        delete rooms[code].players[socket.id];
        io.to(code).emit("room_update", roomSummary(code));
        if (rooms[code].hostSocketId === socket.id) {
          const sids = Object.keys(rooms[code].players);
          rooms[code].hostSocketId = sids.length ? sids[0] : null;
        }
        if (Object.keys(rooms[code].players).length === 0) delete rooms[code];
      }
    }
  });
});

function roomSummary(code) {
  const r = rooms[code];
  if (!r) return null;
  return {
    code: r.code,
    capacity: r.capacity,
    started: r.started,
    hostSocketId: r.hostSocketId,
    players: Object.entries(r.players).map(([sid, p]) => ({ socketId: sid, name: p.name, finished: p.finished, points: p.points })),
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server listening on", PORT));
