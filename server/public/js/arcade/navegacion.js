/**
 * navegacion.js
 *
 * Navegación de menús con la palanca del Jugador 1 (sin mouse).
 *
 * Cada elemento navegable se marca en el HTML con el atributo `data-nav`.
 * La clase CSS `seleccionado` pasa de un elemento a otro según la dirección
 * de la palanca (se elige el vecino más cercano en pantalla, así funciona en
 * listas y en grillas) y el botón de acción lo confirma.
 *
 * Atributos opcionales:
 * - data-nav-inicial          → elemento seleccionado al entrar.
 * - data-nav-izquierda="#id"  → al mover a la izquierda se hace click en #id (carruseles).
 * - data-nav-derecha="#id"    → ídem a la derecha.
 * - data-nav-sonido="elegir"  → sonido fuerte al confirmar (elegir mapa, iniciar partido).
 * - data-nav-id="algo"        → identificador estable para listas que se redibujan.
 * Si el elemento contiene un <select>, un range o un checkbox, izquierda/derecha
 * cambian el valor y el botón de acción lo alterna.
 */
(function (global) {
    const SELECTOR = '[data-nav]';
    const pila = [];
    let ambito = null;
    let opciones = {};
    let actual = null;
    let pausada = false;
    let iniciada = false;

    function sonar(nombre) {
        if (global.Sonidos) global.Sonidos.reproducir(nombre);
    }

    function esVisible(elemento) {
        if (!elemento || !elemento.isConnected || elemento.disabled) return false;
        if (elemento.closest('[hidden]')) return false;
        const rect = elemento.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        return global.getComputedStyle(elemento).visibility !== 'hidden';
    }

    function candidatos() {
        const raiz = ambito || global.document;
        return Array.from(raiz.querySelectorAll(SELECTOR)).filter(esVisible);
    }

    function controlInterno(elemento) {
        if (!elemento) return null;
        if (elemento.matches('select, input')) return elemento;
        return elemento.querySelector('select, input[type="range"], input[type="checkbox"]');
    }

    function seleccionar(elemento, { sonido = false } = {}) {
        if (!elemento || elemento === actual) return;
        if (actual) actual.classList.remove('seleccionado');
        actual = elemento;
        actual.classList.add('seleccionado');
        if (typeof actual.scrollIntoView === 'function') actual.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (sonido) sonar('mover');
        if (typeof opciones.alSeleccionar === 'function') opciones.alSeleccionar(actual);
    }

    function asegurarSeleccion() {
        const lista = candidatos();
        if (actual && lista.includes(actual)) return lista;
        const idPrevio = actual && actual.dataset.navId;
        const porId = idPrevio ? lista.find(item => item.dataset.navId === idPrevio) : null;
        const inicial = lista.find(item => item.hasAttribute('data-nav-inicial'));
        if (actual) actual.classList.remove('seleccionado');
        actual = null;
        seleccionar(porId || inicial || lista[0]);
        return lista;
    }

    function centro(rect) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function mover(direccion) {
        const lista = asegurarSeleccion();
        if (!actual) return;
        const vertical = direccion === 'arriba' || direccion === 'abajo';
        const signo = direccion === 'abajo' || direccion === 'derecha' ? 1 : -1;
        const rectOrigen = actual.getBoundingClientRect();
        const origen = centro(rectOrigen);
        let mejor = null;
        let mejorPuntaje = Infinity;
        lista.forEach(elemento => {
            if (elemento === actual) return;
            const rect = elemento.getBoundingClientRect();
            const destino = centro(rect);
            const principal = (vertical ? destino.y - origen.y : destino.x - origen.x) * signo;
            if (principal <= 1) return;
            // Primero los que están alineados (misma fila o columna), después el resto.
            const separacion = vertical
                ? Math.max(0, rect.left - rectOrigen.right, rectOrigen.left - rect.right)
                : Math.max(0, rect.top - rectOrigen.bottom, rectOrigen.top - rect.bottom);
            const lateral = Math.abs(vertical ? destino.x - origen.x : destino.y - origen.y);
            const puntaje = (separacion > 0 ? 100000 : 0) + principal + lateral * 2;
            if (puntaje < mejorPuntaje) {
                mejorPuntaje = puntaje;
                mejor = elemento;
            }
        });
        if (mejor) seleccionar(mejor, { sonido: true });
    }

    function disparar(elemento, tipo) {
        elemento.dispatchEvent(new Event(tipo, { bubbles: true }));
    }

    function ajustarValor(delta) {
        if (!actual) return false;
        const destino = delta < 0 ? actual.dataset.navIzquierda : actual.dataset.navDerecha;
        if (destino) {
            const boton = global.document.querySelector(destino);
            if (boton && !boton.disabled) {
                boton.click();
                sonar('mover');
            }
            return true;
        }
        const control = controlInterno(actual);
        if (!control || control.disabled) return false;
        if (control.tagName === 'SELECT') {
            const total = control.options.length;
            if (!total) return true;
            control.selectedIndex = (control.selectedIndex + delta + total) % total;
            disparar(control, 'input');
            disparar(control, 'change');
            sonar('mover');
            return true;
        }
        if (control.type === 'range') {
            const minimo = Number(control.min || 0);
            const maximo = Number(control.max || 100);
            const paso = Math.max(Number(control.step) || 1, (maximo - minimo) / 10);
            const valor = Math.max(minimo, Math.min(maximo, Number(control.value) + paso * delta));
            if (String(valor) !== control.value) {
                control.value = String(valor);
                disparar(control, 'input');
                disparar(control, 'change');
            }
            sonar('mover');
            return true;
        }
        return false;
    }

    function confirmar() {
        asegurarSeleccion();
        if (!actual) return;
        const control = controlInterno(actual);
        if (control && control.tagName === 'SELECT') {
            ajustarValor(1);
            return;
        }
        if (control && control.type === 'range') return;
        if (control && control.type === 'checkbox') {
            if (control.disabled) return;
            control.click();
            sonar('confirmar');
            return;
        }
        sonar(actual.dataset.navSonido || 'confirmar');
        actual.click();
    }

    function volver() {
        if (typeof opciones.alVolver === 'function') {
            sonar('atras');
            opciones.alVolver();
            return;
        }
        const selector = opciones.botonVolver;
        const boton = selector ? (ambito || global.document).querySelector(selector) : null;
        if (boton && !boton.disabled) {
            sonar('atras');
            boton.click();
        }
    }

    function alMenu(evento) {
        const { accion } = evento;
        global.document.documentElement.classList.add('arcade-sin-mouse');
        if (pausada) {
            if (typeof opciones.alPausado === 'function') opciones.alPausado(evento);
            return;
        }
        if (typeof opciones.antesDeAccion === 'function' && opciones.antesDeAccion(accion) === false) return;
        switch (accion) {
            case 'arriba':
            case 'abajo':
                mover(accion);
                break;
            case 'izquierda':
            case 'derecha':
                asegurarSeleccion();
                if (!ajustarValor(accion === 'izquierda' ? -1 : 1)) mover(accion);
                break;
            case 'confirmar':
                confirmar();
                break;
            case 'start':
                if (typeof opciones.alStart === 'function') opciones.alStart();
                else confirmar();
                break;
            case 'atras':
                volver();
                break;
            case 'ficha':
                sonar('ficha');
                global.document.dispatchEvent(new CustomEvent('arcade:ficha'));
                break;
            default:
                break;
        }
    }

    function alPasarMouse(evento) {
        global.document.documentElement.classList.remove('arcade-sin-mouse');
        if (pausada) return;
        const elemento = evento.target.closest && evento.target.closest(SELECTOR);
        if (elemento && candidatos().includes(elemento)) seleccionar(elemento);
    }

    /**
     * Activa la navegación en la página.
     * opciones: { alVolver, botonVolver, alStart, alSeleccionar, antesDeAccion, alPausado }
     */
    function iniciar(nuevasOpciones = {}) {
        opciones = nuevasOpciones;
        ambito = nuevasOpciones.ambito || null;
        if (!iniciada) {
            iniciada = true;
            if (global.Controles) global.Controles.alMenu(alMenu);
            global.document.addEventListener('pointermove', alPasarMouse, { passive: true });
        }
        asegurarSeleccion();
    }

    /** Limita la navegación a un contenedor (por ejemplo, un cartel de pausa). */
    function abrirAmbito(elemento, nuevasOpciones = {}) {
        pila.push({ ambito, opciones, actual, pausada });
        if (actual) actual.classList.remove('seleccionado');
        actual = null;
        ambito = elemento;
        opciones = nuevasOpciones;
        pausada = false;
        asegurarSeleccion();
    }

    function cerrarAmbito() {
        const previo = pila.pop();
        if (!previo) return;
        if (actual) actual.classList.remove('seleccionado');
        ambito = previo.ambito;
        opciones = previo.opciones;
        pausada = previo.pausada;
        actual = null;
        if (previo.actual && esVisible(previo.actual)) seleccionar(previo.actual);
        else asegurarSeleccion();
    }

    function setPausada(valor) {
        pausada = !!valor;
        if (pausada && actual) {
            actual.classList.remove('seleccionado');
            actual = null;
        } else if (!pausada) {
            asegurarSeleccion();
        }
    }

    /**
     * Navega a otra página dejando que termine de sonar el efecto. Con el juego
     * abierto como archivo, Almacen suma a la URL la configuración (ver almacen.js).
     */
    function irA(url, demoraMs = 180) {
        pausada = true;
        global.setTimeout(() => {
            global.location.href = global.Almacen ? global.Almacen.url(url) : url;
        }, demoraMs);
    }

    global.NavegacionArcade = {
        iniciar,
        abrirAmbito,
        cerrarAmbito,
        seleccionar: elemento => seleccionar(elemento),
        refrescar: asegurarSeleccion,
        setPausada,
        irA,
        actual: () => actual
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
