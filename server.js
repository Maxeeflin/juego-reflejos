const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// Lobbies en memoria
let lobbies = {};

io.on("connection", (socket) => {
    console.log("Nuevo jugador conectado:", socket.id);

    socket.on("crear_lobby", (data) => {
        const lobbyID = Math.random().toString(36).substr(2, 6);
        lobbies[lobbyID] = {
            jugadores: [],
            turnoActual: 0,
            rondasTotales: data.jugadores * 3,
            rondasJugadores: Array(data.jugadores).fill(0),
            maxJugadores: data.jugadores,
        };
        socket.emit("lobby_creada", lobbyID);
    });

    socket.on("unirse_lobby", (lobbyID) => {
        const lobby = lobbies[lobbyID];
        if (!lobby) {
            socket.emit("error_lobby", "Lobby no encontrado");
            return;
        }
        if (lobby.jugadores.length >= lobby.maxJugadores) {
            socket.emit("error_lobby", "Lobby lleno");
            return;
        }

        lobby.jugadores.push({ id: socket.id, puntos: 0, vidas: 3, fuera: 0 });
        socket.join(lobbyID);
        io.to(lobbyID).emit("actualizar_jugadores", lobby.jugadores);

        if (lobby.jugadores.length === lobby.maxJugadores) {
            io.to(lobbyID).emit("iniciar_ronda", { turno: 0 });
        }
    });

    socket.on("fin_turno", ({ lobbyID, puntos, falloFuera }) => {
        const lobby = lobbies[lobbyID];
        if (!lobby) return;

        const jugador = lobby.jugadores[lobby.turnoActual];
        jugador.puntos += puntos;

        if (falloFuera && jugador.fuera < 3) {
            jugador.vidas -= 1;
            jugador.fuera += 1;
        }

        lobby.rondasJugadores[lobby.turnoActual] += 1;

        if (lobby.rondasJugadores[lobby.turnoActual] >= 3 || jugador.vidas <= 0) {
            lobby.turnoActual += 1;
        }

        const totalRondasJugadores = lobby.rondasJugadores.reduce((a, b) => a + b, 0);
        if (totalRondasJugadores >= lobby.rondasTotales) {
            // Calcular ganador
            let ganador = lobby.jugadores[0];
            lobby.jugadores.forEach(j => {
                if (j.puntos > ganador.puntos) ganador = j;
            });

            io.to(lobbyID).emit("fin_juego", { jugadores: lobby.jugadores, ganador: ganador.id });

            // Reiniciar partida
            lobby.jugadores.forEach(j => {
                j.puntos = 0;
                j.vidas = 3;
                j.fuera = 0;
            });
            lobby.turnoActual = 0;
            lobby.rondasJugadores = Array(lobby.maxJugadores).fill(0);
            io.to(lobbyID).emit("reiniciar_partida");
            return;
        }

        if (lobby.turnoActual >= lobby.jugadores.length) lobby.turnoActual = 0;
        io.to(lobbyID).emit("iniciar_ronda", { turno: lobby.turnoActual });
    });

    socket.on("disconnect", () => {
        console.log("Jugador desconectado:", socket.id);
        for (let id in lobbies) {
            const lobby = lobbies[id];
            lobby.jugadores = lobby.jugadores.filter(j => j.id !== socket.id);
            if (lobby.jugadores.length === 0) delete lobbies[id];
        }
    });
});

http.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
