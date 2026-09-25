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
    const kickPressed = { j1: false, j2: false };
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
                kick: teclas.has('v'),
                kickPressed: kickPressed.j1
            },
            j2: {
                up: teclas.has('ArrowUp'),
                down: teclas.has('ArrowDown'),
                left: teclas.has('ArrowLeft'),
                right: teclas.has('ArrowRight'),
                kick: teclas.has('l'),
                kickPressed: kickPressed.j2
            }
        };
    }

    function limpiar() {
        teclas.clear();
        kickPressed.j1 = false;
        kickPressed.j2 = false;
    }

    document.addEventListener('keydown', event => {
        if (teclasDeFlecha.has(event.key)) event.preventDefault();
        const tecla = normalizarTecla(event.key);
        teclas.add(tecla);
        if (tecla === 'v') kickPressed.j1 = true;
        if (tecla === 'l') kickPressed.j2 = true;
    });

    document.addEventListener('keyup', event => {
        if (teclasDeFlecha.has(event.key)) event.preventDefault();
        const tecla = normalizarTecla(event.key);
        teclas.delete(tecla);
        if (tecla === 'v') kickPressed.j1 = false;
        if (tecla === 'l') kickPressed.j2 = false;
    });

    window.addEventListener('blur', limpiar);

    const InputLocal = { obtenerInputs, limpiar };
    global.InputLocal = InputLocal;
    if (typeof module !== 'undefined' && module.exports) module.exports = InputLocal;
})(typeof globalThis !== 'undefined' ? globalThis : this);