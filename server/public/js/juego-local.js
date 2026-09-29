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
    let faseAnterior = null;
    let startAnterior = false;
    const kickEffects = [];
    const duracionEfectoPatadaMs = 160;
    const COLOR_ROJO = '#e56e56';
    const COLOR_AZUL = '#5689e5';
    const duracionEstelaRapidezMs = 280;
    const duracionGrietasMs = 560;
    const duracionExplosionMs = 320;
    let efectosVisuales = crearEfectosVisuales();

    function crearEfectosVisuales() {
        return {
            estelas: { j1: [], j2: [] },
            posiciones: {},
            explosiones: [],
            ultimoImpactoId: 0
        };
    }

    function leerConfiguracion() {
        const matchTime = Number.parseInt(localStorage.getItem('localMatchTime'), 10);
        const rawGoalLimit = localStorage.getItem('localGoalLimit');
        const mapIndex = Number.parseInt(localStorage.getItem('localMapIndex'), 10);
        const goalLimit = rawGoalLimit === null || rawGoalLimit === 'null' ? null : Number.parseInt(rawGoalLimit, 10);

        return {
            matchTime: [3, 5, 7].includes(matchTime) ? matchTime : 5,
            goalLimit: goalLimit === null || [3, 5, 10].includes(goalLimit) ? goalLimit : 5,
            mapIndex: Number.isInteger(mapIndex) && mapIndex >= 0 && mapIndex < mapas.length ? mapIndex : 0,
            // Por defecto hay power-ups: solo un '0' guardado explícitamente los apaga.
            powerUps: localStorage.getItem('localPowerUps') !== '0'
        };
    }

    function obtenerMapa() {
        return mapas[configuracion.mapIndex] || mapas[0];
    }

    function crearPartido() {
        const mapa = obtenerMapa();
        const estadoFisica = global.FisicaHaxball.crearEstado({
            mapa,
            ladoIzquierdo: 'red',
            kickoffTeam: 'red',
            powerUps: configuracion.powerUps,
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
        efectosVisuales = crearEfectosVisuales();
        faseAnterior = null;
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
            ? `SAQUE · ${snapshot.sacadorId.toUpperCase()}`
            : snapshot.fase.replace('_', ' ');
        pauseButton.textContent = snapshot.fase === 'PAUSA' ? 'Reanudar' : 'Pausar';
    }

    function dibujarFondoTematico(mapa, timestamp) {
        const time = timestamp * 0.001;
        const width = mapa.width;
        const height = mapa.height;

        const gradient = context.createRadialGradient(width / 2, height / 2, 30, width / 2, height / 2, Math.max(width, height));
        switch (mapa.theme) {
            case 'haxball': gradient.addColorStop(0, mapa.bg); gradient.addColorStop(1, mapa.bg); break;
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
            case 'haxball': {
                // Césped a franjas como el fondo "grass" de HaxBall.
                const franja = 64;
                context.fillStyle = 'rgba(0, 0, 0, .045)';
                for (let x = field.left; x < field.right; x += franja * 2) {
                    context.fillRect(x, field.top, Math.min(franja, field.right - x), height);
                }
                break;
            }
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

    // Escala del mapa (ver fisica-haxball.js): el canvas mide lo mismo que el mapa
    // y se achica por CSS, así que los grosores fijos en px se multiplican por
    // esto para que en mapas grandes se vean como en el de referencia.
    function escalaDe(estado) {
        return (estado && estado.mapa && estado.mapa.escala) || 1;
    }

    function dibujarCancha(estado) {
        const mapa = estado.mapa;
        const escala = escalaDe(estado);
        const field = estado.field;
        const profundidad = mapa.profundidadArco;
        const centerX = mapa.width / 2;
        const centerY = mapa.height / 2;
        const altoArco = estado.goalBottom - estado.goalTop;

        context.clearRect(0, 0, mapa.width, mapa.height);
        dibujarFondoTematico(mapa, performance.now());
        context.fillStyle = mapa.goalBg || '#0b1220';
        context.fillRect(field.left - profundidad, estado.goalTop, profundidad, altoArco);
        context.fillRect(field.right, estado.goalTop, profundidad, altoArco);
        context.fillStyle = mapa.fieldColor || '#273444';
        context.fillRect(field.left, field.top, field.right - field.left, field.bottom - field.top);
        dibujarEfectosCancha(estado);

        context.strokeStyle = mapa.lineColor || '#fff';
        context.lineWidth = 3 * escala;
        context.strokeRect(field.left, field.top, field.right - field.left, field.bottom - field.top);
        context.beginPath();
        context.moveTo(centerX, field.top);
        context.lineTo(centerX, field.bottom);
        context.stroke();
        context.beginPath();
        context.arc(centerX, centerY, mapa.radioSaque, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.arc(centerX, centerY, 3 * escala, 0, Math.PI * 2);
        context.fillStyle = mapa.lineColor || '#fff';
        context.fill();
        dibujarRedes(estado);
    }

    function dibujarRedes(estado) {
        const { field, goalTop, goalBottom, mapa } = estado;
        const profundidad = mapa.profundidadArco;
        context.save();
        context.strokeStyle = '#000';
        context.lineWidth = 2 * escalaDe(estado);
        [
            [field.left, field.left - profundidad],
            [field.right, field.right + profundidad]
        ].forEach(([boca, fondo]) => {
            context.beginPath();
            context.moveTo(boca, goalTop);
            context.lineTo(fondo, goalTop);
            context.lineTo(fondo, goalBottom);
            context.lineTo(boca, goalBottom);
            context.stroke();
        });
        context.restore();
    }

    function dibujarPostes(estado) {
        const escala = escalaDe(estado);
        estado.postes.forEach(poste => {
            context.beginPath();
            context.arc(poste.x, poste.y, poste.r, 0, Math.PI * 2);
            context.fillStyle = poste.lado === 'izquierdo' ? '#ffcccc' : '#ccccff';
            context.fill();
            context.strokeStyle = '#000';
            context.lineWidth = 2 * escala;
            context.stroke();
        });
    }

    function dibujarPelota(ball, escala = 1) {
        context.beginPath();
        context.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        context.fillStyle = '#f8fafc';
        context.fill();
        context.strokeStyle = '#0f172a';
        context.lineWidth = 2 * escala;
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
        const escala = escalaDe(estado);
        estado.activePowerUps.forEach(powerUp => {
            context.beginPath();
            context.arc(powerUp.x, powerUp.y, powerUp.r, 0, Math.PI * 2);
            context.fillStyle = obtenerColorPower(powerUp.type);
            context.globalAlpha = 0.9;
            context.fill();
            context.globalAlpha = 1;
            context.strokeStyle = '#fff';
            context.lineWidth = 3 * escala;
            context.stroke();
            context.fillStyle = '#fff';
            // Ícono proporcional al power-up (16 px con el radio 15 de referencia).
            context.font = `700 ${Math.round(powerUp.r * 16 / 15)}px Arial`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(obtenerIconoPower(powerUp.type), powerUp.x, powerUp.y);
        });
    }

    function actualizarEfectosVisuales(estado, deltaMs) {
        const tiempo = Math.max(0, deltaMs || 0);
        const impacto = estado.lastPowerImpact;
        if (impacto && impacto.id !== efectosVisuales.ultimoImpactoId) {
            efectosVisuales.ultimoImpactoId = impacto.id;
            efectosVisuales.explosiones.push({ x: impacto.x, y: impacto.y, edad: 0, escala: escalaDe(estado) });
        }

        estado.players.forEach(player => {
            const anterior = efectosVisuales.posiciones[player.id];
            const seMovio = anterior && Math.hypot(player.x - anterior.x, player.y - anterior.y) > 0.5;
            const estela = efectosVisuales.estelas[player.id];
            const ultimoRastro = estela[estela.length - 1];
            const distanciaDesdeRastro = ultimoRastro
                ? Math.hypot(player.x - ultimoRastro.x, player.y - ultimoRastro.y)
                : Infinity;
            const debeDejarMarca = player.activePower === 'SPEED'
                || (player.activePower === 'BIG' && distanciaDesdeRastro > player.r * 1.8);
            if (seMovio && debeDejarMarca) {
                estela.push({
                    x: anterior.x,
                    y: anterior.y,
                    radio: player.r,
                    escala: escalaDe(estado),
                    tipo: player.activePower,
                    edad: 0,
                    variante: efectosVisuales.estelas[player.id].length % 3
                });
            }
            efectosVisuales.posiciones[player.id] = { x: player.x, y: player.y };
        });

        Object.values(efectosVisuales.estelas).forEach(estela => {
            estela.forEach(rastro => { rastro.edad += tiempo; });
            estela.splice(0, estela.length, ...estela.filter(rastro => rastro.edad < (
                rastro.tipo === 'BIG' ? duracionGrietasMs : duracionEstelaRapidezMs
            )));
        });
        efectosVisuales.explosiones.forEach(explosion => { explosion.edad += tiempo; });
        efectosVisuales.explosiones = efectosVisuales.explosiones.filter(
            explosion => explosion.edad < duracionExplosionMs
        );
    }

    function dibujarEstela(estela) {
        estela.forEach(rastro => {
            const duracion = rastro.tipo === 'BIG' ? duracionGrietasMs : duracionEstelaRapidezMs;
            const alphaBase = rastro.tipo === 'BIG' ? 0.72 : 0.42;
            const alpha = alphaBase * (1 - rastro.edad / duracion);
            const escala = rastro.escala || 1;
            context.save();
            context.globalAlpha = alpha;
            if (rastro.tipo === 'SPEED') {
                context.beginPath();
                context.arc(rastro.x, rastro.y, Math.max(8 * escala, rastro.radio * .72), 0, Math.PI * 2);
                context.fillStyle = '#ffe066';
                context.fill();
            } else {
                const radio = rastro.radio * (.62 + rastro.variante * .1);
                context.fillStyle = '#4a3528';
                context.strokeStyle = '#d8a879';
                context.lineWidth = 2.8 * escala;
                context.beginPath();
                for (let indice = 0; indice < 10; indice += 1) {
                    const angulo = indice / 10 * Math.PI * 2;
                    const variacion = 1 + ((indice + rastro.variante) % 3 - 1) * .16;
                    const x = rastro.x + Math.cos(angulo) * radio * variacion;
                    const y = rastro.y + Math.sin(angulo) * radio * variacion * .72;
                    if (indice === 0) context.moveTo(x, y);
                    else context.lineTo(x, y);
                }
                context.closePath();
                context.fill();
                context.stroke();
                context.fillStyle = 'rgba(20, 13, 10, .62)';
                context.beginPath();
                context.ellipse(rastro.x, rastro.y + radio * .14, radio * .62, radio * .34, 0, 0, Math.PI * 2);
                context.fill();
                context.strokeStyle = '#e5bd8c';
                context.lineWidth = 2.2 * escala;
                context.lineCap = 'round';
                for (let indice = 0; indice < 7; indice += 1) {
                    const angulo = indice / 7 * Math.PI * 2 + rastro.variante * .22;
                    const inicio = radio * .42;
                    const medio = radio * (.78 + (indice % 2) * .12);
                    const final = radio * (1.35 + (indice % 3) * .1);
                    context.beginPath();
                    context.moveTo(
                        rastro.x + Math.cos(angulo) * inicio,
                        rastro.y + Math.sin(angulo) * inicio * .72
                    );
                    context.lineTo(
                        rastro.x + Math.cos(angulo + .12) * medio,
                        rastro.y + Math.sin(angulo + .12) * medio * .72
                    );
                    context.lineTo(
                        rastro.x + Math.cos(angulo - .08) * final,
                        rastro.y + Math.sin(angulo - .08) * final * .72
                    );
                    context.stroke();
                }
            }
            context.restore();
        });
    }

    function dibujarEstelas() {
        dibujarEstela(efectosVisuales.estelas.j1);
        dibujarEstela(efectosVisuales.estelas.j2);
    }

    function dibujarExplosiones() {
        efectosVisuales.explosiones.forEach(explosion => {
            const progreso = explosion.edad / duracionExplosionMs;
            const alpha = 1 - progreso;
            const escala = explosion.escala || 1;
            const radio = (6 + progreso * 17) * escala;
            context.save();
            context.globalAlpha = alpha;
            context.strokeStyle = '#ff477e';
            context.lineWidth = (3 - progreso * 1.5) * escala;
            context.beginPath();
            context.arc(explosion.x, explosion.y, radio, 0, Math.PI * 2);
            context.stroke();
            context.strokeStyle = '#ffd166';
            context.lineWidth = 2.5 * escala;
            for (let indice = 0; indice < 6; indice += 1) {
                const angulo = indice / 8 * Math.PI * 2;
                context.beginPath();
                context.moveTo(
                    explosion.x + Math.cos(angulo) * radio * .7,
                    explosion.y + Math.sin(angulo) * radio * .7
                );
                context.lineTo(
                    explosion.x + Math.cos(angulo) * (radio + 5 * escala),
                    explosion.y + Math.sin(angulo) * (radio + 5 * escala)
                );
                context.stroke();
            }
            context.fillStyle = '#fff3bf';
            context.beginPath();
            context.arc(explosion.x, explosion.y, Math.max(2, 4 * (1 - progreso)) * escala, 0, Math.PI * 2);
            context.fill();
            context.restore();
        });
    }

    function dibujarJugador(player, escala = 1) {
        const acabaDePatear = kickEffects.some(efecto => efecto.player === player);
        context.beginPath();
        context.arc(player.x, player.y, player.r, 0, Math.PI * 2);
        context.fillStyle = player.equipo === 'red' ? COLOR_ROJO : COLOR_AZUL;
        context.fill();
        if (player.activePower) {
            context.strokeStyle = obtenerColorPower(player.activePower);
            context.lineWidth = 6 * escala;
            context.stroke();
        }
        // Como en HaxBall: borde blanco mientras se mantiene "patear".
        context.strokeStyle = player.pateando || acabaDePatear ? '#fff' : '#000';
        context.lineWidth = (player.pateando || acabaDePatear ? 3 : 2) * escala;
        context.stroke();
        context.fillStyle = '#fff';
        context.font = `700 ${Math.round(player.r * 0.8)}px "Press Start 2P", Arial, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(player.id.slice(1), player.x, player.y + 1);
    }

    function registrarEfectosPatada(estado, timestamp) {
        estado.kickEvents.length = 0;
        estado.kickImpactEvents.splice(0).forEach(evento => {
            kickEffects.push({
                player: evento.player,
                startTime: timestamp
            });
            sonar('patada');
        });
    }

    function sonar(nombre) {
        if (global.Sonidos) global.Sonidos.reproducir(nombre);
    }

    function actualizarEfectosPatada(timestamp) {
        for (let index = kickEffects.length - 1; index >= 0; index -= 1) {
            const efecto = kickEffects[index];
            if (timestamp - efecto.startTime >= duracionEfectoPatadaMs) {
                kickEffects.splice(index, 1);
            }
        }
    }

    function dibujarCelebracionGol(snapshot) {
        if (snapshot.fase !== 'GOL' || !snapshot.ultimoGol) return;
        const progreso = Math.min(snapshot.golTranscurridoMs / snapshot.duracionGolMs, 1);
        const entrada = Math.min(progreso / .15, 1);
        const salida = progreso > .8 ? (1 - progreso) / .2 : 1;
        const alpha = Math.max(0, Math.min(entrada, salida));
        const escala = 0.72 + Math.sin(Math.min(progreso, .5) / .5 * Math.PI / 2) * .28;
        const gol = snapshot.ultimoGol;
        const equipo = gol.equipo === 'red' ? 'ROJO' : 'AZUL';
        const jugador = gol.jugadorId ? ` · ${gol.jugadorId.toUpperCase()}${gol.enContra ? ' (EN CONTRA)' : ''}` : '';

        // Las fuentes crecen con el ancho del canvas: las separaciones también
        // (medidas pensadas para 840 px), así en Titan no se pisan los textos.
        const tamanoTexto = Math.max(1, canvas.width / 840);

        context.save();
        context.fillStyle = `rgba(2, 6, 23, ${.28 * alpha})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalAlpha = alpha;
        context.translate(canvas.width / 2, canvas.height / 2);
        context.scale(escala, escala);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `${Math.max(36, canvas.width * .08)}px "Press Start 2P", "Arial Black", Arial`;
        context.lineWidth = Math.max(6, canvas.width * .01);
        context.strokeStyle = '#020617';
        context.strokeText('¡GOL!', 0, -18 * tamanoTexto);
        context.fillStyle = gol.equipo === 'red' ? COLOR_ROJO : COLOR_AZUL;
        context.fillText('¡GOL!', 0, -18 * tamanoTexto);
        context.font = `${Math.max(12, canvas.width * .018)}px "Press Start 2P", Arial`;
        context.fillStyle = '#fff';
        context.lineWidth = 4 * tamanoTexto;
        context.strokeText(`${equipo}${jugador}`, 0, 46 * tamanoTexto);
        context.fillText(`${equipo}${jugador}`, 0, 46 * tamanoTexto);
        context.restore();
    }

    function renderizar(snapshot, deltaMs) {
        const estado = snapshot.estadoFisica;
        actualizarEfectosVisuales(estado, deltaMs);
        dibujarCancha(estado);
        dibujarEstelas();
        dibujarPowerUps(estado);
        const escala = escalaDe(estado);
        estado.players.forEach(player => dibujarJugador(player, escala));
        dibujarPelota(estado.ball, escala);
        dibujarPostes(estado);
        dibujarExplosiones();
        dibujarCelebracionGol(snapshot);
        actualizarHud(snapshot);
    }

    function mostrarPausa(visible) {
        const estabaVisible = !pauseOverlay.hidden;
        pauseOverlay.hidden = !visible;
        if (!global.NavegacionArcade || visible === estabaVisible) return;
        // En la pausa Start lo maneja el loop (así ambos jugadores pueden reanudar).
        if (visible) global.NavegacionArcade.abrirAmbito(pauseOverlay, { alVolver: alternarPausa, alStart: () => {} });
        else global.NavegacionArcade.cerrarAmbito();
    }

    function alternarPausa() {
        const fase = partido.obtenerSnapshot().fase;
        if (fase === 'FIN') return;
        if (fase === 'PAUSA') {
            partido.reanudar();
            mostrarPausa(false);
            sonar('atras');
        } else {
            partido.pausar();
            mostrarPausa(true);
            sonar('start');
        }
    }

    function reiniciarPartido() {
        configuracion = leerConfiguracion();
        crearPartido();
        kickEffects.length = 0;
        if (!finishOverlay.hidden) {
            finishOverlay.hidden = true;
            if (global.NavegacionArcade) global.NavegacionArcade.cerrarAmbito();
        }
        mostrarPausa(false);
        ultimoTimestamp = null;
        if (!loopActivo) {
            loopActivo = true;
            global.requestAnimationFrame(loop);
        }
    }

    function mostrarFin(snapshot) {
        const { red, azul } = snapshot.marcador;
        const resultado = red === azul ? 'Empate' : red > azul ? 'Ganó el equipo rojo' : 'Ganó el equipo azul';
        finishResult.textContent = `${resultado} · Rojo ${red} - ${azul} Azul`;
        finishOverlay.hidden = false;
        sonar('silbato');
        if (global.NavegacionArcade) global.NavegacionArcade.abrirAmbito(finishOverlay, { alVolver: volverAlMenu });
    }

    function volverAlMenu() {
        if (global.NavegacionArcade) global.NavegacionArcade.irA('menu.html');
        else global.location.href = 'menu.html';
    }

    // Start de cualquiera de los dos jugadores (o Escape) pausa el partido.
    function revisarStart(inputs) {
        const presionado = !!(inputs.j1.start || inputs.j2.start);
        const flanco = presionado && !startAnterior;
        startAnterior = presionado;
        return flanco;
    }

    function reaccionarACambioDeFase(snapshot) {
        if (snapshot.fase === faseAnterior) return;
        if (snapshot.fase === 'GOL') sonar('gol');
        if (snapshot.fase === 'SAQUE' && (faseAnterior === null || faseAnterior === 'GOL')) sonar('silbato');
        faseAnterior = snapshot.fase;
    }

    function loop(timestamp) {
        if (!loopActivo) return;
        const deltaMs = ultimoTimestamp === null ? 0 : Math.max(0, timestamp - ultimoTimestamp);
        ultimoTimestamp = timestamp;
        const inputs = global.InputLocal.obtenerInputs();
        const faseActual = partido.obtenerSnapshot().fase;
        if (revisarStart(inputs) && faseActual !== 'FIN') alternarPausa();
        else if (faseActual !== 'PAUSA' && faseActual !== 'FIN') partido.actualizar(deltaMs, inputs);

        const snapshot = partido.obtenerSnapshot();
        registrarEfectosPatada(snapshot.estadoFisica, timestamp);
        actualizarEfectosPatada(timestamp);
        reaccionarACambioDeFase(snapshot);
        renderizar(snapshot, snapshot.fase === 'PAUSA' ? 0 : deltaMs);
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
    document.getElementById('finishRestartButton').addEventListener('click', reiniciarPartido);
    document.getElementById('finishExitButton').addEventListener('click', volverAlMenu);

    if (global.NavegacionArcade) {
        // Durante el partido la palanca mueve al jugador; los menús solo se usan en la pausa y el final.
        // Escape (tecla del sistema) también pausa; el botón "atrás" de J1 no, para no pausar sin querer.
        global.NavegacionArcade.iniciar({
            alPausado: evento => {
                if (evento.accion === 'atras' && evento.sistema) alternarPausa();
            }
        });
        global.NavegacionArcade.setPausada(true);
    }

    crearPartido();
    global.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
