/**
 * Pruebas de js/arcade/navegacion.js: cambiar de pantalla sin dejar historial
 * (para que SALIR pueda cerrar la ventana) y salir del juego.
 * Se corren con: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// Carga el módulo con un "navegador" falso que anota lo que le piden.
function cargar() {
    const llamadas = { replace: [], close: 0 };
    globalThis.location = { href: 'file:///cabina/index.html', replace: url => { llamadas.replace.push(url); } };
    globalThis.close = () => { llamadas.close += 1; };
    delete require.cache[require.resolve('../server/public/js/arcade/navegacion.js')];
    require('../server/public/js/arcade/navegacion.js');
    return { Navegacion: globalThis.NavegacionArcade, llamadas };
}

test('irA cambia de pantalla con replace (no href): el historial queda con una sola página', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { Navegacion, llamadas } = cargar();
    Navegacion.irA('pages/menu.html');
    t.mock.timers.tick(179);
    assert.deepEqual(llamadas.replace, [], 'espera a que termine de sonar el efecto');
    t.mock.timers.tick(1);
    assert.deepEqual(llamadas.replace, ['pages/menu.html']);
    assert.equal(globalThis.location.href, 'file:///cabina/index.html', 'no asigna href (eso agregaría una entrada al historial)');
});

test('salir cierra la ventana y, si el navegador no la cerró, avisa y devuelve el control', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { Navegacion, llamadas } = cargar();
    let avisos = 0;
    Navegacion.salir(() => { avisos += 1; });
    t.mock.timers.tick(349);
    assert.equal(llamadas.close, 0, 'espera a que termine de sonar el efecto');
    t.mock.timers.tick(1);
    assert.equal(llamadas.close, 1);
    t.mock.timers.tick(699);
    assert.equal(avisos, 0, 'le da tiempo al navegador a cerrar la ventana');
    t.mock.timers.tick(1);
    assert.equal(avisos, 1, 'la ventana sigue abierta: avisa');
    assert.equal(llamadas.close, 1, 'no insiste');
});

test('salir sin aviso no rompe si el navegador no cierra', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { Navegacion, llamadas } = cargar();
    Navegacion.salir();
    t.mock.timers.tick(5000);
    assert.equal(llamadas.close, 1);
});
