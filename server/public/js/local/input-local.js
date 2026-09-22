/**
 * input-local.js
 * 
 * Módulo para gestionar la entrada del usuario en el navegador local.
 * Escucha los eventos del teclado, almacena las teclas presionadas
 * y expone una estructura de inputs estandarizada (direcciones, tiros, pases)
 * para ser utilizada por el Game Loop.
 */
(function (global) {
    const teclas = new Set();
    const teclasDeFlecha = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

    function normalizarTecla(tecla) {
        return tecla.length === 1 ? tecla.toLowerCase() : tecla;
    }

    function obtenerInputs() {
        return {
            j1: {
                up: teclas.has('w'),
                down: teclas.has('s'),
                left: teclas.has('a'),
                right: teclas.has('d'),
                kick: teclas.has('v')
            },
            j2: {
                up: teclas.has('ArrowUp'),
                down: teclas.has('ArrowDown'),
                left: teclas.has('ArrowLeft'),
                right: teclas.has('ArrowRight'),
                kick: teclas.has('l')
            }
        };
    }

    function limpiar() {
        teclas.clear();
    }

    document.addEventListener('keydown', event => {
        if (teclasDeFlecha.has(event.key)) event.preventDefault();
        teclas.add(normalizarTecla(event.key));
    });

    document.addEventListener('keyup', event => {
        if (teclasDeFlecha.has(event.key)) event.preventDefault();
        teclas.delete(normalizarTecla(event.key));
    });

    window.addEventListener('blur', limpiar);

    const InputLocal = { obtenerInputs, limpiar };
    global.InputLocal = InputLocal;
    if (typeof module !== 'undefined' && module.exports) module.exports = InputLocal;
})(typeof globalThis !== 'undefined' ? globalThis : this);