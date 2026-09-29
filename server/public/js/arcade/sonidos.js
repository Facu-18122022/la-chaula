/**
 * sonidos.js
 *
 * Efectos de sonido cortos de la interfaz y del partido.
 * Cada efecto es un archivo en /sonidos/ que se reproduce con new Audio().
 * Para cambiar un sonido alcanza con reemplazar el archivo (o cambiar el
 * nombre en ARCHIVOS, por ejemplo a un .mp3).
 * Respeta el volumen de "Efectos" y "Silenciar todo" de Configuración.
 */
(function (global) {
    const RUTA = '/sonidos/';
    const ARCHIVOS = {
        mover: 'mover.wav',
        confirmar: 'confirmar.wav',
        elegir: 'elegir.wav',
        atras: 'atras.wav',
        ficha: 'ficha.wav',
        start: 'start.wav',
        patada: 'patada.wav',
        gol: 'gol.wav',
        silbato: 'silbato.wav',
        error: 'error.wav'
    };
    const MAX_SIMULTANEOS = 4;
    const reproductores = {};
    let volumenForzado = null;

    function leerAjustes() {
        try {
            return JSON.parse(global.localStorage.getItem('lachaula_settings') || '{}') || {};
        } catch (error) {
            return {};
        }
    }

    function volumen() {
        if (volumenForzado !== null) return volumenForzado;
        const ajustes = leerAjustes();
        if (ajustes.mute === true || ajustes.mute === 'true') return 0;
        const valor = Number.parseFloat(ajustes.effects);
        if (Number.isNaN(valor)) return 0.8;
        return Math.max(0, Math.min(1, valor > 1 ? valor / 100 : valor));
    }

    function crearAudio(nombre) {
        const audio = new Audio(RUTA + ARCHIVOS[nombre]);
        audio.preload = 'auto';
        return audio;
    }

    function reproducir(nombre) {
        if (!ARCHIVOS[nombre]) return;
        const vol = volumen();
        if (vol <= 0) return;
        const lista = reproductores[nombre] || (reproductores[nombre] = [crearAudio(nombre)]);
        // Un pequeño grupo de reproductores permite que el mismo sonido se superponga.
        let audio = lista.find(item => item.paused || item.ended);
        if (!audio && lista.length < MAX_SIMULTANEOS) {
            audio = crearAudio(nombre);
            lista.push(audio);
        }
        audio = audio || lista[0];
        audio.volume = vol;
        try {
            audio.currentTime = 0;
        } catch (error) {
            // Algunos navegadores no permiten mover el cursor antes de cargar metadatos.
        }
        const promesa = audio.play();
        if (promesa && typeof promesa.catch === 'function') promesa.catch(() => {});
    }

    function precargar() {
        Object.keys(ARCHIVOS).forEach(nombre => {
            if (!reproductores[nombre]) reproductores[nombre] = [crearAudio(nombre)];
        });
    }

    /** Solo para la pantalla de Configuración: probar el volumen sin guardar. */
    function setVolumenTemporal(valor) {
        volumenForzado = valor === null ? null : Math.max(0, Math.min(1, Number(valor) || 0));
    }

    global.Sonidos = { reproducir, precargar, setVolumenTemporal };
    if (global.document && global.document.readyState !== 'loading') precargar();
    else if (global.document) global.document.addEventListener('DOMContentLoaded', precargar);
})(typeof globalThis !== 'undefined' ? globalThis : this);
