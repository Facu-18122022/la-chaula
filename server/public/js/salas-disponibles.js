/* ========================= */
/* VARIABLES GLOBALES */
/* ========================= */

const serverURL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 3000}`;
const socket = io(serverURL);

const roomsList = document.getElementById('roomsList');
const joinRoomButton = document.getElementById('joinRoomButton');
const backButton = document.getElementById('backButton');

const nickname = localStorage.getItem('jugador') || 'Jugador';

let selectedRoomId = null;
let availableRooms = [];

/* ========================= */
/* INICIALIZACIÓN */
/* ========================= */

document.addEventListener('DOMContentLoaded', () => {
    if (joinRoomButton) joinRoomButton.disabled = true;
    requestRoomsUpdate();
});

socket.on('connect', () => {
    console.log('Conectado al servidor de salas');
    requestRoomsUpdate();
});

socket.on('connect_error', (error) => {
    console.error('Error de conexión:', error);
    if (roomsList) {
        roomsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <p>No se pudo conectar al servidor</p>
                <p style="font-size: 0.9rem; opacity: 0.5;">Verifica la dirección IP y el puerto</p>
            </div>
        `;
    }
});

/* ========================= */
/* SOLICITAR LISTA DE SALAS */
/* ========================= */

function requestRoomsUpdate() {
    socket.emit('rooms:request');
}

/* ========================= */
/* RECIBIR LISTA DE SALAS */
/* ========================= */

socket.on('rooms:list', (rooms) => {
    console.log('Salas recibidas:', rooms);
    availableRooms = rooms;
    renderRooms(rooms);
});

socket.on('room:joined', (data) => {
    console.log('Sala unida correctamente:', data);
    if (data && data.roomId === selectedRoomId) {
        window.location.href = '../pages/lobby.html';
    }
});

socket.on('room:error', (message) => {
    console.error('Error al unirse a la sala:', message);
    alert(message || 'No se pudo unir a la sala. Intenta nuevamente.');
    joinRoomButton.disabled = false;
});

/* ========================= */
/* RENDERIZAR SALAS */
/* ========================= */

function renderRooms(rooms) {
    
    if (!Array.isArray(rooms) || rooms.length === 0) {
        roomsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏟️</div>
                <p>No hay salas disponibles en este momento</p>
                <p style="font-size: 0.9rem; opacity: 0.5;">Crea una nueva sala o intenta más tarde</p>
            </div>
        `;
        return;
    }

    roomsList.innerHTML = '';

    rooms.forEach(room => {
        const playerCount = room.players ? room.players.length : 0;
        const maxPlayers = 12;
        const fillPercentage = (playerCount / maxPlayers) * 100;

        let statusClass = 'available';
        let statusText = 'DISPONIBLE';

        if (playerCount >= maxPlayers) {
            statusClass = 'full';
            statusText = 'LLENO';
        } else if (playerCount >= 8) {
            statusClass = 'almost-full';
            statusText = 'CASI LLENO';
        }

        const roomCard = document.createElement('div');
        roomCard.className = 'room-card';
        roomCard.dataset.roomId = room.id;

        const mapNames = [
            "Classic Arena (1v1)",
            "Street Arena (1v1)",
            "Frozen Arena (3v3)",
            "Desert Arena (3v3)",
            "Champions Arena (6v6)"
        ];

        const mapName = mapNames[room.selectedMapIndex] || "Mapa desconocido";

        roomCard.innerHTML = `
            <div class="room-header">
                <div class="room-name">${room.roomName || 'Sala sin nombre'}</div>
                <div class="room-status ${statusClass}">${statusText}</div>
            </div>

            <div class="room-info">
                <div class="info-item">
                    <span class="info-label">Duración</span>
                    <span class="info-value">${room.matchTime || 5} min</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Objetivo</span>
                    <span class="info-value">${room.goalLimit || 5} goles</span>
                </div>
            </div>

            <div class="players-info">
                <div class="players-bar">
                    <div class="players-fill" style="width: ${fillPercentage}%"></div>
                </div>
                <span class="players-text">${playerCount}/${maxPlayers}</span>
            </div>

            <span class="map-badge">📍 ${mapName}</span>
        `;

        roomCard.setAttribute('tabindex', '0');
        roomCard.setAttribute('role', 'button');
        roomCard.style.cursor = 'pointer';
        if (selectedRoomId === room.id) {
            roomCard.classList.add('selected');
            if (joinRoomButton) joinRoomButton.disabled = false;
        }

        roomCard.addEventListener('click', () => {
            selectRoom(room.id, roomCard);
        });

        roomCard.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectRoom(room.id, roomCard);
            }
        });

        roomsList.appendChild(roomCard);
    });
}

/* ========================= */
/* SELECCIONAR SALA */
/* ========================= */

function selectRoom(roomId, cardElement) {
    if (!roomsList || !joinRoomButton) return;

    // Desseleccionar anterior
    const previousSelected = roomsList.querySelector('.room-card.selected');
    if (previousSelected) {
        previousSelected.classList.remove('selected');
    }

    // Seleccionar nueva
    selectedRoomId = roomId;
    cardElement.classList.add('selected');
    joinRoomButton.disabled = false;
    console.log('Sala seleccionada:', roomId);
    console.log('Botón Unirse habilitado:', !joinRoomButton.disabled);
}

/* ========================= */
/* UNIRSE A SALA */
/* ========================= */

if (joinRoomButton) {
    joinRoomButton.addEventListener('click', () => {
        
        if (!selectedRoomId) {
            alert('Por favor selecciona una sala');
            return;
        }
    
        const selectedRoom = availableRooms.find(r => r.id === selectedRoomId);
        
        if (!selectedRoom) {
            alert('La sala no existe');
            return;
        }

        const playerCount = selectedRoom.players ? selectedRoom.players.length : 0;
        
        if (playerCount >= 12) {
            alert('La sala está llena');
            return;
        }

        // Guardar datos de configuración local para el lobby
        localStorage.setItem('roomId', selectedRoomId);
        localStorage.setItem('matchTime', String(selectedRoom.matchTime));
        localStorage.setItem('goalLimit', String(selectedRoom.goalLimit));
        localStorage.setItem('selectedMapIndex', String(selectedRoom.selectedMapIndex));
        localStorage.setItem('equipoSeleccionado', selectedRoom.creatorTeam || 'red');

        // Emitir evento al servidor y esperar la confirmación
        joinRoomButton.disabled = true;
        socket.emit('player:joinRoom', {
            roomId: selectedRoomId,
            nickname: localStorage.getItem('jugador') || 'Jugador'
        });
    });
}

/* ========================= */
/* VOLVER */
/* ========================= */

backButton.addEventListener('click', () => {
    window.location.href = '../pages/jugar.html';
});

/* ========================= */
/* ACTUALIZACIÓN EN TIEMPO REAL */
/* ========================= */

socket.on('rooms:updated', (rooms) => {
    console.log('Salas actualizadas');
    availableRooms = rooms;
    
    // Mantener selección si existe
    const currentSelectedId = selectedRoomId;
    renderRooms(rooms);
    
    // Re-seleccionar si la sala aún existe
    if (currentSelectedId && rooms.some(r => r.id === currentSelectedId)) {
        const reselectedCard = roomsList.querySelector(`[data-room-id="${currentSelectedId}"]`);
        if (reselectedCard) {
            selectRoom(currentSelectedId, reselectedCard);
        }
    } else {
        selectedRoomId = null;
        if (joinRoomButton) joinRoomButton.disabled = true;
    }
});

/* ========================= */
/* MANEJAR DESCONEXIÓN */
/* ========================= */

socket.on('disconnect', () => {
    console.log('Desconectado del servidor');
});

socket.on('connect_error', (error) => {
    console.error('Error de conexión:', error);
    roomsList.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">❌</div>
            <p>No se pudo conectar al servidor</p>
            <p style="font-size: 0.9rem; opacity: 0.5;">Por favor, intenta más tarde</p>
        </div>
    `;
});
