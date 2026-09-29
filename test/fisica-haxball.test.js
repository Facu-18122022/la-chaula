/**
 * Pruebas del motor de física estilo HaxBall y del gestor de partido.
 * Se corren con: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Fisica = require('../server/public/js/local/fisica-haxball.js');
global.FisicaHaxball = Fisica;
const MatchManager = require('../server/public/js/local/match-manager.js');

const TICK = 1000 / 60;
const MAPA = { width: 840, height: 400, goalHeight: 128, margenX: 50, margenY: 30, profundidadArco: 30, radioSaque: 75 };

function crear(opciones = {}) {
    return Fisica.crearEstado({
        mapa: MAPA,
        ladoIzquierdo: 'red',
        kickoffTeam: 'red',
        jugadores: [{ id: 'j1', equipo: 'red' }, { id: 'j2', equipo: 'blue' }],
        ...opciones
    });
}

function simular(estado, ticks, inputs = {}) {
    const eventos = [];
    for (let i = 0; i < ticks; i += 1) eventos.push(...Fisica.avanzar(estado, TICK, inputs).eventos);
    return eventos;
}

// Generador congruencial lineal: mismo "azar" en cada corrida.
function generador(semilla) {
    let s = semilla >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// Velocidad terminal con amortiguación 0.96: v = a·d / (1 − d).
test('la velocidad máxima del jugador es la del futsal de HaxBall (≈2.64 px/tick) y pateando baja (≈1.99)', () => {
    const estado = crear();
    estado.waitingForKickOff = false;
    estado.ball.y = 60;
    simular(estado, 120, { j1: { right: true } });
    const j1 = estado.players[0];
    assert.ok(Math.abs(Math.hypot(j1.vx, j1.vy) - 2.64) < 0.05, `vel=${j1.vx}`);

    const otro = crear();
    otro.waitingForKickOff = false;
    otro.ball.x = 100;
    otro.ball.y = 60;
    simular(otro, 110, { j1: { down: true, kick: true } });
    const p = otro.players[0];
    assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - 1.992) < 0.05, `vel pateando=${p.vy}`);
});

test('en el mapa de referencia: jugador radio 16 (HaxBall 15 + un toque), pelota radio 8 e invMass 1.2, postes radio 5', () => {
    const estado = crear();
    assert.equal(estado.mapa.escala, 1);
    assert.equal(estado.players[0].r, 16);
    assert.equal(estado.ball.r, 8);
    assert.equal(estado.ball.invMass, 1.2);
    estado.postes.forEach(poste => assert.equal(poste.r, 5));
});

const TITAN = { width: 1600, height: 800, goalHeight: 180 };
const ESCALA_TITAN = Math.sqrt((1600 * 800) / (840 * 400));

test('escala por área: nunca achica, tope 2 y un mapa puede fijar la suya', () => {
    const escalaDe = mapa => Fisica.normalizarMapa(mapa).escala;
    assert.ok(Math.abs(escalaDe(TITAN) - ESCALA_TITAN) < 1e-9);
    assert.ok(Math.abs(escalaDe({ width: 1300, height: 640 }) - Math.sqrt(1300 * 640 / 336000)) < 1e-9);
    assert.equal(escalaDe({ width: 500, height: 300 }), 1, 'Micro no se achica');
    assert.equal(escalaDe({ width: 800, height: 400 }), 1);
    assert.ok(escalaDe({ width: 1200, height: 350 }) < 1.15, 'The Tunnel (largo y finito) casi no crece');
    assert.equal(escalaDe({ width: 3000, height: 1500 }), 2);
    assert.equal(escalaDe({ width: 1600, height: 800, escala: 1.3 }), 1.3);
});

test('en Titan los discos miden 16/8/5 × escala y BIG sigue siendo ×1.55', () => {
    const titan = crear({ mapa: TITAN, powerUps: true, aleatorio: generador(4) });
    const j1 = titan.players[0];
    assert.ok(Math.abs(j1.r - 16 * ESCALA_TITAN) < 1e-9, `r=${j1.r}`);
    assert.equal(j1.rBase, j1.r);
    assert.ok(Math.abs(titan.ball.r - 8 * ESCALA_TITAN) < 1e-9);
    titan.postes.forEach(poste => assert.ok(Math.abs(poste.r - 5 * ESCALA_TITAN) < 1e-9));

    titan.waitingForKickOff = false;
    titan.activePowerUps.push({ x: j1.x, y: j1.y, r: C.RADIO_POWERUP * ESCALA_TITAN, type: 'BIG' });
    simular(titan, 1);
    assert.equal(j1.activePower, 'BIG');
    assert.ok(Math.abs(j1.r - 16 * ESCALA_TITAN * 1.55) < 1e-9);

    titan.proximoPowerUpTicks = 1;
    titan.activePowerUps.length = 0;
    simular(titan, 1);
    assert.ok(Math.abs(titan.activePowerUps[0].r - C.RADIO_POWERUP * ESCALA_TITAN) < 1e-9);
});

test('en mapas grandes el jugador ocupa del ancho lo mismo que en HaxBall', () => {
    const haxball = 16 / 840; // radio / ancho del mapa de referencia
    [[1020, 510], [1000, 500], [1300, 640], [1600, 800], [1100, 550], [900, 450]].forEach(([width, height]) => {
        const estado = crear({ mapa: { width, height, goalHeight: 120 } });
        const proporcion = estado.players[0].r / width;
        assert.ok(Math.abs(proporcion / haxball - 1) < 0.1, `${width}x${height}: ${(proporcion / haxball).toFixed(2)}`);
    });
});

test('la velocidad máxima y la patada escalan linealmente con el mapa', () => {
    const titan = crear({ mapa: TITAN });
    titan.waitingForKickOff = false;
    titan.ball.y = 100;
    titan.players[1].y = 700; // que j2 no se cruce en el camino
    simular(titan, 150, { j1: { right: true } });
    const j1 = titan.players[0];
    assert.ok(Math.abs(Math.hypot(j1.vx, j1.vy) - 2.64 * ESCALA_TITAN) < 0.05, `vel titan=${j1.vx}`);

    const otro = crear({ mapa: TITAN });
    const pateador = otro.players[0];
    // A 1 px × escala del borde: dentro del alcance de la patada (4 px × escala).
    pateador.x = otro.ball.x - (pateador.r + otro.ball.r + 3 * ESCALA_TITAN);
    pateador.y = otro.ball.y;
    simular(otro, 1, { j1: { kick: true } });
    assert.ok(Math.abs(otro.ball.vx - 6 * ESCALA_TITAN * 0.99) < 0.01, `patada titan=${otro.ball.vx}`);

    // Mismo tiempo (en ticks) para cruzar la cancha que en el mapa de referencia.
    const referencia = crear();
    referencia.ball.vx = 6;
    titan.ball.vx = 6 * ESCALA_TITAN;
    const ticksHasta = (estado, fraccion) => {
        estado.waitingForKickOff = false;
        estado.ball.x = estado.field.left + 30 * estado.mapa.escala;
        estado.ball.y = estado.mapa.height / 2;
        estado.ball.vy = 0;
        estado.players.forEach(jugador => { jugador.y = estado.field.top; });
        const meta = estado.field.left + (estado.field.right - estado.field.left) * fraccion;
        let ticks = 0;
        while (estado.ball.x < meta && ticks < 1000) { simular(estado, 1); ticks += 1; }
        return ticks;
    };
    const distanciaRef = (referencia.field.right - referencia.field.left) * 0.3;
    const distanciaTitan = (titan.field.right - titan.field.left) * 0.3;
    // La cancha de Titan es algo más larga que referencia × escala, así que tarda un poco más.
    const ticksRef = ticksHasta(referencia, 0.3);
    const ticksTitan = ticksHasta(titan, 0.3);
    assert.ok(ticksTitan <= ticksRef * (distanciaTitan / (distanciaRef * ESCALA_TITAN)) + 3, `${ticksRef} vs ${ticksTitan}`);
});

test('la diagonal no es más rápida que la recta', () => {
    const estado = crear();
    estado.waitingForKickOff = false;
    simular(estado, 200, { j1: { right: true, down: true } });
    const j1 = estado.players[0];
    assert.ok(Math.hypot(j1.vx, j1.vy) < 2.69);
});

test('la patada suma 5 × 1.2 (invMass de la pelota) = 6 px/tick jugador→pelota y hay que soltar para repetir', () => {
    const estado = crear();
    const j1 = estado.players[0];
    j1.x = estado.ball.x - (j1.r + estado.ball.r + 2);
    j1.y = estado.ball.y;
    const eventos = simular(estado, 1, { j1: { kick: true } });
    assert.ok(eventos.includes('primerToque'));
    assert.ok(Math.abs(estado.ball.vx - 6 * 0.99) < 0.01, `vx=${estado.ball.vx}`);
    assert.equal(estado.waitingForKickOff, false);

    // Sigue apretado: no vuelve a patear aunque la pelota vuelva a estar cerca.
    estado.ball.x = j1.x + j1.r + estado.ball.r + 1;
    estado.ball.vx = 0;
    simular(estado, 1, { j1: { kick: true } });
    assert.ok(Math.abs(estado.ball.vx) < 0.5, 'no debe patear dos veces sin soltar');
    simular(estado, 1, {});
    estado.ball.x = j1.x + j1.r + estado.ball.r + 1;
    estado.ball.vx = 0;
    simular(estado, 1, { j1: { kick: true } });
    assert.ok(estado.ball.vx > 4, 'después de soltar puede volver a patear');
});

test('en el saque el equipo que no saca no puede entrar al círculo ni cruzar la mitad', () => {
    const estado = crear();
    simular(estado, 400, { j2: { left: true } });
    const j2 = estado.players[1];
    const centroX = MAPA.width / 2;
    const distancia = Math.hypot(j2.x - centroX, j2.y - MAPA.height / 2);
    assert.ok(distancia >= 75 + j2.r - 0.5, `j2 entró al círculo: ${distancia}`);
    assert.ok(j2.x >= centroX + j2.r - 0.5);
    assert.equal(estado.waitingForKickOff, true);
});

test('la pelota rebota en el poste y no es gol', () => {
    const estado = crear();
    estado.waitingForKickOff = false;
    const poste = estado.postes[2];
    estado.ball.x = poste.x - 60;
    estado.ball.y = poste.y;
    estado.ball.vx = 6;
    estado.ball.vy = 0;
    const eventos = simular(estado, 30);
    assert.ok(!eventos.includes('gol'));
    assert.ok(estado.ball.vx < 0, 'debe volver hacia la cancha');
});

test('gol al cruzar la línea entre los postes y la pelota queda dentro de la red', () => {
    const estado = crear();
    estado.waitingForKickOff = false;
    estado.ball.x = estado.field.right - 40;
    estado.ball.y = MAPA.height / 2;
    estado.ball.vx = 7;
    const eventos = simular(estado, 30);
    assert.ok(eventos.includes('gol'));
    assert.equal(estado.lastGoalTeam, 'red');
    assert.ok(estado.ball.x <= estado.field.right + MAPA.profundidadArco - estado.ball.r + 0.01);
    assert.ok(estado.ball.x > estado.field.right);
});

test('la pelota no sale por los costados fuera del arco', () => {
    const estado = crear();
    estado.waitingForKickOff = false;
    estado.ball.x = estado.field.left + 60;
    estado.ball.y = estado.field.top + 20;
    estado.ball.vx = -9;
    estado.ball.vy = -3;
    simular(estado, 120);
    assert.ok(estado.ball.x >= estado.field.left + estado.ball.r - 0.01);
    assert.ok(estado.ball.y >= estado.field.top + estado.ball.r - 0.01);
});

test('una súper patada en un mapa grande no atraviesa las paredes', () => {
    // SUPER_KICK × Titan: 6 × 1.8 × 1.95 ≈ 21 px/tick; con la velocidad del jugador
    // sumada se prueba con 34, más que el diámetro de la pelota (≈31).
    const estado = crear({ mapa: TITAN });
    estado.waitingForKickOff = false;
    const velocidad = 34;
    [[0, -1], [0, 1], [-1, -0.2], [1, 0.2], [-0.6, -0.8]].forEach(([dx, dy]) => {
        estado.ball.x = estado.mapa.width / 2 + dx * 10;
        estado.ball.y = dx === 0 ? estado.mapa.height / 2 : estado.field.top + 60;
        const norma = Math.hypot(dx, dy);
        estado.ball.vx = dx / norma * velocidad;
        estado.ball.vy = dy / norma * velocidad;
        for (let i = 0; i < 90; i += 1) {
            Fisica.avanzar(estado, TICK);
            assert.ok(estado.ball.y >= estado.field.top + estado.ball.r - 0.01, 'se escapó por arriba');
            assert.ok(estado.ball.y <= estado.field.bottom - estado.ball.r + 0.01, 'se escapó por abajo');
            if (estado.ball.y < estado.goalTop || estado.ball.y > estado.goalBottom) {
                assert.ok(estado.ball.x >= estado.field.left - 0.01 && estado.ball.x <= estado.field.right + 0.01, 'se escapó por un costado');
            }
        }
    });
});

test('una súper patada no atraviesa ni se mete adentro de un poste (escala 1 y escala 2)', () => {
    [MAPA, { width: 3000, height: 1500, goalHeight: 300 }].forEach(mapa => {
        const escala = Fisica.normalizarMapa(mapa).escala;
        // Súper patada + jugador corriendo con SPEED, con margen.
        const velocidad = (6 * 1.8 + 2.64 * 1.45) * escala * 1.3;
        [-0.5, -0.2, 0, 0.2, 0.5].forEach(desvio => {
            const estado = crear({ mapa });
            estado.waitingForKickOff = false;
            estado.players.forEach(jugador => { jugador.y = estado.field.top; });
            const poste = estado.postes[2];
            const minima = poste.r + estado.ball.r;
            // Arranca justo afuera y apunta al poste con distintos desvíos.
            estado.ball.x = poste.x - minima - 0.5;
            estado.ball.y = poste.y + desvio * minima;
            const dy = poste.y - estado.ball.y;
            const dx = poste.x - estado.ball.x;
            const norma = Math.hypot(dx, dy);
            estado.ball.vx = dx / norma * velocidad;
            estado.ball.vy = dy / norma * velocidad;
            simular(estado, 1);
            const distancia = Math.hypot(estado.ball.x - poste.x, estado.ball.y - poste.y);
            assert.ok(distancia >= minima - 0.01, `escala ${escala} desvío ${desvio}: quedó a ${distancia.toFixed(2)} de ${minima}`);
            assert.ok(estado.ball.x < poste.x, `escala ${escala} desvío ${desvio}: pasó al otro lado del poste`);
            assert.ok(estado.ball.vx < 0, 'rebota hacia la cancha');
        });
    });
});

test('una súper patada justo a una esquina (de la red o de la cancha) no se escapa por el hueco', () => {
    const estado = crear({ mapa: TITAN });
    const { field, goalTop, goalBottom, mapa } = estado;
    const fondoIzq = field.left - mapa.profundidadArco;
    // Tiros cruzados que entran al arco izquierdo en diagonal y van a las esquinas
    // del fondo de la red (el caso real: desde (167, 321) a (-20, 25) px/tick se
    // salía por abajo del arco), y también a las esquinas de la cancha.
    const tiros = [[167.39, 321.41, -19.95, 25.28]];
    for (let x = field.left + 40; x <= field.left + 200; x += 20) {
        for (let y = goalTop + 20; y <= goalBottom - 20; y += 20) {
            [[-20, 25], [-20, -25], [-28, 18], [-28, -18], [-12, 30], [-12, -30]].forEach(([vx, vy]) => tiros.push([x, y, vx, vy]));
        }
    }
    tiros.forEach(([x0, y0, vx, vy]) => {
        estado.waitingForKickOff = false;
        estado.golEnCurso = false;
        Object.assign(estado.ball, { x: x0, y: y0, vx, vy });
        for (let i = 0; i < 40; i += 1) {
            Fisica.avanzar(estado, TICK);
            const { x, y } = estado.ball;
            const enCancha = x >= field.left - 0.5 && x <= field.right + 0.5 && y >= field.top - 0.5 && y <= field.bottom + 0.5;
            const enArco = y >= goalTop - 0.5 && y <= goalBottom + 0.5 && x >= fondoIzq - 0.5;
            assert.ok(enCancha || enArco, `tiro desde (${x0}, ${y0}) a (${vx}, ${vy}): se escapó a (${x.toFixed(1)}, ${y.toFixed(1)})`);
        }
    });
});

test('partido: gol, celebración con física, saque del equipo que lo recibió', () => {
    const estadoFisica = crear();
    const partido = MatchManager.crear({ estadoFisica, tiempoMs: 60000, limiteGoles: 3 });
    const j1 = estadoFisica.players[0];
    j1.x = estadoFisica.ball.x - (j1.r + estadoFisica.ball.r + 1);
    partido.actualizar(TICK, { j1: { kick: true } });
    assert.equal(partido.obtenerSnapshot().fase, 'JUGANDO');

    estadoFisica.ball.x = estadoFisica.field.right - 20;
    estadoFisica.ball.vx = 8;
    let snapshot;
    for (let i = 0; i < 20; i += 1) snapshot = partido.actualizar(TICK, {});
    assert.equal(snapshot.fase, 'GOL');
    assert.equal(snapshot.marcador.red, 1);
    assert.equal(snapshot.ultimoGol.jugadorId, 'j1');

    for (let i = 0; i < 200; i += 1) snapshot = partido.actualizar(TICK, {});
    assert.equal(snapshot.fase, 'SAQUE');
    assert.equal(snapshot.equipoSaque, 'blue');
    assert.equal(estadoFisica.ball.x, MAPA.width / 2);
});

test('partido: el reloj no corre durante el saque y hay tiempo extra si terminan empatados', () => {
    const estadoFisica = crear();
    const partido = MatchManager.crear({ estadoFisica, tiempoMs: 1000, limiteGoles: null });
    for (let i = 0; i < 120; i += 1) partido.actualizar(TICK, {});
    assert.equal(partido.obtenerSnapshot().remainingMs, 1000);
    const j1 = estadoFisica.players[0];
    // Saca hacia arriba para que la pelota (rápida en futsal) no termine en el arco.
    j1.x = estadoFisica.ball.x;
    j1.y = estadoFisica.ball.y + (j1.r + estadoFisica.ball.r + 1);
    partido.actualizar(TICK, { j1: { kick: true } });
    for (let i = 0; i < 80; i += 1) partido.actualizar(TICK, {});
    const snapshot = partido.obtenerSnapshot();
    assert.equal(snapshot.fase, 'TIEMPO_EXTRA');
    assert.equal(snapshot.tiempoExtra, true);
});

/* ===== Power-ups ===== */

const C = Fisica.constantes;

// Avanza tick a tick y junta cada power-up que aparece (lo saca de la cancha
// enseguida para que siempre haya lugar), con los ticks desde el anterior.
function juntarPowerUps(estado, cantidad) {
    const apariciones = [];
    let ticks = 0;
    while (apariciones.length < cantidad && ticks < 200000) {
        ticks += 1;
        simular(estado, 1);
        if (!estado.activePowerUps.length) continue;
        apariciones.push({ tipo: estado.activePowerUps[0].type, ticks });
        estado.activePowerUps.length = 0;
        ticks = 0;
    }
    return apariciones;
}

test('power-ups: nunca el mismo tipo dos veces seguidas y los tres salen en cada tanda de 3', () => {
    [1, 7, 42, 2024].forEach(semilla => {
        const estado = crear({ powerUps: true, aleatorio: generador(semilla) });
        const tipos = juntarPowerUps(estado, 60).map(item => item.tipo);
        assert.equal(tipos.length, 60);
        for (let i = 1; i < tipos.length; i += 1) {
            assert.notEqual(tipos[i], tipos[i - 1], `semilla ${semilla}: repetido en ${i}: ${tipos.join(',')}`);
        }
        for (let i = 0; i < tipos.length; i += 3) {
            assert.deepEqual([...tipos.slice(i, i + 3)].sort(), [...C.TIPOS_POWERUP].sort());
        }
        assert.equal(estado.ultimoPowerUp, tipos[tipos.length - 1]);
    });
});

test('power-ups: el primero sale pronto y los siguientes dentro del intervalo al azar', () => {
    const estado = crear({ powerUps: true, aleatorio: generador(3) });
    assert.ok(estado.proximoPowerUpTicks >= C.TICKS_PRIMER_POWERUP_MIN && estado.proximoPowerUpTicks <= C.TICKS_PRIMER_POWERUP_MAX);
    const apariciones = juntarPowerUps(estado, 40);
    assert.ok(apariciones[0].ticks >= C.TICKS_PRIMER_POWERUP_MIN && apariciones[0].ticks <= C.TICKS_PRIMER_POWERUP_MAX,
        `primero en ${apariciones[0].ticks}`);
    const intervalos = apariciones.slice(1).map(item => item.ticks);
    intervalos.forEach(ticks => {
        assert.ok(ticks >= C.TICKS_ENTRE_POWERUPS_MIN && ticks <= C.TICKS_ENTRE_POWERUPS_MAX, `intervalo ${ticks}`);
    });
    assert.ok(new Set(intervalos).size > 10, 'los intervalos tienen que variar');
});

test('power-ups: no aparecen encima de jugadores, pelota u otro power-up ni pegados a las líneas', () => {
    const azar = generador(99);
    const estado = Fisica.crearEstado({
        mapa: MAPA,
        kickoffTeam: 'red',
        powerUps: true,
        aleatorio: generador(5),
        jugadores: Array.from({ length: 6 }, (_, i) => ({ id: `j${i + 1}`, equipo: i % 2 ? 'blue' : 'red' }))
    });
    estado.waitingForKickOff = false;
    const { field } = estado;
    const alAzar = (desde, hasta) => desde + azar() * (hasta - desde);
    let revisados = 0;
    for (let ronda = 0; ronda < 150; ronda += 1) {
        // Jugadores, pelota y otro power-up en lugares nuevos antes de cada aparición.
        estado.players.forEach(jugador => {
            jugador.x = alAzar(field.left, field.right);
            jugador.y = alAzar(field.top, field.bottom);
        });
        estado.ball.x = alAzar(field.left, field.right);
        estado.ball.y = alAzar(field.top, field.bottom);
        const otro = { x: alAzar(field.left, field.right), y: alAzar(field.top, field.bottom), r: C.RADIO_POWERUP, type: 'BIG' };
        estado.activePowerUps.length = 0;
        estado.activePowerUps.push(otro);
        estado.proximoPowerUpTicks = 1;
        Fisica.avanzar(estado, TICK, {});
        const nuevo = estado.activePowerUps.find(item => item !== otro);
        if (!nuevo) continue;
        revisados += 1;
        [...estado.players, estado.ball, otro].forEach(disco => {
            const aire = Math.hypot(nuevo.x - disco.x, nuevo.y - disco.y) - (disco.rBase || disco.r) - nuevo.r;
            assert.ok(aire >= C.DISTANCIA_LIBRE_POWERUP, `quedó a ${aire.toFixed(1)} px de un disco`);
        });
        assert.ok(nuevo.x - nuevo.r > field.left && nuevo.x + nuevo.r < field.right);
        assert.ok(nuevo.y - nuevo.r > field.top && nuevo.y + nuevo.r < field.bottom);
    }
    assert.ok(revisados > 100, `solo se revisaron ${revisados}`);
});

test('power-ups: después de un gol el próximo sale pronto y la bolsa no se pierde', () => {
    const estado = crear({ powerUps: true, aleatorio: generador(11) });
    const tipos = juntarPowerUps(estado, 2).map(item => item.tipo);
    const bolsa = estado.bolsaPowerUps.slice();
    estado.goalResetPending = true;
    Fisica.avanzar(estado, 0, {});
    assert.deepEqual(estado.bolsaPowerUps, bolsa);
    assert.equal(estado.ultimoPowerUp, tipos[1]);
    assert.ok(estado.proximoPowerUpTicks >= C.TICKS_PRIMER_POWERUP_MIN && estado.proximoPowerUpTicks <= C.TICKS_PRIMER_POWERUP_MAX);
});

test('sin power-ups habilitados no aparece ninguno', () => {
    const estado = crear({ aleatorio: generador(1) });
    simular(estado, 2000);
    assert.equal(estado.activePowerUps.length, 0);
});
