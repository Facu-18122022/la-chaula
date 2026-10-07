/**
 * mapas.js (online)
 *
 * Canchas disponibles en las salas online. Todas usan `escala: 1`: el jugador
 * mide siempre lo mismo y las canchas grandes dejan más lugar para 4v4 y 5v5
 * (como los estadios Big y Huge de HaxBall).
 *
 * Las medidas de los estadios HaxBall son las originales (en HaxBall se
 * escriben como mitades: width 600 = 1200 px de ancho total).
 */
const MAPAS_LOCALES = require('../public/js/local/mapas.js');

const ESTADIO_HAXBALL = {
    margenX: 50,
    margenY: 30,
    profundidadArco: 30,
    fieldColor: '#718c5a',
    lineColor: '#c7e6bd',
    bg: '#718c5a',
    goalBg: '#667f51',
    theme: 'haxball',
    escala: 1
};

const MAPAS_ONLINE = [
    { id: 'hb-classic', name: 'HaxBall Classic', recomendado: '1v1 a 3v3', ...ESTADIO_HAXBALL, width: 840, height: 400, goalHeight: 128, radioSaque: 75 },
    { id: 'hb-big', name: 'HaxBall Big', recomendado: '3v3 a 5v5', ...ESTADIO_HAXBALL, width: 1200, height: 540, goalHeight: 160, radioSaque: 80 },
    { id: 'hb-huge', name: 'HaxBall Huge', recomendado: '4v4 a 5v5', ...ESTADIO_HAXBALL, width: 1500, height: 700, goalHeight: 200, radioSaque: 100 },
    // Canchas temáticas del modo local, sin el "(1v1)" del nombre.
    ...MAPAS_LOCALES.map(mapa => ({
        ...mapa,
        id: mapa.theme,
        name: mapa.name.replace(/\s*\(1v1\)\s*$/, ''),
        recomendado: recomendacion(mapa),
        escala: 1
    }))
];

function recomendacion(mapa) {
    const area = mapa.width * mapa.height;
    if (area < 300000) return '1v1';
    if (area < 600000) return '1v1 a 3v3';
    return '3v3 a 5v5';
}

function buscarMapa(id) {
    return MAPAS_ONLINE.find(mapa => mapa.id === id) || null;
}

module.exports = { MAPAS_ONLINE, buscarMapa, MAPA_POR_DEFECTO: 'hb-big' };
