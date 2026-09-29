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

test('la velocidad máxima del jugador es la de HaxBall (≈2.4 px/tick) y pateando baja (≈1.68)', () => {
    const estado = crear();
    estado.waitingForKickOff = false;
    estado.ball.y = 60;
    simular(estado, 120, { j1: { right: true } });
    const j1 = estado.players[0];
    assert.ok(Math.abs(Math.hypot(j1.vx, j1.vy) - 2.4) < 0.05, `vel=${j1.vx}`);

    const otro = crear();
    otro.waitingForKickOff = false;
    otro.ball.x = 100;
    otro.ball.y = 60;
    simular(otro, 110, { j1: { down: true, kick: true } });
    const p = otro.players[0];
    assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - 1.68) < 0.05, `vel pateando=${p.vy}`);
});

test('la diagonal no es más rápida que la recta', () => {
    const estado = crear();
    estado.waitingForKickOff = false;
    simular(estado, 200, { j1: { right: true, down: true } });
    const j1 = estado.players[0];
    assert.ok(Math.hypot(j1.vx, j1.vy) < 2.45);
});

test('la patada suma 5 px/tick en la dirección jugador→pelota y hay que soltar para repetir', () => {
    const estado = crear();
    const j1 = estado.players[0];
    j1.x = estado.ball.x - (j1.r + estado.ball.r + 2);
    j1.y = estado.ball.y;
    const eventos = simular(estado, 1, { j1: { kick: true } });
    assert.ok(eventos.includes('primerToque'));
    assert.ok(Math.abs(estado.ball.vx - 5 * 0.99) < 0.01, `vx=${estado.ball.vx}`);
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
    j1.x = estadoFisica.ball.x - (j1.r + estadoFisica.ball.r + 1);
    partido.actualizar(TICK, { j1: { kick: true } });
    for (let i = 0; i < 80; i += 1) partido.actualizar(TICK, {});
    const snapshot = partido.obtenerSnapshot();
    assert.equal(snapshot.fase, 'TIEMPO_EXTRA');
    assert.equal(snapshot.tiempoExtra, true);
});
