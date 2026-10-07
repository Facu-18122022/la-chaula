/**
 * red.js (online)
 *
 * Lo que hace que el online se sienta como el arcade aunque haya red de por medio:
 *
 * 1. Predicción del jugador propio: el navegador mueve a TU jugador al instante,
 *    con la misma física de develop (fisica-haxball.js), sin esperar al servidor.
 *    Cada foto del servidor trae, para cada jugador, qué tecla suya ya aplicó y
 *    hace cuántos ticks; con eso el navegador parte de la posición real del
 *    servidor, vuelve a aplicar las teclas que todavía no llegaron y corrige la
 *    diferencia de a poco (sin saltos). Sin esto el jugador responde tarde y
 *    "resbala".
 *
 * 2. Reloj de ticks: las fotos se dibujan según su número de tick del servidor
 *    (no según cuándo llegaron), con un margen chico que se agranda solo si la
 *    red es inestable. Así no se traba aunque lleguen de a dos o a destiempo.
 */
(function (global) {
    const MS_TICK = 1000 / 60;
    const LEJOS = -1e6;

    function interpolar(a, b, t) {
        return a + (b - a) * t;
    }

    /* ========================= */
    /* RELOJ DE TICKS Y FOTOS    */
    /* ========================= */

    function crearLinea() {
        let fotos = [];
        let reloj = null;
        let inestabilidad = 0;

        function reiniciar() {
            fotos = [];
            reloj = null;
            inestabilidad = 0;
        }

        function agregar(foto) {
            const ultima = fotos[fotos.length - 1];
            if (ultima && foto.n < ultima.n) {
                // Partido nuevo (el tick volvió a empezar): se arranca de cero.
                if (ultima.n - foto.n > 30) reiniciar();
                else return;
            }
            if (ultima && ultima.n === foto.n) fotos[fotos.length - 1] = foto;
            else fotos.push(foto);
            if (fotos.length > 120) fotos.shift();

            if (reloj === null || Math.abs(foto.n - reloj) > 30) {
                reloj = foto.n;
                inestabilidad = 0;
                return;
            }
            const error = foto.n - reloj;
            inestabilidad = inestabilidad * 0.9 + Math.abs(error) * 0.1;
            reloj += error * 0.1;
        }

        function avanzar(ms) {
            if (reloj !== null) reloj += ms / MS_TICK;
        }

        // Margen en ticks: 2 (33 ms) con red estable, hasta 6 si llega a los saltos.
        function margen() {
            return Math.min(6, 2 + inestabilidad * 2);
        }

        function ultima() {
            return fotos.length ? fotos[fotos.length - 1] : null;
        }

        /** Foto interpolada en el tick que toca dibujar. */
        function fotoParaDibujar() {
            if (!fotos.length) return null;
            const momento = reloj - margen();
            const siguiente = fotos.findIndex(foto => foto.n > momento);
            if (siguiente === -1) return fotos[fotos.length - 1];
            if (siguiente === 0) return fotos[0];
            const a = fotos[siguiente - 1];
            const b = fotos[siguiente];
            const t = (momento - a.n) / Math.max(1, b.n - a.n);
            const anteriores = new Map(a.j.map(jugador => [jugador[0], jugador]));
            return {
                ...b,
                b: [interpolar(a.b[0], b.b[0], t), interpolar(a.b[1], b.b[1], t), b.b[2]],
                j: b.j.map(jugador => {
                    const previo = anteriores.get(jugador[0]);
                    if (!previo) return jugador;
                    return [jugador[0], interpolar(previo[1], jugador[1], t), interpolar(previo[2], jugador[2], t), ...jugador.slice(3)];
                })
            };
        }

        return { agregar, avanzar, fotoParaDibujar, ultima, reiniciar };
    }

    /* ========================= */
    /* PREDICCIÓN DEL JUGADOR    */
    /* ========================= */

    function inputDeBits(bits) {
        return {
            up: !!(bits & 1),
            down: !!(bits & 2),
            left: !!(bits & 4),
            right: !!(bits & 8),
            kick: !!(bits & 16)
        };
    }

    function crearPrediccion(Fisica) {
        let tick = 0;
        let acumulado = 0;
        let ultimoAncla = -Infinity;
        let mini = null;
        let miId = null;
        let offset = { x: 0, y: 0 };
        const historial = new Map();

        function reiniciar() {
            mini = null;
            offset = { x: 0, y: 0 };
        }

        // Una cancha de un solo jugador (el tuyo) con la pelota lejos: la física
        // de develop mueve, frena, respeta bordes y barreras de saque igual que en el servidor.
        function asegurarMini(mapa, id, equipo) {
            const yo = mini && mini.players[0];
            if (mini && mini.mapa.id === mapa.id && yo.id === id && yo.equipo === equipo) return;
            miId = id;
            mini = Fisica.crearEstado({ mapa, ladoIzquierdo: 'red', kickoffTeam: 'red', jugadores: [{ id, equipo }], powerUps: false });
            esconderPelota();
            offset = { x: 0, y: 0 };
        }

        function esconderPelota() {
            mini.ball.x = LEJOS;
            mini.ball.y = LEJOS;
            mini.ball.vx = 0;
            mini.ball.vy = 0;
        }

        function paso(bits) {
            mini.restoMs = 0;
            Fisica.avanzar(mini, MS_TICK, { [miId]: inputDeBits(bits) });
            mini.kickEvents.length = 0;
            mini.kickImpactEvents.length = 0;
            esconderPelota();
        }

        /**
         * Avanza el reloj local en ticks fijos de 1/60 s guardando qué teclas había
         * en cada uno. Devuelve true cada medio segundo para mandar un "ancla".
         */
        function avanzar(ms, bits, pausado) {
            acumulado = Math.min(acumulado + ms, 250);
            while (acumulado >= MS_TICK) {
                acumulado -= MS_TICK;
                tick += 1;
                historial.set(tick, bits);
                historial.delete(tick - 240);
                if (mini && !pausado) paso(bits);
            }
            if (tick - ultimoAncla >= 30) {
                ultimoAncla = tick;
                return true;
            }
            return false;
        }

        /** Tick en el que va a empezar a valer una tecla apretada ahora. */
        function proximoTick() {
            ultimoAncla = tick;
            return tick + 1;
        }

        /**
         * fila: [id, x, y, r, pateando, power, vx, vy, patadaUsada, tickTecla, ticksDesde]
         */
        function reconciliar(fila, foto, mapa, equipo, bitsActuales) {
            const [id, x, y, r, pateando, power, vx, vy, patadaUsada, tickTecla, ticksDesde] = fila;
            asegurarMini(mapa, id, equipo);
            const yo = mini.players[0];
            const antes = { x: yo.x + offset.x, y: yo.y + offset.y };

            yo.x = x;
            yo.y = y;
            yo.vx = vx || 0;
            yo.vy = vy || 0;
            yo.r = r;
            yo.pateando = !!pateando;
            yo.patadaUsada = !!patadaUsada;
            yo.activePower = power || null;
            yo.powerTimer = 1e9;
            mini.waitingForKickOff = foto.f === 'SAQUE';
            mini.golEnCurso = foto.f === 'GOL';
            mini.kickoffTeam = foto.s;

            // Vuelve a aplicar las teclas que el servidor todavía no procesó.
            if (tickTecla >= 0 && !foto.p) {
                const base = tickTecla + ticksDesde - 1;
                if (base <= tick && tick - base <= 180) {
                    for (let t = base + 1; t <= tick; t += 1) {
                        paso(historial.has(t) ? historial.get(t) : bitsActuales);
                    }
                }
            }

            // Corrección suave; si la diferencia es enorme (saque, reconexión) se salta directo.
            const dx = antes.x - yo.x;
            const dy = antes.y - yo.y;
            const limite = 40 * (mapa.escala || 1);
            offset = Math.hypot(dx, dy) > limite ? { x: 0, y: 0 } : { x: dx, y: dy };
        }

        /** Posición a dibujar de tu jugador (o null si no hay predicción). */
        function posicion(ms) {
            if (!mini) return null;
            const factor = Math.exp(-Math.max(0, ms) / 60);
            offset.x *= factor;
            offset.y *= factor;
            const yo = mini.players[0];
            return { x: yo.x + offset.x, y: yo.y + offset.y, pateando: yo.pateando };
        }

        return { avanzar, proximoTick, reconciliar, posicion, reiniciar, get tick() { return tick; } };
    }

    global.RedOnline = { crearLinea, crearPrediccion };
})(typeof globalThis !== 'undefined' ? globalThis : this);
