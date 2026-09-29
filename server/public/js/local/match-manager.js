/**
 * match-manager.js
 *
 * Gestor del flujo y reglas de un partido (como en HaxBall).
 * Controla el reloj, el marcador y las fases:
 *   SAQUE → JUGANDO → GOL → SAQUE ... → FIN
 * - El reloj solo corre con la pelota en juego (no durante el saque ni el gol).
 * - Después de un gol la física sigue unos segundos (la pelota se mete en la
 *   red y los jugadores se pueden mover) y luego saca el equipo que lo recibió.
 * - Si termina el tiempo empatado hay TIEMPO_EXTRA con gol de oro.
 */
(function (global) {
    const DURACION_GOL_MS = 2500;
    const PASO_MS = 1000 / 60;

    function crear({ estadoFisica, tiempoMs, limiteGoles = null, motor = null } = {}) {
        const fisica = motor || global.FisicaHaxball;
        if (!fisica) throw new Error('FisicaHaxball debe estar disponible antes de crear el partido');

        const match = {
            estadoFisica,
            remainingMs: Math.max(0, Number(tiempoMs) || 0),
            limiteGoles: limiteGoles == null ? null : Number(limiteGoles),
            marcador: { red: 0, azul: 0 },
            fase: 'SAQUE',
            tiempoExtra: false,
            pausedFrom: null,
            equipoSaque: 'red',
            sacadorId: null,
            ultimoGol: null,
            golTranscurridoMs: 0,
            faseDespuesGol: null
        };

        function primerJugadorDe(equipo) {
            const jugador = match.estadoFisica.players.find(item => item.equipo === equipo);
            return jugador ? jugador.id : null;
        }

        function prepararSaque(equipo) {
            match.equipoSaque = equipo;
            match.sacadorId = primerJugadorDe(equipo);
            match.estadoFisica.kickoffTeam = equipo;
            match.estadoFisica.kickoffPlayerId = match.sacadorId;
        }

        function procesarGol() {
            const estado = match.estadoFisica;
            const equipoGol = estado.lastGoalTeam === 'blue' ? 'blue' : 'red';
            const clave = equipoGol === 'blue' ? 'azul' : 'red';
            const autor = estado.players.find(item => item.id === estado.lastTouch);
            match.marcador[clave] += 1;
            match.ultimoGol = {
                equipo: clave,
                jugadorId: autor ? autor.id : null,
                enContra: !!(autor && autor.equipo !== equipoGol),
                numero: match.marcador.red + match.marcador.azul
            };
            match.golTranscurridoMs = 0;
            const alcanzoLimite = match.limiteGoles != null && match.marcador[clave] >= match.limiteGoles;
            match.faseDespuesGol = match.tiempoExtra || alcanzoLimite ? 'FIN' : 'SAQUE';
            // Saca el equipo que recibió el gol.
            if (match.faseDespuesGol === 'SAQUE') prepararSaque(equipoGol === 'red' ? 'blue' : 'red');
        }

        function terminarCelebracion() {
            if (match.faseDespuesGol === 'FIN') {
                match.fase = 'FIN';
                return;
            }
            fisica.reiniciarSaque(match.estadoFisica);
            match.fase = 'SAQUE';
            match.faseDespuesGol = null;
        }

        function actualizar(deltaMs, inputs = {}) {
            if (match.fase === 'PAUSA' || match.fase === 'FIN') return obtenerSnapshot();
            const transcurrido = Math.min(Math.max(Number(deltaMs) || 0, 0), 250);
            const resultado = fisica.avanzar(match.estadoFisica, transcurrido, inputs);
            const tiempoSimulado = resultado.pasos * PASO_MS;

            if (match.fase === 'GOL') {
                match.golTranscurridoMs += tiempoSimulado;
                if (match.golTranscurridoMs >= DURACION_GOL_MS) terminarCelebracion();
                return obtenerSnapshot();
            }

            if (resultado.eventos.includes('primerToque') && match.fase === 'SAQUE') {
                match.fase = match.tiempoExtra ? 'TIEMPO_EXTRA' : 'JUGANDO';
            }

            if (resultado.eventos.includes('gol')) {
                match.fase = 'GOL';
                procesarGol();
                return obtenerSnapshot();
            }

            if (match.fase === 'JUGANDO') {
                match.remainingMs = Math.max(0, match.remainingMs - tiempoSimulado);
                if (match.remainingMs === 0) {
                    if (match.marcador.red === match.marcador.azul) {
                        match.tiempoExtra = true;
                        match.fase = 'TIEMPO_EXTRA';
                    } else {
                        match.fase = 'FIN';
                    }
                }
            }
            return obtenerSnapshot();
        }

        function pausar() {
            if (match.fase !== 'PAUSA' && match.fase !== 'FIN') {
                match.pausedFrom = match.fase;
                match.fase = 'PAUSA';
            }
            return obtenerSnapshot();
        }

        function reanudar() {
            if (match.fase === 'PAUSA') match.fase = match.pausedFrom || 'JUGANDO';
            return obtenerSnapshot();
        }

        function obtenerSnapshot() {
            return {
                marcador: { red: match.marcador.red, azul: match.marcador.azul },
                remainingMs: match.remainingMs,
                fase: match.fase,
                tiempoExtra: match.tiempoExtra,
                sacadorId: match.sacadorId,
                equipoSaque: match.equipoSaque,
                ultimoGol: match.ultimoGol,
                golTranscurridoMs: match.golTranscurridoMs,
                duracionGolMs: DURACION_GOL_MS,
                estadoFisica: match.estadoFisica
            };
        }

        prepararSaque('red');
        return { actualizar, pausar, reanudar, obtenerSnapshot };
    }

    const MatchManager = { crear, DURACION_GOL_MS };
    global.MatchManager = MatchManager;
    if (typeof module !== 'undefined' && module.exports) module.exports = MatchManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
