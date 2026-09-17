// ========================= //
// SOCKET IO - CONFIGURACIÓN //
// ========================= //

// Detectar IP del servidor automáticamente (MEJORADO PARA RED LAN)
function getServerURL() {
    // Obtener protocolo, hostname y puerto
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port || 3000;
    
    // Construir URL
    const url = `${protocol}//${hostname}:${port}`;
    
    console.log('🌐 Conectando a Socket.IO en:', url);
    return url;
}

const serverURL = getServerURL();

// Crear conexión Socket.IO con opciones para LAN
const socket = io(serverURL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'], // Websocket primero, luego polling como fallback
    upgrade: true
});

const nickname = localStorage.getItem('jugador') || 'Jugador';

// ========================= //
// CONEXIÓN //
// ========================= //

socket.on('connect', () => {
    console.log('✅ Conectado a Socket.IO');
    
    // Unirse con el nickname
    socket.emit('player:join', {
        nickname: nickname
    });
});

socket.on('disconnect', () => {
    console.log('❌ Desconectado del servidor');
});

socket.on('connect_error', (error) => {
    console.error('⚠️ Error de conexión:', error);
});

socket.on('error', (error) => {
    console.error('❌ Error del servidor:', error);
});

// ========================= //
// LOBBY //
// ========================= //

socket.on('lobby:update', (state) => {
    console.log('🔄 Lobby actualizado', state);
});

// ========================= //
// CHAT //
// ========================= //

socket.on('chat:message', (message) => {
    console.log('💬 Mensaje de chat:', message);
});

socket.on('game:chat', (message) => {
    console.log('🎮 Mensaje en juego:', message);
});

// ========================= //
// MATCH //
// ========================= //

socket.on('match:started', (data) => {
    console.log('⚽ Partida iniciada:', data);
});

socket.on('match:ended', (data) => {
    console.log('🏁 Partida terminada:', data);
});

socket.on('game:goal', (data) => {
    console.log('⚽ Gol anotado:', data);
});

socket.on('game:save', (data) => {
    console.log('🧤 Salvada realizada:', data);
});

// ========================= //
// ROOMS (SALAS) //
// ========================= //

/**
 * Evento: Solicitar lista de salas disponibles
 * Se dispara cuando el cliente entra a la página de salas disponibles
 */
socket.on('rooms:list', (rooms) => {
    console.log('📋 Lista de salas recibida:', rooms);
});

/**
 * Evento: Actualización de salas en tiempo real
 * Se dispara cuando una sala es creada, eliminada o actualizada
 */
socket.on('rooms:updated', (rooms) => {
    console.log('🔄 Salas actualizadas:', rooms);
});

/**
 * Evento: Confirmación de unirse a sala
 * Se dispara después de que el jugador se une a una sala
 */
socket.on('room:joined', (data) => {
    console.log('✅ Se unió a la sala:', data);
});

/**
 * Evento: Sala eliminada
 * Se dispara cuando una sala es eliminada (sin jugadores)
 */
socket.on('room:deleted', (roomId) => {
    console.log('🗑️ Sala eliminada:', roomId);
});

/**
 * Evento: Jugador se unió a la sala
 * Se dispara cuando otro jugador se une a la sala actual
 */
socket.on('room:playerJoined', (data) => {
    console.log('👤 Otro jugador se unió:', data);
});

/**
 * Evento: Jugador salió de la sala
 * Se dispara cuando otro jugador sale de la sala actual
 */
socket.on('room:playerLeft', (data) => {
    console.log('👤 Jugador salió:', data);
});

/**
 * Evento: Error de sala
 */
socket.on('room:error', (error) => {
    console.error('❌ Error de sala:', error);
});

// ========================= //
// EXPORTAR //
// ========================= //

export default socket;