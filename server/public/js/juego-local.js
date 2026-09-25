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
    const kickEffects = [];
    const duracionEfectoPatadaMs = 120;
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

    function dibujarFondoTematico(mapa, timestamp) {
        const time = timestamp * 0.001;
        const width = mapa.width;
        const height = mapa.height;

        const gradient = context.createRadialGradient(width / 2, height / 2, 30, width / 2, height / 2, Math.max(width, height));
        switch (mapa.theme) {
            case 'frozen': gradient.addColorStop(0, '#bfe8ff'); gradient.addColorStop(1, '#1d4ed8'); break;
            case 'desert': gradient.addColorStop(0, '#f7d28d'); gradient.addColorStop(1, '#7c2d12'); break;
            case 'street': gradient.addColorStop(0, '#3b4252'); gradient.addColorStop(1, '#111827'); break;
            case 'champions': gradient.addColorStop(0, '#214a7a'); gradient.addColorStop(1, '#0f172a'); break;
            case 'cyberpunk': gradient.addColorStop(0, '#32104d'); gradient.addColorStop(1, '#090b18'); break;
            case 'micro': gradient.addColorStop(0, '#9a4d18'); gradient.addColorStop(1, '#2d160b'); break;
            case 'titan': gradient.addColorStop(0, '#4c245f'); gradient.addColorStop(1, '#1b1022'); break;
            case 'tunnel': gradient.addColorStop(0, '#14532d'); gradient.addColorStop(1, '#062312'); break;
            case 'volcanic': gradient.addColorStop(0, '#8b2f1c'); gradient.addColorStop(1, '#160b0b'); break;
            default: gradient.addColorStop(0, '#1f2937'); gradient.addColorStop(1, '#050813'); break;
        }

        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);

        if (mapa.theme === 'classic') {
            for (let i = 0; i < 14; i++) {
                const x = ((i * 91 + time * 18) % (width + 50)) - 25;
                const y = ((i * 53 + time * 14) % (height + 30)) - 15;
                context.fillStyle = `rgba(255,255,255,${0.08 + (i % 4) * 0.04})`;
                context.fillRect(x, y, 4, 4);
            }
        }

        if (mapa.theme === 'street') {
            for (let i = -2; i < 12; i++) {
                const offset = (time * 120 + i * 120) % (width + 200);
                context.fillStyle = `rgba(255, 159, 67, ${0.10 + (i % 3) * 0.05})`;
                context.fillRect(offset - 90, 0, 28, height);
            }
        }

        if (mapa.theme === 'frozen') {
            for (let i = 0; i < 28; i++) {
                const x = ((i * 113 + time * 28) % (width + 40)) - 20;
                const y = ((i * 71 + time * (18 + (i % 3) * 7)) % (height + 30)) - 15;
                context.fillStyle = `rgba(255,255,255,${0.55 + (i % 5) * 0.08})`;
                context.beginPath();
                context.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
                context.fill();
            }
        }

        if (mapa.theme === 'desert') {
            for (let i = 0; i < 10; i++) {
                const y = height * 0.2 + i * (height / 10);
                context.beginPath();
                context.moveTo(-15, y + 18);
                for (let x = -15; x <= width + 15; x += 22) {
                    const wave = Math.sin((x * 0.04) + time * 1.2 + i) * 16;
                    context.lineTo(x, y + wave);
                }
                context.strokeStyle = `rgba(245, 158, 11, ${0.18 + i * 0.04})`;
                context.lineWidth = 2;
                context.stroke();
            }
        }

        if (mapa.theme === 'champions') {
            for (let i = 0; i < 8; i++) {
                const x = ((i * 170 + time * 80) % (width + 160)) - 80;
                context.fillStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.02})`;
                context.fillRect(x, 0, 34, height);
            }
        }

        if (mapa.theme === 'cyberpunk') {
            for (let i = 0; i < 12; i++) {
                const y = (i * 56 + time * 35) % (height + 35);
                context.strokeStyle = `rgba(0,255,204,${0.12 + i * 0.03})`;
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(width, y + Math.sin(time + i) * 10);
                context.stroke();
            }
        }

        if (mapa.theme === 'micro') {
            for (let i = 0; i < 24; i++) {
                const x = ((i * 55 + time * 26) % (width + 20)) - 10;
                const y = ((i * 41 + time * 16) % (height + 20)) - 10;
                context.fillStyle = `rgba(251, 191, 36, ${0.18 + (i % 4) * 0.06})`;
                context.beginPath();
                context.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
                context.fill();
            }
        }

        if (mapa.theme === 'titan') {
            for (let i = 0; i < 6; i++) {
                const radius = 110 + i * 40 + Math.sin(time + i) * 20;
                const x = width * 0.5 + Math.sin(time * 0.7 + i) * (width * 0.25);
                const y = height * 0.5 + Math.cos(time * 0.8 + i) * (height * 0.18);
                context.beginPath();
                context.arc(x, y, radius, 0, Math.PI * 2);
                context.strokeStyle = `rgba(245, 158, 11, ${0.08 + i * 0.03})`;
                context.lineWidth = 2;
                context.stroke();
            }
        }

        if (mapa.theme === 'tunnel') {
            for (let i = 0; i < 9; i++) {
                const offset = ((time * 80 + i * 90) % (width + 60)) - 30;
                context.strokeStyle = `rgba(186, 230, 253, ${0.16 + i * 0.04})`;
                context.beginPath();
                context.moveTo(offset, height * 0.2);
                context.lineTo(offset + 80, height * 0.8);
                context.stroke();
            }
        }

        if (mapa.theme === 'volcanic') {
            for (let i = 0; i < 24; i++) {
                const x = ((i * 91 + time * 42) % (width + 30)) - 15;
                const y = ((i * 64 + time * (18 + (i % 2) * 12)) % (height + 28)) - 14;
                context.fillStyle = `rgba(251, 146, 60, ${0.18 + (i % 3) * 0.08})`;
                context.beginPath();
                context.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
                context.fill();
            }
        }
    }

    function dibujarEfectosCancha(estado) {
        const mapa = estado.mapa;
        const field = estado.field;
        const width = field.right - field.left;
        const height = field.bottom - field.top;
        const time = performance.now() * 0.001;

        context.save();
        context.beginPath();
        context.rect(field.left, field.top, width, height);
        context.clip();

        switch (mapa.theme) {
            case 'frozen':
                for (let i = 0; i < 45; i++) {
                    const x = field.left + ((i * 89 + time * 32) % width);
                    const y = field.top + ((i * 67 + time * (26 + (i % 4) * 8)) % height);
                    context.fillStyle = `rgba(255,255,255,${0.35 + (i % 5) * 0.12})`;
                    context.beginPath();
                    context.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
                    context.fill();
                }
                break;
            case 'desert':
                for (let i = 0; i < 14; i++) {
                    const y = field.top + (i / 14) * height;
                    context.beginPath();
                    context.moveTo(field.left, y);
                    for (let x = field.left; x <= field.right; x += 22) {
                        const wave = Math.sin((x * 0.045) + time * 1.8 + i) * 10;
                        context.lineTo(x, y + wave);
                    }
                    context.strokeStyle = `rgba(255,255,255,${0.22 + i * 0.02})`;
                    context.lineWidth = 1.5;
                    context.stroke();
                }
                break;
            case 'street':
                for (let i = 0; i < 16; i++) {
                    const y = field.top + ((i * 61 + time * 36) % height);
                    context.fillStyle = `rgba(255,255,255,${0.08 + (i % 5) * 0.04})`;
                    context.fillRect(field.left, y, width, 2);
                }
                break;
            case 'champions':
                for (let i = 0; i < 9; i++) {
                    const x = field.left + ((i * 160 + time * 70) % width);
                    context.fillStyle = `rgba(255,255,255,${0.08 + (i % 3) * 0.02})`;
                    context.fillRect(x, field.top, 18, height);
                }
                break;
            case 'cyberpunk':
                for (let i = 0; i < 20; i++) {
                    const x = field.left + ((i * 75 + time * 170) % width);
                    const y = field.top + (i % 2) * 18 + Math.sin(time + i) * 10;
                    context.fillStyle = `rgba(0,255,204,${0.18 + (i % 4) * 0.08})`;
                    context.fillRect(x, y, 8, height * 0.2);
                }
                break;
            case 'micro':
                for (let i = 0; i < 24; i++) {
                    const x = field.left + ((i * 31 + time * 58) % width);
                    const y = field.top + ((i * 41 + time * 28) % height);
                    context.fillStyle = `rgba(255,255,255,${0.2 + (i % 4) * 0.08})`;
                    context.beginPath();
                    context.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
                    context.fill();
                }
                break;
            case 'titan':
                for (let i = 0; i < 7; i++) {
                    const radius = 32 + i * 14 + Math.sin(time * 1.2 + i) * 12;
                    const x = field.left + width * 0.5 + Math.sin(time * 0.8 + i) * (width * 0.2);
                    const y = field.top + height * 0.5 + Math.cos(time * 0.9 + i) * (height * 0.22);
                    context.beginPath();
                    context.arc(x, y, radius, 0, Math.PI * 2);
                    context.strokeStyle = `rgba(255,255,255,${0.06 + i * 0.02})`;
                    context.lineWidth = 2;
                    context.stroke();
                }
                break;
            case 'tunnel':
                for (let i = 0; i < 12; i++) {
                    const x = field.left + ((i * 90 + time * 120) % width);
                    context.strokeStyle = `rgba(186,230,253,${0.15 + (i % 5) * 0.04})`;
                    context.beginPath();
                    context.moveTo(x, field.top);
                    context.lineTo(x + 30, field.bottom);
                    context.stroke();
                }
                break;
            case 'volcanic':
                for (let i = 0; i < 32; i++) {
                    const x = field.left + ((i * 49 + time * 52) % width);
                    const y = field.top + ((i * 26 + time * 32) % height);
                    context.fillStyle = `rgba(251, 146, 60, ${0.15 + (i % 4) * 0.08})`;
                    context.beginPath();
                    context.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
                    context.fill();
                }
                break;
            default:
                for (let i = 0; i < 18; i++) {
                    const x = field.left + ((i * 70 + time * 22) % width);
                    const y = field.top + ((i * 53 + time * 18) % height);
                    context.fillStyle = `rgba(255,255,255,${0.12 + (i % 4) * 0.04})`;
                    context.fillRect(x, y, 6, 6);
                }
        }

        context.restore();
    }

    function dibujarCancha(estado) {
        const mapa = estado.mapa;
        const field = estado.field;
        const goalWidth = 45;
        const centerX = mapa.width / 2;
        const centerY = mapa.height / 2;

        context.clearRect(0, 0, mapa.width, mapa.height);
        dibujarFondoTematico(mapa, performance.now());
        context.fillStyle = mapa.goalBg || '#0b1220';
        context.fillRect(field.left - goalWidth, estado.goalTop, goalWidth, estado.goalBottom - estado.goalTop);
        context.fillRect(field.right, estado.goalTop, goalWidth, estado.goalBottom - estado.goalTop);
        context.fillStyle = mapa.fieldColor || '#273444';
        context.fillRect(field.left, field.top, field.right - field.left, field.bottom - field.top);
        dibujarEfectosCancha(estado);

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
            context.lineWidth = 3;
            context.stroke();
            context.fillStyle = '#fff';
            context.font = '700 16px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(obtenerIconoPower(powerUp.type), powerUp.x, powerUp.y);
        });
    }

    function dibujarJugador(player) {
        const estaPateando = kickEffects.some(efecto => efecto.player === player);
        context.beginPath();
        context.arc(player.x, player.y, player.r, 0, Math.PI * 2);
        context.fillStyle = player.equipo === 'red' ? '#dc2626' : '#2563eb';
        context.fill();
        if (player.activePower) {
            context.strokeStyle = obtenerColorPower(player.activePower);
            context.lineWidth = 4;
            context.stroke();
        }
        context.strokeStyle = estaPateando ? '#fff' : '#000';
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = '#fff';
        context.font = '700 14px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(player.id.toUpperCase(), player.x, player.y);
    }

    function registrarEfectosPatada(estado, timestamp) {
        estado.kickEvents.splice(0).forEach(evento => {
            kickEffects.push({
                player: evento.player,
                startTime: timestamp
            });
        });
    }

    function actualizarEfectosPatada(timestamp) {
        for (let index = kickEffects.length - 1; index >= 0; index -= 1) {
            const efecto = kickEffects[index];
            if (timestamp - efecto.startTime >= duracionEfectoPatadaMs) {
                kickEffects.splice(index, 1);
            }
        }
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

    function obtenerPelotaDuranteGol(snapshot) {
        if (!celebracionGol || snapshot.fase !== 'GOL') return snapshot.estadoFisica.ball;
        const estado = snapshot.estadoFisica;
        const ball = celebracionGol.snapshot.estadoFisica.ball;
        const frames = celebracionGol.transcurridoMs / 16.666;
        const friction = 0.985;
        const displacementFactor = friction === 1
            ? frames
            : (1 - Math.pow(friction, frames)) / (1 - friction);
        let x = ball.x + ball.vx * displacementFactor;
        let y = ball.y + ball.vy * displacementFactor;
        const goalBackLeft = estado.field.left - 45 + ball.r;
        const goalBackRight = estado.field.right + 45 - ball.r;
        const goalTop = estado.goalTop + ball.r;
        const goalBottom = estado.goalBottom - ball.r;
        y = Math.max(goalTop, Math.min(goalBottom, y));
        if (ball.vx < 0) x = Math.max(goalBackLeft, Math.min(estado.field.left - ball.r, x));
        else x = Math.min(goalBackRight, Math.max(estado.field.right + ball.r, x));
        return { ...ball, x, y };
    }

    function renderizar(snapshot) {
        const estado = snapshot.estadoFisica;
        dibujarCancha(estado);
        dibujarPelota(obtenerPelotaDuranteGol(snapshot));
        dibujarPowerUps(estado);
        estado.players.forEach(dibujarJugador);
        actualizarEfectosPatada(ultimoTimestamp);
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
        kickEffects.length = 0;
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
        registrarEfectosPatada(snapshot.estadoFisica, timestamp);
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