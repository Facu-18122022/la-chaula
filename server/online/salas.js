/**
 * salas.js (online)
 *
 * Toda la lógica de las salas online, como en HaxBall:
 * - Cualquiera crea una sala (con contraseña opcional) y queda como admin.
 * - Los que entran caen en "Espectadores"; el admin decide quién juega en
 *   Rojo y quién en Azul (máximo 5 por equipo → 5v5).
 * - El admin elige cancha, tiempo, goles y power-ups, inicia/pausa/detiene
 *   el partido, mezcla equipos, da admin a otros y puede echar jugadores.
 * - Si el admin se va, el admin pasa al jugador más antiguo.
 * - Si alguien se desconecta tiene unos segundos para volver sin perder su
 *   lugar (se reconecta con un token secreto que solo tiene su pestaña).
 *
 * No depende de Socket.IO: avisa todo a través de `emisor`, así se puede
 * probar con tests (ver test/salas.test.js) y el archivo de sockets queda chico.
 */
const crypto = require('crypto');
const Fisica = require('../public/js/local/fisica-haxball.js');
const { crearPartido } = require('./partido.js');
const { MAPAS_ONLINE, buscarMapa, MAPA_POR_DEFECTO } = require('./mapas.js');

const MAX_POR_EQUIPO = 5;
const MAX_JUGADORES_SALA = 10;
const MIN_JUGADORES_SALA = 2;
const MAX_SALAS = 100;
const GRACIA_RECONEXION_MS = 15000;
const LARGO_NOMBRE = 16;
const LARGO_NOMBRE_SALA = 30;
const LARGO_CLAVE = 20;
const LARGO_MENSAJE = 140;
const MENSAJES_POR_VENTANA = 5;
const VENTANA_CHAT_MS = 4000;
const TIEMPOS_VALIDOS = [1, 2, 3, 5, 7, 10];
const GOLES_VALIDOS = [0, 1, 2, 3, 4, 5, 7, 10];
const EQUIPOS = ['red', 'blue'];

const BITS = { arriba: 1, abajo: 2, izquierda: 4, derecha: 8, patear: 16 };

function limpiarTexto(valor, largoMaximo) {
    return String(valor == null ? '' : valor)
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, largoMaximo);
}

function mezclar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i -= 1) {
        const j = Math.floor(aleatorio() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

class GestorSalas {
    /**
     * emisor: {
     *   aSala(salaId, evento, datos), aSocket(socketId, evento, datos),
     *   aVestibulo(evento, datos), unirSocket(socketId, salaId), sacarSocket(socketId, salaId)
     * }
     */
    constructor({ emisor, ahora = Date.now, aleatorio = Math.random, graciaMs = GRACIA_RECONEXION_MS } = {}) {
        this.emisor = emisor;
        this.ahora = ahora;
        this.aleatorio = aleatorio;
        this.graciaMs = graciaMs;
        this.salas = new Map();
        this.porSocket = new Map();
        this.contadorJugadores = 0;
    }

    /* ========================= */
    /* CONSULTAS                 */
    /* ========================= */

    buscar(socketId) {
        const ubicacion = this.porSocket.get(socketId);
        if (!ubicacion) return {};
        const sala = this.salas.get(ubicacion.salaId);
        const jugador = sala ? sala.jugadores.find(item => item.id === ubicacion.jugadorId) : null;
        return sala && jugador ? { sala, jugador } : {};
    }

    listaPublica() {
        return Array.from(this.salas.values()).map(sala => ({
            id: sala.id,
            nombre: sala.nombre,
            jugadores: sala.jugadores.length,
            maxJugadores: sala.maxJugadores,
            conClave: !!sala.clave,
            enJuego: !!sala.partido,
            mapa: (buscarMapa(sala.config.mapaId) || {}).name || ''
        }));
    }

    mapaPublico(mapaId) {
        const mapa = Fisica.normalizarMapa(buscarMapa(mapaId) || buscarMapa(MAPA_POR_DEFECTO));
        return { ...mapa, radioPoste: Fisica.constantes.POSTE.radio * mapa.escala };
    }

    estadoPublico(sala) {
        return {
            id: sala.id,
            nombre: sala.nombre,
            conClave: !!sala.clave,
            maxJugadores: sala.maxJugadores,
            maxPorEquipo: MAX_POR_EQUIPO,
            config: { ...sala.config },
            mapa: this.mapaPublico(sala.config.mapaId),
            mapas: MAPAS_ONLINE.map(({ id, name, recomendado }) => ({ id, name, recomendado })),
            tiempos: TIEMPOS_VALIDOS,
            golesValidos: GOLES_VALIDOS,
            jugadores: sala.jugadores.map(jugador => ({
                id: jugador.id,
                nombre: jugador.nombre,
                equipo: jugador.equipo,
                admin: jugador.admin,
                desconectado: !!jugador.desconectadoDesde
            })),
            partido: sala.partido ? sala.partido.resumen() : null,
            ultimoResultado: sala.ultimoResultado
        };
    }

    /* ========================= */
    /* AVISOS                    */
    /* ========================= */

    avisarSala(sala) {
        this.emisor.aSala(sala.id, 'sala:estado', this.estadoPublico(sala));
    }

    avisarLista() {
        this.emisor.aVestibulo('salas:lista', this.listaPublica());
    }

    mensajeSistema(sala, texto) {
        this.emisor.aSala(sala.id, 'sala:chat', { sistema: true, texto, hora: this.ahora() });
    }

    /* ========================= */
    /* VALIDACIONES              */
    /* ========================= */

    validarNombre(nombre) {
        const limpio = limpiarTexto(nombre, LARGO_NOMBRE);
        return limpio.length ? limpio : null;
    }

    nombreUnico(sala, nombre) {
        const usados = new Set(sala.jugadores.map(jugador => jugador.nombre.toLowerCase()));
        if (!usados.has(nombre.toLowerCase())) return nombre;
        for (let numero = 2; numero < 100; numero += 1) {
            const candidato = `${nombre.slice(0, LARGO_NOMBRE - String(numero).length - 1)} ${numero}`;
            if (!usados.has(candidato.toLowerCase())) return candidato;
        }
        return `${nombre.slice(0, 10)} ${this.contadorJugadores}`;
    }

    generarIdSala() {
        let id;
        do {
            id = crypto.randomBytes(4).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
        } while (!id || id.length < 5 || this.salas.has(id));
        return id;
    }

    crearJugador(socketId, nombre, sala) {
        this.contadorJugadores += 1;
        return {
            id: `j${this.contadorJugadores}`,
            socketId,
            nombre: this.nombreUnico(sala, nombre),
            equipo: null,
            admin: false,
            token: crypto.randomBytes(16).toString('hex'),
            entroEn: this.ahora(),
            desconectadoDesde: null,
            entrada: { up: false, down: false, left: false, right: false, kick: false },
            patadaPendiente: false,
            chat: []
        };
    }

    respuestaIngreso(sala, jugador, reconectado = false) {
        return { ok: true, salaId: sala.id, tuId: jugador.id, token: jugador.token, reconectado, sala: this.estadoPublico(sala) };
    }

    /* ========================= */
    /* CREAR / ENTRAR / SALIR    */
    /* ========================= */

    crearSala(socketId, datos = {}) {
        if (this.porSocket.has(socketId)) this.salir(socketId);
        if (this.salas.size >= MAX_SALAS) return { error: 'Hay demasiadas salas abiertas. Probá en un rato.' };
        const nombreJugador = this.validarNombre(datos.nombreJugador);
        if (!nombreJugador) return { error: 'Elegí un nombre de jugador.' };
        const maxJugadores = Math.round(Number(datos.maxJugadores));
        const sala = {
            id: this.generarIdSala(),
            nombre: limpiarTexto(datos.nombre, LARGO_NOMBRE_SALA) || `Sala de ${nombreJugador}`,
            clave: limpiarTexto(datos.clave, LARGO_CLAVE) || null,
            maxJugadores: Number.isFinite(maxJugadores)
                ? Math.min(MAX_JUGADORES_SALA, Math.max(MIN_JUGADORES_SALA, maxJugadores))
                : MAX_JUGADORES_SALA,
            config: {
                mapaId: MAPA_POR_DEFECTO,
                tiempoMin: 3,
                goles: 3,
                powerUps: false,
                equiposBloqueados: true
            },
            jugadores: [],
            partido: null,
            ultimoResultado: null,
            creadaEn: this.ahora()
        };
        const jugador = this.crearJugador(socketId, nombreJugador, sala);
        jugador.admin = true;
        jugador.equipo = 'red';
        sala.jugadores.push(jugador);
        this.salas.set(sala.id, sala);
        this.porSocket.set(socketId, { salaId: sala.id, jugadorId: jugador.id });
        this.emisor.unirSocket(socketId, sala.id);
        this.mensajeSistema(sala, `${jugador.nombre} creó la sala.`);
        this.avisarLista();
        return this.respuestaIngreso(sala, jugador);
    }

    unirse(socketId, datos = {}) {
        const sala = this.salas.get(limpiarTexto(datos.salaId, 10).toUpperCase());
        if (!sala) return { error: 'La sala no existe (o ya se cerró).' };

        // Reconexión: el token es secreto de cada pestaña.
        const token = typeof datos.token === 'string' ? datos.token : '';
        const previo = token ? sala.jugadores.find(jugador => jugador.token === token) : null;
        if (previo) {
            const ubicacionActual = this.porSocket.get(socketId);
            if (ubicacionActual && ubicacionActual.jugadorId !== previo.id) this.salir(socketId);
            if (previo.socketId && previo.socketId !== socketId) {
                this.porSocket.delete(previo.socketId);
                this.emisor.sacarSocket(previo.socketId, sala.id);
                this.emisor.aSocket(previo.socketId, 'sala:expulsado', { motivo: 'Entraste a la sala desde otra pestaña.' });
            }
            previo.socketId = socketId;
            previo.desconectadoDesde = null;
            this.porSocket.set(socketId, { salaId: sala.id, jugadorId: previo.id });
            this.emisor.unirSocket(socketId, sala.id);
            this.mensajeSistema(sala, `${previo.nombre} volvió.`);
            this.avisarSala(sala);
            return this.respuestaIngreso(sala, previo, true);
        }

        const nombreJugador = this.validarNombre(datos.nombreJugador);
        if (!nombreJugador) return { error: 'Elegí un nombre de jugador.' };
        if (sala.clave && limpiarTexto(datos.clave, LARGO_CLAVE) !== sala.clave) {
            return { error: 'Contraseña incorrecta.', pideClave: true };
        }
        if (sala.jugadores.length >= sala.maxJugadores) return { error: `La sala está llena (${sala.maxJugadores} jugadores).` };

        if (this.porSocket.has(socketId)) this.salir(socketId);
        const jugador = this.crearJugador(socketId, nombreJugador, sala);
        sala.jugadores.push(jugador);
        this.porSocket.set(socketId, { salaId: sala.id, jugadorId: jugador.id });
        this.emisor.unirSocket(socketId, sala.id);
        this.mensajeSistema(sala, `${jugador.nombre} entró a la sala.`);
        this.avisarSala(sala);
        this.avisarLista();
        return this.respuestaIngreso(sala, jugador);
    }

    /** Sale de la sala en serio (botón "Salir", echado o se venció la reconexión). */
    salir(socketId, motivo = null) {
        const { sala, jugador } = this.buscar(socketId);
        this.porSocket.delete(socketId);
        if (!sala) return;
        this.emisor.sacarSocket(socketId, sala.id);
        this.quitarJugador(sala, jugador, motivo);
    }

    quitarJugador(sala, jugador, motivo = null) {
        sala.jugadores = sala.jugadores.filter(item => item !== jugador);
        if (jugador.socketId && this.porSocket.get(jugador.socketId)?.jugadorId === jugador.id) {
            this.porSocket.delete(jugador.socketId);
        }
        if (sala.partido) sala.partido.quitarJugador(jugador.id);

        if (!sala.jugadores.length) {
            this.salas.delete(sala.id);
            this.avisarLista();
            return;
        }
        this.mensajeSistema(sala, motivo ? `${jugador.nombre} ${motivo}` : `${jugador.nombre} salió de la sala.`);
        if (!sala.jugadores.some(item => item.admin)) {
            const nuevo = sala.jugadores.find(item => !item.desconectadoDesde) || sala.jugadores[0];
            nuevo.admin = true;
            this.mensajeSistema(sala, `${nuevo.nombre} ahora es admin.`);
        }
        this.avisarSala(sala);
        this.avisarLista();
    }

    /** Se cortó la conexión: queda unos segundos esperando que vuelva. */
    desconectar(socketId) {
        const { sala, jugador } = this.buscar(socketId);
        this.porSocket.delete(socketId);
        if (!sala) return;
        jugador.desconectadoDesde = this.ahora();
        jugador.socketId = null;
        jugador.entrada = { up: false, down: false, left: false, right: false, kick: false };
        jugador.patadaPendiente = false;
        this.avisarSala(sala);
    }

    /** Saca a los que no volvieron a tiempo. Se llama cada segundo. */
    limpiarDesconectados() {
        const limite = this.ahora() - this.graciaMs;
        Array.from(this.salas.values()).forEach(sala => {
            sala.jugadores
                .filter(jugador => jugador.desconectadoDesde && jugador.desconectadoDesde <= limite)
                .forEach(jugador => this.quitarJugador(sala, jugador, 'se desconectó.'));
        });
    }

    /* ========================= */
    /* EQUIPOS Y ADMIN           */
    /* ========================= */

    exigirAdmin(socketId) {
        const resultado = this.buscar(socketId);
        if (!resultado.sala) return { error: 'No estás en una sala.' };
        if (!resultado.jugador.admin) return { error: 'Solo el admin puede hacer eso.' };
        return resultado;
    }

    /** Mueve a un jugador a 'red', 'blue' o null (espectadores). */
    mover(socketId, { jugadorId, equipo } = {}) {
        const { sala, jugador: quien } = this.buscar(socketId);
        if (!sala) return { error: 'No estás en una sala.' };
        const destino = EQUIPOS.includes(equipo) ? equipo : null;
        const objetivo = sala.jugadores.find(item => item.id === jugadorId);
        if (!objetivo) return { error: 'Ese jugador ya no está.' };
        const esElMismo = objetivo === quien;
        if (!quien.admin && !(esElMismo && !sala.config.equiposBloqueados)) {
            return { error: 'Solo el admin elige los equipos.' };
        }
        if (objetivo.equipo === destino) return { ok: true };
        if (destino && sala.jugadores.filter(item => item.equipo === destino).length >= MAX_POR_EQUIPO) {
            return { error: `El equipo ${destino === 'red' ? 'rojo' : 'azul'} ya tiene ${MAX_POR_EQUIPO} jugadores.` };
        }
        objetivo.equipo = destino;
        if (sala.partido) {
            if (destino) sala.partido.agregarJugador({ id: objetivo.id, nombre: objetivo.nombre, equipo: destino });
            else sala.partido.quitarJugador(objetivo.id);
        }
        this.avisarSala(sala);
        return { ok: true };
    }

    /** Reparte a todos al azar en dos equipos parejos (máximo 5 por lado). */
    mezclarEquipos(socketId) {
        const resultado = this.exigirAdmin(socketId);
        if (resultado.error) return resultado;
        const { sala } = resultado;
        if (sala.partido) return { error: 'Detené el partido para mezclar los equipos.' };
        const conectados = sala.jugadores.filter(jugador => !jugador.desconectadoDesde);
        mezclar(conectados, this.aleatorio).forEach((jugador, indice) => {
            jugador.equipo = indice < MAX_POR_EQUIPO * 2 ? EQUIPOS[indice % 2] : null;
        });
        this.mensajeSistema(sala, 'Se mezclaron los equipos.');
        this.avisarSala(sala);
        return { ok: true };
    }

    alternarAdmin(socketId, { jugadorId } = {}) {
        const resultado = this.exigirAdmin(socketId);
        if (resultado.error) return resultado;
        const { sala, jugador: quien } = resultado;
        const objetivo = sala.jugadores.find(item => item.id === jugadorId);
        if (!objetivo) return { error: 'Ese jugador ya no está.' };
        if (objetivo === quien) return { error: 'No te podés sacar el admin a vos mismo.' };
        objetivo.admin = !objetivo.admin;
        this.mensajeSistema(sala, objetivo.admin ? `${objetivo.nombre} ahora es admin.` : `${objetivo.nombre} ya no es admin.`);
        this.avisarSala(sala);
        return { ok: true };
    }

    echar(socketId, { jugadorId } = {}) {
        const resultado = this.exigirAdmin(socketId);
        if (resultado.error) return resultado;
        const { sala, jugador: quien } = resultado;
        const objetivo = sala.jugadores.find(item => item.id === jugadorId);
        if (!objetivo) return { error: 'Ese jugador ya no está.' };
        if (objetivo === quien) return { error: 'No te podés echar a vos mismo.' };
        if (objetivo.socketId) {
            this.emisor.aSocket(objetivo.socketId, 'sala:expulsado', { motivo: `${quien.nombre} te echó de la sala.` });
            this.emisor.sacarSocket(objetivo.socketId, sala.id);
            this.porSocket.delete(objetivo.socketId);
        }
        this.quitarJugador(sala, objetivo, 'fue echado de la sala.');
        return { ok: true };
    }

    configurar(socketId, cambios = {}) {
        const resultado = this.exigirAdmin(socketId);
        if (resultado.error) return resultado;
        const { sala } = resultado;
        const config = { ...sala.config };
        if (cambios.equiposBloqueados !== undefined) config.equiposBloqueados = !!cambios.equiposBloqueados;
        const cambiaPartido = ['mapaId', 'tiempoMin', 'goles', 'powerUps'].some(clave => cambios[clave] !== undefined);
        if (cambiaPartido && sala.partido) return { error: 'Detené el partido para cambiar la cancha o las reglas.' };
        if (cambios.mapaId !== undefined) {
            if (!buscarMapa(cambios.mapaId)) return { error: 'Esa cancha no existe.' };
            config.mapaId = cambios.mapaId;
        }
        if (cambios.tiempoMin !== undefined) {
            const tiempo = Number(cambios.tiempoMin);
            if (!TIEMPOS_VALIDOS.includes(tiempo)) return { error: 'Tiempo inválido.' };
            config.tiempoMin = tiempo;
        }
        if (cambios.goles !== undefined) {
            const goles = Number(cambios.goles);
            if (!GOLES_VALIDOS.includes(goles)) return { error: 'Límite de goles inválido.' };
            config.goles = goles;
        }
        if (cambios.powerUps !== undefined) config.powerUps = !!cambios.powerUps;
        sala.config = config;
        this.avisarSala(sala);
        this.avisarLista();
        return { ok: true };
    }

    /* ========================= */
    /* CHAT                      */
    /* ========================= */

    chat(socketId, texto) {
        const { sala, jugador } = this.buscar(socketId);
        if (!sala) return { error: 'No estás en una sala.' };
        const mensaje = limpiarTexto(texto, LARGO_MENSAJE);
        if (!mensaje) return { ok: true };
        const ahora = this.ahora();
        jugador.chat = jugador.chat.filter(hora => ahora - hora < VENTANA_CHAT_MS);
        if (jugador.chat.length >= MENSAJES_POR_VENTANA) return { error: 'Estás mandando mensajes muy rápido.' };
        jugador.chat.push(ahora);
        this.emisor.aSala(sala.id, 'sala:chat', {
            de: jugador.nombre,
            deId: jugador.id,
            equipo: jugador.equipo,
            admin: jugador.admin,
            texto: mensaje,
            hora: ahora
        });
        return { ok: true };
    }

    /* ========================= */
    /* PARTIDO                   */
    /* ========================= */

    iniciarPartido(socketId) {
        const resultado = this.exigirAdmin(socketId);
        if (resultado.error) return resultado;
        const { sala } = resultado;
        if (sala.partido) return { error: 'El partido ya está en curso.' };
        const enCancha = sala.jugadores.filter(jugador => jugador.equipo);
        if (!enCancha.length) return { error: 'Poné al menos un jugador en Rojo o Azul.' };
        const mapa = buscarMapa(sala.config.mapaId) || buscarMapa(MAPA_POR_DEFECTO);
        sala.partido = crearPartido({
            mapa,
            jugadores: enCancha.map(jugador => ({ id: jugador.id, nombre: jugador.nombre, equipo: jugador.equipo })),
            tiempoMin: sala.config.tiempoMin,
            goles: sala.config.goles,
            powerUps: sala.config.powerUps
        });
        sala.ultimoResultado = null;
        this.emisor.aSala(sala.id, 'partido:inicio', { mapa: this.mapaPublico(sala.config.mapaId) });
        this.mensajeSistema(sala, '¡Arrancó el partido!');
        this.avisarSala(sala);
        this.avisarLista();
        return { ok: true };
    }

    detenerPartido(socketId) {
        const resultado = this.exigirAdmin(socketId);
        if (resultado.error) return resultado;
        const { sala } = resultado;
        if (!sala.partido) return { ok: true };
        sala.partido = null;
        this.emisor.aSala(sala.id, 'partido:detenido', {});
        this.mensajeSistema(sala, 'El admin detuvo el partido.');
        this.avisarSala(sala);
        this.avisarLista();
        return { ok: true };
    }

    pausar(socketId) {
        const resultado = this.exigirAdmin(socketId);
        if (resultado.error) return resultado;
        const { sala } = resultado;
        if (!sala.partido) return { error: 'No hay partido en curso.' };
        sala.partido.setPausa(!sala.partido.pausado);
        this.mensajeSistema(sala, sala.partido.pausado ? 'Partido en pausa.' : 'Sigue el partido.');
        this.avisarSala(sala);
        return { ok: true };
    }

    /** Teclas del jugador como bits (arriba 1, abajo 2, izquierda 4, derecha 8, patear 16). */
    entrada(socketId, bits) {
        const { jugador } = this.buscar(socketId);
        if (!jugador) return;
        const valor = Number(bits) | 0;
        jugador.entrada = {
            up: !!(valor & BITS.arriba),
            down: !!(valor & BITS.abajo),
            left: !!(valor & BITS.izquierda),
            right: !!(valor & BITS.derecha),
            kick: !!(valor & BITS.patear)
        };
        // Un toque rapidísimo de patear (apretar y soltar entre dos ticks) no se pierde.
        if (jugador.entrada.kick) jugador.patadaPendiente = true;
    }

    /** Avanza todos los partidos. Con `enviarEstado` manda la foto a cada sala. */
    tick(deltaMs, { enviarEstado = true } = {}) {
        this.salas.forEach(sala => {
            if (!sala.partido) return;
            const inputs = {};
            sala.jugadores.forEach(jugador => {
                if (!jugador.equipo) return;
                inputs[jugador.id] = { ...jugador.entrada, kick: jugador.entrada.kick || jugador.patadaPendiente };
                jugador.patadaPendiente = false;
            });
            const eventos = sala.partido.actualizar(deltaMs, inputs);
            eventos.forEach(evento => this.procesarEvento(sala, evento));
            if (sala.partido && enviarEstado) this.emisor.aSala(sala.id, 'partido:estado', sala.partido.snapshot());
        });
    }

    procesarEvento(sala, evento) {
        // Las patadas no se avisan: los navegadores ya ven el borde blanco en la foto.
        if (evento.tipo === 'patada') return;
        if (evento.tipo === 'gol') {
            const equipo = evento.equipo === 'red' ? 'Rojo' : 'Azul';
            const autor = evento.autor ? `: ${evento.autor}${evento.enContra ? ' (en contra)' : ''}` : '';
            const asistencia = evento.asistente ? ` (asist. ${evento.asistente})` : '';
            this.mensajeSistema(sala, `⚽ Gol de ${equipo}${autor}${asistencia} · Rojo ${evento.marcador.red} - ${evento.marcador.blue} Azul`);
            this.emisor.aSala(sala.id, 'partido:evento', evento);
            this.avisarSala(sala);
            return;
        }
        if (evento.tipo === 'fin') {
            sala.ultimoResultado = { marcador: evento.marcador, ganador: evento.ganador, goles: evento.goles };
            sala.partido = null;
            const texto = evento.ganador
                ? `🏁 Terminó el partido: ganó ${evento.ganador === 'red' ? 'Rojo' : 'Azul'} ${evento.marcador.red}-${evento.marcador.blue}.`
                : `🏁 Terminó el partido: empate ${evento.marcador.red}-${evento.marcador.blue}.`;
            this.emisor.aSala(sala.id, 'partido:fin', evento);
            this.mensajeSistema(sala, texto);
            this.avisarSala(sala);
            this.avisarLista();
            return;
        }
        this.emisor.aSala(sala.id, 'partido:evento', evento);
        if (evento.tipo === 'tiempoExtra') this.mensajeSistema(sala, '⏱️ ¡Tiempo extra! El próximo gol gana.');
    }
}

module.exports = { GestorSalas, MAX_POR_EQUIPO, MAX_JUGADORES_SALA, BITS, GRACIA_RECONEXION_MS };
