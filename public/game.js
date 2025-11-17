const socket = io();

let lobbyID;
let jugadorID;

function crearLobby(jugadores) {
    socket.emit("crear_lobby", { jugadores });
}

function unirseLobby(id) {
    lobbyID = id;
    socket.emit("unirse_lobby", lobbyID);
}

socket.on("lobby_creada", id => {
    lobbyID = id;
    console.log("Lobby creado con ID:", id);
});

socket.on("actualizar_jugadores", jugadores => {
    console.log("Jugadores en lobby:", jugadores);
});

socket.on("iniciar_ronda", data => {
    console.log("Turno del jugador:", data.turno);
    // Aquí inicia tu lógica de juego
});

socket.on("fin_juego", ({ jugadores, ganador }) => {
    console.log("Fin de la partida!");
    console.log("Ganador:", ganador);
    console.table(jugadores);
});

socket.on("reiniciar_partida", () => {
    console.log("Se reinicia la partida para todos");
    // Reset UI para nueva partida
});
