/**
 * lobby.js
 * 
 * Controlador de la sala de espera (Lobby) en el modo multijugador online.
 * Maneja la lista de jugadores conectados, la asignación de equipos,
 * los ajustes de la partida (tiempo, límite de goles, mapa) y el chat de texto.
 */
const serverURL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 3000}`;
const socket = io(serverURL);

const roomNameEl = document.querySelector('.room-info h1');
const roomIdEl = document.querySelector('.room-info p');
const redTeam = document.getElementById('redTeam');
const blueTeam = document.getElementById('blueTeam');
const matchDurationEl = document.getElementById('matchDurationValue');
const goalLimitEl = document.getElementById('goalLimitValue');
const mapNameEl = document.getElementById('mapNameValue');
const startGameButton = document.getElementById('startGameButton');
const backButton = document.getElementById('backButton');
const chatInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const chatMessages = document.getElementById('chatMessages');
const changeTeamButton = document.getElementById('changeTeamButton');

const nickname = localStorage.getItem('jugador') || 'Jugador';
const roomId = (localStorage.getItem('roomId') || '').trim();
let currentRoom = null;

const MAP_NAMES = [
    'Classic Arena (1v1)',
    'Street Arena (1v1)',
    'Frozen Arena (3v3)',
    'Desert Arena (3v3)',
    'Champions Arena (6v6)'
];

function formatRoomInfo(room) {
    if (!room) return;
    if (roomNameEl) roomNameEl.textContent = room.roomName || 'Sala';
    if (roomIdEl) roomIdEl.textContent = `ID: ${room.id || roomId}`;
    if (matchDurationEl) matchDurationEl.textContent = `${room.matchTime || 5} Min`;
    if (goalLimitEl) goalLimitEl.textContent = `${room.goalLimit || 5} Goles`;
    if (mapNameEl) mapNameEl.textContent = MAP_NAMES[room.selectedMapIndex] || MAP_NAMES[0];
}

function renderTeamLists(room) {
    if (!room) return;

    const redPlayers = room.players.filter(player => player.team && player.team.toLowerCase() === 'red');
    const bluePlayers = room.players.filter(player => player.team && player.team.toLowerCase() === 'blue');

    redTeam.innerHTML = redPlayers.length
        ? redPlayers.map(player => `<div class="player">${player.nickname}</div>`).join('')
        : '<div class="player empty">Sin jugadores</div>';

    blueTeam.innerHTML = bluePlayers.length
        ? bluePlayers.map(player => `<div class="player">${player.nickname}</div>`).join('')
        : '<div class="player empty">Sin jugadores</div>';
}

function renderRoom(room) {
    currentRoom = room;
    formatRoomInfo(room);
    renderTeamLists(room);

    localStorage.setItem('matchTime', String(room.matchTime || 5));
    localStorage.setItem('goalLimit', String(room.goalLimit || 5));
    localStorage.setItem('selectedMapIndex', String(room.selectedMapIndex || 0));

    const localPlayer = room.players.find(p => p.nickname === nickname);
    if (localPlayer && localPlayer.team) {
        localStorage.setItem('equipoSeleccionado', String(localPlayer.team));
    } else {
        localStorage.setItem('equipoSeleccionado', String(room.creatorTeam || 'red'));
    }
}

function joinRoom() {
    if (!roomId) return;
    socket.emit('room:join', { roomId: roomId.trim(), nickname });
}

function sendChatMessage() {
    const message = chatInput?.value.trim();
    if (!message) return;

    socket.emit('chat:message', {
        jugador: nickname,
        mensaje: message
    });

    if (chatInput) chatInput.value = '';
}

function appendChatMessage(text) {
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = 'chatMessage';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

socket.on('connect', () => {
    console.log('Conectado al servidor de lobby');
    joinRoom();
});

socket.on('room:joined', (data) => {
    if (data?.roomId !== roomId) return;
    console.log('Unido a la sala:', data.roomId);
    if (data.room) renderRoom(data.room);
});

socket.on('lobby:update', (room) => {
    if (!room || room.id !== roomId) return;
    renderRoom(room);
});

socket.on('room:error', (message) => {
    alert(message || 'Error al unirse a la sala');
    if (!currentRoom) {
        window.location.href = '../pages/jugar.html';
    }
});

socket.on('chat:message', (data) => {
    appendChatMessage(`${data.jugador}: ${data.mensaje}`);
});

if (sendButton) {
    sendButton.addEventListener('click', sendChatMessage);
}

if (chatInput) {
    chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            sendChatMessage();
        }
    });
}

if (backButton) {
    backButton.addEventListener('click', () => {
        window.location.href = '../pages/crear-sala.html';
    });
}

if (startGameButton) {
    startGameButton.addEventListener('click', () => {
        if (!currentRoom) {
            alert('Espera a que la sala se cargue antes de iniciar el juego.');
            return;
        }

        socket.emit('match:start', { roomId: currentRoom.id });
    });
}

socket.on('match:started', (data) => {
    if (!data || data.roomId !== roomId) return;

    localStorage.setItem('roomId', data.roomId);
    localStorage.setItem('matchTime', String(data.matchTime || 5));
    localStorage.setItem('goalLimit', String(data.goalLimit || 5));
    localStorage.setItem('selectedMapIndex', String(data.selectedMapIndex || 0));

    window.location.href = '../pages/juego.html';
});

if (changeTeamButton) {
    changeTeamButton.textContent = 'Equipo automático';
    changeTeamButton.disabled = true;
}

window.addEventListener('DOMContentLoaded', () => {
    if (!roomId) {
        alert('No se encontró una sala activa. Regresa a jugar.');
        window.location.href = '../pages/jugar.html';
        return;
    }

    if (roomNameEl) roomNameEl.textContent = 'Cargando sala...';
    if (roomIdEl) roomIdEl.textContent = `ID: ${roomId}`;
});