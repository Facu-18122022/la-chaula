/**
 * sockets.js (online)
 *
 * Conecta Socket.IO con el gestor de salas y corre el bucle de los partidos:
 * - La física avanza a 60 ticks por segundo (igual que HaxBall).
 * - A cada sala se le manda el estado del partido en cada tick (60 por
 *   segundo) para que el control se sienta igual que jugando en el arcade.
 *
 * Eventos que manda el navegador (todos con callback de respuesta):
 *   salas:pedir · sala:crear · sala:unirse · sala:salir · sala:chat
 *   sala:mover · sala:mezclar · sala:admin · sala:echar · sala:config
 *   partido:iniciar · partido:detener · partido:pausa · entrada (sin callback) · ping
 */
const { GestorSalas } = require('./salas.js');

const VESTIBULO = 'vestibulo';
const MS_TICK = 1000 / 60;
const TICKS_POR_ENVIO = 1;
// Igual que el máximo de ticks por llamada de fisica-haxball.js.
const MAX_TICKS_ATRASO = 8;

function iniciarOnline(io) {
    const gestor = new GestorSalas({
        emisor: {
            aSala: (salaId, evento, datos) => io.to(`sala:${salaId}`).emit(evento, datos),
            aSocket: (socketId, evento, datos) => io.to(socketId).emit(evento, datos),
            aVestibulo: (evento, datos) => io.to(VESTIBULO).emit(evento, datos),
            unirSocket: (socketId, salaId) => {
                const socket = io.sockets.sockets.get(socketId);
                if (!socket) return;
                socket.leave(VESTIBULO);
                socket.join(`sala:${salaId}`);
            },
            sacarSocket: (socketId, salaId) => {
                const socket = io.sockets.sockets.get(socketId);
                if (!socket) return;
                socket.leave(`sala:${salaId}`);
                socket.join(VESTIBULO);
            }
        }
    });

    io.on('connection', socket => {
        socket.join(VESTIBULO);

        // Envuelve cada acción: valida el callback y nunca deja caer el servidor.
        const accion = (evento, manejador) => {
            socket.on(evento, (datos, callback) => {
                const responder = typeof callback === 'function' ? callback : () => {};
                try {
                    responder(manejador(datos || {}) || { ok: true });
                } catch (error) {
                    console.error(`[online] error en ${evento}`, error);
                    responder({ error: 'Error inesperado del servidor.' });
                }
            });
        };

        accion('salas:pedir', () => ({ ok: true, salas: gestor.listaPublica() }));
        accion('sala:crear', datos => gestor.crearSala(socket.id, datos));
        accion('sala:unirse', datos => gestor.unirse(socket.id, datos));
        accion('sala:salir', () => {
            gestor.salir(socket.id);
            return { ok: true };
        });
        accion('sala:chat', datos => gestor.chat(socket.id, datos.texto));
        accion('sala:mover', datos => gestor.mover(socket.id, datos));
        accion('sala:mezclar', () => gestor.mezclarEquipos(socket.id));
        accion('sala:admin', datos => gestor.alternarAdmin(socket.id, datos));
        accion('sala:echar', datos => gestor.echar(socket.id, datos));
        accion('sala:config', datos => gestor.configurar(socket.id, datos));
        accion('sala:avatar', datos => gestor.cambiarAvatar(socket.id, datos));
        accion('partido:iniciar', () => gestor.iniciarPartido(socket.id));
        accion('partido:detener', () => gestor.detenerPartido(socket.id));
        accion('partido:pausa', () => gestor.pausar(socket.id));
        accion('ping', () => ({ ok: true }));

        socket.on('entrada', bits => gestor.entrada(socket.id, bits));
        socket.on('disconnect', () => gestor.desconectar(socket.id));
    });

    // Bucle de partidos: un solo reloj para todas las salas.
    // setInterval(16,7 ms) en Windows tarda en realidad 17-18 ms por vuelta (y a
    // veces 30-45 ms), así que las fotos salían desparejas. Ahora cada vuelta se
    // agenda contra la hora exacta en que le toca y corre los ticks que se deben
    // (casi siempre 1): sale una foto pareja por tick, 60 por segundo.
    const inicio = performance.now();
    let ticksHechos = 0;
    let contador = 0;
    let temporizador = null;
    let cerrado = false;
    function vuelta() {
        if (cerrado) return;
        const debidos = Math.floor((performance.now() - inicio) / MS_TICK);
        // Si el servidor se trabó mucho no intenta recuperar todo de golpe.
        if (debidos - ticksHechos > MAX_TICKS_ATRASO) ticksHechos = debidos - MAX_TICKS_ATRASO;
        const pasos = debidos - ticksHechos;
        if (pasos > 0) {
            ticksHechos = debidos;
            contador += 1;
            gestor.tick(pasos * MS_TICK, { enviarEstado: contador % TICKS_POR_ENVIO === 0 });
        }
        const espera = inicio + (ticksHechos + 1) * MS_TICK - performance.now();
        temporizador = setTimeout(vuelta, Math.max(0, espera));
    }
    temporizador = setTimeout(vuelta, MS_TICK);

    const limpieza = setInterval(() => gestor.limpiarDesconectados(), 1000);

    return {
        gestor,
        cerrar() {
            cerrado = true;
            clearTimeout(temporizador);
            clearInterval(limpieza);
        }
    };
}

module.exports = { iniciarOnline };
