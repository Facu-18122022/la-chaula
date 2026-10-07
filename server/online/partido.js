/**
 * partido.js (online)
 *
 * Un partido corriendo en el servidor (el servidor es la única "verdad": los
 * navegadores solo mandan qué teclas tocan y dibujan lo que reciben).
 *
 * Usa el mismo motor de física que el modo arcade (fisica-haxball.js, traído
 * de la rama develop) y las mismas reglas que match-manager.js del arcade:
 *   SAQUE → JUGANDO → GOL → SAQUE ... → FIN
 * - El reloj solo corre con la pelota en juego.
 * - Después del gol la física sigue unos segundos y saca el que lo recibió.
 * - Si termina empatado hay TIEMPO_EXTRA con gol de oro.
 * Además soporta lo propio del online: jugadores que entran, salen o cambian
 * de equipo con el partido en curso, y goleadores/asistencias.
 */
const Fisica = require('../public/js/local/fisica-haxball.js');

const DURACION_GOL_MS = 2500;
const PASO_MS = 1000 / 60;

function otroEquipo(equipo) {
    return equipo === 'red' ? 'blue' : 'red';
}

function redondear(valor) {
    return Math.round(valor * 10) / 10;
}

/**
 * opciones: { mapa, jugadores: [{ id, nombre, equipo }], tiempoMin, goles (0 = sin límite), powerUps }
 */
function crearPartido({ mapa, jugadores = [], tiempoMin = 3, goles = 3, powerUps = false } = {}) {
    const estado = Fisica.crearEstado({
        mapa,
        ladoIzquierdo: 'red',
        kickoffTeam: 'red',
        powerUps,
        jugadores: jugadores.map(jugador => ({ id: jugador.id, equipo: jugador.equipo }))
    });

    const partido = {
        estado,
        fase: 'SAQUE',
        marcador: { red: 0, blue: 0 },
        restanteMs: Math.max(1, Number(tiempoMin) || 3) * 60 * 1000,
        limiteGoles: Number(goles) > 0 ? Number(goles) : null,
        tiempoExtra: false,
        pausado: false,
        equipoSaque: 'red',
        golTranscurridoMs: 0,
        terminaTrasGol: false,
        goles: [],
        nombres: new Map(jugadores.map(jugador => [jugador.id, jugador.nombre]))
    };

    function hayJugadoresEn(equipo) {
        return estado.players.some(jugador => jugador.equipo === equipo);
    }

    // Si el equipo que tiene que sacar está vacío, saca el otro (sino el partido queda trabado).
    function ajustarSaque() {
        const equipo = hayJugadoresEn(partido.equipoSaque) ? partido.equipoSaque : otroEquipo(partido.equipoSaque);
        estado.kickoffTeam = equipo;
        const sacador = estado.players.find(jugador => jugador.equipo === equipo);
        estado.kickoffPlayerId = sacador ? sacador.id : null;
    }

    function registrarGol(eventos) {
        const equipo = estado.lastGoalTeam === 'blue' ? 'blue' : 'red';
        const autor = estado.players.find(jugador => jugador.id === estado.lastTouch) || null;
        const enContra = !!(autor && autor.equipo !== equipo);
        const asistente = !enContra && autor
            ? estado.players.find(jugador => jugador.id === estado.secondLastTouch && jugador.equipo === equipo && jugador.id !== autor.id)
            : null;
        partido.marcador[equipo] += 1;
        const gol = {
            equipo,
            autorId: autor ? autor.id : null,
            autor: autor ? partido.nombres.get(autor.id) || '' : '',
            asistente: asistente ? partido.nombres.get(asistente.id) || '' : '',
            enContra,
            restanteMs: partido.restanteMs,
            tiempoExtra: partido.tiempoExtra
        };
        partido.goles.push(gol);
        partido.fase = 'GOL';
        partido.golTranscurridoMs = 0;
        const alcanzoLimite = partido.limiteGoles != null && partido.marcador[equipo] >= partido.limiteGoles;
        partido.terminaTrasGol = partido.tiempoExtra || alcanzoLimite;
        if (!partido.terminaTrasGol) partido.equipoSaque = otroEquipo(equipo);
        eventos.push({ tipo: 'gol', ...gol, marcador: { ...partido.marcador } });
    }

    function terminarGol(eventos) {
        if (partido.terminaTrasGol) {
            terminar(eventos);
            return;
        }
        Fisica.reiniciarSaque(estado);
        partido.fase = 'SAQUE';
        ajustarSaque();
        eventos.push({ tipo: 'saque', equipo: estado.kickoffTeam });
    }

    function terminar(eventos) {
        partido.fase = 'FIN';
        const { red, blue } = partido.marcador;
        eventos.push({
            tipo: 'fin',
            marcador: { red, blue },
            ganador: red === blue ? null : red > blue ? 'red' : 'blue',
            goles: partido.goles.slice()
        });
    }

    /**
     * Avanza el partido. `inputs` = { [idJugador]: { up, down, left, right, kick } }.
     * Devuelve la lista de eventos (gol, saque, fin, patada) para avisar a la sala.
     */
    function actualizar(deltaMs, inputs = {}) {
        const eventos = [];
        if (partido.pausado || partido.fase === 'FIN') return eventos;
        const transcurrido = Math.min(Math.max(Number(deltaMs) || 0, 0), 250);
        const resultado = Fisica.avanzar(estado, transcurrido, inputs);
        const simulado = resultado.pasos * PASO_MS;

        estado.kickImpactEvents.splice(0).forEach(impacto => eventos.push({ tipo: 'patada', id: impacto.player.id }));
        estado.kickEvents.length = 0;

        if (partido.fase === 'GOL') {
            partido.golTranscurridoMs += simulado;
            if (partido.golTranscurridoMs >= DURACION_GOL_MS) terminarGol(eventos);
            return eventos;
        }

        if (resultado.eventos.includes('primerToque') && partido.fase === 'SAQUE') {
            partido.fase = partido.tiempoExtra ? 'TIEMPO_EXTRA' : 'JUGANDO';
        }

        if (resultado.eventos.includes('gol')) {
            registrarGol(eventos);
            return eventos;
        }

        if (partido.fase === 'JUGANDO') {
            partido.restanteMs = Math.max(0, partido.restanteMs - simulado);
            if (partido.restanteMs === 0) {
                if (partido.marcador.red === partido.marcador.blue) {
                    partido.tiempoExtra = true;
                    partido.fase = 'TIEMPO_EXTRA';
                    eventos.push({ tipo: 'tiempoExtra' });
                } else {
                    terminar(eventos);
                }
            }
        }
        return eventos;
    }

    /* ========================= */
    /* JUGADORES EN PLENO PARTIDO */
    /* ========================= */

    function agregarJugador({ id, nombre, equipo }) {
        quitarJugador(id);
        partido.nombres.set(id, nombre);
        const { mapa } = estado;
        const radio = Fisica.constantes.JUGADOR.radio * mapa.escala;
        const companeros = estado.players.filter(jugador => jugador.equipo === equipo).length;
        const distancia = Math.min(170 * mapa.escala, (mapa.field.right - mapa.field.left) * 0.23);
        const lado = equipo === estado.ladoIzquierdo ? -1 : 1;
        const desplazamientoY = companeros === 0 ? 0 : (companeros % 2 ? -1 : 1) * Math.ceil(companeros / 2) * 55 * mapa.escala;
        estado.players.push({
            id,
            equipo,
            x: mapa.width / 2 + lado * distancia,
            y: mapa.height / 2 + desplazamientoY,
            vx: 0,
            vy: 0,
            r: radio,
            rBase: radio,
            invMass: Fisica.constantes.JUGADOR.invMass,
            pateando: false,
            patadaUsada: false,
            activePower: null,
            powerTimer: 0
        });
        if (estado.waitingForKickOff) ajustarSaque();
    }

    function quitarJugador(id) {
        const indice = estado.players.findIndex(jugador => jugador.id === id);
        if (indice === -1) return;
        estado.players.splice(indice, 1);
        if (estado.lastTouch === id) estado.lastTouch = null;
        if (estado.secondLastTouch === id) estado.secondLastTouch = null;
        if (estado.waitingForKickOff) ajustarSaque();
    }

    function setPausa(valor) {
        if (partido.fase === 'FIN') return;
        partido.pausado = !!valor;
    }

    /* ========================= */
    /* ESTADO PARA LOS CLIENTES */
    /* ========================= */

    /** Foto compacta que se manda 60 veces por segundo. */
    function snapshot() {
        return {
            f: partido.fase,
            p: partido.pausado ? 1 : 0,
            m: [partido.marcador.red, partido.marcador.blue],
            t: Math.ceil(partido.restanteMs / 100) * 100,
            x: partido.tiempoExtra ? 1 : 0,
            s: estado.kickoffTeam,
            b: [redondear(estado.ball.x), redondear(estado.ball.y), redondear(estado.ball.r)],
            // Festejo de gol: cuánto pasó y quién lo hizo (para la animación de develop).
            g: partido.fase === 'GOL' ? Math.round(partido.golTranscurridoMs) : null,
            ug: partido.goles.length ? (({ equipo, autor, enContra }) => [equipo, autor, enContra ? 1 : 0])(partido.goles[partido.goles.length - 1]) : null,
            // Último súper tiro (para la explosión).
            i: estado.lastPowerImpact ? [estado.lastPowerImpact.id, redondear(estado.lastPowerImpact.x), redondear(estado.lastPowerImpact.y)] : null,
            j: estado.players.map(jugador => [
                jugador.id,
                redondear(jugador.x),
                redondear(jugador.y),
                redondear(jugador.r),
                jugador.pateando ? 1 : 0,
                jugador.activePower || 0
            ]),
            u: estado.activePowerUps.map(powerUp => [redondear(powerUp.x), redondear(powerUp.y), powerUp.type, redondear(powerUp.r)])
        };
    }

    function resumen() {
        return {
            fase: partido.fase,
            pausado: partido.pausado,
            marcador: { ...partido.marcador },
            goles: partido.goles.slice()
        };
    }

    ajustarSaque();

    return {
        actualizar,
        agregarJugador,
        quitarJugador,
        setPausa,
        snapshot,
        resumen,
        get fase() { return partido.fase; },
        get pausado() { return partido.pausado; },
        get estado() { return estado; },
        get marcador() { return { ...partido.marcador }; }
    };
}

module.exports = { crearPartido, DURACION_GOL_MS };
