// game.js
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// Utils for DOM
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

const RONDAS_POR_JUGADOR = 3;
const VIDAS_FUERA = 3;
const RADIO_INICIAL = 10;
const RADIO_MAXIMO = 60;
const VELOCIDAD_INICIAL = 0.4;
const VELOCIDAD_INCREMENTO = 0.12;
const UPDATE_MS = 25;
const CUENTA_ATRAS_SEG = 3;

// local game state
let gameState = {
  mode: "menu",
  myName: "",
  roomCode: null,
  players: [],
  myIndex: -1,
  turnoIndex: 0,
  velocidad: VELOCIDAD_INICIAL,
  radio: RADIO_INICIAL,
  x: 0, y: 0,
  circleId: null,
  rondaEnCurso: false,
  vidas: VIDAS_FUERA,
  rondasPerdidas: 0,
  puntos: 0,
  growJob: null,
};

// ----------------- Socket handlers -----------------
socket.on("connect", () => {
  mySocketId = socket.id;
  console.log("connected", mySocketId);
});

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
    } else {
      alert("Error creando sala");
    }
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
  roomInfo.innerText = `Sala: ${myRoom.code}  (${myRoom.players.length}/${myRoom.capacity})`;
  myRoom.players.forEach(p => {
    const div = document.createElement("div");
    div.className = "playerCard";
    div.innerHTML = `<h4>${p.name}${p.socketId === mySocketId ? " (Tú)" : ""}${p.finished ? " ✓" : ""}</h4>
      <div>Estado: ${p.finished ? "Terminado" : "Jugando"}</div>
      <div>Puntos: ${p.points}</div>`;
    playerPanels.appendChild(div);
  });

  if (myRoom.hostSocketId === mySocketId && !myRoom.started) {
    btnStart.style.display = "inline-block";
  } else {
    btnStart.style.display = "none";
  }
}

// ----------------- Local game logic -----------------
function startLocalPlay() {
  gameState.mode = "playing";
  gameState.myName = nameInput.value.trim() || "Player";
  gameState.velocidad = VELOCIDAD_INICIAL;
  gameState.radio = RADIO_INICIAL;
  gameState.vidas = VIDAS_FUERA;
  gameState.rondasPerdidas = 0;
  gameState.puntos = 0;
  gameState.rondaEnCurso = false;
  gameState.growJob = null;

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
  // reinicia la velocidad al inicio de cada ronda
  gameState.velocidad = VELOCIDAD_INICIAL;

  gameState.radio = RADIO_INICIAL;
  gameState.x = randInt(RADIO_MAXIMO, CANVAS_WIDTH - RADIO_MAXIMO);
  gameState.y = randInt(RADIO_MAXIMO, CANVAS_HEIGHT - RADIO_MAXIMO);
  gameState.rondaEnCurso = true;
  gameState.vidas = VIDAS_FUERA;

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
    stopGrowJob();
    const puntos = Math.max(0, Math.floor(RADIO_MAXIMO - gameState.radio));
    gameState.puntos += puntos;
    drawHitEffect(x, y, "+" + puntos);
    gameState.rondaEnCurso = false;
    gameState.velocidad += VELOCIDAD_INCREMENTO;
    setTimeout(() => startRound(), 250);
  } else {
    gameState.vidas -= 1;
    drawHitEffect(x, y, "❌");
    if (gameState.vidas <= 0) {
      stopGrowJob();
      gameState.rondasPerdidas += 1;
      gameState.rondaEnCurso = false;
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
  drawHearts();
  ctx.fillStyle="white";
  ctx.font="16px Arial";
  ctx.textAlign="left";
  ctx.fillText(`Rondas perdidas: ${gameState.rondasPerdidas}/${RONDAS_POR_JUGADOR}`, 10,30);
  ctx.fillText(`Puntos: ${gameState.puntos}`, 10,50);
}
function drawHearts() {
  const hearts="❤️".repeat(gameState.vidas)+"💔".repeat(Math.max(0,VIDAS_FUERA-gameState.vidas));
  ctx.font="22px Arial";
  ctx.textAlign="right";
  ctx.fillText(hearts,CANVAS_WIDTH-10,30);
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
  finalScreen.innerHTML="";
  let cont=document.createElement("div");
  cont.style.color="white";
  cont.style.textAlign="center";
  cont.innerHTML="<h2>Estadísticas finales</h2>";
  results.forEach(r=>{
    const p=document.createElement("div");
    p.style.fontSize="20px";
    p.style.margin="8px";
    p.innerText=`${r.name}: 0`;
    cont.appendChild(p);
  });
  const btn=document.createElement("button");
  btn.innerText="Reiniciar partida";
  btn.onclick=()=>{
    finalScreen.style.display="none";
    // reinicia el juego local sin destruir sala
    socket.emit("start_game",{code:myRoom.code}, res=>{
      if(res && res.ok){
        startLocalPlay();
      } else alert("Error reiniciando la partida");
    });
  };
  cont.appendChild(btn);
  finalScreen.appendChild(cont);

  const counters=results.map(()=>0);
  const targets=results.map(r=>r.points||0);
  function step(){
    let done=true;
    for(let i=0;i<counters.length;i++){
      if(counters[i]<targets[i]){
        counters[i]+=Math.max(1,Math.floor(targets[i]/20));
        if(counters[i]>targets[i]) counters[i]=targets[i];
        cont.children[i+1].innerText=`${results[i].name}: ${counters[i]}`;
        done=false;
      }
    }
    if(!done) requestAnimationFrame(step);
    else{
      let maxp=Math.max(...targets);
      const winners=results.filter(r=>r.points===maxp);
      const text=document.createElement("h3");
      if(winners.length===1) text.innerText=`${winners[0].name} GANA 🏆`;
      else text.innerText="¡Empate! 🤝";
      cont.appendChild(text);
    }
  }
  step();
}

// ------------------ initialize small UI labels ------------------
drawCenteredText("Bienvenido — crea o únete a una sala",20);
