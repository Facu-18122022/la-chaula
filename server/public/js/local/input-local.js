/**
 * input-local.js
 *
 * Adaptador entre el módulo de controles de la cabina (js/arcade/controles.js)
 * y el Game Loop del modo local. Expone una estructura de inputs
 * estandarizada (direcciones y patada) para cada jugador.
 *
 * Las teclas y botones ya no están fijos acá: se configuran desde la pantalla
 * de Controles y se leen por tecla física (event.code) o por joystick.
 */
(function (global) {
    const inputVacio = { up: false, down: false, left: false, right: false, kick: false, kickPressed: false };

    function adaptar(estado) {
        if (!estado) return { ...inputVacio };
        return {
            up: estado.up,
            down: estado.down,
            left: estado.left,
            right: estado.right,
            kick: estado.kick,
            kickPressed: estado.kick,
            start: estado.start
        };
    }

    function obtenerInputs() {
        if (!global.Controles) return { j1: { ...inputVacio }, j2: { ...inputVacio } };
        const inputs = global.Controles.leerJuego();
        return { j1: adaptar(inputs.j1), j2: adaptar(inputs.j2) };
    }

    /**
     * Antes se borraban todas las teclas al hacer un gol o pausar, y las que
     * seguían apretadas "morían" hasta volver a presionarlas (parecía ghosting).
     * Ahora el estado físico se conserva y el juego simplemente ignora los
     * inputs cuando no corresponde.
     */
    function limpiar() {}

    const InputLocal = { obtenerInputs, limpiar };
    global.InputLocal = InputLocal;
    if (typeof module !== 'undefined' && module.exports) module.exports = InputLocal;
})(typeof globalThis !== 'undefined' ? globalThis : this);
