/**
 * fisica-haxball.js
 *
 * Motor de física del modo local, calcado de HaxBall (estadio "Classic").
 * Usa los mismos valores por defecto de HaxBall y el mismo orden de cálculo
 * por tick (60 ticks por segundo):
 *
 *   1. Input de cada jugador: aceleración (más lenta si mantiene "patear")
 *      y patada si la pelota está a menos de 4 px del borde del jugador.
 *   2. Movimiento: posición += velocidad; velocidad *= amortiguación.
 *   3. Colisiones elásticas disco-disco con coeficiente de rebote (bCoef)
 *      y masa inversa (invMass), postes redondos, redes y bordes.
 *   4. Gol cuando el centro de la pelota cruza la línea entre los postes.
 *
 * Expone la misma API que fisica-local.js (crearEstado / avanzar) para que
 * match-manager.js pueda usar cualquiera de los dos.
 */
(function (global) {
    // Valores por defecto de HaxBall (playerPhysics / ballPhysics / estadio Classic).
    const JUGADOR = {
        radio: 15,
        bCoef: 0.5,
        invMass: 0.5,
        damping: 0.96,
        aceleracion: 0.1,
        aceleracionPateando: 0.07,
        dampingPateando: 0.96,
        fuerzaPatada: 5,
        retroceso: 0
    };
    const PELOTA = { radio: 10, bCoef: 0.5, invMass: 1, damping: 0.99 };
    const POSTE = { radio: 8, bCoef: 0.5 };
    const BCOEF_BORDE = 1;
    const BCOEF_RED = 0.1;
    const BCOEF_LIMITE_JUGADOR = 0.1;
    const DISTANCIA_PATADA = 4;
    const MS_POR_TICK = 1000 / 60;
    const MAX_TICKS_POR_LLAMADA = 8;

    // Márgenes históricos de La Chaula (los mapas pueden redefinirlos).
    const MARGEN_X = 80;
    const MARGEN_Y = 40;
    const PROFUNDIDAD_ARCO = 45;

    // Power-ups opcionales (no existen en HaxBall; se activan desde la configuración local).
    const DURACION_POWER_TICKS = 360;
    const TICKS_ENTRE_POWERUPS = 480;

    function normalizarMapa(mapa) {
        const width = Number(mapa && mapa.width) || 800;
        const height = Number(mapa && mapa.height) || 400;
        const goalHeight = Number(mapa && mapa.goalHeight) || 110;
        const margenX = Number.isFinite(mapa && mapa.margenX) ? mapa.margenX : MARGEN_X;
        const margenY = Number.isFinite(mapa && mapa.margenY) ? mapa.margenY : MARGEN_Y;
        return {
            ...mapa,
            width,
            height,
            goalHeight,
            margenX,
            margenY,
            profundidadArco: Number.isFinite(mapa && mapa.profundidadArco) ? mapa.profundidadArco : PROFUNDIDAD_ARCO,
            radioSaque: Number.isFinite(mapa && mapa.radioSaque) ? mapa.radioSaque : width * 0.085,
            field: { left: margenX, right: width - margenX, top: margenY, bottom: height - margenY },
            goalTop: height / 2 - goalHeight / 2,
            goalBottom: height / 2 + goalHeight / 2
        };
    }

    function posicionInicial(mapa, ladoIzquierdo, jugadores, indice) {
        const jugador = jugadores[indice];
        const equipo = jugador.equipo === 'blue' ? 'blue' : 'red';
        const companeros = jugadores.slice(0, indice).filter(item => (item.equipo === 'blue' ? 'blue' : 'red') === equipo).length;
        const distancia = Math.min(170, (mapa.field.right - mapa.field.left) * 0.23) + companeros * 40;
        const centroX = mapa.width / 2;
        const esIzquierdo = equipo === ladoIzquierdo;
        const desplazamientoY = companeros === 0 ? 0 : (companeros % 2 ? -1 : 1) * Math.ceil(companeros / 2) * 55;
        return {
            x: esIzquierdo ? centroX - distancia : centroX + distancia,
            y: mapa.height / 2 + desplazamientoY
        };
    }

    function crearEstado({ mapa, ladoIzquierdo = 'red', kickoffTeam = null, jugadores = [], powerUps = false } = {}) {
        const map = normalizarMapa(mapa);
        const centroX = map.width / 2;
        const players = jugadores.map((jugador, indice) => {
            const id = jugador.id == null ? `j${indice + 1}` : String(jugador.id);
            const equipo = jugador.equipo === 'blue' ? 'blue' : 'red';
            const rBase = Number.isFinite(jugador.rBase) ? jugador.rBase : (Number.isFinite(jugador.r) ? jugador.r : JUGADOR.radio);
            const posicion = posicionInicial(map, ladoIzquierdo, jugadores, indice);
            return {
                id,
                equipo,
                x: posicion.x,
                y: posicion.y,
                vx: 0,
                vy: 0,
                r: rBase,
                rBase,
                invMass: JUGADOR.invMass,
                pateando: false,
                patadaUsada: false,
                activePower: null,
                powerTimer: 0
            };
        });

        return {
            motor: 'haxball',
            mapa: map,
            ladoIzquierdo,
            field: map.field,
            goalTop: map.goalTop,
            goalBottom: map.goalBottom,
            postes: crearPostes(map),
            players,
            ball: { x: centroX, y: map.height / 2, vx: 0, vy: 0, r: PELOTA.radio, invMass: PELOTA.invMass },
            powerUpsHabilitados: !!powerUps,
            activePowerUps: [],
            powerUpSpawnTimer: 0,
            waitingForKickOff: true,
            kickoffPlayerId: players[0] ? players[0].id : 'j1',
            kickoffTeam: kickoffTeam === 'blue' || kickoffTeam === 'red' ? kickoffTeam : null,
            golEnCurso: false,
            clockMs: 0,
            restoMs: 0,
            kickEvents: [],
            kickImpactEvents: [],
            timerStarted: false,
            goalResetPending: false,
            lastTouch: null,
            secondLastTouch: null,
            lastGoalTeam: null,
            goalDetected: false,
            powerImpactId: 0,
            lastPowerImpact: null
        };
    }

    function crearPostes(mapa) {
        const { field, goalTop, goalBottom } = mapa;
        return [
            { x: field.left, y: goalTop, r: POSTE.radio, lado: 'izquierdo' },
            { x: field.left, y: goalBottom, r: POSTE.radio, lado: 'izquierdo' },
            { x: field.right, y: goalTop, r: POSTE.radio, lado: 'derecho' },
            { x: field.right, y: goalBottom, r: POSTE.radio, lado: 'derecho' }
        ];
    }

    function inputDe(inputs, jugador) {
        return (inputs && inputs[jugador.id]) || {};
    }

    function esEquipoQueSaca(jugador, estado) {
        if (estado.kickoffTeam === 'red' || estado.kickoffTeam === 'blue') return jugador.equipo === estado.kickoffTeam;
        const sacador = estado.players.find(item => item.id === estado.kickoffPlayerId);
        return sacador ? sacador.equipo === jugador.equipo : jugador.id === estado.kickoffPlayerId;
    }

    /* ========================= */
    /* 1. INPUT Y PATADA */
    /* ========================= */

    function multiplicadorVelocidad(jugador) {
        if (jugador.activePower === 'SPEED') return 1.45;
        if (jugador.activePower === 'BIG') return 0.75;
        return 1;
    }

    function aplicarInput(jugador, input, estado) {
        const mantienePatear = !!(input.kick || input.kickPressed);
        // Como en HaxBall: la patada queda "armada" mientras se mantiene el botón
        // y se consume al pegarle a la pelota. Hay que soltar para volver a patear.
        if (!mantienePatear) jugador.patadaUsada = false;
        const armado = mantienePatear && !jugador.patadaUsada;
        if (armado && !jugador.pateando) estado.kickEvents.push({ player: jugador });
        jugador.pateando = armado;

        if (armado) intentarPatada(jugador, estado);

        let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (dx && dy) {
            dx *= Math.SQRT1_2;
            dy *= Math.SQRT1_2;
        }
        const aceleracion = (jugador.pateando ? JUGADOR.aceleracionPateando : JUGADOR.aceleracion) * multiplicadorVelocidad(jugador);
        jugador.vx += dx * aceleracion;
        jugador.vy += dy * aceleracion;
    }

    function intentarPatada(jugador, estado) {
        if (estado.waitingForKickOff && !esEquipoQueSaca(jugador, estado)) return;
        const pelota = estado.ball;
        const dx = pelota.x - jugador.x;
        const dy = pelota.y - jugador.y;
        const distancia = Math.hypot(dx, dy);
        if (distancia - jugador.r - pelota.r >= DISTANCIA_PATADA) return;
        const nx = distancia > 0 ? dx / distancia : 1;
        const ny = distancia > 0 ? dy / distancia : 0;
        const fuerza = JUGADOR.fuerzaPatada * (jugador.activePower === 'SUPER_KICK' ? 1.8 : 1);
        pelota.vx += nx * fuerza * pelota.invMass;
        pelota.vy += ny * fuerza * pelota.invMass;
        jugador.vx -= nx * JUGADOR.retroceso * jugador.invMass;
        jugador.vy -= ny * JUGADOR.retroceso * jugador.invMass;
        jugador.patadaUsada = true;
        jugador.pateando = false;
        estado.kickImpactEvents.push({ player: jugador });
        registrarToque(jugador, estado);
        if (jugador.activePower === 'SUPER_KICK') {
            estado.powerImpactId += 1;
            estado.lastPowerImpact = { id: estado.powerImpactId, x: pelota.x, y: pelota.y };
        }
    }

    function registrarToque(jugador, estado) {
        if (estado.lastTouch !== jugador.id) estado.secondLastTouch = estado.lastTouch;
        estado.lastTouch = jugador.id;
        if (estado.waitingForKickOff && !estado.golEnCurso && esEquipoQueSaca(jugador, estado)) {
            estado.waitingForKickOff = false;
            estado.timerStarted = true;
            estado.eventosTick.push('primerToque');
        }
    }

    /* ========================= */
    /* 2. MOVIMIENTO */
    /* ========================= */

    function integrar(estado) {
        estado.players.forEach(jugador => {
            jugador.x += jugador.vx;
            jugador.y += jugador.vy;
            const damping = jugador.pateando ? JUGADOR.dampingPateando : JUGADOR.damping;
            jugador.vx *= damping;
            jugador.vy *= damping;
        });
        const pelota = estado.ball;
        pelota.x += pelota.vx;
        pelota.y += pelota.vy;
        pelota.vx *= PELOTA.damping;
        pelota.vy *= PELOTA.damping;
    }

    /* ========================= */
    /* 3. COLISIONES */
    /* ========================= */

    // Choque entre dos discos móviles (fórmula de HaxBall).
    function chocarDiscos(a, b, bCoefA, bCoefB) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distancia = Math.hypot(dx, dy);
        const minima = a.r + b.r;
        if (distancia >= minima || distancia === 0) return false;
        const nx = dx / distancia;
        const ny = dy / distancia;
        const factor = a.invMass / (a.invMass + b.invMass);
        const solapamiento = minima - distancia;
        a.x += nx * solapamiento * factor;
        a.y += ny * solapamiento * factor;
        b.x -= nx * solapamiento * (1 - factor);
        b.y -= ny * solapamiento * (1 - factor);
        const velocidadRelativa = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (velocidadRelativa < 0) {
            const impulso = velocidadRelativa * (1 + bCoefA * bCoefB);
            a.vx -= nx * impulso * factor;
            a.vy -= ny * impulso * factor;
            b.vx += nx * impulso * (1 - factor);
            b.vy += ny * impulso * (1 - factor);
        }
        return true;
    }

    // Choque contra un disco fijo (postes).
    function chocarDiscoFijo(disco, fijo, bCoefDisco, bCoefFijo) {
        const dx = disco.x - fijo.x;
        const dy = disco.y - fijo.y;
        const distancia = Math.hypot(dx, dy);
        const minima = disco.r + fijo.r;
        if (distancia >= minima || distancia === 0) return;
        const nx = dx / distancia;
        const ny = dy / distancia;
        disco.x += nx * (minima - distancia);
        disco.y += ny * (minima - distancia);
        const velocidadNormal = disco.vx * nx + disco.vy * ny;
        if (velocidadNormal < 0) {
            const rebote = 1 + bCoefDisco * bCoefFijo;
            disco.vx -= nx * velocidadNormal * rebote;
            disco.vy -= ny * velocidadNormal * rebote;
        }
    }

    /**
     * Choque contra un segmento recto de un solo lado. `normal` apunta hacia la
     * zona donde puede estar el disco; desde..hasta es la extensión del segmento
     * sobre el eje paralelo. Las puntas las cubren los postes o la pared vecina.
     */
    function chocarSegmento(disco, segmento, bCoefDisco) {
        const { eje, valor, desde, hasta, normal, bCoef } = segmento;
        const paralelo = eje === 'x' ? disco.y : disco.x;
        if (paralelo < desde || paralelo > hasta) return;
        const posicion = eje === 'x' ? disco.x : disco.y;
        const distancia = (posicion - valor) * normal;
        if (distancia >= disco.r || distancia < -disco.r) return;
        const corregida = valor + normal * disco.r;
        const velocidad = eje === 'x' ? disco.vx : disco.vy;
        const velocidadNormal = velocidad * normal;
        const nueva = velocidadNormal < 0 ? velocidad - normal * velocidadNormal * (1 + bCoefDisco * bCoef) : velocidad;
        if (eje === 'x') {
            disco.x = corregida;
            disco.vx = nueva;
        } else {
            disco.y = corregida;
            disco.vy = nueva;
        }
    }

    function segmentosPelota(estado) {
        if (estado.segmentosPelota) return estado.segmentosPelota;
        const { field, goalTop, goalBottom, mapa } = estado;
        const fondoIzq = field.left - mapa.profundidadArco;
        const fondoDer = field.right + mapa.profundidadArco;
        estado.segmentosPelota = [
            // Bordes de la cancha (la pelota solo sale por la boca del arco).
            { eje: 'y', valor: field.top, desde: field.left, hasta: field.right, normal: 1, bCoef: BCOEF_BORDE },
            { eje: 'y', valor: field.bottom, desde: field.left, hasta: field.right, normal: -1, bCoef: BCOEF_BORDE },
            { eje: 'x', valor: field.left, desde: field.top, hasta: goalTop, normal: 1, bCoef: BCOEF_BORDE },
            { eje: 'x', valor: field.left, desde: goalBottom, hasta: field.bottom, normal: 1, bCoef: BCOEF_BORDE },
            { eje: 'x', valor: field.right, desde: field.top, hasta: goalTop, normal: -1, bCoef: BCOEF_BORDE },
            { eje: 'x', valor: field.right, desde: goalBottom, hasta: field.bottom, normal: -1, bCoef: BCOEF_BORDE },
            // Redes: casi no rebotan.
            { eje: 'y', valor: goalTop, desde: fondoIzq, hasta: field.left, normal: 1, bCoef: BCOEF_RED },
            { eje: 'y', valor: goalBottom, desde: fondoIzq, hasta: field.left, normal: -1, bCoef: BCOEF_RED },
            { eje: 'x', valor: fondoIzq, desde: goalTop, hasta: goalBottom, normal: 1, bCoef: BCOEF_RED },
            { eje: 'y', valor: goalTop, desde: field.right, hasta: fondoDer, normal: 1, bCoef: BCOEF_RED },
            { eje: 'y', valor: goalBottom, desde: field.right, hasta: fondoDer, normal: -1, bCoef: BCOEF_RED },
            { eje: 'x', valor: fondoDer, desde: goalTop, hasta: goalBottom, normal: -1, bCoef: BCOEF_RED }
        ];
        return estado.segmentosPelota;
    }

    // Los jugadores pueden salir de las líneas pero no del estadio (como en HaxBall).
    function limitarAlEstadio(jugador, mapa) {
        const limites = [
            { eje: 'x', valor: 0, normal: 1 },
            { eje: 'x', valor: mapa.width, normal: -1 },
            { eje: 'y', valor: 0, normal: 1 },
            { eje: 'y', valor: mapa.height, normal: -1 }
        ];
        limites.forEach(limite => chocarSegmento(jugador, {
            ...limite,
            desde: -Infinity,
            hasta: Infinity,
            bCoef: BCOEF_LIMITE_JUGADOR
        }, JUGADOR.bCoef));
    }

    /**
     * Barreras del saque inicial: nadie cruza la mitad de cancha y el equipo que
     * no saca tampoco puede entrar al círculo central. El que saca sí puede
     * entrar al círculo aunque ocupe la mitad rival.
     */
    function aplicarBarrerasSaque(jugador, estado) {
        const centroX = estado.mapa.width / 2;
        const centroY = estado.mapa.height / 2;
        const radio = estado.mapa.radioSaque;
        const esIzquierdo = jugador.equipo === estado.ladoIzquierdo;
        const lado = esIzquierdo ? -1 : 1;
        const saca = esEquipoQueSaca(jugador, estado);
        const dx = jugador.x - centroX;
        const dy = jugador.y - centroY;
        const distancia = Math.hypot(dx, dy);
        const cruzoLaMitad = (jugador.x - centroX) * lado < jugador.r;

        if (!saca) {
            if (cruzoLaMitad) {
                jugador.x = centroX + lado * jugador.r;
                if (jugador.vx * lado < 0) jugador.vx = 0;
            }
            const minima = radio + jugador.r;
            const dx2 = jugador.x - centroX;
            const distancia2 = Math.hypot(dx2, dy);
            if (distancia2 < minima) {
                const nx = distancia2 > 0 ? dx2 / distancia2 : lado;
                const ny = distancia2 > 0 ? dy / distancia2 : 0;
                jugador.x = centroX + nx * minima;
                jugador.y = centroY + ny * minima;
                const haciaAdentro = jugador.vx * nx + jugador.vy * ny;
                if (haciaAdentro < 0) {
                    jugador.vx -= nx * haciaAdentro;
                    jugador.vy -= ny * haciaAdentro;
                }
            }
            return;
        }

        if (!cruzoLaMitad) return;
        const maximaEnCirculo = radio - jugador.r;
        if (distancia <= maximaEnCirculo) return;
        // Fuera del círculo y del lado rival: se lo devuelve al punto permitido más cercano.
        const opcionLinea = { x: centroX + lado * jugador.r, y: jugador.y };
        const opcionCirculo = distancia > 0
            ? { x: centroX + dx / distancia * Math.max(0, maximaEnCirculo), y: centroY + dy / distancia * Math.max(0, maximaEnCirculo) }
            : opcionLinea;
        const costoLinea = Math.hypot(opcionLinea.x - jugador.x, opcionLinea.y - jugador.y);
        const costoCirculo = Math.hypot(opcionCirculo.x - jugador.x, opcionCirculo.y - jugador.y);
        const destino = costoLinea <= costoCirculo ? opcionLinea : opcionCirculo;
        jugador.x = destino.x;
        jugador.y = destino.y;
        jugador.vx *= 0.5;
        jugador.vy *= 0.5;
    }

    function resolverColisiones(estado) {
        const { players, ball, postes } = estado;
        for (let i = 0; i < players.length; i += 1) {
            for (let j = i + 1; j < players.length; j += 1) {
                chocarDiscos(players[i], players[j], JUGADOR.bCoef, JUGADOR.bCoef);
            }
        }
        players.forEach(jugador => {
            if (chocarDiscos(jugador, ball, JUGADOR.bCoef, PELOTA.bCoef)) registrarToque(jugador, estado);
        });
        players.forEach(jugador => postes.forEach(poste => chocarDiscoFijo(jugador, poste, JUGADOR.bCoef, POSTE.bCoef)));
        postes.forEach(poste => chocarDiscoFijo(ball, poste, PELOTA.bCoef, POSTE.bCoef));
        segmentosPelota(estado).forEach(segmento => chocarSegmento(ball, segmento, PELOTA.bCoef));
        players.forEach(jugador => {
            limitarAlEstadio(jugador, estado.mapa);
            if (estado.waitingForKickOff && !estado.golEnCurso) aplicarBarrerasSaque(jugador, estado);
        });
    }

    /* ========================= */
    /* 4. GOL */
    /* ========================= */

    function detectarGol(estado, xAnterior) {
        if (estado.golEnCurso) return;
        const { ball, field, goalTop, goalBottom } = estado;
        if (ball.y < goalTop || ball.y > goalBottom) return;
        const entroIzquierdo = xAnterior > field.left && ball.x <= field.left;
        const entroDerecho = xAnterior < field.right && ball.x >= field.right;
        if (!entroIzquierdo && !entroDerecho) return;
        const equipoDerecho = estado.ladoIzquierdo === 'red' ? 'blue' : 'red';
        // Gol en el arco izquierdo = punto para el equipo que ataca hacia la izquierda.
        estado.lastGoalTeam = entroIzquierdo ? equipoDerecho : estado.ladoIzquierdo;
        estado.goalDetected = true;
        estado.golEnCurso = true;
        estado.timerStarted = false;
        estado.eventosTick.push('gol');
    }

    /* ========================= */
    /* POWER-UPS (OPCIONALES) */
    /* ========================= */

    function avanzarPowerUps(estado) {
        if (!estado.powerUpsHabilitados || estado.golEnCurso) return;
        estado.powerUpSpawnTimer += 1;
        const { field } = estado;
        if (estado.powerUpSpawnTimer >= TICKS_ENTRE_POWERUPS && estado.activePowerUps.length < 2) {
            estado.powerUpSpawnTimer = 0;
            const tipos = ['SPEED', 'BIG', 'SUPER_KICK'];
            estado.activePowerUps.push({
                x: field.left + 30 + Math.random() * (field.right - field.left - 60),
                y: field.top + 30 + Math.random() * (field.bottom - field.top - 60),
                r: 15,
                type: tipos[Math.floor(Math.random() * tipos.length)]
            });
        }
        for (let i = estado.activePowerUps.length - 1; i >= 0; i -= 1) {
            const powerUp = estado.activePowerUps[i];
            const jugador = estado.players.find(item => Math.hypot(powerUp.x - item.x, powerUp.y - item.y) < powerUp.r + item.r);
            if (!jugador) continue;
            jugador.r = jugador.rBase;
            jugador.activePower = powerUp.type;
            jugador.powerTimer = DURACION_POWER_TICKS;
            if (powerUp.type === 'BIG') jugador.r = jugador.rBase * 1.55;
            estado.activePowerUps.splice(i, 1);
            estado.eventosTick.push('powerUp');
        }
        estado.players.forEach(jugador => {
            if (jugador.powerTimer > 0 && (jugador.powerTimer -= 1) <= 0) {
                jugador.r = jugador.rBase;
                jugador.activePower = null;
            }
        });
    }

    function quitarPowerUps(estado) {
        estado.activePowerUps.length = 0;
        estado.powerUpSpawnTimer = 0;
        estado.players.forEach(jugador => {
            jugador.r = jugador.rBase;
            jugador.activePower = null;
            jugador.powerTimer = 0;
        });
    }

    /* ========================= */
    /* SAQUE */
    /* ========================= */

    /** Vuelve a todos a su posición y deja la pelota en el centro esperando el saque. */
    function reiniciarSaque(estado) {
        const jugadores = estado.players.map(jugador => ({ id: jugador.id, equipo: jugador.equipo }));
        estado.players.forEach((jugador, indice) => {
            const posicion = posicionInicial(estado.mapa, estado.ladoIzquierdo, jugadores, indice);
            jugador.x = posicion.x;
            jugador.y = posicion.y;
            jugador.vx = 0;
            jugador.vy = 0;
            jugador.pateando = false;
        });
        const pelota = estado.ball;
        pelota.x = estado.mapa.width / 2;
        pelota.y = estado.mapa.height / 2;
        pelota.vx = 0;
        pelota.vy = 0;
        quitarPowerUps(estado);
        estado.waitingForKickOff = true;
        estado.timerStarted = false;
        estado.golEnCurso = false;
        estado.goalResetPending = false;
        estado.lastTouch = null;
        estado.secondLastTouch = null;
    }

    /* ========================= */
    /* PASO PRINCIPAL */
    /* ========================= */

    function tick(estado, inputs) {
        estado.players.forEach(jugador => aplicarInput(jugador, inputDe(inputs, jugador), estado));
        const xAnterior = estado.ball.x;
        integrar(estado);
        resolverColisiones(estado);
        detectarGol(estado, xAnterior);
        avanzarPowerUps(estado);
    }

    /**
     * Avanza la simulación `deltaMs` milisegundos en ticks fijos de 1/60 s.
     * Devuelve { pasos, eventos } con 'primerToque', 'gol' y 'powerUp'.
     */
    function avanzar(estado, deltaMs, inputs = {}) {
        if (!estado || !estado.ball) return { pasos: 0, eventos: [] };
        if (estado.goalResetPending) reiniciarSaque(estado);
        const eventos = [];
        estado.eventosTick = eventos;
        estado.restoMs += Math.max(Number(deltaMs) || 0, 0);
        estado.clockMs += Math.max(Number(deltaMs) || 0, 0);
        let pasos = 0;
        while (estado.restoMs >= MS_POR_TICK - 0.001 && pasos < MAX_TICKS_POR_LLAMADA) {
            tick(estado, inputs);
            estado.restoMs -= MS_POR_TICK;
            pasos += 1;
        }
        if (pasos === MAX_TICKS_POR_LLAMADA) estado.restoMs = Math.min(estado.restoMs, MS_POR_TICK);
        estado.restoMs = Math.max(0, estado.restoMs);
        return { pasos, eventos };
    }

    const FisicaHaxball = {
        crearEstado,
        avanzar,
        reiniciarSaque,
        normalizarMapa,
        constantes: { JUGADOR, PELOTA, POSTE, DISTANCIA_PATADA, MS_POR_TICK }
    };
    global.FisicaHaxball = FisicaHaxball;
    if (typeof module !== 'undefined' && module.exports) module.exports = FisicaHaxball;
})(typeof globalThis !== 'undefined' ? globalThis : this);
