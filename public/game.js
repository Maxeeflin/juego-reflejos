const socket = io();

let lobbyID;
let jugadorID;
let jugadorActual = 0;

// Crear y unirse a lobby
function crearLobby(jugadores) { socket.emit("crear_lobby", { jugadores }); }
function unirseLobby(id) { lobbyID = id; socket.emit("unirse_lobby", lobbyID); }

// Manejo de eventos
socket.on("lobby_creada", id => {
    lobbyID = id;
    alert("Sala creada con ID: " + id);
});

socket.on("error_lobby", msg => { alert(msg); });

socket.on("actualizar_jugadores", jugadores => {
    const div = document.getElementById("infoJugadores");
    div.innerHTML = "";
    jugadores.forEach((j, i) => {
        const vidas = "❤️".repeat(j.vidas) + "🖤".repeat(3 - j.vidas);
        div.innerHTML += `<p>Jugador ${i+1}: ${vidas} | Puntos: ${j.puntos}</p>`;
    });
});

socket.on("iniciar_ronda", data => {
    jugadorActual = data.turno;
    document.getElementById("turno").innerText = `Turno del jugador ${jugadorActual+1}`;
    iniciarRonda(); // tu función de lógica del juego
});

socket.on("fin_juego", ({ jugadores, ganador }) => {
    alert(`Fin de la partida! Ganador: Jugador ${jugadorActual+1}`);
    console.table(jugadores);
});

socket.on("reiniciar_partida", () => {
    alert("Nueva partida iniciada!");
    document.getElementById("turno").innerText = `Turno del jugador ${jugadorActual+1}`;
    actualizarUI();
});

// Funciones ejemplo de UI
function actualizarUI() {
    // Aquí puedes resetear la bola, puntos y UI sin cambiar vidas que ya se han consumido correctamente
}

// Función ejemplo de ronda
function iniciarRonda() {
    // Lógica de la bola, clicks y puntos
    // Al terminar el turno, llama:
    // socket.emit("fin_turno", { lobbyID, puntos: puntosGanados, falloFuera: fallo });
}
