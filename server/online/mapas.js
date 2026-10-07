/**
 * mapas.js (online)
 *
 * Canchas de las salas online: son exactamente las del modo arcade
 * (public/js/local/mapas.js de la rama develop), con la misma escala por
 * cancha que calcula fisica-haxball.js, así el juego se siente igual.
 * Solo se les agrega un id para elegirlas desde el panel de la sala.
 */
const MAPAS_LOCALES = require('../public/js/local/mapas.js');

const MAPAS_ONLINE = MAPAS_LOCALES.map(mapa => ({
    ...mapa,
    id: mapa.theme,
    name: mapa.name.replace(/\s*\(1v1\)\s*$/, '')
}));

function buscarMapa(id) {
    return MAPAS_ONLINE.find(mapa => mapa.id === id) || null;
}

module.exports = { MAPAS_ONLINE, buscarMapa, MAPA_POR_DEFECTO: MAPAS_ONLINE[0].id };
