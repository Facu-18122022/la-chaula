/**
 * match-manager.js
 * 
 * Gestor del flujo y reglas de un partido.
 * Controla el reloj (temporizador), el marcador, las transiciones de fases 
 * (SAQUE, JUGANDO, GOL, FIN) y la lógica de tiempo extra.
 */
(function (global) {
    function crear({ estadoFisica, tiempoMs, limiteGoles = null } = {}) {
        const match = {
            estadoFisica,
            remainingMs: Math.max(0, Number(tiempoMs) || 0),
            limiteGoles: limiteGoles == null ? null : Number(limiteGoles),
            marcador: { red: 0, azul: 0 },
            fase: 'SAQUE',
            tiempoExtra: false,
            pausedFrom: null,
            sacadorId: 'j1',
            ultimoGol: null,
            accumulatorMs: 0,
            fixedStepMs: 16.666,
            maxSubsteps: 8,
            faseDespuesGol: null
        };
        estadoFisica.kickoffPlayerId = match.sacadorId;

        function inputsParaPaso(inputs) {
            return inputs;
        }

        function tieneAccion(input) {
            return !!(input && (input.up || input.down || input.left || input.right || input.kick));
        }

        function prepararSaque() {
            const goalTeam = match.estadoFisica.lastGoalTeam;
            if (goalTeam === 'red') match.sacadorId = 'j2';
            else if (goalTeam === 'blue') match.sacadorId = 'j1';
            else if (match.sacadorId !== 'j1' && match.sacadorId !== 'j2') match.sacadorId = 'j1';
            match.estadoFisica.kickoffPlayerId = match.sacadorId;
        }

        function procesarGol() {
            const goalTeam = match.estadoFisica.lastGoalTeam;
            const scorer = goalTeam === 'blue' ? 'azul' : 'red';
            const jugadorId = match.estadoFisica.lastTouch === 'j1' || match.estadoFisica.lastTouch === 'j2'
                ? match.estadoFisica.lastTouch
                : null;
            match.marcador[scorer] += 1;
            match.ultimoGol = { equipo: scorer, jugadorId };
            if (match.tiempoExtra || (match.limiteGoles != null && match.marcador[scorer] >= match.limiteGoles)) {
                match.faseDespuesGol = 'FIN';
                return;
            }
            prepararSaque();
            match.faseDespuesGol = 'SAQUE';
        }

        function avanzarPaso(inputs) {
            const inputsDelPaso = inputsParaPaso(inputs);
            const accionDelSacador = tieneAccion(inputsDelPaso[match.sacadorId]);
            const result = global.FisicaLocal.avanzar(match.estadoFisica, match.fixedStepMs, inputsDelPaso);
            const primerToqueDetectado = result.eventos.includes('primerToque') && match.estadoFisica.lastTouch === match.sacadorId;
            const primerToqueValido = primerToqueDetectado && accionDelSacador;
            if (primerToqueDetectado && !primerToqueValido) {
                match.estadoFisica.waitingForKickOff = true;
                match.estadoFisica.timerStarted = false;
                match.estadoFisica.lastTouch = null;
                match.estadoFisica.ball.x = match.estadoFisica.mapa.width / 2;
                match.estadoFisica.ball.y = match.estadoFisica.mapa.height / 2;
                match.estadoFisica.ball.vx = 0;
                match.estadoFisica.ball.vy = 0;
            }
            if (primerToqueValido && match.fase === 'SAQUE') match.fase = 'JUGANDO';
            if (result.eventos.includes('gol') && (match.fase === 'JUGANDO' || match.fase === 'SAQUE' || match.fase === 'TIEMPO_EXTRA')) {
                match.fase = 'GOL';
                procesarGol();
            }
        }

        function actualizar(deltaMs, inputs = {}) {
            if (match.fase === 'PAUSA' || match.fase === 'FIN') return obtenerSnapshot();
            if (match.fase === 'GOL') {
                match.fase = match.faseDespuesGol || 'SAQUE';
                match.faseDespuesGol = null;
                return obtenerSnapshot();
            }
            const elapsed = Math.min(Math.max(Number(deltaMs) || 0, 0), 250);
            const physics = global.FisicaLocal;
            if (!physics) throw new Error('FisicaLocal debe estar disponible antes de crear el partido');
            match.accumulatorMs += elapsed;
            let substeps = 0;
            while (match.accumulatorMs >= match.fixedStepMs && substeps < match.maxSubsteps && match.fase !== 'GOL' && match.fase !== 'FIN') {
                avanzarPaso(inputs);
                match.accumulatorMs -= match.fixedStepMs;
                substeps += 1;
                if (match.fase === 'JUGANDO') {
                    if (!match.tiempoExtra) match.remainingMs = Math.max(0, match.remainingMs - match.fixedStepMs);
                    if (match.remainingMs === 0 && !match.tiempoExtra) {
                        if (match.marcador.red === match.marcador.azul) {
                            match.tiempoExtra = true;
                            match.fase = 'TIEMPO_EXTRA';
                        } else {
                            match.fase = 'FIN';
                        }
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
                ultimoGol: match.ultimoGol,
                estadoFisica: match.estadoFisica
            };
        }

        return { actualizar, pausar, reanudar, obtenerSnapshot };
    }

    const MatchManager = { crear };
    global.MatchManager = MatchManager;
    if (typeof module !== 'undefined' && module.exports) module.exports = MatchManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);