/**
 * controles.js
 *
 * Capa única de entrada para la cabina arcade.
 *
 * - Lee el teclado por `event.code` (la tecla física), así no importa el
 *   idioma del teclado, Shift o Bloq Mayús, y nunca quedan teclas "trabadas"
 *   porque el keyup no coincide con el keydown.
 * - Lee joysticks/placas USB que se presentan como gamepad (Gamepad API) y
 *   placas que se presentan como teclado (con teclas reasignables).
 * - Guarda las asignaciones en localStorage ('lachaula_controles') para que se
 *   puedan cambiar desde la pantalla de Controles sin tocar código.
 * - En los menús solo escucha al Jugador 1 (más Enter/Escape del teclado);
 *   el Jugador 2 queda ignorado.
 *
 * Sobre el ghosting: es una limitación física de los teclados de membrana
 * (algunas combinaciones de 3+ teclas nunca llegan a la PC). Ningún código
 * puede recuperar una tecla que el teclado no envía; lo que sí hace este
 * módulo es permitir elegir combinaciones que el teclado soporte, aceptar
 * varias teclas por acción y no perder teclas mantenidas (por ejemplo al
 * hacer un gol). Con las placas USB de los joysticks el problema desaparece.
 */
(function (global) {
    const CLAVE_STORAGE = 'lachaula_controles';
    const JUGADORES = ['j1', 'j2'];
    const ACCIONES = ['arriba', 'abajo', 'izquierda', 'derecha', 'patear', 'atras', 'start'];
    const ACCIONES_MENU = ['arriba', 'abajo', 'izquierda', 'derecha', 'confirmar', 'atras', 'start', 'ficha'];
    const DIRECCIONES = ['arriba', 'abajo', 'izquierda', 'derecha'];
    const UMBRAL_EJE = 0.5;
    const REPETICION_INICIAL_MS = 380;
    const REPETICION_MS = 120;

    // Teclas del sistema: solo cuentan si ningún jugador las tiene asignadas.
    const TECLAS_CONFIRMAR = ['Enter', 'NumpadEnter'];
    const TECLAS_ATRAS = ['Escape', 'Backspace'];
    const TECLAS_FICHA = ['Digit5'];

    // 'Pad:Bn' = botón n del joystick asignado a ese jugador.
    // Las direcciones del joystick (palanca, cruceta o hat) se leen siempre.
    const PREDETERMINADOS = {
        j1: {
            arriba: ['KeyW'],
            abajo: ['KeyS'],
            izquierda: ['KeyA'],
            derecha: ['KeyD'],
            patear: ['Space', 'KeyV', 'Pad:B0'],
            atras: ['KeyC', 'Pad:B1'],
            start: ['Digit1', 'Pad:B9']
        },
        j2: {
            arriba: ['ArrowUp'],
            abajo: ['ArrowDown'],
            izquierda: ['ArrowLeft'],
            derecha: ['ArrowRight'],
            patear: ['KeyL', 'Numpad0', 'Pad:B0'],
            atras: ['KeyK', 'Pad:B1'],
            start: ['Digit2', 'Pad:B9']
        }
    };

    const NOMBRES_ACCION = {
        arriba: 'Arriba',
        abajo: 'Abajo',
        izquierda: 'Izquierda',
        derecha: 'Derecha',
        patear: 'Patear / Aceptar',
        atras: 'Atrás',
        start: 'Start / Pausa'
    };

    const NOMBRES_TECLA = {
        Space: 'Espacio',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→',
        Enter: 'Enter',
        NumpadEnter: 'Enter (num)',
        Escape: 'Esc',
        Backspace: 'Borrar',
        ShiftLeft: 'Shift izq',
        ShiftRight: 'Shift der',
        ControlLeft: 'Ctrl izq',
        ControlRight: 'Ctrl der',
        AltLeft: 'Alt',
        AltRight: 'Alt Gr',
        Tab: 'Tab',
        CapsLock: 'Bloq Mayús'
    };

    const teclasMantenidas = new Set();
    // Teclas que ya venían apretadas de la pantalla anterior: no disparan menús.
    const teclasBloqueadas = new Set();
    const pendientesMenu = new Set();
    const pendientesJuego = new Set();
    const oyentesMenu = new Set();
    const oyentesCambio = new Set();
    const estadoRepeticion = {};
    let menuPrevio = crearEstadoMenuVacio();
    let bloqueoMenu = true;
    let captura = null;
    let padsCache = [];
    let mapaTeclado = null;
    let config = cargarConfig();

    function crearEstadoMenuVacio() {
        return ACCIONES_MENU.reduce((estado, accion) => {
            estado[accion] = false;
            return estado;
        }, {});
    }

    function clonar(valor) {
        return JSON.parse(JSON.stringify(valor));
    }

    function cargarConfig() {
        const base = { j1: clonar(PREDETERMINADOS.j1), j2: clonar(PREDETERMINADOS.j2), invertirPads: false };
        try {
            const guardada = JSON.parse(global.localStorage.getItem(CLAVE_STORAGE) || 'null');
            if (!guardada) return base;
            JUGADORES.forEach(jugador => {
                ACCIONES.forEach(accion => {
                    const lista = guardada[jugador] && guardada[jugador][accion];
                    if (Array.isArray(lista)) base[jugador][accion] = lista.filter(item => typeof item === 'string');
                });
            });
            base.invertirPads = !!guardada.invertirPads;
        } catch (error) {
            console.warn('[Controles] configuración inválida, se usan los valores de fábrica', error);
        }
        return base;
    }

    function guardarConfig() {
        try {
            global.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(config));
        } catch (error) {
            console.warn('[Controles] no se pudo guardar la configuración', error);
        }
        oyentesCambio.forEach(oyente => oyente(obtenerConfig()));
    }

    function obtenerConfig() {
        return clonar(config);
    }

    function estaAsignada(codigo) {
        return JUGADORES.some(jugador => ACCIONES.some(accion => config[jugador][accion].includes(codigo)));
    }

    function teclaDelSistema(lista, codigo) {
        return lista.includes(codigo) && !estaAsignada(codigo);
    }

    function esTeclaDelJuego(codigo) {
        return estaAsignada(codigo)
            || TECLAS_CONFIRMAR.includes(codigo)
            || TECLAS_ATRAS.includes(codigo)
            || codigo.startsWith('Arrow')
            || codigo === 'Space';
    }

    function escribiendoTexto(evento) {
        const destino = evento.target;
        if (!destino || !destino.tagName) return false;
        const tag = destino.tagName.toLowerCase();
        return tag === 'textarea' || destino.isContentEditable || (tag === 'input' && !['range', 'checkbox', 'button'].includes(destino.type));
    }

    /* ========================= */
    /* TECLADO */
    /* ========================= */

    function alPresionar(evento) {
        if (escribiendoTexto(evento)) return;
        const codigo = evento.code;
        if (!codigo) return;
        if (esTeclaDelJuego(codigo)) evento.preventDefault();

        if (captura && !evento.repeat) {
            evento.preventDefault();
            evento.stopImmediatePropagation();
            teclasMantenidas.add(codigo);
            teclasBloqueadas.add(codigo);
            finalizarCaptura(codigo === 'Escape' ? null : codigo);
            return;
        }

        if (evento.repeat) {
            // Un repeat de una tecla que nunca vimos bajar viene de la página anterior.
            if (!teclasMantenidas.has(codigo)) teclasBloqueadas.add(codigo);
        } else {
            pendientesMenu.add(codigo);
            pendientesJuego.add(codigo);
        }
        teclasMantenidas.add(codigo);
    }

    function alSoltar(evento) {
        if (escribiendoTexto(evento)) return;
        const codigo = evento.code;
        if (!codigo) return;
        if (esTeclaDelJuego(codigo)) evento.preventDefault();
        teclasMantenidas.delete(codigo);
        teclasBloqueadas.delete(codigo);
    }

    function limpiarTeclado() {
        teclasMantenidas.clear();
        teclasBloqueadas.clear();
        pendientesMenu.clear();
        pendientesJuego.clear();
    }

    function teclaActiva(codigo, pendientes, paraMenu) {
        if (paraMenu && teclasBloqueadas.has(codigo)) return false;
        return teclasMantenidas.has(codigo) || (pendientes ? pendientes.has(codigo) : false);
    }

    /* ========================= */
    /* JOYSTICKS (GAMEPAD API) */
    /* ========================= */

    function sondearPads() {
        const lista = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
        padsCache = Array.from(lista || []).filter(Boolean).sort((a, b) => a.index - b.index);
        return padsCache;
    }

    function padDeJugador(jugador) {
        const posicion = (jugador === 'j1') !== config.invertirPads ? 0 : 1;
        return padsCache[posicion] || null;
    }

    function botonPad(pad, indice) {
        const boton = pad && pad.buttons[indice];
        return !!(boton && (boton.pressed || boton.value > 0.5));
    }

    function direccionesPad(pad) {
        const direcciones = { arriba: false, abajo: false, izquierda: false, derecha: false };
        if (!pad) return direcciones;
        const ejeX = pad.axes[0] || 0;
        const ejeY = pad.axes[1] || 0;
        direcciones.izquierda = ejeX < -UMBRAL_EJE;
        direcciones.derecha = ejeX > UMBRAL_EJE;
        direcciones.arriba = ejeY < -UMBRAL_EJE;
        direcciones.abajo = ejeY > UMBRAL_EJE;

        if (pad.mapping === 'standard') {
            direcciones.arriba = direcciones.arriba || botonPad(pad, 12);
            direcciones.abajo = direcciones.abajo || botonPad(pad, 13);
            direcciones.izquierda = direcciones.izquierda || botonPad(pad, 14);
            direcciones.derecha = direcciones.derecha || botonPad(pad, 15);
        } else if (pad.axes.length > 9) {
            // Placas genéricas (tipo "Zero Delay") en Windows reportan la cruceta como hat en el eje 9.
            const hat = pad.axes[9];
            if (hat >= -1.05 && hat <= 1.05) {
                const posicion = Math.round((hat + 1) * 3.5) % 8;
                direcciones.arriba = direcciones.arriba || [0, 1, 7].includes(posicion);
                direcciones.derecha = direcciones.derecha || [1, 2, 3].includes(posicion);
                direcciones.abajo = direcciones.abajo || [3, 4, 5].includes(posicion);
                direcciones.izquierda = direcciones.izquierda || [5, 6, 7].includes(posicion);
            }
        }
        return direcciones;
    }

    function entradaPadActiva(pad, entrada) {
        const coincidencia = /^Pad:B(\d+)$/.exec(entrada);
        return !!(coincidencia && botonPad(pad, Number(coincidencia[1])));
    }

    /* ========================= */
    /* LECTURA POR JUGADOR */
    /* ========================= */

    function accionActiva(jugador, accion, pendientes, paraMenu) {
        const pad = padDeJugador(jugador);
        const activaPorEntrada = config[jugador][accion].some(entrada => (
            entrada.startsWith('Pad:') ? entradaPadActiva(pad, entrada) : teclaActiva(entrada, pendientes, paraMenu)
        ));
        if (activaPorEntrada) return true;
        return DIRECCIONES.includes(accion) ? direccionesPad(pad)[accion] : false;
    }

    /**
     * Estado de un jugador para el juego. Devuelve { up, down, left, right, kick }
     * (los nombres que usa el motor de física).
     */
    function leerJugador(jugador) {
        sondearPads();
        const pendientes = pendientesJuego;
        return {
            up: accionActiva(jugador, 'arriba', pendientes, false),
            down: accionActiva(jugador, 'abajo', pendientes, false),
            left: accionActiva(jugador, 'izquierda', pendientes, false),
            right: accionActiva(jugador, 'derecha', pendientes, false),
            kick: accionActiva(jugador, 'patear', pendientes, false),
            start: accionActiva(jugador, 'start', pendientes, false)
        };
    }

    /** Lee a los dos jugadores y consume los toques rápidos pendientes. */
    function leerJuego() {
        const inputs = { j1: leerJugador('j1'), j2: leerJugador('j2') };
        pendientesJuego.clear();
        return inputs;
    }

    function estadoAcciones(jugador) {
        return ACCIONES.reduce((estado, accion) => {
            estado[accion] = accionActiva(jugador, accion, null, false);
            return estado;
        }, {});
    }

    /* ========================= */
    /* MENÚS (SOLO JUGADOR 1) */
    /* ========================= */

    // Devuelve el estado de cada acción de menú y si vino de una tecla del sistema (Enter, Esc, 5).
    function leerMenu() {
        const activa = accion => accionActiva('j1', accion, pendientesMenu, true);
        const sistema = lista => lista.some(codigo => teclaDelSistema(lista, codigo) && teclaActiva(codigo, pendientesMenu, true));
        const confirmarSistema = sistema(TECLAS_CONFIRMAR);
        const atrasSistema = sistema(TECLAS_ATRAS);
        const fichaSistema = sistema(TECLAS_FICHA);
        return {
            estado: {
                arriba: activa('arriba'),
                abajo: activa('abajo'),
                izquierda: activa('izquierda'),
                derecha: activa('derecha'),
                confirmar: activa('patear') || confirmarSistema,
                atras: activa('atras') || atrasSistema,
                start: activa('start'),
                ficha: fichaSistema
            },
            sistema: { confirmar: confirmarSistema, atras: atrasSistema, ficha: fichaSistema }
        };
    }

    function emitirMenu(accion, repeticion, sistema) {
        oyentesMenu.forEach(oyente => {
            try {
                oyente({ accion, repeticion, sistema: !!sistema });
            } catch (error) {
                console.error('[Controles] error en un oyente de menú', error);
            }
        });
    }

    function procesarMenu(ahora) {
        const { estado: actual, sistema } = leerMenu();
        pendientesMenu.clear();
        const algunaActiva = ACCIONES_MENU.some(accion => actual[accion]);

        if (bloqueoMenu || captura) {
            if (!algunaActiva) bloqueoMenu = false;
            menuPrevio = actual;
            return;
        }

        ACCIONES_MENU.forEach(accion => {
            const antes = menuPrevio[accion];
            const ahoraActiva = actual[accion];
            if (ahoraActiva && !antes) {
                estadoRepeticion[accion] = ahora + REPETICION_INICIAL_MS;
                emitirMenu(accion, false, sistema[accion]);
            } else if (ahoraActiva && DIRECCIONES.includes(accion) && ahora >= (estadoRepeticion[accion] || Infinity)) {
                estadoRepeticion[accion] = ahora + REPETICION_MS;
                emitirMenu(accion, true);
            }
        });
        menuPrevio = actual;
    }

    function alMenu(oyente) {
        oyentesMenu.add(oyente);
        return () => oyentesMenu.delete(oyente);
    }

    /* ========================= */
    /* REASIGNACIÓN */
    /* ========================= */

    /**
     * Espera la próxima tecla o botón de joystick y se lo pasa al callback
     * ({ entrada: 'KeyW' | 'Pad:B3' } o null si se canceló con Escape).
     */
    function capturar(callback, { permitirPad = true, jugador = null } = {}) {
        captura = { callback, permitirPad, jugador, padsIniciales: fotoBotonesPads() };
    }

    function cancelarCaptura() {
        if (captura) finalizarCaptura(null);
    }

    function fotoBotonesPads() {
        return sondearPads().reduce((foto, pad) => {
            foto[pad.index] = pad.buttons.map(boton => !!(boton && (boton.pressed || boton.value > 0.5)));
            return foto;
        }, {});
    }

    function revisarCapturaPad() {
        if (!captura || !captura.permitirPad) return;
        const pads = captura.jugador ? [padDeJugador(captura.jugador)].filter(Boolean) : padsCache;
        for (const pad of pads) {
            const antes = captura.padsIniciales[pad.index] || [];
            for (let indice = 0; indice < pad.buttons.length; indice += 1) {
                const presionado = botonPad(pad, indice);
                if (presionado && !antes[indice]) {
                    finalizarCaptura(`Pad:B${indice}`);
                    return;
                }
                antes[indice] = presionado;
            }
            captura.padsIniciales[pad.index] = antes;
        }
    }

    function finalizarCaptura(entrada) {
        const { callback } = captura;
        captura = null;
        bloqueoMenu = true;
        callback(entrada ? { entrada } : null);
    }

    /** Reemplaza las entradas de una acción. Una tecla no puede hacer dos cosas a la vez. */
    function asignar(jugador, accion, entradas) {
        const lista = (Array.isArray(entradas) ? entradas : [entradas]).filter(Boolean);
        lista.forEach(entrada => {
            JUGADORES.forEach(otroJugador => {
                // Los botones de joystick son por jugador: solo chocan dentro del mismo jugador.
                if (entrada.startsWith('Pad:') && otroJugador !== jugador) return;
                ACCIONES.forEach(otraAccion => {
                    config[otroJugador][otraAccion] = config[otroJugador][otraAccion].filter(item => item !== entrada);
                });
            });
        });
        config[jugador][accion] = lista;
        guardarConfig();
    }

    function restablecer() {
        config = { j1: clonar(PREDETERMINADOS.j1), j2: clonar(PREDETERMINADOS.j2), invertirPads: false };
        guardarConfig();
    }

    function setInvertirPads(valor) {
        config.invertirPads = !!valor;
        guardarConfig();
    }

    function alCambiarConfig(oyente) {
        oyentesCambio.add(oyente);
        return () => oyentesCambio.delete(oyente);
    }

    /* ========================= */
    /* UTILIDADES PARA LA UI */
    /* ========================= */

    function nombreEntrada(entrada) {
        if (!entrada) return '—';
        const boton = /^Pad:B(\d+)$/.exec(entrada);
        if (boton) return `Botón ${Number(boton[1]) + 1}`;
        if (NOMBRES_TECLA[entrada]) return NOMBRES_TECLA[entrada];
        if (/^Key[A-Z]$/.test(entrada)) return entrada.slice(3);
        if (/^Digit\d$/.test(entrada)) return entrada.slice(5);
        if (/^Numpad\d$/.test(entrada)) return `Num ${entrada.slice(6)}`;
        if (/^F\d+$/.test(entrada)) return entrada;
        // Para signos de puntuación se usa la etiqueta real del teclado (español, latino, etc.).
        const etiqueta = mapaTeclado && mapaTeclado.get(entrada);
        if (etiqueta) return etiqueta.toUpperCase();
        return entrada.replace(/^Numpad/, 'Num ');
    }

    function padsConectados() {
        return sondearPads().map(pad => ({ index: pad.index, id: pad.id, mapping: pad.mapping }));
    }

    function infoPad(jugador) {
        const pad = padDeJugador(jugador);
        return pad ? { index: pad.index, id: pad.id } : null;
    }

    /* ========================= */
    /* BUCLE INTERNO */
    /* ========================= */

    function tick(ahora) {
        sondearPads();
        revisarCapturaPad();
        procesarMenu(ahora);
        global.requestAnimationFrame(tick);
    }

    if (typeof global.addEventListener === 'function') {
        global.addEventListener('keydown', alPresionar, true);
        global.addEventListener('keyup', alSoltar, true);
        global.addEventListener('blur', limpiarTeclado);
        global.document.addEventListener('visibilitychange', () => {
            if (global.document.hidden) limpiarTeclado();
        });
        global.addEventListener('storage', evento => {
            if (evento.key === CLAVE_STORAGE) config = cargarConfig();
        });
        global.requestAnimationFrame(tick);
        if (navigator.keyboard && typeof navigator.keyboard.getLayoutMap === 'function') {
            navigator.keyboard.getLayoutMap().then(mapa => { mapaTeclado = mapa; }).catch(() => {});
        }
    }

    const Controles = {
        JUGADORES,
        ACCIONES,
        NOMBRES_ACCION,
        PREDETERMINADOS: clonar(PREDETERMINADOS),
        leerJugador,
        leerJuego,
        estadoAcciones,
        alMenu,
        capturar,
        cancelarCaptura,
        asignar,
        restablecer,
        setInvertirPads,
        obtenerConfig,
        alCambiarConfig,
        nombreEntrada,
        padsConectados,
        infoPad,
        teclasMantenidas: () => Array.from(teclasMantenidas),
        limpiar: limpiarTeclado
    };

    global.Controles = Controles;
})(typeof globalThis !== 'undefined' ? globalThis : this);
