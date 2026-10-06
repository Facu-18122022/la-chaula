/**
 * Pruebas del reparto de joysticks de js/arcade/controles.js (Gamepad API simulada).
 * Se corren con: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const RUTA = require.resolve('../server/public/js/arcade/controles.js');
let pads = [];

function crearStorage() {
    const datos = new Map();
    return {
        getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
        setItem: (clave, valor) => { datos.set(clave, String(valor)); }
    };
}

// Carga el módulo de nuevo con el navegador indicado (el modo se decide al cargar).
function cargarControles(userAgent) {
    delete require.cache[RUTA];
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent, getGamepads: () => pads },
        configurable: true,
        writable: true
    });
    globalThis.localStorage = crearStorage();
    return require(RUTA);
}

// Placa genérica (tipo Zero Delay): palanca en los ejes 0 y 1, PATEAR = botón 0.
function placa(index, { x = 0, y = 0, patear = false } = {}) {
    const buttons = Array.from({ length: 12 }, (_, boton) => ({ pressed: boton === 0 && patear, value: boton === 0 && patear ? 1 : 0 }));
    return { index, id: '0079-0006-Generic   USB  Joystick  ', connected: true, mapping: '', axes: [x, y], buttons };
}

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0';

test('Chrome: cada jugador usa el joystick con su número, aunque falte el otro', () => {
    const Controles = cargarControles(CHROME);
    assert.equal(Controles.MODO_JOYSTICKS, 'fijo');
    pads = [placa(0, { x: 1 }), placa(1, { y: -1, patear: true })];
    let inputs = Controles.leerJuego();
    assert.equal(inputs.j1.right, true);
    assert.equal(inputs.j1.kick, false);
    assert.equal(inputs.j2.up, true);
    assert.equal(inputs.j2.kick, true);

    // Se desconecta el joystick 0: antes el 1 pasaba a manejar al Jugador 1.
    pads = [null, placa(1, { x: -1, patear: true })];
    inputs = Controles.leerJuego();
    assert.equal(inputs.j1.left, false);
    assert.equal(inputs.j1.kick, false);
    assert.equal(inputs.j2.left, true);
    assert.equal(inputs.j2.kick, true);
});

test('Chrome: "Intercambiar joysticks" invierte y queda guardado', () => {
    const Controles = cargarControles(CHROME);
    pads = [placa(0, { x: 1 }), placa(1, { x: -1 })];
    assert.equal(Controles.intercambiarJoysticks(), true);
    const inputs = Controles.leerJuego();
    assert.equal(inputs.j1.left, true);
    assert.equal(inputs.j2.right, true);
    assert.equal(JSON.parse(globalThis.localStorage.getItem('lachaula_controles')).invertirPads, true);
    assert.equal(Controles.faltaReclamoJoystick(), false);
});

test('Firefox: en el partido el Jugador 2 que se mueve primero no maneja al Jugador 1', () => {
    const Controles = cargarControles(FIREFOX);
    assert.equal(Controles.MODO_JOYSTICKS, 'por-pantalla');
    Controles.exigirReclamoJoystick();

    // Firefox le da el número 0 al primer joystick que se toca: acá, el del Jugador 2.
    const placaJ2 = placa(0, { x: -1 });
    pads = [placaJ2];
    let inputs = Controles.leerJuego();
    assert.equal(inputs.j1.left, false, 'antes de elegir, ningún joystick mueve a J1');
    assert.equal(inputs.j2.left, false);
    assert.equal(Controles.faltaReclamoJoystick(), true);

    // El Jugador 1 aprieta PATEAR en el suyo (número 1): ese pasa a ser el de J1.
    const placaJ1 = placa(1, { y: 1, patear: true });
    pads = [placaJ2, placaJ1];
    inputs = Controles.leerJuego();
    assert.equal(Controles.faltaReclamoJoystick(), false);
    assert.equal(inputs.j1.down, true);
    assert.equal(inputs.j1.kick, true);
    assert.equal(inputs.j1.left, false);
    assert.equal(inputs.j2.left, true);
    assert.equal(inputs.j2.kick, false);

    // El Jugador 2 aprieta PATEAR después: sigue siendo el Jugador 2.
    pads = [placa(0, { patear: true }), placa(1)];
    inputs = Controles.leerJuego();
    assert.equal(inputs.j2.kick, true);
    assert.equal(inputs.j1.kick, false);
});

test('Firefox: si J1 eligió mal, "Cambiar joysticks" los da vuelta', () => {
    const Controles = cargarControles(FIREFOX);
    Controles.exigirReclamoJoystick();
    pads = [placa(0, { patear: true }), placa(1)];
    Controles.leerJuego();
    assert.equal(Controles.intercambiarJoysticks(), true);
    pads = [placa(0, { x: 1 }), placa(1, { x: -1 })];
    const inputs = Controles.leerJuego();
    assert.equal(inputs.j1.left, true);
    assert.equal(inputs.j2.right, true);
});

test('Firefox: si se desconecta el joystick de J1, J2 sigue con el suyo y J1 lo vuelve a elegir', () => {
    const Controles = cargarControles(FIREFOX);
    Controles.exigirReclamoJoystick();
    pads = [placa(0, { patear: true }), placa(1)];
    Controles.leerJuego();
    pads = [placa(0), placa(1)];
    Controles.leerJuego();

    pads = [null, placa(1, { x: 1 })];
    let inputs = Controles.leerJuego();
    assert.equal(inputs.j2.right, true);
    assert.equal(inputs.j1.right, false);
    assert.equal(Controles.faltaReclamoJoystick(), false, 'el único joystick que queda es de J2');

    // Vuelve (Firefox le da el primer número libre) y J1 aprieta PATEAR.
    pads = [placa(0, { patear: true }), placa(1, { x: 1 })];
    inputs = Controles.leerJuego();
    assert.equal(inputs.j1.kick, true);
    assert.equal(inputs.j2.right, true);
    assert.equal(inputs.j2.kick, false);
});

test('Firefox: en los menús (sin exigir) navega el primer joystick que se tocó', () => {
    const Controles = cargarControles(FIREFOX);
    pads = [placa(0, { y: 1 })];
    assert.equal(Controles.leerJuego().j1.down, true);
    assert.equal(Controles.infoPad('j1').provisorio, true);
});
