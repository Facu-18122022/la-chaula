/**
 * red.js (online)
 *
 * Lo que hace que el online se sienta como el arcade aunque haya red de por medio:
 *
 * 1. Predicción de toda la cancha (ver crearPrediccion). El navegador mueve a TU jugador al instante,
 *    con la misma física de develop (fisica-haxball.js), sin esperar al servidor.
 *    Cada foto del servidor trae, para cada jugador, qué tecla suya ya aplicó y
 *    hace cuántos ticks; con eso el navegador parte de la posición real del
 *    servidor, vuelve a aplicar las teclas que todavía no llegaron y corrige la
 *    diferencia de a poco (sin saltos). Sin esto el jugador responde tarde y
 *    "resbala". La física va en ticks fijos de 1/60 s, pero se dibuja entre el
 *    tick anterior y el actual según cuánto pasó: así se ve fluido a cualquier
 *    tasa de refresco (60, 75, 144 Hz...) y no da saltitos.
 *
 * 2. Reloj de ticks: las fotos se dibujan según su número de tick del servidor
 *    (no según cuándo llegaron). El reloj sigue a las fotos que llegan más rápido
 *    y el margen (cuánto atrás se dibuja) sale del peor atraso de los últimos 2
 *    segundos; cambia de a poco para que no se note. Si igual falta la foto que
 *    toca, jugadores y pelota siguen un par de ticks con su velocidad en vez de
 *    congelarse y pegar un salto.
 */
(function (global) {
    const MS_TICK = 1000 / 60;
    // Margen en ticks: 2 (33 ms) con red estable, hasta 8 si llega a los saltos.
    const MARGEN_MIN = 2;
    const MARGEN_MAX = 8;
    const VENTANA_ATRASOS_MS = 2000;
    // Si no llegó la foto que toca se sigue con la velocidad hasta 2 ticks (33 ms).
    const MAX_EXTRAPOLAR = 2;

    function interpolar(a, b, t) {
        return a + (b - a) * t;
    }

    /* ========================= */
    /* RELOJ DE TICKS Y FOTOS    */
    /* ========================= */

    function crearLinea() {
        let fotos = [];
        let reloj = null;
        let margen = MARGEN_MIN;
        let atrasos = [];
        let tiempoMs = 0;

        function reiniciar() {
            fotos = [];
            reloj = null;
            margen = MARGEN_MIN;
            atrasos = [];
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

            // En pausa el tick del servidor no avanza, y el reloj tampoco (ver avanzar).
            if (foto.p) {
                if (reloj === null) reloj = foto.n;
                return;
            }
            if (reloj === null || Math.abs(foto.n - reloj) > 30) {
                reloj = foto.n;
                margen = MARGEN_MIN;
                atrasos = [];
                return;
            }
            // Una foto adelantada acerca el reloj rápido; una atrasada (la red tardó)
            // casi no lo mueve: su atraso queda anotado para agrandar el margen.
            const error = foto.n - reloj;
            reloj += error > 0 ? error * 0.3 : error * 0.02;
            atrasos.push({ t: tiempoMs, v: Math.max(0, -error) });
        }

        function avanzar(ms) {
            tiempoMs += ms;
            while (atrasos.length && tiempoMs - atrasos[0].t > VENTANA_ATRASOS_MS) atrasos.shift();
            const ultima = fotos[fotos.length - 1];
            if (reloj === null || (ultima && ultima.p)) return;
            const ticks = ms / MS_TICK;
            reloj += ticks;

            // Hace falta la foto siguiente para interpolar: peor atraso + 1 tick + medio de respiro.
            let peor = 0;
            atrasos.forEach(atraso => { if (atraso.v > peor) peor = atraso.v; });
            const objetivo = Math.min(MARGEN_MAX, Math.max(MARGEN_MIN, peor + 1.5));
            // Sube rápido y baja despacio (como mucho 10% / 3% de cambio de velocidad: no se nota).
            const paso = ticks * (objetivo > margen ? 0.1 : 0.03);
            margen += Math.max(-paso, Math.min(paso, objetivo - margen));
        }

        function ultima() {
            return fotos.length ? fotos[fotos.length - 1] : null;
        }

        /** Sigue a jugadores y pelota con su velocidad (px por tick) un ratito más allá de la última foto. */
        function extrapolar(foto, momento) {
            const extra = Math.min(MAX_EXTRAPOLAR, momento - foto.n);
            if (foto.p || !(extra > 0)) return foto;
            const pelota = foto.b;
            return {
                ...foto,
                b: [pelota[0] + (pelota[3] || 0) * extra, pelota[1] + (pelota[4] || 0) * extra, pelota[2]],
                j: foto.j.map(jugador => [
                    jugador[0],
                    jugador[1] + (jugador[6] || 0) * extra,
                    jugador[2] + (jugador[7] || 0) * extra,
                    ...jugador.slice(3)
                ])
            };
        }

        /** Foto interpolada en el tick que toca dibujar. */
        function fotoParaDibujar() {
            if (!fotos.length) return null;
            const momento = reloj - margen;
            const siguiente = fotos.findIndex(foto => foto.n > momento);
            if (siguiente === -1) return extrapolar(fotos[fotos.length - 1], momento);
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

    /**
     * Predicción de TODA la cancha (como la "extrapolación" de HaxBall).
     *
     * Antes solo se adelantaba a tu jugador y la pelota y los demás se dibujaban
     * atrasados (lo que tarda la red): por eso parecía que atravesabas la pelota
     * y a los rivales. Ahora el navegador tiene una copia completa de la cancha
     * con la misma física del servidor: en cada foto parte del estado real
     * (todos los jugadores y la pelota), vuelve a simular hasta el presente con
     * tus teclas guardadas y las últimas teclas conocidas de los demás, y dibuja
     * todo en el mismo instante. Así chocás, conducís y pateás al momento, y lo
     * que ves es lo mismo que calcula el servidor. Las correcciones se reparten
     * en unos cuadros para que no se vean saltos.
     */
    function crearPrediccion(Fisica) {
        let tick = 0;
        let acumulado = 0;
        let ultimoAncla = -Infinity;
        let mundo = null;
        let miId = null;
        let pausado = false;
        // Teclas de los demás (las últimas que mandó el servidor).
        let bitsOtros = new Map();
        // Corrección pendiente de cada cosa ('b' = pelota) y posición en el tick anterior.
        let offsets = new Map();
        let previas = null;
        const historial = new Map();

        function reiniciar() {
            mundo = null;
            previas = null;
            offsets = new Map();
            bitsOtros = new Map();
        }

        function asegurarMundo(mapa) {
            if (mundo && mundo.mapa.id === mapa.id && mundo.mapa.width === mapa.width && mundo.mapa.height === mapa.height) return;
            mundo = Fisica.crearEstado({ mapa, ladoIzquierdo: 'red', kickoffTeam: 'red', jugadores: [], powerUps: false });
            previas = null;
            offsets = new Map();
        }

        function fotoDelMundo() {
            const posiciones = new Map();
            mundo.players.forEach(jugador => posiciones.set(jugador.id, { x: jugador.x, y: jugador.y }));
            posiciones.set('b', { x: mundo.ball.x, y: mundo.ball.y });
            return posiciones;
        }

        function paso(bitsPropios) {
            mundo.restoMs = 0;
            const inputs = {};
            mundo.players.forEach(jugador => {
                inputs[jugador.id] = inputDeBits(jugador.id === miId ? bitsPropios : (bitsOtros.get(jugador.id) || 0));
            });
            Fisica.avanzar(mundo, MS_TICK, inputs);
            mundo.kickEvents.length = 0;
            mundo.kickImpactEvents.length = 0;
        }

        /** Posiciones entre el tick anterior y el actual según cuánto pasó del tick (sin corrección). */
        function puntosEntreTicks() {
            const actuales = fotoDelMundo();
            if (!previas) return actuales;
            const t = Math.min(1, acumulado / MS_TICK);
            actuales.forEach((punto, id) => {
                const previo = previas.get(id);
                if (!previo) return;
                punto.x = interpolar(previo.x, punto.x, t);
                punto.y = interpolar(previo.y, punto.y, t);
            });
            return actuales;
        }

        function puntosDibujados() {
            const puntos = puntosEntreTicks();
            puntos.forEach((punto, id) => {
                const offset = offsets.get(id);
                if (!offset) return;
                punto.x += offset.x;
                punto.y += offset.y;
            });
            return puntos;
        }

        /**
         * Avanza el reloj local en ticks fijos de 1/60 s guardando qué teclas había
         * en cada uno. Devuelve true cada medio segundo para mandar un "ancla".
         */
        function avanzar(ms, bits, enPausa) {
            pausado = !!enPausa;
            acumulado = Math.min(acumulado + ms, 250);
            while (acumulado >= MS_TICK) {
                acumulado -= MS_TICK;
                tick += 1;
                historial.set(tick, bits);
                historial.delete(tick - 240);
                if (mundo && !pausado) {
                    previas = fotoDelMundo();
                    paso(bits);
                }
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

        function jugadorDeFila(fila, equipo) {
            const [id, x, y, r, pateando, power, vx, vy, patadaUsada] = fila;
            return {
                id,
                equipo: equipo === 'blue' ? 'blue' : 'red',
                x, y,
                vx: vx || 0,
                vy: vy || 0,
                r,
                rBase: r,
                invMass: Fisica.constantes.JUGADOR.invMass,
                pateando: !!pateando,
                patadaUsada: !!patadaUsada,
                activePower: power || null,
                // Los power-ups los maneja el servidor: acá no se vencen.
                powerTimer: 1e9
            };
        }

        /**
         * Carga la foto del servidor en la copia local y la adelanta hasta el presente.
         * Fila de cada jugador: [id, x, y, r, pateando, power, vx, vy, patadaUsada, tickTecla, ticksDesde, bits]
         * equipos: Map id → 'red' | 'blue'.
         */
        function reconciliar(foto, mapa, equipos, id, bitsActuales) {
            const mia = foto.j.find(fila => fila[0] === id);
            if (!mia) {
                reiniciar();
                return;
            }
            asegurarMundo(mapa);
            miId = id;
            // Lo último que se dibujó, para que la corrección no se vea como un salto.
            const antes = puntosDibujados();

            bitsOtros = new Map(foto.j.map(fila => [fila[0], fila[11] | 0]));
            mundo.players = foto.j.map(fila => jugadorDeFila(fila, equipos.get(fila[0])));
            const pelota = mundo.ball;
            pelota.x = foto.b[0];
            pelota.y = foto.b[1];
            pelota.r = foto.b[2];
            pelota.vx = foto.b[3] || 0;
            pelota.vy = foto.b[4] || 0;
            mundo.waitingForKickOff = foto.f === 'SAQUE';
            mundo.golEnCurso = foto.f === 'GOL';
            mundo.kickoffTeam = foto.s;
            mundo.activePowerUps = [];

            // Vuelve a simular los ticks que el servidor todavía no procesó.
            previas = null;
            const tickTecla = mia[9];
            const ticksDesde = mia[10];
            if (tickTecla >= 0 && !foto.p) {
                const base = tickTecla + ticksDesde - 1;
                if (base <= tick && tick - base <= 60) {
                    for (let t = base + 1; t <= tick; t += 1) {
                        previas = fotoDelMundo();
                        paso(historial.has(t) ? historial.get(t) : bitsActuales);
                    }
                }
            }

            // Corrección suave; si la diferencia es enorme (saque, gol, reconexión) se salta directo.
            const ahora = puntosEntreTicks();
            const limite = 40 * (mapa.escala || 1);
            const nuevos = new Map();
            ahora.forEach((punto, clave) => {
                const previo = antes.get(clave);
                if (!previo) return;
                const dx = previo.x - punto.x;
                const dy = previo.y - punto.y;
                if (Math.hypot(dx, dy) <= limite) nuevos.set(clave, { x: dx, y: dy });
            });
            offsets = nuevos;
        }

        /**
         * Lo que hay que dibujar: { pelota: {x, y}, jugadores: Map id → {x, y, pateando} }
         * (o null si no hay predicción, por ejemplo si mirás como espectador).
         */
        function estadoActual(ms) {
            if (!mundo) return null;
            // Las correcciones se van apagando (~60 ms la de los jugadores, ~45 ms la de la pelota).
            const factorJugador = Math.exp(-Math.max(0, ms) / 60);
            const factorPelota = Math.exp(-Math.max(0, ms) / 45);
            offsets.forEach((offset, clave) => {
                const factor = clave === 'b' ? factorPelota : factorJugador;
                offset.x *= factor;
                offset.y *= factor;
            });
            const puntos = puntosDibujados();
            const jugadores = new Map();
            mundo.players.forEach(jugador => {
                const punto = puntos.get(jugador.id);
                jugadores.set(jugador.id, { x: punto.x, y: punto.y, pateando: jugador.pateando });
            });
            return { pelota: puntos.get('b'), jugadores };
        }

        return { avanzar, proximoTick, reconciliar, estadoActual, reiniciar, get tick() { return tick; } };
    }

    global.RedOnline = { crearLinea, crearPrediccion };
})(typeof globalThis !== 'undefined' ? globalThis : this);
