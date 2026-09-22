/**
 * juego-local.js
 * 
 * Controlador principal de la partida en modo local (offline).
 * Inicializa el canvas, maneja la puntuación, el tiempo de juego, y 
 * se comunica con el motor físico y de renderizado de manera local, 
 * sin necesidad de conectarse al servidor (Socket.IO).
 */
(function (global) {
    const canvas = document.getElementById('localCanvas');
    const context = canvas.getContext('2d');
    const redScore = document.getElementById('redScore');
    const blueScore = document.getElementById('blueScore');
    const localClock = document.getElementById('localClock');
    const extraTimeBanner = document.getElementById('extraTimeBanner');
    const matchPhase = document.getElementById('matchPhase');
    const pauseButton = document.getElementById('pauseButton');
    const pauseOverlay = document.getElementById('pauseOverlay');
    const finishOverlay = document.getElementById('finishOverlay');
    const finishResult = document.getElementById('finishResult');

    const mapas = Array.isArray(global.MAPAS) ? global.MAPAS : [];
    let configuracion = leerConfiguracion();
    let partido = null;
    let ultimoTimestamp = null;
    let loopActivo = true;
    let celebracionGol = null;
    let ultimoGolMostrado = null;
    const duracionCelebracionGolMs = 1400;

    function leerConfiguracion() {
        const matchTime = Number.parseInt(localStorage.getItem('localMatchTime'), 10);
        const rawGoalLimit = localStorage.getItem('localGoalLimit');
        const mapIndex = Number.parseInt(localStorage.getItem('localMapIndex'), 10);
        const goalLimit = rawGoalLimit === null || rawGoalLimit === 'null' ? null : Number.parseInt(rawGoalLimit, 10);

        return {
            matchTime: [3, 5, 7].includes(matchTime) ? matchTime : 5,
            goalLimit: goalLimit === null || [3, 5, 10].includes(goalLimit) ? goalLimit : 5,
            mapIndex: Number.isInteger(mapIndex) && mapIndex >= 0 && mapIndex < mapas.length ? mapIndex : 0
        };
    }

    function obtenerMapa() {
        return mapas[configuracion.mapIndex] || mapas[0];
    }

    function crearPartido() {
        const mapa = obtenerMapa();
        const estadoFisica = global.FisicaLocal.crearEstado({
            mapa,
            ladoIzquierdo: 'red',
            jugadores: [
                { id: 'j1', equipo: 'red' },
                { id: 'j2', equipo: 'blue' }
            ]
        });
        partido = global.MatchManager.crear({
            estadoFisica,
            tiempoMs: configuracion.matchTime * 60 * 1000,
            limiteGoles: configuracion.goalLimit
        });
        canvas.width = mapa.width;
        canvas.height = mapa.height;
    }

    function formatearTiempo(remainingMs) {
        const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function actualizarHud(snapshot) {
        redScore.textContent = snapshot.marcador.red;
        blueScore.textContent = snapshot.marcador.azul;
        localClock.textContent = formatearTiempo(snapshot.remainingMs);
        extraTimeBanner.hidden = !snapshot.tiempoExtra;
        matchPhase.textContent = snapshot.fase === 'SAQUE' && snapshot.sacadorId
            ? `SAQUE · HABILITADO: ${snapshot.sacadorId.toUpperCase()}`
            : snapshot.fase;
        pauseButton.textContent = snapshot.fase === 'PAUSA' ? 'Reanudar' : 'Pausar';
    }

    function dibujarCancha(estado) {
        const mapa = estado.mapa;
        const field = estado.field;
        const goalWidth = 45;
        const centerX = mapa.width / 2;
        const centerY = mapa.height / 2;

        context.clearRect(0, 0, mapa.width, mapa.height);
        context.fillStyle = mapa.bg || '#111827';
        context.fillRect(0, 0, mapa.width, mapa.height);
        context.fillStyle = mapa.goalBg || '#0b1220';
        context.fillRect(field.left - goalWidth, estado.goalTop, goalWidth, estado.goalBottom - estado.goalTop);
        context.fillRect(field.right, estado.goalTop, goalWidth, estado.goalBottom - estado.goalTop);
        context.fillStyle = mapa.fieldColor || '#273444';
        context.fillRect(field.left, field.top, field.right - field.left, field.bottom - field.top);

        context.strokeStyle = mapa.lineColor || '#fff';
        context.lineWidth = 3;
        context.strokeRect(field.left, field.top, field.right - field.left, field.bottom - field.top);
        context.beginPath();
        context.moveTo(centerX, field.top);
        context.lineTo(centerX, field.bottom);
        context.stroke();
        context.beginPath();
        context.arc(centerX, centerY, mapa.width * .085, 0, Math.PI * 2);
        context.stroke();
        context.strokeRect(field.left - goalWidth, estado.goalTop, goalWidth, estado.goalBottom - estado.goalTop);
        context.strokeRect(field.right, estado.goalTop, goalWidth, estado.goalBottom - estado.goalTop);
    }

    function dibujarPelota(ball) {
        context.beginPath();
        context.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        context.fillStyle = '#f8fafc';
        context.fill();
        context.strokeStyle = '#0f172a';
        context.lineWidth = 2;
        context.stroke();
    }

    function obtenerColorPower(power) {
        if (power === 'BIG') return '#ff9f43';
        if (power === 'SUPER_KICK') return '#ff0055';
        return '#ffd700';
    }

    function obtenerIconoPower(power) {
        if (power === 'SPEED') return '⚡';
        if (power === 'BIG') return '🛡️';
        if (power === 'SUPER_KICK') return '🥊';
        return '';
    }

    function dibujarPowerUps(estado) {
        estado.activePowerUps.forEach(powerUp => {
            context.beginPath();
            context.arc(powerUp.x, powerUp.y, powerUp.r, 0, Math.PI * 2);
            context.fillStyle = obtenerColorPower(powerUp.type);
            context.globalAlpha = 0.9;
            context.fill();
            context.globalAlpha = 1;
            context.strokeStyle = '#fff';
            context.lineWidth = 2;
            context.stroke();
            context.fillStyle = '#fff';
            context.font = '700 16px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(obtenerIconoPower(powerUp.type), powerUp.x, powerUp.y);
        });
    }

    function dibujarJugador(player) {
        context.beginPath();
        context.arc(player.x, player.y, player.r, 0, Math.PI * 2);
        context.fillStyle = player.equipo === 'red' ? '#dc2626' : '#2563eb';
        context.fill();
        if (player.activePower) {
            context.strokeStyle = obtenerColorPower(player.activePower);
            context.lineWidth = 4;
            context.stroke();
        }
        context.strokeStyle = '#fff';
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = '#fff';
        context.font = '700 14px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(player.id.toUpperCase(), player.x, player.y);
    }

    function obtenerClaveGol(snapshot) {
        if (!snapshot.ultimoGol) return null;
        return `${snapshot.marcador.red}:${snapshot.marcador.azul}:${snapshot.ultimoGol.equipo}:${snapshot.ultimoGol.jugadorId || ''}`;
    }

    function iniciarCelebracionGol(snapshot) {
        const claveGol = obtenerClaveGol(snapshot);
        if (!claveGol || claveGol === ultimoGolMostrado) return;
        ultimoGolMostrado = claveGol;
        celebracionGol = {
            transcurridoMs: 0,
            snapshot,
            claveGol
        };
        global.InputLocal.limpiar();
    }

    function dibujarCelebracionGol() {
        if (!celebracionGol) return;
        const progreso = Math.min(celebracionGol.transcurridoMs / duracionCelebracionGolMs, 1);
        const entrada = Math.min(progreso / .25, 1);
        const salida = progreso > .72 ? (1 - progreso) / .28 : 1;
        const alpha = Math.max(0, Math.min(entrada, salida));
        const escala = 0.72 + Math.sin(Math.min(progreso, .72) / .72 * Math.PI) * .28;
        const gol = celebracionGol.snapshot.ultimoGol;
        const equipo = gol.equipo === 'red' ? 'RED' : 'AZUL';
        const jugador = gol.jugadorId ? ` · ${gol.jugadorId.toUpperCase()}` : '';

        context.save();
        context.fillStyle = `rgba(2, 6, 23, ${.28 * alpha})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalAlpha = alpha;
        context.translate(canvas.width / 2, canvas.height / 2);
        context.scale(escala, escala);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `900 ${Math.max(42, canvas.width * .105)}px Arial Black, Arial`;
        context.lineWidth = Math.max(4, canvas.width * .008);
        context.strokeStyle = '#020617';
        context.strokeText('¡GOL!', 0, -18);
        context.fillStyle = equipo === 'RED' ? '#f87171' : '#38bdf8';
        context.fillText('¡GOL!', 0, -18);
        context.font = `800 ${Math.max(18, canvas.width * .032)}px Arial`;
        context.fillStyle = '#fff';
        context.fillText(`${equipo}${jugador}`, 0, 42);
        context.restore();
    }

    function renderizar(snapshot) {
        const estado = snapshot.estadoFisica;
        dibujarCancha(estado);
        dibujarPelota(estado.ball);
        dibujarPowerUps(estado);
        estado.players.forEach(dibujarJugador);
        dibujarCelebracionGol();
        actualizarHud(snapshot);
    }

    function mostrarPausa(visible) {
        pauseOverlay.hidden = !visible;
    }

    function alternarPausa() {
        const fase = partido.obtenerSnapshot().fase;
        if (fase === 'FIN') return;
        global.InputLocal.limpiar();
        if (fase === 'PAUSA') {
            partido.reanudar();
            mostrarPausa(false);
        } else {
            partido.pausar();
            mostrarPausa(true);
        }
    }

    function reiniciarPartido() {
        global.InputLocal.limpiar();
        configuracion = leerConfiguracion();
        crearPartido();
        celebracionGol = null;
        ultimoGolMostrado = null;
        finishOverlay.hidden = true;
        mostrarPausa(false);
        ultimoTimestamp = null;
        loopActivo = true;
    }

    function mostrarFin(snapshot) {
        const { red, azul } = snapshot.marcador;
        const resultado = red === azul ? 'Empate' : red > azul ? 'Ganó el equipo rojo' : 'Ganó el equipo azul';
        finishResult.textContent = `${resultado} · Rojo ${red} - ${azul} Azul`;
        finishOverlay.hidden = false;
        global.InputLocal.limpiar();
    }

    function volverAlMenu() {
        global.location.href = 'menu.html';
    }

    function loop(timestamp) {
        if (!loopActivo) return;
        const deltaMs = ultimoTimestamp === null ? 0 : Math.max(0, timestamp - ultimoTimestamp);
        ultimoTimestamp = timestamp;
        const snapshotAntes = partido.obtenerSnapshot();
        if (snapshotAntes.fase === 'GOL') {
            iniciarCelebracionGol(snapshotAntes);
        }

        if (celebracionGol) {
            if (snapshotAntes.fase !== 'PAUSA') celebracionGol.transcurridoMs += deltaMs;
            if (celebracionGol.transcurridoMs >= duracionCelebracionGolMs && snapshotAntes.fase === 'GOL') {
                celebracionGol = null;
                partido.actualizar(0, {});
            }
        } else if (snapshotAntes.fase !== 'PAUSA' && snapshotAntes.fase !== 'FIN') {
            partido.actualizar(deltaMs, global.InputLocal.obtenerInputs());
        }
        const snapshot = partido.obtenerSnapshot();
        if (snapshot.fase === 'GOL') iniciarCelebracionGol(snapshot);
        renderizar(snapshot);
        if (snapshot.fase === 'FIN' && finishOverlay.hidden) {
            mostrarFin(snapshot);
            loopActivo = false;
            return;
        }
        global.requestAnimationFrame(loop);
    }

    pauseButton.addEventListener('click', alternarPausa);
    document.getElementById('resumeButton').addEventListener('click', alternarPausa);
    document.getElementById('restartButton').addEventListener('click', reiniciarPartido);
    document.getElementById('pauseExitButton').addEventListener('click', volverAlMenu);
    document.getElementById('finishExitButton').addEventListener('click', volverAlMenu);
    document.addEventListener('keydown', event => {
        if (partido.obtenerSnapshot().fase === 'PAUSA') global.InputLocal.limpiar();
        if (event.key === 'Escape' && !event.repeat) alternarPausa();
    });

    crearPartido();
    global.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);