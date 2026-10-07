/**
 * fisica-haxball.js
 *
 * Motor de física del modo local, calcado de HaxBall con los valores de los
 * estadios FUTSAL (jugadores rápidos que no rebotan) y el mismo
 * orden de cálculo por tick (60 ticks por segundo):
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
    // Valores de los estadios Futsal de HaxBall ("Futsal x3/x4 by Bazinga", "Futsal 1v1"):
    // playerPhysics / ballPhysics. Comparados con el Classic: el jugador acelera más
    // (0.11 vs 0.1 → velocidad máxima 2.64 px/tick en vez de 2.4).
    // Todos los tamaños y velocidades de acá son los del mapa de referencia
    // (840x400, como el Classic); en mapas más grandes se multiplican por
    // `mapa.escala` (ver normalizarMapa). El jugador es radio 16, un toque más grande que en
    // HaxBall (15), y con la escala ocupa en pantalla lo mismo en cualquier mapa.
    const JUGADOR = {
        radio: 16,
        bCoef: 0, // En futsal el jugador no rebota: la pelota se "pega" al conducir.
        invMass: 0.5,
        damping: 0.96,
        aceleracion: 0.11,
        aceleracionPateando: 0.083,
        dampingPateando: 0.96,
        fuerzaPatada: 5,
        retroceso: 0
    };
    // Pelota entre la del futsal (6.25) y la del Classic (10), bien proporcionada con
    // el jugador. invMass 1.2 (futsal 1.5, Classic 1): la patada de fuerza 5 sale a
    // 6 px/tick, más tranquila que los 7.5 del futsal y un poco más viva que el Classic (5).
    const PELOTA = { radio: 8, bCoef: 0.4, invMass: 1.2, damping: 0.99 };
    // Postes de futsal: más finitos que los del Classic (radio 8).
    const POSTE = { radio: 5, bCoef: 0.5 };
    // Borde con bCoef 1 como en el ballArea del futsal: el rebote final es
    // bCoef pelota × bCoef borde = 0.4, o sea rebota menos que en el Classic (0.5).
    const BCOEF_BORDE = 1;
    const BCOEF_RED = 0.1;
    // El canvas mide lo mismo que el mapa y se estira por CSS a toda la pantalla,
    // así que en los mapas grandes todo se ve achicado. Para que se vea y se
    // sienta como HaxBall en cualquier cancha, cada mapa tiene una `escala` única
    // (por área respecto del estadio de referencia 840x400, para que un mapa
    // largo y finito como The Tunnel no crezca de más) que multiplica radios de
    // jugadores, pelota, postes y power-ups, distancias en px entre discos,
    // aceleración y patada. Nunca achica (mínimo 1) y tiene tope 2:
    // Frozen ×1.24, Champions ×1.57, Volcanic ×1.34, Tunnel ×1.12, Titan ×1.95.
    // Un mapa puede fijar la suya con la propiedad `escala`.
    const ANCHO_REFERENCIA = 840;
    const ALTO_REFERENCIA = 400;
    const ESCALA_MAX = 2;
    const BCOEF_LIMITE_JUGADOR = 0.1;
    const DISTANCIA_PATADA = 4;
    const MS_POR_TICK = 1000 / 60;
    const MAX_TICKS_POR_LLAMADA = 8;

    // Márgenes históricos de La Chaula (los mapas pueden redefinirlos).
    const MARGEN_X = 80;
    const MARGEN_Y = 40;
    const PROFUNDIDAD_ARCO = 45;

    // Power-ups opcionales (no existen en HaxBall; se activan desde la configuración local).
    // Aparecen de una "bolsa" mezclada (salen los tres tipos antes de repetir y
    // nunca el mismo dos veces seguidas) cada un intervalo al azar.
    const DURACION_POWER_TICKS = 360;
    const TIPOS_POWERUP = ['SPEED', 'BIG', 'SUPER_KICK'];
    const MAX_POWERUPS_EN_CANCHA = 2;
    const RADIO_POWERUP = 15;
    const TICKS_ENTRE_POWERUPS_MIN = 240; // 4 s
    const TICKS_ENTRE_POWERUPS_MAX = 540; // 9 s
    const TICKS_PRIMER_POWERUP_MIN = 90; // 1.5 s después del saque
    const TICKS_PRIMER_POWERUP_MAX = 240; // 4 s
    const INTENTOS_POSICION_POWERUP = 25;
    const DISTANCIA_LIBRE_POWERUP = 30; // aire mínimo entre el power-up y jugadores/pelota/otros
    const MARGEN_LINEAS_POWERUP = 25; // aire mínimo con las líneas de la cancha

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
            escala: Number.isFinite(mapa && mapa.escala) && mapa.escala > 0
                ? mapa.escala
                : Math.min(ESCALA_MAX, Math.max(1, Math.sqrt((width * height) / (ANCHO_REFERENCIA * ALTO_REFERENCIA)))),
            field: { left: margenX, right: width - margenX, top: margenY, bottom: height - margenY },
            goalTop: height / 2 - goalHeight / 2,
            goalBottom: height / 2 + goalHeight / 2
        };
    }

    function posicionInicial(mapa, ladoIzquierdo, jugadores, indice) {
        const jugador = jugadores[indice];
        const equipo = jugador.equipo === 'blue' ? 'blue' : 'red';
        const companeros = jugadores.slice(0, indice).filter(item => (item.equipo === 'blue' ? 'blue' : 'red') === equipo).length;
        const escala = mapa.escala;
        const distancia = Math.min(170 * escala, (mapa.field.right - mapa.field.left) * 0.23) + companeros * 40 * escala;
        const centroX = mapa.width / 2;
        const esIzquierdo = equipo === ladoIzquierdo;
        const desplazamientoY = companeros === 0 ? 0 : (companeros % 2 ? -1 : 1) * Math.ceil(companeros / 2) * 55 * escala;
        return {
            x: esIzquierdo ? centroX - distancia : centroX + distancia,
            y: mapa.height / 2 + desplazamientoY
        };
    }

    // `aleatorio` se puede inyectar (devuelve [0, 1) como Math.random) para tests deterministas.
    function crearEstado({ mapa, ladoIzquierdo = 'red', kickoffTeam = null, jugadores = [], powerUps = false, aleatorio = Math.random } = {}) {
        const map = normalizarMapa(mapa);
        const centroX = map.width / 2;
        const players = jugadores.map((jugador, indice) => {
            const id = jugador.id == null ? `j${indice + 1}` : String(jugador.id);
            const equipo = jugador.equipo === 'blue' ? 'blue' : 'red';
            // Un radio propio (rBase o r) también se toma como medida del mapa de referencia.
            const radioReferencia = Number.isFinite(jugador.rBase) ? jugador.rBase : (Number.isFinite(jugador.r) ? jugador.r : JUGADOR.radio);
            const rBase = radioReferencia * map.escala;
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

        const estado = {
            motor: 'haxball',
            mapa: map,
            ladoIzquierdo,
            field: map.field,
            goalTop: map.goalTop,
            goalBottom: map.goalBottom,
            postes: crearPostes(map),
            players,
            ball: { x: centroX, y: map.height / 2, vx: 0, vy: 0, r: PELOTA.radio * map.escala, invMass: PELOTA.invMass },
            powerUpsHabilitados: !!powerUps,
            activePowerUps: [],
            aleatorio: typeof aleatorio === 'function' ? aleatorio : Math.random,
            bolsaPowerUps: [],
            ultimoPowerUp: null,
            proximoPowerUpTicks: 0,
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
        estado.proximoPowerUpTicks = sortearTicks(estado, TICKS_PRIMER_POWERUP_MIN, TICKS_PRIMER_POWERUP_MAX);
        return estado;
    }

    function crearPostes(mapa) {
        const { field, goalTop, goalBottom } = mapa;
        const r = POSTE.radio * mapa.escala;
        return [
            { x: field.left, y: goalTop, r, lado: 'izquierdo' },
            { x: field.left, y: goalBottom, r, lado: 'izquierdo' },
            { x: field.right, y: goalTop, r, lado: 'derecho' },
            { x: field.right, y: goalBottom, r, lado: 'derecho' }
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
        const aceleracion = (jugador.pateando ? JUGADOR.aceleracionPateando : JUGADOR.aceleracion)
            * multiplicadorVelocidad(jugador) * estado.mapa.escala;
        jugador.vx += dx * aceleracion;
        jugador.vy += dy * aceleracion;
    }

    function intentarPatada(jugador, estado) {
        if (estado.waitingForKickOff && !esEquipoQueSaca(jugador, estado)) return;
        const pelota = estado.ball;
        const dx = pelota.x - jugador.x;
        const dy = pelota.y - jugador.y;
        const distancia = Math.hypot(dx, dy);
        if (distancia - jugador.r - pelota.r >= DISTANCIA_PATADA * estado.mapa.escala) return;
        const nx = distancia > 0 ? dx / distancia : 1;
        const ny = distancia > 0 ? dy / distancia : 0;
        const fuerza = JUGADOR.fuerzaPatada * (jugador.activePower === 'SUPER_KICK' ? 1.8 : 1) * estado.mapa.escala;
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
     * Choque de la pelota contra un poste con barrido: si en este tick la pelota
     * venía de afuera y su recorrido toca el poste, se la deja en el punto de
     * contacto y rebota ahí. Sin esto, un tiro muy rápido podía quedar pasado del
     * centro del poste (y se la empujaba para el otro lado) o saltarlo entero.
     * Si el recorrido no lo toca, choque normal.
     */
    function chocarPosteBarrido(disco, poste, bCoefDisco, bCoefPoste, anterior) {
        if (anterior) {
            const minima = disco.r + poste.r;
            const mx = disco.x - anterior.x;
            const my = disco.y - anterior.y;
            const fx = anterior.x - poste.x;
            const fy = anterior.y - poste.y;
            // |anterior + t·m − poste| = minima → a·t² + b·t + c = 0
            const a = mx * mx + my * my;
            const b = 2 * (fx * mx + fy * my);
            const c = fx * fx + fy * fy - minima * minima;
            const discriminante = b * b - 4 * a * c;
            if (a > 0 && c > 0 && discriminante >= 0) {
                const t = (-b - Math.sqrt(discriminante)) / (2 * a);
                if (t >= 0 && t <= 1) {
                    disco.x = anterior.x + mx * t;
                    disco.y = anterior.y + my * t;
                    const nx = (disco.x - poste.x) / minima;
                    const ny = (disco.y - poste.y) / minima;
                    const velocidadNormal = disco.vx * nx + disco.vy * ny;
                    if (velocidadNormal < 0) {
                        const rebote = 1 + bCoefDisco * bCoefPoste;
                        disco.vx -= nx * velocidadNormal * rebote;
                        disco.vy -= ny * velocidadNormal * rebote;
                    }
                    return;
                }
            }
        }
        chocarDiscoFijo(disco, poste, bCoefDisco, bCoefPoste);
    }

    /**
     * Choque contra un segmento recto de un solo lado. `normal` apunta hacia la
     * zona donde puede estar el disco; desde..hasta es la extensión del segmento
     * sobre el eje paralelo. Las puntas las cubren los postes o la pared vecina.
     * `anterior` ({x, y} antes de integrar, opcional) evita que un disco muy
     * rápido atraviese la línea en un solo tick: una súper patada puede avanzar
     * más que el diámetro de la pelota y se escapaba.
     */
    function chocarSegmento(disco, segmento, bCoefDisco, anterior = null) {
        const { eje, valor, desde, hasta, normal, bCoef } = segmento;
        const posicion = eje === 'x' ? disco.x : disco.y;
        const distancia = (posicion - valor) * normal;
        let paralelo = eje === 'x' ? disco.y : disco.x;
        if (distancia < -disco.r) {
            if (!anterior) return;
            const distanciaAnterior = ((eje === 'x' ? anterior.x : anterior.y) - valor) * normal;
            if (distanciaAnterior < 0) return;
            // Cruzó la línea en este tick: se mira el punto donde la cruzó.
            const t = distanciaAnterior / (distanciaAnterior - distancia);
            const paraleloAnterior = eje === 'x' ? anterior.y : anterior.x;
            paralelo = paraleloAnterior + (paralelo - paraleloAnterior) * t;
        }
        if (paralelo < desde || paralelo > hasta) return;
        if (distancia >= disco.r) return;
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
        // Las puntas que dan a una esquina hacia adentro (esquinas de la cancha y
        // fondo de la red) se estiran sin límite: del otro lado ya está la pared
        // vecina, y así un tiro rápido que cruza justo por la esquina no se escapa
        // por el hueco entre los dos segmentos (pasaba con escala grande + súper
        // tiro). Las puntas de la boca del arco no se estiran: esas son los postes.
        const I = Infinity;
        estado.segmentosPelota = [
            // Bordes de la cancha (la pelota solo sale por la boca del arco).
            { eje: 'y', valor: field.top, desde: -I, hasta: I, normal: 1, bCoef: BCOEF_BORDE },
            { eje: 'y', valor: field.bottom, desde: -I, hasta: I, normal: -1, bCoef: BCOEF_BORDE },
            { eje: 'x', valor: field.left, desde: -I, hasta: goalTop, normal: 1, bCoef: BCOEF_BORDE },
            { eje: 'x', valor: field.left, desde: goalBottom, hasta: I, normal: 1, bCoef: BCOEF_BORDE },
            { eje: 'x', valor: field.right, desde: -I, hasta: goalTop, normal: -1, bCoef: BCOEF_BORDE },
            { eje: 'x', valor: field.right, desde: goalBottom, hasta: I, normal: -1, bCoef: BCOEF_BORDE },
            // Redes: casi no rebotan.
            { eje: 'y', valor: goalTop, desde: -I, hasta: field.left, normal: 1, bCoef: BCOEF_RED },
            { eje: 'y', valor: goalBottom, desde: -I, hasta: field.left, normal: -1, bCoef: BCOEF_RED },
            { eje: 'x', valor: fondoIzq, desde: -I, hasta: I, normal: 1, bCoef: BCOEF_RED },
            { eje: 'y', valor: goalTop, desde: field.right, hasta: I, normal: 1, bCoef: BCOEF_RED },
            { eje: 'y', valor: goalBottom, desde: field.right, hasta: I, normal: -1, bCoef: BCOEF_RED },
            { eje: 'x', valor: fondoDer, desde: -I, hasta: I, normal: -1, bCoef: BCOEF_RED }
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

    function resolverColisiones(estado, pelotaAnterior = null) {
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
        postes.forEach(poste => chocarPosteBarrido(ball, poste, PELOTA.bCoef, POSTE.bCoef, pelotaAnterior));
        segmentosPelota(estado).forEach(segmento => chocarSegmento(ball, segmento, PELOTA.bCoef, pelotaAnterior));
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

    // Entero al azar en [min, max] con el generador del estado.
    function sortearTicks(estado, min, max) {
        return min + Math.floor(estado.aleatorio() * (max - min + 1));
    }

    /**
     * Saca el próximo tipo de la bolsa. La bolsa tiene los tres tipos mezclados
     * (Fisher-Yates) y se rellena al vaciarse; si la nueva empezaría con el mismo
     * tipo que salió último, se lo cambia de lugar para no repetir.
     */
    function sacarTipoPowerUp(estado) {
        if (!estado.bolsaPowerUps.length) {
            const bolsa = TIPOS_POWERUP.slice();
            for (let i = bolsa.length - 1; i > 0; i -= 1) {
                const j = Math.floor(estado.aleatorio() * (i + 1));
                [bolsa[i], bolsa[j]] = [bolsa[j], bolsa[i]];
            }
            if (bolsa.length > 1 && bolsa[0] === estado.ultimoPowerUp) {
                const j = 1 + Math.floor(estado.aleatorio() * (bolsa.length - 1));
                [bolsa[0], bolsa[j]] = [bolsa[j], bolsa[0]];
            }
            estado.bolsaPowerUps = bolsa;
        }
        const tipo = estado.bolsaPowerUps.shift();
        estado.ultimoPowerUp = tipo;
        return tipo;
    }

    /**
     * Busca un lugar al azar dentro de la cancha (lejos de las líneas) que no
     * quede encima de un jugador, de la pelota ni de otro power-up. Si en todos
     * los intentos hay algo cerca, se queda con el lugar más despejado.
     */
    function buscarLugarPowerUp(estado) {
        const { field, players, ball, activePowerUps } = estado;
        const escala = estado.mapa.escala;
        const radio = RADIO_POWERUP * escala;
        const margen = (RADIO_POWERUP + MARGEN_LINEAS_POWERUP) * escala;
        const ancho = Math.max(0, field.right - field.left - margen * 2);
        const alto = Math.max(0, field.bottom - field.top - margen * 2);
        const obstaculos = [...players, ball, ...activePowerUps];
        let mejor = null;
        for (let intento = 0; intento < INTENTOS_POSICION_POWERUP; intento += 1) {
            const x = field.left + margen + estado.aleatorio() * ancho;
            const y = field.top + margen + estado.aleatorio() * alto;
            // Aire libre contra el obstáculo más cercano (negativo = se pisan).
            const holgura = obstaculos.reduce((minima, disco) => Math.min(minima,
                Math.hypot(x - disco.x, y - disco.y) - disco.r - radio), Infinity);
            if (!mejor || holgura > mejor.holgura) mejor = { x, y, holgura };
            if (holgura >= DISTANCIA_LIBRE_POWERUP * escala) break;
        }
        return mejor;
    }

    function aparecerPowerUp(estado) {
        const lugar = buscarLugarPowerUp(estado);
        estado.activePowerUps.push({ x: lugar.x, y: lugar.y, r: RADIO_POWERUP * estado.mapa.escala, type: sacarTipoPowerUp(estado) });
        estado.eventosTick.push('powerUpAparece');
    }

    function avanzarPowerUps(estado) {
        if (!estado.powerUpsHabilitados || estado.golEnCurso) return;
        // Durante el saque nadie puede cruzar la mitad: un power-up que salía en
        // ese momento solo lo podía agarrar el de ese lado. La cuenta arranca
        // recién con la pelota en juego.
        if (estado.waitingForKickOff) return;
        estado.proximoPowerUpTicks -= 1;
        if (estado.proximoPowerUpTicks <= 0) {
            // Con la cancha llena no se acumula: se sortea otra espera.
            if (estado.activePowerUps.length < MAX_POWERUPS_EN_CANCHA) aparecerPowerUp(estado);
            estado.proximoPowerUpTicks = sortearTicks(estado, TICKS_ENTRE_POWERUPS_MIN, TICKS_ENTRE_POWERUPS_MAX);
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

    // En cada saque se limpian los power-ups, pero la bolsa sigue (no se repite
    // el último) y el próximo sale enseguida, no después de un intervalo entero.
    function quitarPowerUps(estado) {
        estado.activePowerUps.length = 0;
        estado.proximoPowerUpTicks = sortearTicks(estado, TICKS_PRIMER_POWERUP_MIN, TICKS_PRIMER_POWERUP_MAX);
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
        const pelotaAnterior = { x: estado.ball.x, y: estado.ball.y };
        integrar(estado);
        resolverColisiones(estado, pelotaAnterior);
        detectarGol(estado, pelotaAnterior.x);
        avanzarPowerUps(estado);
    }

    /**
     * Avanza la simulación `deltaMs` milisegundos en ticks fijos de 1/60 s.
     * Devuelve { pasos, eventos } con 'primerToque', 'gol', 'powerUp' (lo agarró
     * un jugador) y 'powerUpAparece'.
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
        constantes: {
            JUGADOR, PELOTA, POSTE, DISTANCIA_PATADA, MS_POR_TICK, ANCHO_REFERENCIA, ALTO_REFERENCIA, ESCALA_MAX,
            TIPOS_POWERUP, RADIO_POWERUP, MAX_POWERUPS_EN_CANCHA, DISTANCIA_LIBRE_POWERUP,
            TICKS_ENTRE_POWERUPS_MIN, TICKS_ENTRE_POWERUPS_MAX, TICKS_PRIMER_POWERUP_MIN, TICKS_PRIMER_POWERUP_MAX
        }
    };
    global.FisicaHaxball = FisicaHaxball;
    if (typeof module !== 'undefined' && module.exports) module.exports = FisicaHaxball;
})(typeof globalThis !== 'undefined' ? globalThis : this);
