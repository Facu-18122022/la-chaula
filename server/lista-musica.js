/**
 * lista-musica.js
 *
 * Lista las canciones de server/public/musica/ (menús) y musica/partido/
 * (partido). El servidor la usa para /api/musica y además escribe
 * public/musica/lista.js, que js/music.js lee cuando el juego se abre como
 * archivo (sin servidor, por ejemplo en Batocera).
 *
 * `npm start` la actualiza sola. Si agregás canciones y copiás el juego a la
 * cabina sin arrancar el servidor, corré antes: npm run musica
 */
const fs = require('fs');
const path = require('path');

const CARPETA_MUSICA = path.join(__dirname, 'public', 'musica');
const ARCHIVO_LISTA = path.join(CARPETA_MUSICA, 'lista.js');
const EXTENSIONES_AUDIO = /\.(mp3|ogg|wav|m4a|opus)$/i;

function listarCanciones(carpeta, prefijoUrl) {
    try {
        return fs.readdirSync(carpeta, { withFileTypes: true })
            .filter(archivo => archivo.isFile() && EXTENSIONES_AUDIO.test(archivo.name))
            .map(archivo => archivo.name)
            .sort()
            .map(nombre => prefijoUrl + encodeURIComponent(nombre));
    } catch (error) {
        return [];
    }
}

/** prefijo: '/musica/' para el servidor o 'musica/' (relativo a public/) para lista.js. */
function listarTodo(prefijo) {
    return {
        menu: listarCanciones(CARPETA_MUSICA, prefijo),
        partido: listarCanciones(path.join(CARPETA_MUSICA, 'partido'), `${prefijo}partido/`)
    };
}

/** Escribe musica/lista.js (solo si cambió) y devuelve la lista. */
function escribirListaArchivo() {
    const lista = listarTodo('musica/');
    const contenido = [
        '// Generado por server/lista-musica.js (npm start o npm run musica): no editar a mano.',
        '// Lo usa js/music.js cuando el juego se abre como archivo, sin servidor.',
        `window.LISTA_MUSICA = ${JSON.stringify(lista, null, 4)};`,
        ''
    ].join('\n');
    let anterior = null;
    try {
        anterior = fs.readFileSync(ARCHIVO_LISTA, 'utf8').replace(/\r\n/g, '\n');
    } catch (error) {
        // Todavía no existe.
    }
    if (anterior !== contenido) fs.writeFileSync(ARCHIVO_LISTA, contenido);
    return lista;
}

if (require.main === module) {
    const lista = escribirListaArchivo();
    console.log(`musica/lista.js: ${lista.menu.length} canciones de menú y ${lista.partido.length} de partido.`);
}

module.exports = { listarTodo, escribirListaArchivo };
