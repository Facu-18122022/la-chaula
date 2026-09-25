/**
 * juego.js
 * 
 * Lógica principal del lado del cliente para el modo multijugador online.
 * Se encarga de renderizar la partida, procesar los inputs del jugador,
 * sincronizar el estado del juego (posición de jugadores y pelota)
 * recibido desde el servidor mediante Socket.IO y mostrar efectos visuales (Ej: explosiones de goles).
 */
// Cargar la imagen de Momo para el centro de la cancha
const streetLogo = new Image();
streetLogo.src = "../img/MomoCancha.jpg"


const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const blueText = document.getElementById("blueScore");
const redText = document.getElementById("redScore");
const timerMainText = document.getElementById("timer-main");
const timerMsText = document.getElementById("timer-ms");

let blueScore = 0;
let redScore = 0;

// ==========================================
// CONFIGURACIÓN DE LOS 5 MAPAS CON DETALLES
// ==========================================
const MAPS = [
    { name: "Classic Arena (1v1)", width: 800, height: 400, fieldColor: "#333b42", lineColor: "#ffffff", goalHeight: 100, bg: "#121212", goalBg: "#22272b", theme: "classic" },
    { name: "Street Arena (1v1)", width: 820, height: 390, fieldColor: "#2c3e50", lineColor: "#ff9f43", goalHeight: 90, bg: "#1e293b", goalBg: "#111827", theme: "street" },
    { name: "Frozen Arena (1v1)", width: 1020, height: 510, fieldColor: "#a5d8ff", lineColor: "#ffffff", goalHeight: 110, bg: "#4dabf7", goalBg: "#74c0fc", theme: "frozen" },
    { name: "Desert Arena (1v1)", width: 1000, height: 500, fieldColor: "#f4d03f", lineColor: "#784212", goalHeight: 105, bg: "#5e35b1", goalBg: "#7e57c2", theme: "desert" },
    { name: "Champions Arena (1v1)", width: 1300, height: 640, fieldColor: "#228be6", lineColor: "#ffffff", goalHeight: 130, bg: "#1a252f", goalBg: "#2c3e50", theme: "champions" }
];
// Leer el mapa seleccionado desde crear-sala
const storedMapIndex = parseInt(localStorage.getItem("selectedMapIndex"), 10);
const mapIndex = Number.isInteger(storedMapIndex) && storedMapIndex >= 0 && storedMapIndex < MAPS.length
    ? storedMapIndex
    : 0;
const currentMap = MAPS[mapIndex];
// =========================================================================

// Asignamos el tamaño real del mapa elegido al Canvas
canvas.width = currentMap.width;
canvas.height = currentMap.height;

// VARIABLES DE LÍMITES DE CANCHA (Ahora dinámicas con 'let')
let fieldLeft = 80;
let fieldRight = canvas.width - 80;
let fieldTop = 40;
let fieldBottom = canvas.height - 40;

const goalWidth = 45;   
let goalHeight = currentMap.goalHeight; 
let goalTop = (canvas.height / 2) - (goalHeight / 2);
let goalBottom = (canvas.height / 2) + (goalHeight / 2);
const postRadius = 7;
let centerCircleRadius = canvas.width * 0.085; // Proporcional al ancho de la cancha

let posts = [];

// Función para actualizar los postes según las medidas del mapa cargado
function updatePostPositions() {
    posts = [
        { x: fieldLeft, y: goalTop, r: postRadius },    
        { x: fieldLeft, y: goalBottom, r: postRadius }, 
        { x: fieldRight, y: goalTop, r: postRadius },   
        { x: fieldRight, y: goalBottom, r: postRadius } 
    ];
}

// SISTEMA DE TIEMPO ESTILO SMASH
let isTimerRunning = false;
let lastTick = 0;
const matchTimeMinutes = parseInt(localStorage.getItem('matchTime'), 10) || 5; 
let totalMatchMs = matchTimeMinutes * 60 * 1000;
let remainingMs = totalMatchMs;
let overtime = false;
let overtimeMs = 0;

// SISTEMA DE CELEBRACIÓN Y SAQUES
let isCelebration = false;
let celebrationTimer = 0;
let goalScorerColor = "";
let goalScorerName = "";
let kickOffTeam = "red"; 
let waitingForKickOff = true; 
const selectedTeam = localStorage.getItem('equipoSeleccionado') || 'red';
const roomId = localStorage.getItem('roomId');
const nickname = localStorage.getItem('jugador') || 'Jugador';

const player1 = {
    x: 0, y: 0, r: 20, baseR: 20,
    vx: 0, vy: 0,
    color: "#1a46a0",
    number: "13",
    name: 'Rival',
    massa: 2.0,
    team: "blue",
    activePower: null,
    powerTimer: 0,
    trail: []
};

const player2 = {
    x: 0, y: 0, r: 20, baseR: 20,
    vx: 0, vy: 0,
    color: "#d63031",
    number: "00",
    name: 'Rival',
    massa: 2.0,
    team: "red",
    activePower: null,
    powerTimer: 0,
    trail: []
};

let remoteRoom = null;
let gameStarted = false;
let gameRoomId = roomId;
let localPlayerTeam = selectedTeam;
let localPlayerNickname = nickname;
let visiblePlayers = [];
let currentInputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    kick: false
};

function sendGameInput() {
    if (!socket || !socket.connected || !gameStarted || !gameRoomId) return;
    socket.emit('game:input', {
        roomId: gameRoomId,
        nickname: localPlayerNickname,
        input: { ...currentInputState }
    });
}

function updateInputState(key, value) {
    if (!(key in currentInputState)) return;
    if (currentInputState[key] === value) return;
    currentInputState[key] = value;
    sendGameInput();
}

function resetGameStateFromServer() {
    blueScore = 0;
    redScore = 0;
    remainingMs = totalMatchMs;
    lastTick = performance.now();
    resetPositions();
    updateTimerDisplay();
}

const ball = {
    x: 0, y: 0, r: 10,
    vx: 0, vy: 0,
    friccion: 0.982, 
    rebotePared: -0.5,
    massa: 0.5 
};

// CONFIGURACIÓN DEL SISTEMA DE PODERES
const POWER_TYPES = ["SPEED", "BIG", "SUPER_KICK"];
const activePowerUps = [];
let powerUpSpawnTimer = 0;
const SPAWN_INTERVAL = 480; 

const keys = {};

document.addEventListener("keydown", e => { 
    keys[e.key.toLowerCase()] = true; 
    if (e.key === " ") keys["space"] = true; 
});

let lastTouch = null;
let secondLastTouch = null;

let socket = null;
if (typeof io !== 'undefined') {
    const serverURL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 3000}`;
    socket = io(serverURL);
    socket.on('connect', () => {
        socket.emit('player:join', { nickname });
        if (roomId) {
            socket.emit('room:join', { roomId, nickname });
        }
    });
    socket.on('room:joined', (data) => {
        if (data?.roomId === roomId && data.room) {
            updateRoomPlayers(data.room);
        }
    });
    socket.on('lobby:update', (room) => {
        if (room?.id === roomId) {
            updateRoomPlayers(room);
        }
    });
    socket.on('match:started', (data) => {
        if (!data || data.roomId !== roomId) return;
        gameStarted = true;
        gameRoomId = data.roomId;
        visiblePlayers = [];
        remainingMs = (data.matchTime || 5) * 60 * 1000;
        totalMatchMs = remainingMs;
        overtime = false;
        overtimeMs = 0;
        resetGameStateFromServer();
        if (data.players && Array.isArray(data.players)) {
            const local = data.players.find(p => p.nickname.trim().toLowerCase() === localPlayerNickname.trim().toLowerCase());
            if (local) {
                localPlayerTeam = local.team || localPlayerTeam;
            }
        }
    });
    socket.on('game:state', (data) => {
        if (!data || data.roomId !== roomId || !data.players) return;

        visiblePlayers = data.players.map((playerState, index) => {
            const player = visiblePlayers[index] || {
                x: 0, y: 0, r: 20, baseR: 20, vx: 0, vy: 0,
                color: playerState.team === 'blue' ? '#1a46a0' : '#d63031',
                number: String(index + 1).padStart(2, '0'),
                name: playerState.nickname,
                massa: 2.0,
                team: playerState.team,
                activePower: null,
                powerTimer: 0,
                trail: []
            };

            Object.assign(player, {
                name: playerState.nickname,
                team: playerState.team,
                x: playerState.x,
                y: playerState.y,
                vx: playerState.vx,
                vy: playerState.vy,
                r: playerState.r || 20,
                activePower: playerState.activePower || null,
                powerTimer: playerState.powerTimer || 0
            });
            return player;
        });

        data.players.forEach(p => {
            if (p.nickname && p.nickname.trim().toLowerCase() === localPlayerNickname.trim().toLowerCase()) {
                localPlayerTeam = p.team || localPlayerTeam;
            }
        });

        if (data.ball) {
            ball.x = data.ball.x;
            ball.y = data.ball.y;
            ball.vx = typeof data.ball.vx === 'number' ? data.ball.vx : ball.vx;
            ball.vy = typeof data.ball.vy === 'number' ? data.ball.vy : ball.vy;
        }

        if (Array.isArray(data.activePowerUps)) {
            activePowerUps.length = 0;
            data.activePowerUps.forEach(pup => activePowerUps.push(pup));
        }

        if (typeof data.timerStarted === 'boolean' && data.timerStarted && !isTimerRunning) {
            startTimer();
        }

        if (typeof data.servingTeam === 'string') {
            kickOffTeam = data.servingTeam;
        }

        if (typeof data.paused === 'boolean') {
            setPausedFromServer(data.paused);
        }

        if (typeof data.overtime === 'boolean') {
            overtime = data.overtime;
            if (!overtime) overtimeMs = 0;
            if (data.overtime) {
                goalScorerName = 'TIEMPO EXTRA';
                goalScorerColor = '#facc15';
            }
        }

        if (typeof data.overtimeMs === 'number') {
            overtimeMs = data.overtimeMs;
        }

        if (typeof data.waitingForKickOff === 'boolean') {
            waitingForKickOff = data.waitingForKickOff;
        }

        if (data.scores) {
            blueScore = data.scores.blue || 0;
            redScore = data.scores.red || 0;
            if (blueText) blueText.textContent = blueScore;
            if (redText) redText.textContent = redScore;
        }

        if (typeof data.remainingMs === 'number') {
            remainingMs = data.remainingMs;
            updateTimerDisplay();
        }
    });
    socket.on('match:ended', (data) => {
        if (!data || data.roomId !== roomId) return;
        gameStarted = false;
        if (data.scores) {
            blueScore = data.scores.blue || blueScore;
            redScore = data.scores.red || redScore;
            if (blueText) blueText.textContent = blueScore;
            if (redText) redText.textContent = redScore;
        }
        isCelebration = true;
        celebrationTimer = 180;
        goalScorerColor = '#ffffff';
        goalScorerName = '¡PARTIDO FINALIZADO!';
        
        setTimeout(() => {
            window.location.href = '../pages/lobby.html';
        }, 2500);
    });
    
    socket.on('game:goal', (data) => {
        if (!data || !data.scorer) return;
        const scorer = data.scorer;
        const scorerTeam = data.team || (scorer === player1.name ? 'blue' : 'red');
        
        isCelebration = true;
        celebrationTimer = 180;
        goalScorerColor = scorerTeam === 'blue' ? '#1a46a0' : '#d63031';
        goalScorerName = `¡${scorer.toUpperCase()} GOL!`;
        
    });
    socket.on('room:error', (message) => {
        console.error('Room error:', message);
        alert(message || 'Error en la sala');
        window.location.href = '../pages/jugar.html';
    });
}

document.addEventListener("keyup", e => { 
    const key = e.key.toLowerCase();
    keys[key] = false; 
    if (e.key === " ") keys["space"] = false;
    if (gameStarted) {
        if (key === 'w') updateInputState('up', false);
        if (key === 's') updateInputState('down', false);
        if (key === 'a') updateInputState('left', false);
        if (key === 'd') updateInputState('right', false);
        if (e.key === ' ') updateInputState('kick', false);
        if (key.startsWith('arrow')) {
            if (key === 'arrowup') updateInputState('up', false);
            if (key === 'arrowdown') updateInputState('down', false);
            if (key === 'arrowleft') updateInputState('left', false);
            if (key === 'arrowright') updateInputState('right', false);
        }
    }
});

document.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    if (e.key === ' ') keys['space'] = true;
    if (gameStarted) {
        if (key === 'w') updateInputState('up', true);
        if (key === 's') updateInputState('down', true);
        if (key === 'a') updateInputState('left', true);
        if (key === 'd') updateInputState('right', true);
        if (e.key === ' ') updateInputState('kick', true);
        if (key.startsWith('arrow')) {
            if (key === 'arrowup') updateInputState('up', true);
            if (key === 'arrowdown') updateInputState('down', true);
            if (key === 'arrowleft') updateInputState('left', true);
            if (key === 'arrowright') updateInputState('right', true);
        }
    }
});

function getPowerEmoji(type) {
    if (type === "SPEED") return "⚡";
    if (type === "BIG") return "🛡️";
    if (type === "SUPER_KICK") return "🥊";
    return "";
}

function getMovementMultiplier(player) {
    if (!player) return 1;
    if (player.activePower === "BIG") return 0.65;
    if (player.activePower === "SPEED") return 1.55;
    return 1;
}

function updateRoomPlayers(room) {
    remoteRoom = room;
    // assign local player names/teams using room members
    const bluePlayers = room.players.filter(p => p.team === 'blue');
    const redPlayers = room.players.filter(p => p.team === 'red');

    if (bluePlayers[0]) {
        player1.name = bluePlayers[0].nickname;
        player1.team = 'blue';
    }
    if (redPlayers[0]) {
        player2.name = redPlayers[0].nickname;
        player2.team = 'red';
    }

    // If local player appears in room, use their assigned team and name
    const lowerNickname = nickname.trim().toLowerCase();
    const localPlayer = room.players.find(p => p.nickname && p.nickname.trim().toLowerCase() === lowerNickname);
    if (localPlayer) {
        if (localPlayer.team === 'blue') {
            player1.name = localPlayer.nickname;
            player1.team = 'blue';
            localPlayerTeam = 'blue';
        } else if (localPlayer.team === 'red') {
            player2.name = localPlayer.nickname;
            player2.team = 'red';
            localPlayerTeam = 'red';
        }
    }

    // If there is a rival player on the opposite team, show their nickname
    if (!localPlayer || localPlayer.team === 'blue') {
        const enemy = redPlayers.find(p => !localPlayer || p.nickname.trim().toLowerCase() !== lowerNickname) || { nickname: 'Rival' };
        player2.name = enemy.nickname;
    } else {
        const enemy = bluePlayers.find(p => !localPlayer || p.nickname.trim().toLowerCase() !== lowerNickname) || { nickname: 'Rival' };
        player1.name = enemy.nickname;
    }
}

function startTimer() {
    if (!isTimerRunning) {
        lastTick = performance.now();
        isTimerRunning = true;
    }
}

function stopTimer() {
    isTimerRunning = false;
}

function updateTimerDisplay() {
    const ms = Math.max(0, overtime ? overtimeMs : remainingMs);
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);

    const strMin = minutes < 10 ? "0" + minutes : String(minutes);
    const strSec = seconds < 10 ? "0" + seconds : String(seconds);
    const strCen = centiseconds < 10 ? "0" + centiseconds : String(centiseconds);

    if (timerMainText) timerMainText.textContent = `${strMin}:${strSec}`;
    if (timerMsText) timerMsText.textContent = `.${strCen}`;
}

function applyPowerUp(player, type) {
    player.activePower = type;
    player.powerTimer = 360; 

    if (type === "BIG") {
        player.r = player.baseR * 1.55; 
    } else {
        player.r = player.baseR; 
    }
}

function removePowerUp(player) {
    player.activePower = null;
    player.powerTimer = 0;
    player.r = player.baseR;
}

function handlePowerUpsLogic() {
    if (isCelebration || waitingForKickOff) return;

    visiblePlayers.forEach(p => {
        if (p.powerTimer > 0) {
            p.powerTimer--;
            if (p.powerTimer <= 0) removePowerUp(p);
        }
    });

    powerUpSpawnTimer++;
    if (powerUpSpawnTimer >= SPAWN_INTERVAL) {
        powerUpSpawnTimer = 0;

        if (activePowerUps.length < 2) {
            const margin = 50;
            const randomX = Math.random() * ((fieldRight - margin) - (fieldLeft + margin)) + (fieldLeft + margin);
            const randomY = Math.random() * ((fieldBottom - margin) - (fieldTop + margin)) + (fieldTop + margin);
            const randomType = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];

            activePowerUps.push({ x: randomX, y: randomY, r: 15, type: randomType }); 
        }
    }

    for (let i = activePowerUps.length - 1; i >= 0; i--) {
        const pup = activePowerUps[i];
        
        let hitPlayer = null;
        if (checkCircleCollision(player1, pup)) hitPlayer = player1;
        else if (checkCircleCollision(player2, pup)) hitPlayer = player2;

        if (hitPlayer) {
            applyPowerUp(hitPlayer, pup.type);
            activePowerUps.splice(i, 1); 
        }
    }
}

function checkCircleCollision(c1, c2) {
    const dx = c1.x - c2.x;
    const dy = c1.y - c2.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < (c1.r + c2.r);
}

function triggerGoal(team) {
    if (window.__matchEnded) return;

    isCelebration = true;
    celebrationTimer = 120; 
    stopTimer(); 
    
    if (team === "red") {

    redScore++;

    redText.textContent = redScore;
    goalScorerColor = "#d63031";

    goalScorerName = `¡GOL DE ${player2.name.toUpperCase()}!`;

    kickOffTeam = "blue";

    if (socket) {

        socket.emit("game:goal", {

            scorer: player2.name

        });

    }

} else {

    blueScore++;

    blueText.textContent = blueScore;
    goalScorerColor = "#1a46a0";

    goalScorerName = `¡GOL DE ${player1.name.toUpperCase()}!`;

    kickOffTeam = "red";

    if (socket) {

        socket.emit("game:goal", {

            scorer: player1.name

        });

    }

}

    try {
        const scorer = lastTouch || (team === 'red' ? player2.name : player1.name);
        const assister = (secondLastTouch && secondLastTouch !== scorer) ? secondLastTouch : null;
        if (socket) socket.emit('game:goal', { scorer, assister });

        const limit = parseInt(localStorage.getItem('goalLimit'), 10) || 0;
        if (limit > 0) {
            if (redScore >= limit || blueScore >= limit) {
                window.__matchEnded = true;
                isPaused = true;
                stopTimer();

                const winnerTeam = redScore > blueScore ? 'red' : (blueScore > redScore ? 'blue' : 'draw');
                const winnerName = winnerTeam === 'red' ? player2.name : (winnerTeam === 'blue' ? player1.name : null);

                if (socket) {
                    if (winnerName) {

                    socket.emit('match:ended', {
                        winnerTeam,
                        winnerName,
                        finalScore: { red: redScore, blue: blueScore }
                    });
                }
                }

                setTimeout(() => {
                    window.location.href = "../pages/lobby.html";
                }, 2500);
            }
        }
    } catch (e) {}
}

// POSICIONAMIENTO INICIAL PROPORCIONAL AL TAMAÑO DEL MAPA
function resetPositions() {
    ball.x = canvas.width / 2; 
    ball.y = canvas.height / 2; 
    ball.vx = 0; 
    ball.vy = 0;
    
    player1.vx = 0; player1.vy = 0;
    player2.vx = 0; player2.vy = 0;
    waitingForKickOff = true; 

    // Jugadores distribuidos simétricamente según el ancho del mapa actual
    player1.x = (canvas.width / 2) - 150; 
    player1.y = canvas.height / 2; 
    player2.x = (canvas.width / 2) + 150; 
    player2.y = canvas.height / 2; 

    removePowerUp(player1);
    removePowerUp(player2);
    player1.trail = [];
    player2.trail = [];
    activePowerUps.length = 0;
    powerUpSpawnTimer = 0;
    lastTouch = null;
    secondLastTouch = null;
}

function resetGame() {
    isCelebration = false;
    resetPositions();
}

function drawCircle(x, y, r, color, strokeColor = "#000000", strokeWidth = 1.5) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
    ctx.closePath();
}

function drawPlayer(player, isKicking) {
    if (player.trail && player.trail.length > 0) {
        player.trail.forEach((pos, index) => {
            let alpha = (index + 1) / player.trail.length * 0.20; 
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`; 
            ctx.fill();
            ctx.closePath();
        });
    }

    if (player.activePower) {
        let auraColor = "#ffd700"; 
        if (player.activePower === "BIG") auraColor = "#ff9f43"; 
        if (player.activePower === "SUPER_KICK") auraColor = "#ff0055"; 

        ctx.beginPath();
        ctx.arc(player.x, player.y, player.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.closePath();
    }

    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = isKicking ? 4.5 : 1.5;
    ctx.stroke();
    
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${player.r * 0.85}px Arial`; 
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(player.number, player.x, player.y);
    ctx.closePath();

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    
    let textoNombre = player.name;
    if (player.activePower) {
        textoNombre += " " + getPowerEmoji(player.activePower); 
    }
    ctx.fillText(textoNombre, player.x, player.y + player.r + 6);
}

function movePlayers() {
    const p1Chuta = keys["space"];
    const p2Chuta = keys["space"];

    const p1Multiplier = getMovementMultiplier(player1);
    const p2Multiplier = getMovementMultiplier(player2);

    const maxVelP1 = p1Chuta ? 1.6 * p1Multiplier : JUGADOR_MAX_VEL * p1Multiplier;
    const accelP1 = p1Chuta ? 0.09 * p1Multiplier : JUGADOR_ACCEL * p1Multiplier;

    const maxVelP2 = p2Chuta ? 1.6 * p2Multiplier : JUGADOR_MAX_VEL * p2Multiplier;
    const accelP2 = p2Chuta ? 0.09 * p2Multiplier : JUGADOR_ACCEL * p2Multiplier;

    let moveX1 = 0; let moveY1 = 0;
    if (keys["w"]) moveY1 -= 1;
    if (keys["s"]) moveY1 += 1;
    if (keys["a"]) moveX1 -= 1;
    if (keys["d"]) moveX1 += 1;

    if (moveX1 !== 0 && moveY1 !== 0) {
        moveX1 *= 0.7071; moveY1 *= 0.7071;
    }
    player1.vx += moveX1 * accelP1;
    player1.vy += moveY1 * accelP1;

    let moveX2 = 0; let moveY2 = 0;
    if (keys["arrowup"]) moveY2 -= 1;
    if (keys["arrowdown"]) moveY2 += 1;
    if (keys["arrowleft"]) moveX2 -= 1;
    if (keys["arrowright"]) moveX2 += 1;

    if (moveX2 !== 0 && moveY2 !== 0) {
        moveX2 *= 0.7071; moveY2 *= 0.7071;
    }
    player2.vx += moveX2 * accelP2;
    player2.vy += moveY2 * accelP2;

    player1.vx *= JUGADOR_FRICCION; player1.vy *= JUGADOR_FRICCION;
    player2.vx *= JUGADOR_FRICCION; player2.vy *= JUGADOR_FRICCION;

    let vel1 = Math.sqrt(player1.vx*player1.vx + player1.vy*player1.vy);
    if (vel1 > maxVelP1) {
        player1.vx = (player1.vx / vel1) * maxVelP1;
        player1.vy = (player1.vy / vel1) * maxVelP1;
    }
    let vel2 = Math.sqrt(player2.vx*player2.vx + player2.vy*player2.vy);
    if (vel2 > maxVelP2) {
        player2.vx = (player2.vx / vel2) * maxVelP2;
        player2.vy = (player2.vy / vel2) * maxVelP2;
    }

    player1.x += player1.vx; player1.y += player1.vy;
    player2.x += player2.vx; player2.y += player2.vy;
}

function playerVsPlayer() {
    const dx = player2.x - player1.x;
    const dy = player2.y - player1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = player1.r + player2.r;

    if (dist < minDist) {
        const overlap = minDist - dist;
        const angle = Math.atan2(dy, dx);

        player1.x -= Math.cos(angle) * (overlap / 2);
        player1.y -= Math.sin(angle) * (overlap / 2);
        player2.x += Math.cos(angle) * (overlap / 2);
        player2.y += Math.sin(angle) * (overlap / 2);

        const nx = dx / dist;
        const ny = dy / dist;

        const kx = player1.vx - player2.vx;
        const ky = player1.vy - player2.vy;
        const p = 2 * (nx * kx + ny * ky) / (player1.massa + player2.massa);

        player1.vx -= p * player2.massa * nx;
        player1.vy -= p * player2.massa * ny;
        player2.vx += p * player1.massa * nx;
        player2.vy += p * player1.massa * ny;
    }
}

function handleBallCollisions() {
    const dx1 = ball.x - player1.x; const dy1 = ball.y - player1.y;
    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    
    const dx2 = ball.x - player2.x; const dy2 = ball.y - player2.y;
    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    const localKick = keys["space"];
    const p1Chuta = localPlayerTeam === 'blue' ? localKick : false;
    const p2Chuta = localPlayerTeam === 'red' ? localKick : false;

    const minDist1 = p1Chuta ? (player1.r + ball.r + 12) : (player1.r + ball.r);
    const minDist2 = p2Chuta ? (player2.r + ball.r + 12) : (player2.r + ball.r);

    const p1Collides = dist1 < minDist1;
    const p2Collides = dist2 < minDist2;

    if (waitingForKickOff) {
        if ((p1Collides && kickOffTeam === "blue") || (p2Collides && kickOffTeam === "red")) {
            waitingForKickOff = false;
            startTimer(); 
        }
    }

    if (p1Collides && p2Collides) {
        processCollision(player1, dx1, dy1, dist1, p1Chuta);
        processCollision(player2, dx2, dy2, dist2, p2Chuta);
        return; 
    }

    if (p1Collides) processCollision(player1, dx1, dy1, dist1, p1Chuta);
    if (p2Collides) processCollision(player2, dx2, dy2, dist2, p2Chuta);

    posts.forEach(post => {
        const pdx = ball.x - post.x;
        const pdy = ball.y - post.y;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        const pMinDist = ball.r + post.r;

        if (pdist < pMinDist) {
            const pAngle = Math.atan2(pdy, pdx);
            const pOverlap = pMinDist - pdist;
            ball.x += Math.cos(pAngle) * pOverlap;
            ball.y += Math.sin(pAngle) * pOverlap;

            const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            ball.vx = Math.cos(pAngle) * Math.max(speed * 0.6, 1.5);
            ball.vy = Math.sin(pAngle) * Math.max(speed * 0.6, 1.5);
        }
    });
}

function processCollision(player, dx, dy, dist, isKicking) {
    const safeDist = dist > 0 ? dist : 0.0001;
    const rawAngle = Math.atan2(dy, dx);
    const fallbackAngle = dist === 0
        ? Math.atan2((player.y - ball.y) || 1, (player.x - ball.x) || 1)
        : rawAngle;
    const angle = Number.isFinite(fallbackAngle) ? fallbackAngle : rawAngle;

    try {
        secondLastTouch = lastTouch || null;
        lastTouch = player.name || null;
    } catch (e){}

    if (isKicking) {
        const force = player.activePower === "SUPER_KICK" ? 18.5 : 12.0;
        ball.vx = Math.cos(angle) * force; 
        ball.vy = Math.sin(angle) * force;
    } else {
        const minDistCuerpo = player.r + ball.r;
        if (dist < minDistCuerpo) {
            const overlap = minDistCuerpo - dist;
            ball.x += Math.cos(angle) * overlap;
            ball.y += Math.sin(angle) * overlap;
            player.x -= Math.cos(angle) * overlap * 0.6;
            player.y -= Math.sin(angle) * overlap * 0.6;
        }

        const nx = dx / safeDist;
        const ny = dy / safeDist;
        const kx = player.vx - ball.vx;
        const ky = player.vy - ball.vy;
        
        const p = 1.15 * (nx * kx + ny * ky) / (player.massa + ball.massa);

        ball.vx += p * player.massa * nx;
        ball.vy += p * player.massa * ny;
        player.vx -= p * ball.massa * nx;
        player.vy -= p * ball.massa * ny;
    }

    try {
        const nearLeft = (player.team === 'blue') && (player.x - fieldLeft < 100);
        const nearRight = (player.team === 'red') && (fieldRight - player.x < 100);
        if (nearLeft || nearRight) {
            if (socket) socket.emit('game:save', { nickname: player.name });
        }
    } catch (e) {}
}

function updatePositionsAndLimits() {
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= ball.friccion;
    ball.vy *= ball.friccion;

    handleBallCollisions();

    if (ball.y - ball.r < fieldTop) { ball.y = fieldTop + ball.r; ball.vy *= ball.rebotePared; }
    if (ball.y + ball.r > fieldBottom) { ball.y = fieldBottom - ball.r; ball.vy *= ball.rebotePared; }

    const insideLeftGoal = ball.x - ball.r < fieldLeft && ball.y - ball.r >= goalTop && ball.y + ball.r <= goalBottom;
    const insideRightGoal = ball.x + ball.r > fieldRight && ball.y - ball.r >= goalTop && ball.y + ball.r <= goalBottom;

    if (insideLeftGoal || insideRightGoal) {
        // Dejar que el servidor procese el gol; aquí solo evitamos rebotes irregulares.
    } else {
        if (ball.x - ball.r < fieldLeft) { ball.x = fieldLeft + ball.r; ball.vx *= ball.rebotePared; }
        if (ball.x + ball.r > fieldRight) { ball.x = fieldRight - ball.r; ball.vx *= ball.rebotePared; }
    }

    const midX = canvas.width / 2;
    const midY = canvas.height / 2;

    visiblePlayers.forEach(p => {
        if (waitingForKickOff) {
            if (p.team === "blue" && p.x + p.r > midX) {
                p.x = midX - p.r;
                p.vx = 0;
            }
            if (p.team === "red" && p.x - p.r < midX) {
                p.x = midX + p.r;
                p.vx = 0;
            }

            if (p.team !== kickOffTeam) {
                const cdx = p.x - midX;
                const cdy = p.y - midY;
                const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                const limitDist = centerCircleRadius + p.r;
                
                if (cdist < limitDist) {
                    const cAngle = Math.atan2(cdy, cdx);
                    const cOverlap = limitDist - cdist;
                    p.x += Math.cos(cAngle) * cOverlap;
                    p.y += Math.sin(cAngle) * cOverlap;

                    const dot = p.vx * Math.cos(cAngle) + p.vy * Math.sin(cAngle);
                    if (dot < 0) {
                        p.vx -= Math.cos(cAngle) * dot;
                        p.vy -= Math.sin(cAngle) * dot;
                    }
                }
            }
        }

        posts.forEach(post => {
            const pdx = p.x - post.x;
            const pdy = p.y - post.y;
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            const pMinDist = p.r + post.r;

            if (pdist < pMinDist) {
                const pAngle = Math.atan2(pdy, pdx);
                const pOverlap = pMinDist - pdist;
                p.x += Math.cos(pAngle) * pOverlap;
                p.y += Math.sin(pAngle) * pOverlap;

                const dot = p.vx * Math.cos(pAngle) + p.vy * Math.sin(pAngle);
                if (dot < 0) {
                    p.vx -= Math.cos(pAngle) * dot * 1.2;
                    p.vy -= Math.sin(pAngle) * dot * 1.2;
                }
            }
        });

        const inGoalMouth = p.y + p.r > goalTop && p.y - p.r < goalBottom;
        const leftGoalBack = fieldLeft - goalWidth;
        const rightGoalBack = fieldRight + goalWidth;
        const inLeftGoalDepth = p.x > leftGoalBack && p.x < fieldLeft;
        const inRightGoalDepth = p.x > fieldRight && p.x < rightGoalBack;
        if ((inLeftGoalDepth || inRightGoalDepth) && p.y - p.r < goalTop) {
            if (p.vy < 0) p.vy = 0;
        } else if ((inLeftGoalDepth || inRightGoalDepth) && p.y + p.r > goalBottom) {
            if (p.vy > 0) p.vy = 0;
        }

        p.x = Math.max(p.r, Math.min(canvas.width - p.r, p.x));
        p.y = Math.max(p.r, Math.min(canvas.height - p.r, p.y));
    });

    if (!isCelebration) {
        if (ball.x < fieldLeft - ball.r) { triggerGoal("red"); }
        if (ball.x > fieldRight + ball.r) { triggerGoal("blue"); }
    }
}

// DIBUJADO DE LA CANCHA ADAPTADO AL MAPA ACTUAL
function drawThemeBackground(theme, timestamp) {
    const time = timestamp * 0.001;
    const width = canvas.width;
    const height = canvas.height;

    ctx.save();
    const baseGradient = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, Math.max(width, height));
    switch (theme) {
        case 'frozen':
            baseGradient.addColorStop(0, '#99d9ff');
            baseGradient.addColorStop(1, '#1d4ed8');
            break;
        case 'desert':
            baseGradient.addColorStop(0, '#f6c76b');
            baseGradient.addColorStop(1, '#7c2d12');
            break;
        case 'street':
            baseGradient.addColorStop(0, '#2f3542');
            baseGradient.addColorStop(1, '#0f172a');
            break;
        case 'champions':
            baseGradient.addColorStop(0, '#1d3557');
            baseGradient.addColorStop(1, '#0b1120');
            break;
        case 'cyberpunk':
            baseGradient.addColorStop(0, '#240b40');
            baseGradient.addColorStop(1, '#050816');
            break;
        case 'micro':
            baseGradient.addColorStop(0, '#7c3d15');
            baseGradient.addColorStop(1, '#2b1207');
            break;
        case 'titan':
            baseGradient.addColorStop(0, '#4b2058');
            baseGradient.addColorStop(1, '#1b1024');
            break;
        case 'tunnel':
            baseGradient.addColorStop(0, '#0f5132');
            baseGradient.addColorStop(1, '#061b11');
            break;
        case 'volcanic':
            baseGradient.addColorStop(0, '#7b2d18');
            baseGradient.addColorStop(1, '#160b0b');
            break;
        default:
            baseGradient.addColorStop(0, '#1f2937');
            baseGradient.addColorStop(1, '#04070d');
            break;
    }

    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, width, height);

    if (theme === 'classic') {
        for (let i = 0; i < 18; i++) {
            const x = ((i * 97 + time * 18) % (width + 80)) - 40;
            const y = ((i * 67 + time * (12 + i % 5)) % (height + 80)) - 40;
            ctx.fillStyle = `rgba(255,255,255,${0.06 + (i % 4) * 0.03})`;
            ctx.fillRect(x, y, 4, 4);
        }
    }

    if (theme === 'street') {
        for (let i = -2; i < 12; i++) {
            const offset = (time * 140 + i * 120) % (width + 200);
            ctx.fillStyle = `rgba(255, 165, 0, ${0.08 + (i % 4) * 0.04})`;
            ctx.fillRect(offset - 100, 0, 22, height);
        }
    }

    if (theme === 'frozen') {
        for (let i = 0; i < 36; i++) {
            const x = ((i * 131 + time * 30) % (width + 40)) - 20;
            const y = ((i * 73 + time * (26 + (i % 3) * 6)) % (height + 40)) - 20;
            ctx.fillStyle = `rgba(255,255,255,${0.55 + (i % 5) * 0.08})`;
            ctx.beginPath();
            ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (theme === 'desert') {
        for (let i = 0; i < 12; i++) {
            const y = (height * 0.18) + i * (height / 11);
            ctx.beginPath();
            ctx.moveTo(-20, y + 18);
            for (let x = -20; x <= width + 20; x += 28) {
                const wave = Math.sin((x * 0.04) + time * 1.3 + i) * 18;
                ctx.lineTo(x, y + wave);
            }
            ctx.strokeStyle = `rgba(245, 158, 11, ${0.18 + i * 0.03})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    if (theme === 'champions') {
        for (let i = 0; i < 10; i++) {
            const x = ((i * 180 + time * 90) % (width + 200)) - 100;
            ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.02})`;
            ctx.fillRect(x, 0, 36, height);
        }
        for (let i = 0; i < 6; i++) {
            const y = 20 + i * 22;
            ctx.fillStyle = `rgba(255,255,255,${0.06 + i * 0.02})`;
            ctx.fillRect(0, y + Math.sin(time + i) * 8, width, 2);
        }
    }

    if (theme === 'cyberpunk') {
        for (let i = 0; i < 14; i++) {
            const y = (i * 58 + time * 40) % (height + 40);
            ctx.strokeStyle = `rgba(0,255,204,${0.15 + i * 0.03})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y + Math.sin(time + i) * 12);
            ctx.stroke();
        }
        for (let i = 0; i < 18; i++) {
            const x = ((i * 99 + time * 140) % (width + 40)) - 20;
            ctx.fillStyle = `rgba(34, 211, 238, ${0.12 + (i % 4) * 0.04})`;
            ctx.fillRect(x, 0, 6, height);
        }
    }

    if (theme === 'micro') {
        for (let i = 0; i < 30; i++) {
            const x = ((i * 61 + time * 32) % (width + 20)) - 10;
            const y = ((i * 47 + time * 18) % (height + 20)) - 10;
            ctx.fillStyle = `rgba(251, 191, 36, ${0.18 + (i % 4) * 0.06})`;
            ctx.beginPath();
            ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (theme === 'titan') {
        for (let i = 0; i < 8; i++) {
            const radius = 130 + i * 45 + Math.sin(time + i) * 25;
            const x = (width * 0.5) + Math.sin(time * 0.7 + i) * (width * 0.28);
            const y = (height * 0.5) + Math.cos(time * 0.9 + i) * (height * 0.2);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(245, 158, 11, ${0.08 + i * 0.02})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    if (theme === 'tunnel') {
        for (let i = 0; i < 10; i++) {
            const offset = ((time * 80 + i * 90) % (width + 90)) - 45;
            ctx.strokeStyle = `rgba(186, 230, 253, ${0.14 + i * 0.03})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(offset, height * 0.2);
            ctx.lineTo(offset + 80, height * 0.8);
            ctx.stroke();
        }
    }

    if (theme === 'volcanic') {
        for (let i = 0; i < 28; i++) {
            const x = ((i * 89 + time * 40) % (width + 40)) - 20;
            const y = ((i * 53 + time * (30 + (i % 2) * 12)) % (height + 50)) - 25;
            ctx.fillStyle = `rgba(251, 146, 60, ${0.15 + (i % 3) * 0.1})`;
            ctx.beginPath();
            ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

function drawFieldEffects() {
    const time = performance.now() * 0.001;
    const width = fieldRight - fieldLeft;
    const height = fieldBottom - fieldTop;

    ctx.save();
    ctx.beginPath();
    ctx.rect(fieldLeft, fieldTop, width, height);
    ctx.clip();

    switch (currentMap.theme) {
        case 'frozen':
            for (let i = 0; i < 55; i++) {
                const x = fieldLeft + ((i * 97 + time * 35) % width);
                const y = fieldTop + ((i * 71 + time * (28 + (i % 4) * 8)) % height);
                ctx.fillStyle = `rgba(255,255,255,${0.35 + (i % 5) * 0.12})`;
                ctx.beginPath();
                ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case 'desert':
            for (let i = 0; i < 18; i++) {
                const y = fieldTop + (i / 18) * height;
                ctx.beginPath();
                ctx.moveTo(fieldLeft, y);
                for (let x = fieldLeft; x <= fieldRight; x += 22) {
                    const wave = Math.sin((x * 0.045) + time * 1.8 + i) * 10;
                    ctx.lineTo(x, y + wave);
                }
                ctx.strokeStyle = `rgba(255,255,255,${0.22 + i * 0.02})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            break;
        case 'street':
            for (let i = 0; i < 20; i++) {
                const y = fieldTop + ((i * 63 + time * 40) % height);
                ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 5) * 0.04})`;
                ctx.fillRect(fieldLeft, y, width, 2);
            }
            break;
        case 'champions':
            for (let i = 0; i < 11; i++) {
                const x = fieldLeft + ((i * 180 + time * 80) % width);
                ctx.fillStyle = `rgba(255,255,255,${0.06 + (i % 4) * 0.02})`;
                ctx.fillRect(x, fieldTop, 18, height);
            }
            break;
        case 'cyberpunk':
            for (let i = 0; i < 26; i++) {
                const x = fieldLeft + ((i * 77 + time * 180) % width);
                const y = fieldTop + (i % 2) * 18 + Math.sin(time + i) * 10;
                ctx.fillStyle = `rgba(0,255,204,${0.18 + (i % 4) * 0.08})`;
                ctx.fillRect(x, y, 8, height * 0.2);
            }
            break;
        case 'micro':
            for (let i = 0; i < 30; i++) {
                const x = fieldLeft + ((i * 31 + time * 60) % width);
                const y = fieldTop + ((i * 41 + time * 30) % height);
                ctx.fillStyle = `rgba(255,255,255,${0.22 + (i % 4) * 0.08})`;
                ctx.beginPath();
                ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case 'titan':
            for (let i = 0; i < 8; i++) {
                const radius = 40 + i * 18 + Math.sin(time * 1.2 + i) * 12;
                const x = fieldLeft + width * 0.5 + Math.sin(time * 0.8 + i) * (width * 0.2);
                const y = fieldTop + height * 0.5 + Math.cos(time * 0.9 + i) * (height * 0.22);
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255,255,255,${0.06 + i * 0.02})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            break;
        case 'tunnel':
            for (let i = 0; i < 14; i++) {
                const x = fieldLeft + ((i * 92 + time * 120) % width);
                ctx.strokeStyle = `rgba(186,230,253,${0.15 + (i % 5) * 0.04})`;
                ctx.beginPath();
                ctx.moveTo(x, fieldTop);
                ctx.lineTo(x + 40, fieldBottom);
                ctx.stroke();
            }
            break;
        case 'volcanic':
            for (let i = 0; i < 40; i++) {
                const x = fieldLeft + ((i * 51 + time * 50) % width);
                const y = fieldTop + ((i * 27 + time * 34) % height);
                ctx.fillStyle = `rgba(251, 146, 60, ${0.15 + (i % 4) * 0.08})`;
                ctx.beginPath();
                ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        default:
            for (let i = 0; i < 20; i++) {
                const x = fieldLeft + ((i * 69 + time * 25) % width);
                const y = fieldTop + ((i * 57 + time * 18) % height);
                ctx.fillStyle = `rgba(255,255,255,${0.12 + (i % 4) * 0.04})`;
                ctx.fillRect(x, y, 6, 6);
            }
    }

    ctx.restore();
}

function drawField() {
    const backgroundTimestamp = performance.now();
    drawThemeBackground(currentMap.theme, backgroundTimestamp);

    // 2. TERRENO DE JUEGO PRINCIPAL (El color de la cancha)
    ctx.fillStyle = currentMap.fieldColor;
    ctx.fillRect(fieldLeft, fieldTop, fieldRight - fieldLeft, fieldBottom - fieldTop);
    drawFieldEffects();

    // 3. DETALLES ESTÉTICOS ESTÁTICOS SEGÚN EL TEMA (Los de anoche sin animar)
    ctx.font = "16px Arial";
    ctx.textBaseline = "middle";

    if (currentMap.theme === "frozen") {
        ctx.textAlign = "center";
        for (let x = fieldLeft + 30; x < fieldRight; x += 60) {
            ctx.fillText("🐧", x, fieldTop - 20);      
            ctx.fillText("☃️", x, fieldBottom + 20); 
        }
    } 
    else if (currentMap.theme === "desert") {
        ctx.textAlign = "center";
        for (let x = fieldLeft + 45; x < fieldRight; x += 90) {
            ctx.fillText("🌵", x, fieldTop - 20);
            ctx.fillText("🦂", x, fieldBottom + 20);
        }
    }
    else if (currentMap.theme === "street") {
        ctx.textAlign = "center";
        // El bucle limpio de la calle que controlaba bien los límites
        for (let x = fieldLeft + 60; x < fieldRight; x += 120) {
            ctx.fillText("🗑️", x, fieldTop - 20);
            ctx.fillText("🧱", x, fieldBottom + 20);
        }
    }
    else if (currentMap.theme === "champions") {
        ctx.textAlign = "center";
        for (let x = fieldLeft + 20; x < fieldRight; x += 40) {
            ctx.fillText("🙋‍♂️", x, fieldTop - 20);
            ctx.fillText("🚩", x, fieldBottom + 20);
        }
        // Líneas de césped estilo estadio
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        let stripeWidth = (fieldRight - fieldLeft) / 10;
        for (let i = 0; i < 10; i += 2) {
            ctx.fillRect(fieldLeft + (i * stripeWidth), fieldTop, stripeWidth, fieldBottom - fieldTop);
        }
    }

    // 4. ARCOS (Izquierdo y Derecho)
    ctx.fillStyle = currentMap.goalBg;
    ctx.fillRect(fieldLeft - goalWidth, goalTop, goalWidth, goalHeight);
    ctx.strokeStyle = currentMap.lineColor; 
    ctx.lineWidth = 2.5;
    ctx.strokeRect(fieldLeft - goalWidth, goalTop, goalWidth, goalHeight);

    ctx.fillRect(fieldRight, goalTop, goalWidth, goalHeight);
    ctx.strokeRect(fieldRight, goalTop, goalWidth, goalHeight);

    // Redes de los arcos
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    for (let y = goalTop + 10; y < goalBottom; y += 10) {
        ctx.beginPath(); ctx.moveTo(fieldLeft - goalWidth, y); ctx.lineTo(fieldLeft, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fieldRight, y); ctx.lineTo(fieldRight + goalWidth, y); ctx.stroke();
    }

    // 5. LÍNEAS REGLAMENTARIAS DE LA CANCHA
    ctx.strokeStyle = currentMap.lineColor;
    ctx.lineWidth = 3.5;
    ctx.strokeRect(fieldLeft, fieldTop, fieldRight - fieldLeft, fieldBottom - fieldTop);
    
    // Línea de mitad de cancha y círculo central
    ctx.beginPath(); ctx.moveTo(canvas.width / 2, fieldTop); ctx.lineTo(canvas.width / 2, fieldBottom); ctx.stroke();
    ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, centerCircleRadius, 0, Math.PI * 2); ctx.stroke();

    // ==========================================
    // LOGO DE MOMO EN EL CÍRCULO CENTRAL (STREET)
    // ==========================================
    if (currentMap.theme === "street" && typeof streetLogo !== "undefined" && streetLogo.complete && streetLogo.naturalWidth > 0) {
        ctx.save(); // Guardamos el estado del lienzo
        
        // Creamos la máscara circular para recortar la foto de Momo
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, centerCircleRadius, 0, Math.PI * 2);
        ctx.clip(); 

        // La dibujamos centrada usando el radio del círculo central
        let size = centerCircleRadius * 2;
        ctx.drawImage(
            streetLogo, 
            (canvas.width / 2) - centerCircleRadius, 
            (canvas.height / 2) - centerCircleRadius, 
            size, 
            size
        );

        ctx.restore(); // Restauramos para seguir dibujando lo demás sin problemas
    }

    // Líneas de los arcos
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath(); ctx.moveTo(fieldLeft, goalTop); ctx.lineTo(fieldLeft, goalBottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fieldRight, goalTop); ctx.lineTo(fieldRight, goalBottom); ctx.stroke();

    // Áreas grandes para Champions y Desierto
    if (currentMap.theme === "champions" || currentMap.theme === "desert") {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.strokeRect(fieldLeft, canvas.height/2 - goalHeight, goalWidth * 2.5, goalHeight * 2);
        ctx.strokeRect(fieldRight - (goalWidth * 2.5), canvas.height/2 - goalHeight, goalWidth * 2.5, goalHeight * 2);
    }

    // 6. NOMBRE DEL MAPA EN LA ESQUINA
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.font = "italic bold 13px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`🏟️  ${currentMap.name}`, fieldLeft + 15, fieldTop + 25);
}
function drawPowerUps() {
    activePowerUps.forEach(pup => {
        let color = "#ffd700"; 
        if (pup.type === "BIG") color = "#ff9f43"; 
        if (pup.type === "SUPER_KICK") color = "#ff0055"; 

        drawCircle(pup.x, pup.y, pup.r, color, "#ffffff", 2);

        ctx.font = "16px Arial"; 
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(getPowerEmoji(pup.type), pup.x, pup.y);
    });
}

function drawCelebrationOverlay() {
    if (!isCelebration) return;

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
    ctx.fillRect(0, canvas.height / 2 - 60, canvas.width, 120);

    ctx.fillStyle = goalScorerColor;
    ctx.font = "italic bold 55px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 8;
    ctx.fillText(goalScorerName, canvas.width / 2, canvas.height / 2);
    
    ctx.shadowBlur = 0;
}

let isPaused = false;
let timerWasRunningBeforePause = false;

function renderPauseState(p) {
    const overlay = document.getElementById('pauseOverlay');
    isPaused = !!p;
    if (overlay) {
        if (isPaused) overlay.classList.remove('hidden');
        else overlay.classList.add('hidden');
    }

    if (isPaused) {
        timerWasRunningBeforePause = isTimerRunning;
        if (isTimerRunning) stopTimer();
    } else {
        if (timerWasRunningBeforePause) startTimer();
    }
}

function setPausedFromServer(p) {
    renderPauseState(p);
}

function requestPause(p) {
    if (!socket || !socket.connected || !gameStarted || !gameRoomId) return;
    socket.emit('game:pause', { roomId: gameRoomId, paused: !!p });
}

function setPaused(p) {
    requestPause(!!p);
}

function togglePause() {
    requestPause(!isPaused);
}

function resetMatch() {
    blueScore = 0; redScore = 0;
    blueText.textContent = blueScore;
    redText.textContent = redScore;
    remainingMs = totalMatchMs;
    let gameAnimFrame = 0;
    updateTimerDisplay();
    // Sumar al contador de animación en cada frame del loop
gameAnimFrame++;
    resetPositions();
}

document.addEventListener('DOMContentLoaded', () => {
    const resumeBtn = document.getElementById('resumeButton');
    const restartBtn = document.getElementById('restartButton');
    const exitBtn = document.getElementById('exitButton');
    if (resumeBtn) resumeBtn.addEventListener('click', () => requestPause(false));
    if (restartBtn) restartBtn.addEventListener('click', () => { setPaused(false); resetMatch(); });
    if (exitBtn) exitBtn.addEventListener('click', () => { window.location.href = 'menu.html'; });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        togglePause();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const openPause = document.getElementById('openPauseButton');
    if (openPause) openPause.addEventListener('click', () => togglePause());
});

function gameLoop() {
    if (!isPaused) {
        if (gameStarted) {
            sendGameInput();
        }
        
        if (!isPaused) {
            if (isTimerRunning) {
                const now = performance.now();
                const delta = now - lastTick;
                lastTick = now;
            }
            updateTimerDisplay();
        }
    }

    [player1, player2].forEach(p => {
        if (p.activePower === "SPEED") {
            p.trail.push({ x: p.x, y: p.y, r: p.r });
            if (p.trail.length > 15) p.trail.shift(); 
        } else {
            if (p.trail.length > 0) p.trail.shift();
        }
    });

    drawField();
    drawPowerUps();

    // Actualizar power-ups timer
    [player1, player2].forEach(p => {
        if (p.powerTimer && p.powerTimer > 0) {
            p.powerTimer--;
            if (p.powerTimer <= 0) {
                p.activePower = null;
            }
        }
    });

    const localKick = currentInputState.kick || keys["space"];
    visiblePlayers.forEach(player => {
        const isLocalPlayer = player.name.trim().toLowerCase() === localPlayerNickname.trim().toLowerCase();
        drawPlayer(player, isLocalPlayer && localKick);
    });

    drawCircle(ball.x, ball.y, ball.r, "#ffffff", "#000000", 1.5);
    // Guarda la referencia del último jugador que tocó la pelota
let lastTouchPlayer = null;

    posts.forEach(post => {
        drawCircle(post.x, post.y, post.r, "#ffffff", "#000000", 1.5);
    });

    if (isCelebration) {
        drawCelebrationOverlay();
        celebrationTimer--;
        if (celebrationTimer <= 0) {
            resetGame();
        }
    }

    requestAnimationFrame(gameLoop);
}

// INICIALIZACIÓN INICIAL BASADA EN EL MAPA CARGADO
updatePostPositions();
resetPositions();
gameLoop();
// Función para registrar quién tocó la pelota por última vez
function trackLastTouch() {
    [player1, player2].forEach(p => {
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= (ball.r + p.r) + 2) {
            lastTouchPlayer = p;
        }
    });
}

const chatInput =
document.getElementById("chatInput");

const sendChat =
document.getElementById("sendChat");

const chatMessages =
document.getElementById("chatMessages");

function enviarMensaje(){

    const mensaje =
    chatInput.value.trim();

    if(!mensaje) return;

    socket.emit(

        "chat:message",

        {

            jugador: nickname,

            mensaje

        }

    );

    chatInput.value="";

}

if (sendChat && chatInput) {
    sendChat.addEventListener("click", enviarMensaje);
    chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter") enviarMensaje();
    });
}

if (socket) {
    socket.on("chat:message", data => {
        if (!chatMessages) return;
        const div = document.createElement("div");
        div.className = "chatMessage";
        div.textContent = `${data.jugador}: ${data.mensaje}`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}