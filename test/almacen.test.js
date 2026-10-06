/**
 * Pruebas de js/arcade/almacen.js: la configuración pasa de una pantalla a
 * otra aunque cada archivo tenga su propio localStorage (Firefox con file://).
 * Se corren con: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crear, CLAVE_VERSION } = require('../server/public/js/arcade/almacen.js');

const CARPETA = 'file:///userdata/roms/ports/la-chaula/server/public/pages/';

function crearStorage() {
    const datos = new Map();
    return {
        getItem: clave => (datos.has(clave) ? datos.get(clave) : null),
        setItem: (clave, valor) => { datos.set(clave, String(valor)); },
        removeItem: clave => { datos.delete(clave); }
    };
}

// Abre una "pantalla" con su propio localStorage, como hace Firefox con file://.
function abrir(url, local = crearStorage(), sesion = crearStorage()) {
    const history = { state: null, urlNueva: null, replaceState(estado, titulo, nueva) { this.urlNueva = nueva; } };
    const pagina = crear({ location: { protocol: new URL(url).protocol, href: url }, history, localStorage: local, sessionStorage: sesion });
    return { pagina, history, local, sesion };
}

test('con file:// la partida elegida llega al partido aunque cada archivo tenga su localStorage', () => {
    const config = abrir(`${CARPETA}local-config.html`);
    config.pagina.guardar('localMatchTime', '3');
    config.pagina.guardar('localGoalLimit', '10');
    config.pagina.guardar('localMapIndex', '4');
    config.pagina.guardar('localPowerUps', '0');
    const destino = config.pagina.url('juego-local.html');
    assert.match(destino, /^juego-local\.html#estado=[\w-]+$/);

    const partido = abrir(new URL(destino, `${CARPETA}local-config.html`).href);
    assert.equal(partido.local.getItem('localMatchTime'), '3');
    assert.equal(partido.local.getItem('localGoalLimit'), '10');
    assert.equal(partido.local.getItem('localMapIndex'), '4');
    assert.equal(partido.local.getItem('localPowerUps'), '0');
    // Se limpia la URL para que recargar no vuelva a aplicar el estado.
    assert.equal(partido.history.urlNueva, `${CARPETA}juego-local.html`);
});

test('los controles y el volumen viajan por varias pantallas, con tildes y eñes', () => {
    const controles = JSON.stringify({ j1: { patear: ['Pad:B2'] }, nota: 'Ñandú pateó' });
    const pantallaControles = abrir(`${CARPETA}controles.html`);
    pantallaControles.pagina.guardar('lachaula_controles', controles);
    pantallaControles.pagina.guardar('lachaula_settings', '{"music":"30","effects":"80","mute":false}');

    let anterior = pantallaControles;
    let url = `${CARPETA}controles.html`;
    ['configuracion.html', 'menu.html', 'local-config.html', 'juego-local.html'].forEach(siguiente => {
        url = new URL(anterior.pagina.url(siguiente), url).href;
        anterior = abrir(url);
    });
    assert.equal(anterior.local.getItem('lachaula_controles'), controles);
    assert.equal(anterior.local.getItem('lachaula_settings'), '{"music":"30","effects":"80","mute":false}');
});

test('una pantalla con datos viejos no pisa los más nuevos', () => {
    // El partido ya tiene una configuración más nueva que la del menú que lo abre.
    const menu = abrir(`${CARPETA}menu.html`);
    menu.pagina.guardar('localMatchTime', '7');
    const versionMenu = menu.pagina.version();

    const localPartido = crearStorage();
    localPartido.setItem('localMatchTime', '3');
    localPartido.setItem(CLAVE_VERSION, String(versionMenu + 60000));

    const partido = abrir(new URL(menu.pagina.url('juego-local.html'), `${CARPETA}menu.html`).href, localPartido);
    assert.equal(partido.local.getItem('localMatchTime'), '3');
    assert.equal(partido.pagina.version(), versionMenu + 60000);
});

test('una clave que no conoce la pantalla nueva se agrega sin borrar las que ya tenía', () => {
    const config = abrir(`${CARPETA}local-config.html`);
    config.pagina.guardar('localMatchTime', '3');

    const localPartido = crearStorage();
    localPartido.setItem('lachaula_controles', '{"guardado":"antes"}');
    const partido = abrir(new URL(config.pagina.url('juego-local.html'), `${CARPETA}local-config.html`).href, localPartido);
    assert.equal(partido.local.getItem('localMatchTime'), '3');
    assert.equal(partido.local.getItem('lachaula_controles'), '{"guardado":"antes"}');
});

test('la música sigue en la misma canción y el mismo segundo', () => {
    const menu = abrir(`${CARPETA}menu.html`);
    menu.local.setItem('laChaula_music_track_main', 'musica/Homero%20Rkt%203.mp3');
    menu.local.setItem('laChaula_music_time_main', '42.5');
    menu.sesion.setItem('laChaula_music_anunciada_menu', 'musica/Homero%20Rkt%203.mp3');
    const config = abrir(new URL(menu.pagina.url('configuracion.html'), `${CARPETA}menu.html`).href);
    assert.equal(config.local.getItem('laChaula_music_track_main'), 'musica/Homero%20Rkt%203.mp3');
    assert.equal(config.local.getItem('laChaula_music_time_main'), '42.5');
    assert.equal(config.sesion.getItem('laChaula_music_anunciada_menu'), 'musica/Homero%20Rkt%203.mp3');
});

test('con servidor (http) la URL no cambia y no se toca nada', () => {
    const menu = abrir('http://localhost:3000/pages/menu.html');
    menu.pagina.guardar('localMatchTime', '3');
    assert.equal(menu.pagina.url('local-config.html'), 'local-config.html');
    assert.equal(menu.pagina.url('../index.html#algo'), '../index.html#algo');
});

test('un estado roto en la URL se ignora sin romper la pantalla', t => {
    t.mock.method(console, 'warn', () => {});
    const local = crearStorage();
    local.setItem('localMatchTime', '5');
    const partido = abrir(`${CARPETA}juego-local.html#estado=esto-no-es-base64!!`, local);
    assert.equal(partido.local.getItem('localMatchTime'), '5');
    assert.equal(partido.history.urlNueva, `${CARPETA}juego-local.html`);
});
