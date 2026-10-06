/**
 * almacen.js
 *
 * Comparte la configuración entre pantallas también cuando el juego se abre
 * como archivo (file://), por ejemplo en Batocera sin servidor.
 *
 * Con http://localhost todas las páginas usan el mismo localStorage. Con
 * file:// depende del navegador: Chrome lo comparte, pero Firefox le da a cada
 * archivo su propio localStorage. Por eso lo elegido en "Partida local"
 * (tiempo, goles, cancha) no llegaba al partido y siempre se jugaba con los
 * valores de fábrica; lo mismo pasaba con los controles y el volumen.
 *
 * En file://, al cambiar de pantalla los datos compartidos viajan en la URL
 * (#estado=...) y la pantalla nueva los copia a su localStorage antes de que
 * corra cualquier otro script. Cada cambio guarda la hora como versión: una
 * pantalla con datos viejos nunca pisa datos más nuevos.
 *
 * Tiene que ser el primer script de cada pantalla. Para que un dato nuevo
 * viaje entre pantallas: agregar su clave a CLAVES y guardarlo con
 * Almacen.guardar(clave, valor).
 */
(function (global) {
    // Configuración: viaja con versión (gana la más nueva).
    const CLAVES = [
        'lachaula_settings',
        'lachaula_controles',
        'localMatchTime',
        'localGoalLimit',
        'localMapIndex',
        'localPowerUps'
    ];
    // Música: canción y segundo en que iba, para que siga igual en la pantalla nueva.
    const CLAVES_MUSICA = [
        'laChaula_music_track_main',
        'laChaula_music_time_main',
        'laChaula_music_track_game',
        'laChaula_music_time_game'
    ];
    // sessionStorage: canción ya anunciada en el cartel "Sonando".
    const CLAVES_SESION = ['laChaula_music_anunciada_menu', 'laChaula_music_anunciada_partido'];
    const CLAVE_VERSION = 'lachaula_version';
    const MARCA = 'estado=';

    // Base64 "para URL" (sin + / =): así el paquete no cambia aunque el navegador
    // codifique o decodifique la URL.
    function aBase64(texto) {
        let binario = '';
        new TextEncoder().encode(texto).forEach(byte => { binario += String.fromCharCode(byte); });
        return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function deBase64(codigo) {
        const base = codigo.replace(/-/g, '+').replace(/_/g, '/');
        const binario = atob(base.padEnd(base.length + (4 - base.length % 4) % 4, '='));
        return new TextDecoder().decode(Uint8Array.from(binario, letra => letra.charCodeAt(0)));
    }

    /**
     * entorno: { location, history, localStorage, sessionStorage } (en el
     * navegador, window). Al crearse aplica el estado que trae la URL.
     */
    function crear(entorno) {
        // Leer localStorage puede tirar error (almacenamiento bloqueado): se trata como ausente.
        function obtener(nombre) {
            try {
                return entorno[nombre] || null;
            } catch (error) {
                return null;
            }
        }

        const location = obtener('location');
        const history = obtener('history');
        const local = obtener('localStorage');
        const sesion = obtener('sessionStorage');
        const porUrl = !!location && location.protocol === 'file:';

        function leer(almacen, clave) {
            try {
                return almacen ? almacen.getItem(clave) : null;
            } catch (error) {
                return null;
            }
        }

        function escribir(almacen, clave, valor) {
            try {
                if (almacen) almacen.setItem(clave, valor);
            } catch (error) {
                console.warn(`[Almacen] no se pudo guardar ${clave}`, error);
            }
        }

        function leerVarias(almacen, claves) {
            return claves.reduce((datos, clave) => {
                const valor = leer(almacen, clave);
                if (valor !== null) datos[clave] = valor;
                return datos;
            }, {});
        }

        function copiar(datos, claves, almacen) {
            if (!datos || typeof datos !== 'object') return;
            claves.forEach(clave => {
                if (typeof datos[clave] === 'string') escribir(almacen, clave, datos[clave]);
            });
        }

        function version() {
            return Number(leer(local, CLAVE_VERSION)) || 0;
        }

        function aplicarLlegada() {
            const href = String(location.href || '');
            const posicion = href.indexOf(`#${MARCA}`);
            if (posicion < 0) return;
            let paquete = null;
            try {
                paquete = JSON.parse(deBase64(href.slice(posicion + 1 + MARCA.length)));
            } catch (error) {
                console.warn('[Almacen] el estado de la URL no se pudo leer', error);
            }
            // Se saca de la URL: así recargar la pantalla no vuelve a aplicarlo.
            try {
                if (history) history.replaceState(history.state, '', href.slice(0, posicion));
            } catch (error) {
                // Si el navegador no deja, la versión igual evita pisar datos más nuevos.
            }
            if (!paquete || typeof paquete !== 'object') return;
            const versionLlegada = Number(paquete.v) || 0;
            if (versionLlegada > version()) {
                copiar(paquete.d, CLAVES, local);
                escribir(local, CLAVE_VERSION, String(versionLlegada));
            }
            copiar(paquete.m, CLAVES_MUSICA, local);
            copiar(paquete.s, CLAVES_SESION, sesion);
        }

        /** Guarda en localStorage; si es una clave compartida, la marca como la más nueva. */
        function guardar(clave, valor) {
            escribir(local, clave, String(valor));
            if (CLAVES.includes(clave)) escribir(local, CLAVE_VERSION, String(Math.max(Date.now(), version() + 1)));
        }

        /** URL para ir a otra pantalla. En file:// le agrega el estado; con servidor la deja igual. */
        function url(destino) {
            const texto = String(destino);
            if (!porUrl) return texto;
            const paquete = {
                v: version(),
                d: leerVarias(local, CLAVES),
                m: leerVarias(local, CLAVES_MUSICA),
                s: leerVarias(sesion, CLAVES_SESION)
            };
            return `${texto.split('#')[0]}#${MARCA}${aBase64(JSON.stringify(paquete))}`;
        }

        if (porUrl) aplicarLlegada();
        return { guardar, url, version, porUrl };
    }

    if (global.location) global.Almacen = crear(global);
    if (typeof module !== 'undefined' && module.exports) module.exports = { crear, CLAVES, CLAVE_VERSION };
})(typeof globalThis !== 'undefined' ? globalThis : this);
