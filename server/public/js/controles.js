/**
 * controles.js (pantalla)
 *
 * Pantalla de prueba y asignación de controles:
 * - Muestra en vivo qué direcciones y botones recibe cada jugador.
 * - Detecta si el teclado deja pasar la combinación más exigente de un
 *   partido (los dos jugadores en diagonal + patear = 6 teclas juntas).
 * - Permite reasignar cada acción a otra tecla o botón de joystick.
 */
(function () {
    const Controles = window.Controles;
    const Navegacion = window.NavegacionArcade;
    const aviso = document.getElementById('controlesAviso');
    const teclasAhora = document.getElementById('teclasAhora');
    const maximoTeclas = document.getElementById('maximoTeclas');
    const checks = {
        j1: document.getElementById('checkJ1'),
        j2: document.getElementById('checkJ2'),
        ambos: document.getElementById('checkAmbos')
    };
    const listas = { j1: document.getElementById('listaJ1'), j2: document.getElementById('listaJ2') };
    const TECLAS_RIESGOSAS = {
        ControlLeft: 'Ctrl + W cierra la pestaña: evitá Ctrl si el otro jugador usa W.',
        ControlRight: 'Ctrl + W cierra la pestaña: evitá Ctrl si el otro jugador usa W.',
        AltLeft: 'Alt puede abrir menús del navegador.',
        AltRight: 'Alt Gr puede escribir símbolos o abrir menús.',
        MetaLeft: 'La tecla Windows abre el menú Inicio.',
        MetaRight: 'La tecla Windows abre el menú Inicio.',
        ShiftLeft: 'En Windows, 5 Shift seguidos abren "Teclas especiales" (se puede desactivar).',
        ShiftRight: 'En Windows, 5 Shift seguidos abren "Teclas especiales" (se puede desactivar).',
        Tab: 'Tab mueve el foco del navegador.'
    };
    const testButton = document.getElementById('testButton');
    const testBanner = document.getElementById('testBanner');
    let maximo = 0;
    let enPrueba = false;
    let capturando = null;
    let temporizadorAviso = null;

    function mostrarAviso(texto, duracionMs = 4000) {
        aviso.textContent = texto;
        clearTimeout(temporizadorAviso);
        if (duracionMs) temporizadorAviso = setTimeout(() => { aviso.textContent = ''; }, duracionMs);
    }

    /* ========================= */
    /* LISTAS DE ASIGNACIÓN */
    /* ========================= */

    function chip(entrada) {
        const elemento = document.createElement('kbd');
        elemento.className = entrada.startsWith('Pad:') ? 'controles-chip controles-chip--pad' : 'controles-chip';
        elemento.textContent = Controles.nombreEntrada(entrada);
        return elemento;
    }

    function dibujarListas() {
        const config = Controles.obtenerConfig();
        Controles.JUGADORES.forEach(jugador => {
            const lista = listas[jugador];
            lista.textContent = '';
            Controles.ACCIONES.forEach(accion => {
                const fila = document.createElement('li');
                fila.className = 'controles-fila';
                fila.setAttribute('data-nav', '');
                fila.dataset.navId = `${jugador}-${accion}`;
                fila.dataset.jugador = jugador;
                fila.dataset.accion = accion;

                const nombre = document.createElement('span');
                nombre.className = 'controles-fila__nombre';
                nombre.textContent = Controles.NOMBRES_ACCION[accion];
                const entradas = document.createElement('span');
                entradas.className = 'controles-fila__entradas';
                const asignadas = config[jugador][accion];
                if (asignadas.length) asignadas.forEach(entrada => entradas.appendChild(chip(entrada)));
                else entradas.textContent = 'Sin asignar';
                if (['arriba', 'abajo', 'izquierda', 'derecha'].includes(accion)) {
                    const pad = document.createElement('small');
                    pad.className = 'controles-fila__extra';
                    pad.textContent = '+ palanca';
                    entradas.appendChild(pad);
                }

                fila.append(nombre, entradas);
                fila.addEventListener('click', () => empezarCaptura(fila));
                lista.appendChild(fila);
            });
        });
        if (Navegacion) Navegacion.refrescar();
    }

    function empezarCaptura(fila) {
        if (capturando) return;
        const { jugador, accion } = fila.dataset;
        capturando = fila;
        fila.classList.add('controles-fila--esperando');
        fila.querySelector('.controles-fila__entradas').textContent = 'Apretá la tecla o botón… (Esc cancela)';
        Controles.capturar(resultado => terminarCaptura(jugador, accion, resultado), { jugador });
    }

    function terminarCaptura(jugador, accion, resultado) {
        capturando.classList.remove('controles-fila--esperando');
        capturando = null;
        if (!resultado) {
            mostrarAviso('Asignación cancelada.');
            dibujarListas();
            return;
        }
        const { entrada } = resultado;
        // Se reemplazan solo las entradas del mismo tipo: cambiar la tecla no borra el botón del joystick.
        const esPad = entrada.startsWith('Pad:');
        const actuales = Controles.obtenerConfig()[jugador][accion];
        const conservadas = actuales.filter(item => item.startsWith('Pad:') !== esPad);
        Controles.asignar(jugador, accion, [entrada, ...conservadas]);
        if (window.Sonidos) window.Sonidos.reproducir('elegir');
        const riesgo = TECLAS_RIESGOSAS[entrada];
        mostrarAviso(`${Controles.NOMBRES_ACCION[accion]} de ${jugador.toUpperCase()}: ${Controles.nombreEntrada(entrada)}.${riesgo ? ` Ojo: ${riesgo}` : ''}`, riesgo ? 8000 : 4000);
        dibujarListas();
    }

    /* ========================= */
    /* PRUEBA EN VIVO */
    /* ========================= */

    function actualizarJugador(jugador) {
        const tarjeta = document.querySelector(`[data-jugador="${jugador}"]`);
        const estado = Controles.estadoAcciones(jugador);
        const direcciones = {
            arriba: estado.arriba && !estado.izquierda && !estado.derecha,
            abajo: estado.abajo && !estado.izquierda && !estado.derecha,
            izquierda: estado.izquierda && !estado.arriba && !estado.abajo,
            derecha: estado.derecha && !estado.arriba && !estado.abajo,
            'arriba-izquierda': estado.arriba && estado.izquierda,
            'arriba-derecha': estado.arriba && estado.derecha,
            'abajo-izquierda': estado.abajo && estado.izquierda,
            'abajo-derecha': estado.abajo && estado.derecha
        };
        Object.entries(direcciones).forEach(([direccion, activa]) => {
            tarjeta.querySelector(`[data-dir="${direccion}"]`).classList.toggle('activo', activa);
        });
        ['patear', 'atras', 'start'].forEach(accion => {
            tarjeta.querySelector(`[data-accion="${accion}"]`).classList.toggle('activo', estado[accion]);
        });
        const pad = Controles.infoPad(jugador);
        tarjeta.querySelector('[data-pad]').textContent = pad ? `· Joystick ${pad.index + 1}` : '· Teclado';
        tarjeta.querySelector('[data-pad]').title = pad ? pad.id : 'Sin joystick conectado';

        const diagonal = (estado.arriba || estado.abajo) && (estado.izquierda || estado.derecha);
        return diagonal && estado.patear;
    }

    function actualizarPrueba() {
        const okJ1 = actualizarJugador('j1');
        const okJ2 = actualizarJugador('j2');
        if (enPrueba) {
            if (okJ1) checks.j1.classList.add('ok');
            if (okJ2) checks.j2.classList.add('ok');
            if (okJ1 && okJ2) checks.ambos.classList.add('ok');
        }

        const teclas = Controles.teclasMantenidas();
        teclasAhora.textContent = teclas.length ? teclas.map(Controles.nombreEntrada).join('  ') : '—';
        if (enPrueba && teclas.length > maximo) {
            maximo = teclas.length;
            maximoTeclas.textContent = String(maximo);
        }
        requestAnimationFrame(actualizarPrueba);
    }

    /**
     * En la prueba los dos jugadores aprietan de todo; el menú se pausa para
     * que "patear" no active botones ni empiece una reasignación.
     */
    function empezarPrueba() {
        enPrueba = true;
        maximo = 0;
        maximoTeclas.textContent = '0';
        Object.values(checks).forEach(item => item.classList.remove('ok'));
        testBanner.hidden = false;
        testButton.textContent = 'Probando…';
        if (Navegacion) Navegacion.setPausada(true);
    }

    function terminarPrueba() {
        enPrueba = false;
        testBanner.hidden = true;
        testButton.textContent = 'Repetir prueba';
        if (Navegacion) {
            Navegacion.setPausada(false);
            Navegacion.seleccionar(testButton);
        }
        const resultado = checks.ambos.classList.contains('ok')
            ? '¡Tu teclado aguanta la combinación completa!'
            : 'No llegaron las 6 teclas juntas: probá asignar otras teclas a J1 o J2.';
        mostrarAviso(`Prueba terminada. Máximo de teclas juntas: ${maximo}. ${resultado}`, 8000);
    }

    /* ========================= */
    /* BOTONES */
    /* ========================= */

    testButton.addEventListener('click', () => {
        if (!enPrueba) empezarPrueba();
    });

    document.getElementById('backButton').addEventListener('click', () => {
        if (Navegacion) Navegacion.irA('configuracion.html');
        else window.location.href = 'configuracion.html';
    });

    document.getElementById('resetButton').addEventListener('click', () => {
        Controles.restablecer();
        dibujarListas();
        mostrarAviso('Se restablecieron las teclas de fábrica.');
    });

    document.getElementById('swapPadsButton').addEventListener('click', () => {
        const invertir = !Controles.obtenerConfig().invertirPads;
        Controles.setInvertirPads(invertir);
        const pads = Controles.padsConectados().length;
        mostrarAviso(pads
            ? `Joysticks intercambiados: el joystick ${invertir ? 2 : 1} ahora es del Jugador 1.`
            : 'No hay joysticks conectados (apretá un botón del joystick para que el navegador lo detecte).');
    });

    window.addEventListener('gamepadconnected', evento => {
        mostrarAviso(`Joystick conectado: ${evento.gamepad.id}`);
    });

    dibujarListas();
    if (Navegacion) {
        Navegacion.iniciar({
            botonVolver: '#backButton',
            alPausado: evento => {
                if (enPrueba && evento.accion === 'atras') terminarPrueba();
            }
        });
    }
    requestAnimationFrame(actualizarPrueba);
})();
