// game.js
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

const $ = id => document.getElementById(id);

let myRoom = null;
let mySocketId = null;
let isHost = false;

// UI elements
const btnCreate = $("btnCreate");
const btnJoin = $("btnJoin");
const joinCodeInput = $("joinCode");
const nameInput = $("nameInput");
const roomInfo = $("roomInfo");
const playerPanels = $("playerPanels");
const btnStart = $("btnStart");
const statusDiv = $("status");
const finalScreen = $("finalScreen");

const heartsDOM = $("heartsDOM");
const borderFlash = $("borderFlash");
const hitFlash = $("hitFlash");
const gameWrap = $("gameWrap");

// Game constants
const RONDAS_POR_JUGADOR = 3;
const VIDAS_FUERA = 3;
const RADIO_INICIAL = 10;
const RADIO_MAXIMO = 60;
const VELOCIDAD_INICIAL = 0.4;
const VELOCIDAD_INCREMENTO = 0.12;
const UPDATE_MS = 25;
const CUENTA_ATRAS_SEG = 3;

// Local game state
let gameState = {
  mode: "menu",
  myName: "",
  roomCode: null,
  players: [],
  myIndex: -1,
  turnoIndex: 0,
  velocidad: VELOCIDAD_INICIAL,
  sessionVel: VELOCIDAD_INICIAL, // se incrementa dentro de la misma ronda al acertar
  radio: RADIO_INICIAL,
  x: 0, y: 0,
  rondaEnCurso: false,
  vidas: VIDAS_FUERA,
  rondasPerdidas: 0,
  puntos: 0,
  growJob: null,
};

// ----------------- Socket handlers -----------------
socket.on("connect", () => { mySocketId = socket.id; });

socket.on("room_update", (room) => {
  if (!room) return;
  myRoom = room;
  updateRoomUI();
});

socket.on("game_started", ({ code }) => {
  statusDiv.innerText = "Partida iniciada — cuenta atrás...";
  startLocalPlay();
});

socket.on("game_over", ({ results }) => {
  showFinalResults(results);
});

// ----------------- UI actions -----------------
btnCreate.addEventListener("click", () => {
  const name = nameInput.value.trim() || "Host";
  const numPlayers = prompt("Modo: 2 o 3 jugadores? (escribe 2 o 3)", "2");
  const capacity = (numPlayers === "3") ? 3 : 2;
  socket.emit("create_room", { numPlayers: capacity, name }, (res) => {
    if (res.ok) {
      myRoom = res.room;
      gameState.roomCode = res.code;
      isHost = true;
      statusDiv.innerText = `Sala creada: ${res.code} (esperando jugadores...)`;
      updateRoomUI();
      btnStart.style.display = "inline-block";
    } else alert("Error creando sala");
  });
});

btnJoin.addEventListener("click", () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) return alert("Introduce código de sala");
  const name = nameInput.value.trim() || "Player";
  socket.emit("join_room", { code, name }, (res) => {
    if (!res.ok) return alert(res.error || "Error uniendo");
    myRoom = res.room;
    gameState.roomCode = code;
    isHost = false;
    statusDiv.innerText = `En la sala ${code} — esperando start`;
    updateRoomUI();
  });
});

btnStart.addEventListener("click", () => {
  if (!myRoom) return;
  socket.emit("start_game", { code: myRoom.code }, (res) => {
    if (!res.ok) return alert(res.error || "Error al iniciar");
    statusDiv.innerText = "Partida iniciada";
    btnStart.style.display = "none";
  });
});

// ----------------- Helpers -----------------
function updateRoomUI() {
  playerPanels.innerHTML = "";
  if (!myRoom) return;
  roomInfo.innerText = `Sala: ${myRoom.code} (${myRoom.players.length}/${myRoom.capacity})`;
  myRoom.players.forEach(p => {
    const div = document.createElement("div");
    div.className = "playerCard";
    div.innerHTML = `<h4>${p.name}${p.socketId === mySocketId ? " (Tú)" : ""}${p.finished ? " ✓" : ""}</h4>
      <div>Estado: ${p.finished ? "Terminado" : "Jugando"}</div>
      <div>Puntos: ${p.points}</div>`;
    playerPanels.appendChild(div);
  });

  btnStart.style.display = (myRoom.hostSocketId === mySocketId && !myRoom.started) ? "inline-block" : "none";
}

// ----------------- DOM hearts helpers -----------------
function renderHearts(vidas) {
  heartsDOM.innerHTML = "";
  for (let i = 0; i < VIDAS_FUERA; i++) {
    const h = document.createElement("div");
    h.className = "heart";
    h.innerHTML = i < vidas ? `<span class="full">❤️</span>` : `<span class="empty">💔</span>`;
    heartsDOM.appendChild(h);
  }
}

function animateHeartLoss() {
  const hearts = heartsDOM.querySelectorAll(".heart");
  for (let i = hearts.length -1; i >= 0; i--) {
    const span = hearts[i].querySelector(".full");
    if (span) {
      hearts[i].classList.add("broken");
      setTimeout(()=> hearts[i].classList.remove("broken"), 700);
      setTimeout(()=> hearts[i].innerHTML = `<span class="empty">💔</span>`, 350);
      break;
    }
  }
}

// ----------------- Hit flash & shake helpers -----------------
function showHitFlash(x, y) {
  const rect = canvas.getBoundingClientRect();
  const px = ((x - rect.left) / rect.width) * 100;
  const py = ((y - rect.top) / rect.height) * 100;
  hitFlash.style.setProperty('--x', px + '%');
  hitFlash.style.setProperty('--y', py + '%');
  hitFlash.classList.add('show');
  setTimeout(() => hitFlash.classList.remove('show'), 200);
}

function doShake() {
  gameWrap.classList.add('shake');
  setTimeout(()=> gameWrap.classList.remove('shake'), 420);
}

function flashBorder() {
  borderFlash.style.opacity = 1;
  setTimeout(()=> borderFlash.style.opacity = 0, 300);
}

// ----------------- Local game logic -----------------
function startLocalPlay() {
  gameState.mode = "playing";
  gameState.myName = nameInput.value.trim() || "Player";
  gameState.sessionVel = VELOCIDAD_INICIAL;
  gameState.velocidad = VELOCIDAD_INICIAL;
  gameState.radio = RADIO_INICIAL;
  gameState.vidas = VIDAS_FUERA;
  gameState.rondasPerdidas = 0;
  gameState.puntos = 0;
  gameState.rondaEnCurso = false;
  gameState.growJob = null;

  renderHearts(gameState.vidas);
  drawClear();
  drawCenteredText("Toca para iniciar (pantalla)", 20);
  canvas.onclick = () => {
    canvas.onclick = null;
    startCountdown(CUENTA_ATRAS_SEG, () => startRound());
  };
  statusDiv.innerText = "Tu turno: empieza en breve";
  updateRoomUI();
}

function startCountdown(n, cb) {
  let cur = n;
  const tick = () => {
    drawClear();
    drawCenteredText(String(cur), 80);
    if (cur === 0) cb && cb();
    else { cur--; setTimeout(tick, 1000); }
  };
  tick();
}

function startRound() {
  gameState.velocidad = gameState.sessionVel;
  gameState.radio = RADIO_INICIAL;
  gameState.x = randInt(RADIO_MAXIMO, CANVAS_WIDTH - RADIO_MAXIMO);
  gameState.y = randInt(RADIO_MAXIMO, CANVAS_HEIGHT - RADIO_MAXIMO);
  gameState.rondaEnCurso = true;
  gameState.vidas = VIDAS_FUERA;

  renderHearts(gameState.vidas);
  gameState.growLoop();
  canvas.onclick = onCanvasClick;
  drawFrame();
}

function stopGrowJob() {
  if (gameState.growJob) { clearTimeout(gameState.growJob); gameState.growJob = null; }
}

gameState.growLoop = function growLoop() {
  if (!gameState.rondaEnCurso) return;
  gameState.radio += gameState.velocidad;
  if (gameState.radio >= RADIO_MAXIMO) {
    stopGrowJob();
    gameState.rondaEnCurso = false;
    gameState.rondasPerdidas += 1;
    gameState.sessionVel = VELOCIDAD_INICIAL;
    drawExplosion(gameState.x, gameState.y, gameState.radio);
    setTimeout(() => onRoundEnded(), 1000);
    return;
  }
  drawFrame();
  gameState.growJob = setTimeout(gameState.growLoop, UPDATE_MS);
};

function onCanvasClick(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  if (!gameState.rondaEnCurso) return;
  const dist = Math.hypot(x - gameState.x, y - gameState.y);
  if (dist <= gameState.radio) {
    // HIT
    stopGrowJob();
    const puntos = Math.max(0, Math.floor(RADIO_MAXIMO - gameState.radio));
    gameState.puntos += puntos;
    drawHitEffect(x, y, "+" + puntos);
    showHitFlash(evt.clientX, evt.clientY);
    gameState.sessionVel = Math.min(5, gameState.sessionVel + VELOCIDAD_INCREMENTO);
    gameState.velocidad = gameState.sessionVel;
    gameState.rondaEnCurso = false;
    setTimeout(() => startRound(), 250);
  } else {
    // MISS
    gameState.vidas -= 1;
    drawHitEffect(x, y, "❌");
    animateHeartLoss();
    doShake();
    flashBorder();

    if (gameState.vidas <= 0) {
      stopGrowJob();
      gameState.rondasPerdidas += 1;
      gameState.rondaEnCurso = false;
      gameState.sessionVel = VELOCIDAD_INICIAL;
      drawExplosion(gameState.x, gameState.y, gameState.radio, true);
      setTimeout(() => onRoundEnded(), 1000);
    } else drawFrame();
  }
}

function onRoundEnded() {
  drawFrame();
  if (gameState.rondasPerdidas >= RONDAS_POR_JUGADOR) {
    statusDiv.innerText = "Has terminado tus rondas. Enviando resultados...";
    socket.emit("player_finished", { code: gameState.roomCode || myRoom.code, totalPoints: gameState.puntos }, (res) => {
      if (res && res.ok) statusDiv.innerText = "Resultados enviados. Esperando a los demás...";
      else console.error("error sending finished", res);
    });
    canvas.onclick = null;
    return;
  } else {
    statusDiv.innerText = `Perdiste la ronda. Próxima en 5s (rondas perdidas ${gameState.rondasPerdidas}/${RONDAS_POR_JUGADOR})`;
    canvas.onclick = null;
    startCountdown(5, () => {
      startRound();
      statusDiv.innerText = `Jugando - Puntos: ${gameState.puntos}`;
    });
  }
}

// ----------------- Drawing helpers -----------------
function drawClear() { ctx.clearRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT); }
function drawCenteredText(text, size=24, color="#fff") { drawClear(); ctx.fillStyle=color; ctx.font=`${size}px Arial`; ctx.textAlign="center"; ctx.fillText(text,CANVAS_WIDTH/2,CANVAS_HEIGHT/2); }
function drawCircle(x,y,r,color="#ff0000") { ctx.beginPath(); ctx.fillStyle=color; ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.closePath(); }
function drawFrame() {
  drawClear();
  drawCircle(gameState.x, gameState.y, gameState.radio, colorForRadius(gameState.radio));
  ctx.fillStyle="white";
  ctx.font="16px Arial";
  ctx.textAlign="left";
  ctx.fillText(`Rondas perdidas: ${gameState.rondasPerdidas}/${RONDAS_POR_JUGADOR}`, 10,30);
  ctx.fillText(`Puntos: ${gameState.puntos}`, 10,50);
}
function drawExplosion(x,y,r) {
  drawCircle(x,y,r,"#000");
  ctx.strokeStyle="#ff6666";
  for(let i=0;i<6;i++){ ctx.beginPath(); ctx.arc(x,y,r+i*6,0,Math.PI*2); ctx.stroke(); }
}
function drawHitEffect(x,y,text) { drawFrame(); ctx.fillStyle="#bfff00"; ctx.font="20px Arial"; ctx.textAlign="center"; ctx.fillText(text,x,y-10); }
function colorForRadius(r) { const ratio=Math.min(1,r/RADIO_MAXIMO); const rx=Math.floor(Math.min(255,255*ratio*2)); const gx=Math.floor(Math.max(0,255-255*ratio*2)); return `rgb(${rx},${gx},0)`; }
function randInt(a,b) { return Math.floor(Math.random()*(b-a+1))+a; }

// ------------------- Final results UI -------------------
function showFinalResults(results) {
  drawClear();
  finalScreen.style.display="flex";
  finalScreen.innerHTML = "";

  const card = document.createElement("div");
  card.className = "finalCard";

  const title = document.createElement("h2");
  title.innerText = "Estadísticas finales";
  card.appendChild(title);

  const podium = document.createElement("div");
  podium.className = "podium";
  card.appendChild(podium);

  const sorted = results.slice().sort((a,b)=> b.points - a.points);
  const slots = [sorted[1] || {name:"-", points:0}, sorted[0] || {name:"-", points:0}, sorted[2] || {name:"-", points:0}];

  slots.forEach((s, idx) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = "0px";
    const label = document.createElement("div");
    label.className = "label";
    label.innerText = `${s.name}: ${s.points}`;
    slot.appendChild(bar);
    slot.appendChild(label);
    podium.appendChild(slot);
  });

  const btn = document.createElement("button");
  btn.innerText = "Reiniciar partida";
  btn.onclick = () => {
    finalScreen.style.display = "none";
    socket.emit("restart_game", { code: myRoom.code }, (res) => {
      if (res && res.ok) startLocalPlay();
      else {
        socket.emit("start_game", { code: myRoom.code }, (res2) => {
          if (res2 && res2.ok) startLocalPlay();
          else alert("Error reiniciando la partida");
        });
      }
    });
  };
  card.appendChild(btn);
  finalScreen.appendChild(card);

  const bars = finalScreen.querySelectorAll(".bar");
  const targets = slots.map(s=>s.points);
  const maxTarget = Math.max(...targets,1);

  bars.forEach((bar, i) => {
    const heightPercent = Math.round((targets[i] / maxTarget) * 100);
    const finalPx = Math.round((heightPercent/100)*140)+20;
    setTimeout(()=>{ bar.style.height = finalPx + "px"; }, i*150);
  });
}
drawCenteredText("Bienvenido — crea o únete a una sala",20);
