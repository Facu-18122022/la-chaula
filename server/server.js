/**
 * server.js
 * 
 * Punto de entrada principal para el backend del juego.
 * Configura el servidor Express para servir archivos estáticos (frontend),
 * e inicializa Socket.IO para manejar la comunicación en tiempo real
 * (creación de salas, sincronización de la física, jugadores y chat).
 */
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const FisicaLocal = require("./public/js/local/fisica-local.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ SOLUCIÓN: Ruta absoluta
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Redirigir raíz a inicio.html
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'inicio.html'));
});

const PORT = 3000;

// ========================= //
// ESTADO GLOBAL //
// ========================= //

const globalState = {
    players: [],
    rooms: []
};

// Mapa de salas por ID
const roomsMap = new Map();

// ========================= //
// UTILIDADES //
// ========================= //

/**
 * Genera un ID único para la sala
 */
function generateRoomId() {
    return 'room_' + Math.random().toString(36).substr(2, 9) + Date.now();
}

/**
 * Obtiene información de una sala
 */
function getRoomInfo(roomId) {
    return roomsMap.get(roomId);
}

/**
 * Obtiene todas las salas disponibles
 */
function getAvailableRooms() {
    const rooms = [];
    roomsMap.forEach((room, roomId) => {
        rooms.push({
            id: roomId,
            roomName: room.roomName,
            matchTime: room.matchTime,
            goalLimit: room.goalLimit,
            selectedMapIndex: room.selectedMapIndex,
            creatorTeam: room.creatorTeam,
            creatorNickname: room.creatorNickname,
            players: room.players.map(p => ({
                nickname: p.nickname,
                team: p.team
            })),
            createdAt: room.createdAt
        });
    });
    return rooms;
}

function getRoomPublicState(room) {
    if (!room) return null;
    return {
        id: room.id,
        roomName: room.roomName,
        matchTime: room.matchTime,
        goalLimit: room.goalLimit,
        selectedMapIndex: room.selectedMapIndex,
        creatorTeam: room.creatorTeam,
        creatorNickname: room.creatorNickname,
        players: room.players.map(p => ({ nickname: p.nickname, team: p.team, id: p.id, isAdmin: p.isAdmin })),
        matchActive: !!room.matchActive,
        settings: room.settings,
        createdAt: room.createdAt
    };
}

/**
 * Equilibra los equipos en una sala
 */
function normalizePlayerTeam(player) {
    if (!player) return;
    if (typeof player.team === 'string') {
        const normalized = player.team.trim().toLowerCase();
        if (normalized === 'red' || normalized === 'blue') {
            player.team = normalized;
            return;
        }
    }
    player.team = null;
}

function normalizeRoomTeams(room) {
    if (!room || !Array.isArray(room.players)) return;
    room.players.forEach(normalizePlayerTeam);
}

function assignTeamToNewPlayer(room, player) {
    normalizeRoomTeams(room);
    const redCount = room.players.filter(p => p.team === 'red').length;
    const blueCount = room.players.filter(p => p.team === 'blue').length;
    player.team = redCount <= blueCount ? 'red' : 'blue';
}

function rebalanceRoomTeams(room) {
    if (!room || !Array.isArray(room.players)) return;

    room.players.forEach(normalizePlayerTeam);

    const redPlayers = room.players.filter(p => p.team === 'red');
    const bluePlayers = room.players.filter(p => p.team === 'blue');
    const unassigned = room.players.filter(p => !p.team);

    unassigned.forEach(player => {
        if (redPlayers.length <= bluePlayers.length) {
            player.team = 'red';
            redPlayers.push(player);
        } else {
            player.team = 'blue';
            bluePlayers.push(player);
        }
    });

    while (redPlayers.length - bluePlayers.length > 1) {
        const moved = redPlayers.pop();
        if (!moved) break;
        moved.team = 'blue';
        bluePlayers.push(moved);
    }

    while (bluePlayers.length - redPlayers.length > 1) {
        const moved = bluePlayers.pop();
        if (!moved) break;
        moved.team = 'red';
        redPlayers.push(moved);
    }
}

/**
 * Limpia las salas sin jugadores
 */
function cleanEmptyRooms() {
    const roomsToDelete = [];
    const now = Date.now();

    roomsMap.forEach((room, roomId) => {
        if (Array.isArray(room.players) && room.players.length > 0) {
            const remainingPlayers = room.players.filter(player => !player.disconnectedAt || (now - player.disconnectedAt) < 10000);
            if (remainingPlayers.length !== room.players.length) {
                room.players = remainingPlayers;
                if (room.players.length > 0) {
                    io.to(roomId).emit('lobby:update', getRoomPublicState(room));
                } else {
                    room.emptySince = now;
                }
            }
        }

        if (room.players.length === 0) {
            if (!room.emptySince) {
                room.emptySince = now;
                return;
            }
            if (now - room.emptySince >= 10000) {
                roomsToDelete.push(roomId);
            }
        }
    });

    roomsToDelete.forEach(roomId => {
        const room = roomsMap.get(roomId);
        if (room) {
            stopRoomGameLoop(room);
        }
        roomsMap.delete(roomId);
        io.emit('room:deleted', roomId);
        console.log(`Sala ${roomId} eliminada (vacía después de espera)`);
    });
}

function getMapConfig(index) {
    const maps = [
        { width: 800, height: 400, goalHeight: 110 },
        { width: 820, height: 390, goalHeight: 95 },
        { width: 1020, height: 510, goalHeight: 140 },
        { width: 1000, height: 500, goalHeight: 135 },
        { width: 1300, height: 640, goalHeight: 180 }
    ];
    return maps[index] || maps[0];
}

function createRoomGameState(room) {
    const map = getMapConfig(room.selectedMapIndex);
    const players = room.players.slice(0, 2).map(player => {
        const team = String(player.team || 'red').trim().toLowerCase() === 'blue' ? 'blue' : 'red';
        return {
            id: player.nickname,
            equipo: team,
            rBase: 20
        };
    });
    const kickoffTeam = players.find(player => player.equipo === 'red') ? 'red' : 'blue';
    const estadoFisica = FisicaLocal.crearEstado({
        mapa: map,
        ladoIzquierdo: 'blue',
        kickoffTeam,
        jugadores: players
    });
    estadoFisica.kickoffPlayerId = players.find(player => player.equipo === kickoffTeam)?.id || estadoFisica.players[0]?.id;
    estadoFisica.players.forEach(player => {
        player.nickname = player.id;
        player.team = player.equipo;
    });

    return {
        active: true,
        lastTick: Date.now(),
        map,
        physicsState: estadoFisica,
        field: estadoFisica.field,
        goalWidth: 45,
        goalTop: estadoFisica.goalTop,
        goalBottom: estadoFisica.goalBottom,
        players: estadoFisica.players,
        inputStates: {},
        scores: { blue: 0, red: 0 },
        remainingMs: (room.matchTime || 5) * 60 * 1000,
        overtimeMs: 0,
        overtime: false,
        phase: 'SAQUE',
        paused: false,
        servingTeam: kickoffTeam,
        goalLimit: Number(room.goalLimit) || null,
        intervalId: null
    };
}

function stopRoomGameLoop(room) {
    if (!room || !room.game) return;
    if (room.game.intervalId) {
        clearInterval(room.game.intervalId);
        room.game.intervalId = null;
    }
}

function broadcastRoomGameState(room) {
    if (!room || !room.game) return;
    const physicsState = room.game.physicsState;
    io.to(room.id).emit('game:state', {
        roomId: room.id,
        players: physicsState.players.map(p => ({
            nickname: p.nickname,
            team: p.equipo,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            r: p.r,
            activePower: p.activePower || null,
            powerTimer: p.powerTimer || 0
        })),
        ball: {
            x: physicsState.ball.x,
            y: physicsState.ball.y,
            vx: physicsState.ball.vx,
            vy: physicsState.ball.vy,
            r: physicsState.ball.r
        },
        activePowerUps: physicsState.activePowerUps || [],
        scores: room.game.scores,
        remainingMs: room.game.remainingMs,
        timerStarted: !!room.game.physicsState.timerStarted,
        waitingForKickOff: !!room.game.physicsState.waitingForKickOff,
        paused: !!room.game.paused,
        overtime: !!room.game.overtime,
        overtimeMs: room.game.overtimeMs,
        phase: room.game.phase,
        servingTeam: room.game.servingTeam,
        goalLimit: room.game.goalLimit
    });
}

function processRoomGameTick(room) {
    if (!room || !room.game || !room.game.active) return;
    const now = Date.now();
    if (room.game.paused) {
        room.game.lastTick = now;
        return;
    }
    const deltaMs = now - room.game.lastTick;
    room.game.lastTick = now;
    const physicsState = room.game.physicsState;
    const result = FisicaLocal.avanzar(physicsState, Math.min(Math.max(deltaMs, 0), 250), room.game.inputStates);
    const goalEvent = result.eventos.includes('gol');

    if (goalEvent) {
        const goalTeam = physicsState.lastGoalTeam;
        room.game.scores[goalTeam] += 1;
        room.game.servingTeam = goalTeam === 'red' ? 'blue' : 'red';
        room.game.phase = 'GOL';
        physicsState.kickoffTeam = room.game.servingTeam;
        physicsState.kickoffPlayerId = room.game.players.find(player => player.equipo === room.game.servingTeam)?.id;
        io.to(room.id).emit('game:goal', {
            scorer: physicsState.lastTouch || 'Jugador',
            team: goalTeam,
            roomId: room.id
        });
        const reachedGoalLimit = room.game.goalLimit != null && room.game.scores[goalTeam] >= room.game.goalLimit;
        if (reachedGoalLimit || room.game.overtime) {
            finishRoomGame(room);
            return;
        }
        room.game.phase = 'SAQUE';
    }

    if (physicsState.timerStarted && !room.game.overtime) {
        room.game.remainingMs = Math.max(0, room.game.remainingMs - deltaMs);
    } else if (room.game.overtime) {
        room.game.overtimeMs += deltaMs;
    }

    if (room.game.remainingMs <= 0 && !room.game.overtime && physicsState.timerStarted) {
        if (room.game.scores.red === room.game.scores.blue) {
            room.game.overtime = true;
            room.game.phase = 'TIEMPO_EXTRA';
        } else {
            finishRoomGame(room);
            return;
        }
    }

    if (physicsState.timerStarted && room.game.phase === 'SAQUE') room.game.phase = 'JUGANDO';
    broadcastRoomGameState(room);
}

function finishRoomGame(room) {
    room.matchActive = false;
    room.game.active = false;
    room.game.phase = 'FIN';
    stopRoomGameLoop(room);
    io.to(room.id).emit('match:ended', {
        roomId: room.id,
        scores: room.game.scores
    });
    broadcastRoomGameState(room);
}

function startRoomGameLoop(room) {
    if (!room || !room.game || room.game.intervalId) return;
    room.game.lastTick = Date.now();
    room.game.intervalId = setInterval(() => processRoomGameTick(room), 50);
}

// ========================= //
// TICK RATE / LIMPIEZA //
// ========================= //

// Limpiar salas vacías periódicamente, pero no emitir actualizaciones constantes.
setInterval(() => {
    cleanEmptyRooms();
}, 5000);

// ========================= //
// CONEXIÓN SOCKET IO //
// ========================= //

io.on("connection", (socket) => {

    console.log("Jugador conectado:", socket.id);

    // ========================= //
    // PLAYER JOIN //
    // ========================= //

    socket.on("player:join", (data) => {
        const player = {
            id: socket.id,
            nickname: data.nickname,
            team: null,
            isAdmin: false,
            stats: {
                goals: 0,
                assists: 0,
                saves: 0,
                matches: 0,
                losses: 0,
                wins: 0,
                points: 0
            }
        };

        globalState.players.push(player);
        console.log(`${data.nickname} se unió`);
    });

    // ========================= //
    // ROOMS - SOLICITAR LISTA //
    // ========================= //

    socket.on('rooms:request', () => {
        const rooms = getAvailableRooms();
        socket.emit('rooms:list', rooms);
        console.log(`Enviando ${rooms.length} salas disponibles`);
    });

    // ========================= //
    // ROOMS - CREAR SALA //
    // ========================= //

    socket.on('room:create', (roomData, callback) => {
        const roomId = generateRoomId();
        const creatorNickname = 'Player 1';
        
        const normalizedCreatorTeam = roomData.creatorTeam && String(roomData.creatorTeam).trim().toLowerCase() === 'blue' ? 'blue' : 'red';
        const room = {
            id: roomId,
            roomName: roomData.roomName || `Sala de ${creatorNickname}`,
            matchTime: roomData.matchTime,
            goalLimit: roomData.goalLimit,
            selectedMapIndex: roomData.selectedMapIndex,
            creatorTeam: normalizedCreatorTeam,
            creatorNickname,
            players: [],
            matchActive: false,
            emptySince: null,
            settings: {
                timeLimit: roomData.matchTime,
                goalLimit: roomData.goalLimit,
                powersEnabled: true,
                selectedMap: roomData.selectedMapIndex,
                gameMode: "Classic"
            },
            createdAt: Date.now()
        };

        roomsMap.set(roomId, room);
        
        // Unir el creador a la sala
        const creatorPlayer = {
            id: socket.id,
            nickname: creatorNickname,
            team: normalizedCreatorTeam,
            isAdmin: true,
            stats: {
                goals: 0,
                assists: 0,
                saves: 0,
                matches: 0,
                losses: 0,
                wins: 0,
                points: 0
            }
        };
        
        room.players.push(creatorPlayer);
        socket.join(roomId);
        
        console.log(`Sala creada: ${roomId} por ${creatorNickname}`);
        
        // Callback para enviar el ID de la sala al cliente
        if (callback) callback(roomId);
        
        // Emitir actualización a todos
        io.emit('rooms:updated', getAvailableRooms());
        io.to(roomId).emit('lobby:update', getRoomPublicState(room));
        socket.emit('room:joined', { roomId, room: getRoomPublicState(room) });
    });

    // ========================= //
    // ROOMS - UNIRSE A SALA //
    // ========================= //

    socket.on('player:joinRoom', (data) => {
        const room = getRoomInfo(data.roomId);
        
        if (!room) {
            socket.emit('room:error', 'La sala no existe');
            console.log(`Error: Intento de unirse a sala inexistente ${data.roomId}`);
            return;
        }

        if (room.matchActive) {
            socket.emit('room:error', 'La partida ya inició en esta sala');
            console.log(`Error: Intento de unirse a sala en juego ${data.roomId}`);
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('room:error', 'El modo online es 1v1 y la sala está llena');
            console.log(`Error: Intento de unirse a sala llena ${data.roomId}`);
            return;
        }

        // Crear jugador
        const nickname = `Player ${room.players.length + 1}`;
        const player = {
            id: socket.id,
            nickname,
            team: null,
            isAdmin: false,
            stats: {
                goals: 0,
                assists: 0,
                saves: 0,
                matches: 0,
                losses: 0,
                wins: 0,
                points: 0
            }
        };

        room.players.push(player);
        room.emptySince = null;
        socket.join(data.roomId);
        
        assignTeamToNewPlayer(room, player);
        normalizeRoomTeams(room);
        
        console.log(`${nickname} se unió a la sala ${data.roomId}`);
        
        // Emitir eventos
        io.to(data.roomId).emit('lobby:update', getRoomPublicState(room));
        io.to(data.roomId).emit('room:playerJoined', {
            nickname,
            playerCount: room.players.length
        });
        io.emit('rooms:updated', getAvailableRooms());
        socket.emit('room:joined', { roomId: data.roomId, room: getRoomPublicState(room) });
    });

    socket.on('room:join', (data) => {
        const roomId = String(data.roomId || '').trim();
        const nickname = String(data.nickname || '').trim();
        const room = getRoomInfo(roomId);
        if (!room) {
            socket.emit('room:error', 'La sala no existe');
            return;
        }

        normalizeRoomTeams(room);
        const existingPlayer = room.players.find(p => p.nickname && p.nickname.trim().toLowerCase() === nickname.toLowerCase());
        if (room.matchActive && !existingPlayer) {
            socket.emit('room:error', 'La partida ya inició en esta sala');
            return;
        }

        if (existingPlayer) {
            existingPlayer.id = socket.id;
        } else {
            if (room.players.length >= 2) {
                socket.emit('room:error', 'El modo online es 1v1 y la sala está llena');
                return;
            }
            const newPlayer = {
                id: socket.id,
                nickname: data.nickname,
                team: null,
                isAdmin: false,
                stats: {
                    goals: 0,
                    assists: 0,
                    saves: 0,
                    matches: 0,
                    losses: 0,
                    wins: 0,
                    points: 0
                }
            };
            assignTeamToNewPlayer(room, newPlayer);
            room.players.push(newPlayer);
        }

        room.emptySince = null;
        socket.join(data.roomId);
        io.to(data.roomId).emit('lobby:update', getRoomPublicState(room));
        io.to(data.roomId).emit('room:playerJoined', {
            nickname: data.nickname,
            playerCount: room.players.length
        });
        io.emit('rooms:updated', getAvailableRooms());
        socket.emit('room:joined', { roomId: data.roomId, room: getRoomPublicState(room) });

        if (room.matchActive && room.game) {
            socket.emit('match:started', {
                roomId: room.id,
                matchTime: room.matchTime,
                goalLimit: room.goalLimit,
                selectedMapIndex: room.selectedMapIndex,
                players: room.players.map(p => ({ nickname: p.nickname, team: p.team })),
                settings: room.settings
            });
            socket.emit('game:state', {
                roomId: room.id,
                players: room.game.physicsState.players.map(p => ({
                    nickname: p.nickname,
                    team: p.equipo,
                    x: p.x,
                    y: p.y,
                    vx: p.vx,
                    vy: p.vy,
                    r: p.r
                })),
                ball: {
                    x: room.game.physicsState.ball.x,
                    y: room.game.physicsState.ball.y,
                    vx: room.game.physicsState.ball.vx,
                    vy: room.game.physicsState.ball.vy,
                    r: room.game.physicsState.ball.r
                },
                scores: room.game.scores,
                remainingMs: room.game.remainingMs,
                timerStarted: !!room.game.physicsState.timerStarted,
                waitingForKickOff: !!room.game.physicsState.waitingForKickOff,
                paused: !!room.game.paused,
                overtime: !!room.game.overtime,
                overtimeMs: room.game.overtimeMs,
                phase: room.game.phase,
                servingTeam: room.game.servingTeam,
                goalLimit: room.game.goalLimit
            });
        }
    });

    // ========================= //
    // CHAT //
    // ========================= //

    socket.on("chat:message", (data) => {
        io.emit("chat:message", {
            jugador: data.jugador,
            mensaje: data.mensaje,
            timestamp: Date.now()
        });
    });

    socket.on("game:chat", (data) => {
        io.emit("game:chat", {
            nickname: data.nickname,
            message: data.message,
            team: data.team,
            timestamp: Date.now()
        });
    });

    // ========================= //
    // GAME EVENTS //
    // ========================= //

    socket.on('game:goal', (data) => {
        if (!data || !data.scorer) return;

        let scorer = globalState.players.find(p => p.nickname === data.scorer);
        if (!scorer) {
            scorer = {
                id: null,
                nickname: data.scorer,
                team: null,
                isAdmin: false,
                stats: {
                    goals: 0,
                    assists: 0,
                    saves: 0,
                    matches: 0,
                    losses: 0,
                    wins: 0,
                    points: 0
                }
            };
            globalState.players.push(scorer);
        }
        
        scorer.stats.goals = (scorer.stats.goals || 0) + 1;
        scorer.stats.points = (scorer.stats.points || 0) + 100;

        if (data.assister) {
            let assister = globalState.players.find(p => p.nickname === data.assister);
            if (!assister) {
                assister = {
                    id: null,
                    nickname: data.assister,
                    team: null,
                    isAdmin: false,
                    stats: {
                        goals: 0,
                        assists: 0,
                        saves: 0,
                        matches: 0,
                        losses: 0,
                        wins: 0,
                        points: 0
                    }
                };
                globalState.players.push(assister);
            }
            assister.stats.assists = (assister.stats.assists || 0) + 1;
            assister.stats.points = (assister.stats.points || 0) + 50;
        }

        io.emit('lobby:update', globalState);
    });

    socket.on('game:save', (data) => {
        if (!data || !data.nickname) return;

        let saver = globalState.players.find(p => p.nickname === data.nickname);
        if (!saver) {
            saver = {
                id: null,
                nickname: data.nickname,
                team: null,
                isAdmin: false,
                stats: {
                    goals: 0,
                    assists: 0,
                    saves: 0,
                    matches: 0,
                    losses: 0,
                    wins: 0,
                    points: 0
                }
            };
            globalState.players.push(saver);
        }

        saver.stats.saves = (saver.stats.saves || 0) + 1;
        saver.stats.points = (saver.stats.points || 0) + 15;
        io.emit('lobby:update', globalState);
    });

    socket.on('game:input', (data) => {
        if (!data || !data.roomId || !data.input) return;
        const roomId = String(data.roomId || '').trim();
        const room = getRoomInfo(roomId);
        if (!room || !room.game) return;

        const player = room.players.find(p => p.id === socket.id && !p.disconnectedAt);
        if (!player) return;

        room.game.inputStates[player.nickname] = {
            up: !!data.input.up,
            down: !!data.input.down,
            left: !!data.input.left,
            right: !!data.input.right,
            kick: !!data.input.kick
        };
    });

    socket.on('game:pause', (data = {}) => {
        const roomId = String(data.roomId || '').trim();
        const room = getRoomInfo(roomId);
        if (!room || !room.game || !room.game.active) return;
        const player = room.players.find(p => p.id === socket.id && !p.disconnectedAt);
        if (!player) return;
        room.game.paused = data.paused == null ? !room.game.paused : !!data.paused;
        room.game.lastTick = Date.now();
        broadcastRoomGameState(room);
    });

    // ========================= //
    // ADMIN SETTINGS //
    // ========================= //

    socket.on("admin:updateSettings", (settings) => {
        globalState.settings = {
            ...globalState.settings,
            ...settings
        };
        io.emit("lobby:update", globalState);
    });

    // ========================= //
    // MATCH //
    // ========================= //

    socket.on("match:start", (data) => {
        const roomId = String(data.roomId || '').trim();
        const room = getRoomInfo(roomId);
        if (!room) {
            socket.emit('room:error', 'La sala no existe');
            return;
        }

        if (room.matchActive) {
            socket.emit('room:error', 'La partida ya está en curso');
            return;
        }

        if (room.players.filter(player => !player.disconnectedAt).length !== 2) {
            socket.emit('room:error', 'El modo online requiere exactamente 2 jugadores');
            return;
        }

        room.matchActive = true;
        room.game = createRoomGameState(room);
        room.emptySince = null;
        io.to(roomId).emit("match:started", {
            roomId,
            matchTime: room.matchTime,
            goalLimit: room.goalLimit,
            selectedMapIndex: room.selectedMapIndex,
            players: room.players.map(p => ({ nickname: p.nickname, team: p.team })),
            settings: room.settings
        });

        startRoomGameLoop(room);
    });

    socket.on("match:ended", (data) => {
        try {
            globalState.matchActive = false;

            if (data && data.winnerName) {
                let winner = globalState.players.find(p => p.nickname === data.winnerName);
                if (!winner) {
                    winner = {
                        id: null,
                        nickname: data.winnerName,
                        team: null,
                        isAdmin: false,
                        stats: {
                            goals: 0,
                            assists: 0,
                            saves: 0,
                            matches: 0,
                            losses: 0,
                            wins: 0,
                            points: 0
                        }
                    };
                    globalState.players.push(winner);
                }
                
                winner.stats.wins = (winner.stats.wins || 0) + 1;
                winner.stats.points = (winner.stats.points || 0) + 30;

                globalState.players.forEach(p => {
                    p.stats.matches = (p.stats.matches || 0) + 1;
                    if (p.nickname !== data.winnerName) {
                        p.stats.losses = (p.stats.losses || 0) + 1;
                    }
                });
            } else {
                globalState.players.forEach(p => {
                    p.stats.matches = (p.stats.matches || 0) + 1;
                });
            }

            io.emit("lobby:update", globalState);
        } catch (e) {
            console.error('Error procesando match:ended', e);
        }
    });

    // ========================= //
    // DISCONNECT //
    // ========================= //

    socket.on("disconnect", () => {
        // Remover del estado global
        globalState.players = globalState.players.filter(
            player => player.id !== socket.id
        );

        // Remover de todas las salas
        roomsMap.forEach((room, roomId) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const disconnectedPlayer = room.players[playerIndex];
                disconnectedPlayer.disconnectedAt = Date.now();
                if (room.players.length === 0) {
                    room.emptySince = Date.now();
                }
                
                // Emitir notificación en la sala si el jugador queda visible temporalmente
                io.to(roomId).emit('room:playerLeft', {
                    nickname: disconnectedPlayer.nickname,
                    playerCount: room.players.length
                });
                
                // Equilibrar equipos si quedan jugadores visibles
                const activePlayers = room.players.filter(p => !p.disconnectedAt);
                if (activePlayers.length > 0) {
                    rebalanceRoomTeams(room);
                    io.to(roomId).emit('lobby:update', getRoomPublicState(room));
                }
                
                console.log(`${disconnectedPlayer.nickname} desconectado de sala ${roomId}`);
            }
        });

        // Limpiar salas vacías
        cleanEmptyRooms();

        console.log("Jugador desconectado:", socket.id);
    });

});

// ========================= //
// SERVIDOR ESCUCHANDO //
// ========================= //

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════╗
║          🟡  La Chaula  🟡            ║
╠══════════════════════════════════════╣
║  Servidor corriendo en               ║
║  http://localhost:${PORT}             ║
║                                      ║
║  Gestión de salas habilitada         ║
╚══════════════════════════════════════╝
`);
});