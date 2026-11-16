/**
 * mapas.js (online)
 *
 * Canchas de las salas online: son exactamente las del modo arcade
 * (public/js/local/mapas.js de la rama develop), con la misma escala por
 * cancha que calcula fisica-haxball.js, así el juego se siente igual.
 * Solo se les agrega un id para elegirlas desde el panel de la sala.
 *
 * Tamaños: el admin puede agrandar (o achicar) la cancha. Se multiplica el
 * largo y el ancho, pero los jugadores, la pelota y la velocidad se quedan
 * igual que en el tamaño normal (se fija la `escala` de la cancha original):
 * hay más lugar para correr, como los estadios "Big" de HaxBall.
 */
const Fisica = require('../public/js/local/fisica-haxball.js');
const MAPAS_LOCALES = require('../public/js/local/mapas.js');

const MAPAS_ONLINE = MAPAS_LOCALES.map(mapa => ({
    ...mapa,
    id: mapa.theme,
    name: mapa.name.replace(/\s*\(1v1\)\s*$/, '')
}));

const TAMANOS = [
    { id: 'chica', nombre: 'Chica', factor: 0.85 },
    { id: 'normal', nombre: 'Normal', factor: 1 },
    { id: 'grande', nombre: 'Grande', factor: 1.3 },
    { id: 'enorme', nombre: 'Enorme', factor: 1.6 },
    { id: 'gigante', nombre: 'Gigante', factor: 2 }
];
const TAMANO_POR_DEFECTO = 'normal';

// Modos de juego: cambian la pelota (ver PELOTAS_POR_MODO en fisica-haxball.js).
const MODOS = [
    { id: 'normal', nombre: 'Normal' },
    { id: 'futsal', nombre: 'Futsal (pelota chica y rápida)' }
];
const MODO_POR_DEFECTO = 'normal';

function buscarModo(id) {
    return MODOS.find(modo => modo.id === id) || null;
}

function buscarMapa(id) {
    return MAPAS_ONLINE.find(mapa => mapa.id === id) || null;
}

function buscarTamano(id) {
    return TAMANOS.find(tamano => tamano.id === id) || null;
}

/** Cancha lista para jugar: con el tamaño y el modo elegidos. */
function prepararMapa(mapa, { tamano, modo } = {}) {
    if (!mapa) return mapa;
    return { ...mapaConTamano(mapa, tamano), modo: buscarModo(modo) ? modo : MODO_POR_DEFECTO };
}

/** Copia de la cancha con el tamaño elegido (misma escala de jugadores y pelota). */
function mapaConTamano(mapa, tamanoId) {
    const tamano = buscarTamano(tamanoId);
    if (!mapa || !tamano || tamano.factor === 1) return mapa;
    const original = Fisica.normalizarMapa(mapa);
    const factor = tamano.factor;
    return {
        ...mapa,
        width: Math.round(original.width * factor),
        height: Math.round(original.height * factor),
        // El arco crece un poco menos que la cancha (sino los goles son muy fáciles).
        goalHeight: Math.round(original.goalHeight * Math.sqrt(factor)),
        radioSaque: Number.isFinite(mapa.radioSaque) ? mapa.radioSaque : original.radioSaque,
        escala: original.escala,
        tamano: tamano.id
    };
}

module.exports = {
    MAPAS_ONLINE,
    TAMANOS,
    MODOS,
    buscarMapa,
    buscarModo,
    prepararMapa,
    buscarTamano,
    mapaConTamano,
    MAPA_POR_DEFECTO: MAPAS_ONLINE[0].id,
    TAMANO_POR_DEFECTO,
    MODO_POR_DEFECTO
};
