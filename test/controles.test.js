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

test('la configuración de fábrica asigna por defecto los botones de los dos joysticks', () => {
    const Controles = cargarControles(CHROME);
    const config = Controles.obtenerConfig();
    assert.equal(config.invertirPads, false);
    assert.ok(!config.j1.patear.includes('Enter'));
    for (const jugador of ['j1', 'j2']) {
        assert.ok(config[jugador].patear.includes('Pad:B0'));
        assert.ok(config[jugador].atras.includes('Pad:B1'));
        assert.ok(config[jugador].start.includes('Pad:B9'));
    }
});

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
});

test('Firefox: los índices 0 y 1 responden sin esperar a que J1 apriete PATEAR', () => {
    const Controles = cargarControles(FIREFOX);
    assert.equal(Controles.MODO_JOYSTICKS, 'por-pantalla');

    pads = [placa(0, { x: -1 }), placa(1, { y: 1, patear: true })];
    let inputs = Controles.leerJuego();
    assert.equal(inputs.j1.left, true);
    assert.equal(inputs.j1.down, false);
    assert.equal(inputs.j1.kick, false);
    assert.equal(inputs.j2.down, true);
    assert.equal(inputs.j2.kick, true);
});

test('Firefox: "Cambiar joysticks" intercambia los índices durante la pantalla actual', () => {
    const Controles = cargarControles(FIREFOX);
    pads = [placa(0, { x: 1 }), placa(1, { x: -1 })];
    assert.equal(Controles.intercambiarJoysticks(), true);
    const inputs = Controles.leerJuego();
    assert.equal(inputs.j1.left, true);
    assert.equal(inputs.j2.right, true);
});

test('Firefox: si se desconecta el joystick 0, el joystick 1 no pasa a controlar J1', () => {
    const Controles = cargarControles(FIREFOX);
    pads = [placa(0), placa(1)];
    Controles.leerJuego();

    pads = [null, placa(1, { x: 1 })];
    let inputs = Controles.leerJuego();
    assert.equal(inputs.j2.right, true);
    assert.equal(inputs.j1.right, false);

    // Al volver el joystick 0, cada uno conserva su índice asignado.
    pads = [placa(0, { patear: true }), placa(1, { x: 1 })];
    inputs = Controles.leerJuego();
    assert.equal(inputs.j1.kick, true);
    assert.equal(inputs.j2.right, true);
    assert.equal(inputs.j2.kick, false);
});

test('Firefox: el joystick de índice 0 navega los menús', () => {
    const Controles = cargarControles(FIREFOX);
    pads = [placa(0, { y: 1 })];
    assert.equal(Controles.leerJuego().j1.down, true);
    assert.equal(Controles.infoPad('j1').index, 0);
});

test('si falla la Gamepad API, la lectura del juego continúa y el error se informa una vez', () => {
    const Controles = cargarControles(CHROME);
    globalThis.navigator.getGamepads = () => { throw new Error('Gamepad API no disponible'); };
    const errorOriginal = console.error;
    let erroresInformados = 0;
    console.error = () => { erroresInformados += 1; };
    try {
        assert.doesNotThrow(() => Controles.leerJuego());
        assert.equal(Controles.leerJuego().j1.left, false);
        assert.equal(erroresInformados, 1);
    } finally {
        console.error = errorOriginal;
    }
});
