/**
 * cliente.js (online)
 *
 * Toda la experiencia online en una sola página (como HaxBall), así la
 * conexión con el servidor no se corta al pasar de la lista de salas al
 * partido:
 *   1. Lista de salas: elegir nombre, crear sala o entrar a una.
 *   2. Sala: panel con Rojo / Espectadores / Azul. El admin arrastra (o usa
 *      las flechas) para elegir de qué lado juega cada uno, cambia la cancha
 *      y las reglas, y arranca el partido.
 *   3. Partido: el navegador manda las teclas y dibuja lo que manda el
 *      servidor, interpolando entre fotos para que se vea fluido.
 */
(function () {
    const socket = io({ transports: ['websocket', 'polling'] });
    const $ = id => document.getElementById(id);

    const CLAVE_NOMBRE = 'lachaula_nombre';
    // El servidor manda 60 fotos por segundo: con un atraso chico ya hay dos para interpolar.
    const RETARDO_INTERPOLACION_MS = 25;
    const BITS_TECLA = {
        ArrowUp: 1, KeyW: 1,
        ArrowDown: 2, KeyS: 2,
        ArrowLeft: 4, KeyA: 4,
        ArrowRight: 8, KeyD: 8,
        Space: 16, KeyX: 16
    };
    const NOMBRE_EQUIPO = { red: 'Rojo', blue: 'Azul' };

    const estado = {
        salaId: null,
        tuId: null,
        token: null,
        sala: null,
        fotos: [],
        teclas: new Set(),
        bits: 0,
        panelVisible: true,
        cartelTimeout: null,
        mapas: [],
        ultimoDibujo: null
    };

    const canvas = $('cancha');
    const dibujante = DibujoOnline.crearDibujante(canvas);
    const preview = $('previewMapa');
    const dibujantePreview = DibujoOnline.crearDibujante(preview);

    /* ========================= */
    /* UTILIDADES                */
    /* ========================= */

    function mostrarAviso(elemento, texto, duracionMs = 4000) {
        elemento.textContent = texto || '';
        clearTimeout(elemento._timeout);
        if (texto && duracionMs) elemento._timeout = setTimeout(() => { elemento.textContent = ''; }, duracionMs);
    }

    function avisoActual(texto) {
        mostrarAviso(estado.salaId ? $('avisoSala') : $('avisoSalas'), texto);
    }

    function pedir(evento, datos = {}) {
        return new Promise(resolve => socket.emit(evento, datos, respuesta => resolve(respuesta || {})));
    }

    async function accion(evento, datos) {
        const respuesta = await pedir(evento, datos);
        if (respuesta.error) avisoActual(respuesta.error);
        return respuesta;
    }

    function nombreGuardado() {
        return (localStorage.getItem(CLAVE_NOMBRE) || '').trim();
    }

    function leerNombre() {
        const nombre = $('nombreJugador').value.trim();
        if (!nombre) {
            mostrarAviso($('avisoSalas'), 'Primero escribí tu nombre de jugador.');
            $('nombreJugador').focus();
            return null;
        }
        localStorage.setItem(CLAVE_NOMBRE, nombre);
        return nombre;
    }

    function claveToken(salaId) {
        return `lachaula_token_${salaId}`;
    }

    function formatearTiempo(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }

    function crearElemento(tag, clase, texto) {
        const elemento = document.createElement(tag);
        if (clase) elemento.className = clase;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    }

    function soyAdmin() {
        const yo = estado.sala && estado.sala.jugadores.find(jugador => jugador.id === estado.tuId);
        return !!(yo && yo.admin);
    }

    /* ========================= */
    /* CONEXIÓN                  */
    /* ========================= */

    function actualizarConexion(texto, clase) {
        const etiqueta = $('estadoConexion');
        etiqueta.textContent = texto;
        etiqueta.className = `online-conexion ${clase || ''}`;
    }

    socket.on('connect', async () => {
        actualizarConexion('● Conectado', 'online-conexion--ok');
        if (estado.salaId && estado.token) {
            // Se cortó y volvió: recupera su lugar en la sala.
            const respuesta = await pedir('sala:unirse', { salaId: estado.salaId, token: estado.token });
            if (respuesta.ok) entrarASala(respuesta);
            else volverALista(respuesta.error || 'Se perdió la conexión con la sala.');
            return;
        }
        pedirSalas();
        intentarEntrarPorLink();
    });

    socket.on('disconnect', () => actualizarConexion('● Sin conexión, reintentando…', 'online-conexion--mal'));

    setInterval(() => {
        if (!socket.connected) return;
        const inicio = performance.now();
        socket.emit('ping', {}, () => {
            actualizarConexion(`● ${Math.round(performance.now() - inicio)} ms`, 'online-conexion--ok');
        });
    }, 2000);

    /* ========================= */
    /* LISTA DE SALAS            */
    /* ========================= */

    async function pedirSalas() {
        const respuesta = await pedir('salas:pedir');
        if (respuesta.salas) dibujarSalas(respuesta.salas);
    }

    function dibujarSalas(salas) {
        const cuerpo = $('listaSalas');
        cuerpo.textContent = '';
        if (!salas.length) {
            const fila = crearElemento('tr');
            const celda = crearElemento('td', 'online-vacio', 'No hay salas abiertas. ¡Creá una!');
            celda.colSpan = 5;
            fila.appendChild(celda);
            cuerpo.appendChild(fila);
            return;
        }
        salas.forEach(sala => {
            const fila = crearElemento('tr', 'online-fila-sala');
            fila.append(
                crearElemento('td', '', `${sala.conClave ? '🔒 ' : ''}${sala.nombre}`),
                crearElemento('td', '', `${sala.jugadores}/${sala.maxJugadores}`),
                crearElemento('td', '', sala.mapa),
                crearElemento('td', sala.enJuego ? 'online-estado--juego' : '', sala.enJuego ? 'Jugando' : 'Esperando')
            );
            const celdaBoton = crearElemento('td');
            const boton = crearElemento('button', 'ssf-button online-mini', 'Entrar');
            boton.type = 'button';
            boton.disabled = sala.jugadores >= sala.maxJugadores;
            boton.addEventListener('click', () => unirse(sala.id, sala.conClave));
            celdaBoton.appendChild(boton);
            fila.appendChild(celdaBoton);
            cuerpo.appendChild(fila);
        });
    }

    socket.on('salas:lista', dibujarSalas);

    function pedirClave() {
        const dialogo = $('dialogoClave');
        $('claveIngreso').value = '';
        dialogo.returnValue = '';
        dialogo.showModal();
        $('claveIngreso').focus();
        return new Promise(resolve => {
            dialogo.addEventListener('close', () => resolve(dialogo.returnValue === 'entrar' ? $('claveIngreso').value : null), { once: true });
        });
    }

    async function unirse(salaId, conClave = false) {
        const nombreJugador = leerNombre();
        if (!nombreJugador) return;
        let clave = '';
        if (conClave) {
            clave = await pedirClave();
            if (clave === null) return;
        }
        const token = sessionStorage.getItem(claveToken(salaId)) || undefined;
        let respuesta = await pedir('sala:unirse', { salaId, nombreJugador, clave, token });
        if (respuesta.pideClave && !conClave) {
            clave = await pedirClave();
            if (clave === null) return;
            respuesta = await pedir('sala:unirse', { salaId, nombreJugador, clave });
        }
        if (respuesta.error) {
            mostrarAviso($('avisoSalas'), respuesta.error);
            return;
        }
        entrarASala(respuesta);
    }

    async function intentarEntrarPorLink() {
        const salaId = new URLSearchParams(window.location.search).get('sala');
        if (!salaId || estado.salaId) return;
        const token = sessionStorage.getItem(claveToken(salaId.toUpperCase()));
        if (token) {
            const respuesta = await pedir('sala:unirse', { salaId, token });
            if (respuesta.ok) {
                entrarASala(respuesta);
                return;
            }
        }
        if (!nombreGuardado()) {
            mostrarAviso($('avisoSalas'), `Te invitaron a la sala ${salaId}: escribí tu nombre y tocá "Entrar".`, 0);
            $('codigoSala').value = salaId;
            $('nombreJugador').focus();
            return;
        }
        unirse(salaId);
    }

    $('formCrear').addEventListener('submit', async evento => {
        evento.preventDefault();
        const nombreJugador = leerNombre();
        if (!nombreJugador) return;
        const respuesta = await accion('sala:crear', {
            nombreJugador,
            nombre: $('nombreSala').value,
            clave: $('claveSala').value,
            maxJugadores: Number($('maxJugadores').value)
        });
        if (respuesta.ok) entrarASala(respuesta);
    });

    $('formCodigo').addEventListener('submit', evento => {
        evento.preventDefault();
        const codigo = $('codigoSala').value.trim();
        if (codigo) unirse(codigo.toUpperCase());
    });

    $('actualizarSalas').addEventListener('click', pedirSalas);
    $('volverMenu').addEventListener('click', () => { window.location.href = 'menu.html'; });

    /* ========================= */
    /* ENTRAR / SALIR DE LA SALA */
    /* ========================= */

    function entrarASala(respuesta) {
        estado.salaId = respuesta.salaId;
        estado.tuId = respuesta.tuId;
        estado.token = respuesta.token;
        estado.fotos = [];
        if (respuesta.mapas) {
            estado.mapas = respuesta.mapas;
            dibujarMiniaturas();
        }
        sessionStorage.setItem(claveToken(respuesta.salaId), respuesta.token);
        history.replaceState(null, '', `?sala=${respuesta.salaId}`);
        $('vistaSalas').hidden = true;
        $('vistaSala').hidden = false;
        if (!respuesta.reconectado) $('chatMensajes').textContent = '';
        actualizarSala(respuesta.sala);
        mostrarPanel(!respuesta.sala.partido);
    }

    function volverALista(motivo) {
        if (estado.salaId) sessionStorage.removeItem(claveToken(estado.salaId));
        estado.salaId = null;
        estado.tuId = null;
        estado.token = null;
        estado.sala = null;
        estado.fotos = [];
        soltarTeclas();
        history.replaceState(null, '', window.location.pathname);
        $('vistaSala').hidden = true;
        $('vistaSalas').hidden = false;
        if (motivo) mostrarAviso($('avisoSalas'), motivo, 6000);
        pedirSalas();
    }

    $('salirSala').addEventListener('click', async () => {
        await pedir('sala:salir');
        volverALista();
    });

    socket.on('sala:expulsado', ({ motivo }) => volverALista(motivo || 'Saliste de la sala.'));

    $('copiarLink').addEventListener('click', async () => {
        const link = `${window.location.origin}${window.location.pathname}?sala=${estado.salaId}`;
        try {
            await navigator.clipboard.writeText(link);
            mostrarAviso($('avisoSala'), '¡Link copiado! Pasáselo a tus amigos.');
        } catch (error) {
            mostrarAviso($('avisoSala'), `Link de la sala: ${link}`, 10000);
        }
    });

    /* ========================= */
    /* PANEL DE LA SALA          */
    /* ========================= */

    socket.on('sala:estado', sala => {
        if (sala.id === estado.salaId) actualizarSala(sala);
    });

    function actualizarSala(sala) {
        const mapaAnterior = estado.sala && estado.sala.mapa.id;
        estado.sala = sala;
        if (mapaAnterior !== sala.mapa.id || canvas.width !== sala.mapa.width) {
            ajustarCanvas(sala.mapa);
            dibujante.reiniciarEfectos();
        }
        $('tituloSala').textContent = sala.nombre;
        $('codigoActual').textContent = sala.id;
        $('candado').hidden = !sala.conClave;
        dibujarEquipos(sala);
        dibujarControlesAdmin(sala);
        dibujarUltimoResultado(sala);
        if (!sala.partido) estado.fotos = [];
    }

    function ajustarCanvas(mapa) {
        canvas.width = mapa.width;
        canvas.height = mapa.height;
        canvas.style.aspectRatio = `${mapa.width} / ${mapa.height}`;
    }

    function moverJugador(jugadorId, equipo) {
        accion('sala:mover', { jugadorId, equipo: equipo || null });
    }

    function dibujarEquipos(sala) {
        const admin = soyAdmin();
        const yo = sala.jugadores.find(jugador => jugador.id === estado.tuId);
        const columnas = ['red', '', 'blue'];
        document.querySelectorAll('.online-equipo').forEach(seccion => {
            const equipo = seccion.dataset.equipo;
            const indice = columnas.indexOf(equipo);
            const lista = seccion.querySelector('[data-lista]');
            const miembros = sala.jugadores.filter(jugador => (jugador.equipo || '') === equipo);
            lista.textContent = '';
            seccion.querySelector('[data-cuenta]').textContent = equipo ? `${miembros.length}/${sala.maxPorEquipo}` : String(miembros.length);

            miembros.forEach((jugador, posicion) => {
                const item = crearElemento('li', 'online-jugador');
                if (jugador.id === estado.tuId) item.classList.add('online-jugador--vos');
                if (jugador.desconectado) item.classList.add('online-jugador--desconectado');
                item.dataset.id = jugador.id;
                item.draggable = admin;
                const nombre = crearElemento('span', 'online-jugador__nombre');
                nombre.textContent = `${equipo ? `${posicion + 1}. ` : ''}${jugador.nombre}${jugador.id === estado.tuId ? ' (vos)' : ''}`;
                item.appendChild(nombre);
                if (jugador.admin) item.appendChild(crearElemento('span', 'online-jugador__admin', '★'));
                if (jugador.desconectado) item.appendChild(crearElemento('span', 'online-jugador__estado', 'reconectando…'));

                if (admin) {
                    const acciones = crearElemento('span', 'online-jugador__acciones');
                    if (indice > 0) acciones.appendChild(botonMini('◀', `Mover a ${columnas[indice - 1] ? NOMBRE_EQUIPO[columnas[indice - 1]] : 'Espectadores'}`, () => moverJugador(jugador.id, columnas[indice - 1])));
                    if (indice < 2) acciones.appendChild(botonMini('▶', `Mover a ${columnas[indice + 1] ? NOMBRE_EQUIPO[columnas[indice + 1]] : 'Espectadores'}`, () => moverJugador(jugador.id, columnas[indice + 1])));
                    if (jugador.id !== estado.tuId) {
                        acciones.appendChild(botonMini('★', jugador.admin ? 'Sacar admin' : 'Dar admin', () => accion('sala:admin', { jugadorId: jugador.id })));
                        acciones.appendChild(botonMini('✕', 'Echar de la sala', () => {
                            if (window.confirm(`¿Echar a ${jugador.nombre} de la sala?`)) accion('sala:echar', { jugadorId: jugador.id });
                        }));
                    }
                    item.appendChild(acciones);
                }
                lista.appendChild(item);
            });

            const puedeUnirse = yo && (yo.equipo || '') !== equipo && (admin || !sala.config.equiposBloqueados);
            seccion.querySelector('[data-unirme]').hidden = !puedeUnirse;
        });
    }

    function botonMini(texto, titulo, alClick) {
        const boton = crearElemento('button', 'online-mini', texto);
        boton.type = 'button';
        boton.title = titulo;
        boton.setAttribute('aria-label', titulo);
        boton.addEventListener('click', alClick);
        return boton;
    }

    // Arrastrar y soltar jugadores entre columnas (solo el admin).
    document.querySelectorAll('.online-equipo').forEach(seccion => {
        seccion.addEventListener('dragover', evento => {
            if (!soyAdmin()) return;
            evento.preventDefault();
            seccion.classList.add('online-equipo--destino');
        });
        seccion.addEventListener('dragleave', () => seccion.classList.remove('online-equipo--destino'));
        seccion.addEventListener('drop', evento => {
            evento.preventDefault();
            seccion.classList.remove('online-equipo--destino');
            const jugadorId = evento.dataTransfer.getData('text/plain');
            if (jugadorId) moverJugador(jugadorId, seccion.dataset.equipo);
        });
        seccion.querySelector('[data-unirme]').addEventListener('click', () => moverJugador(estado.tuId, seccion.dataset.equipo));
    });

    document.addEventListener('dragstart', evento => {
        const item = evento.target.closest && evento.target.closest('.online-jugador');
        if (item) evento.dataTransfer.setData('text/plain', item.dataset.id);
    });

    function llenarSelect(select, opciones) {
        if (select.options.length === opciones.length) return;
        select.textContent = '';
        opciones.forEach(([valor, texto]) => {
            const opcion = crearElemento('option', '', texto);
            opcion.value = String(valor);
            select.appendChild(opcion);
        });
    }

    function dibujarControlesAdmin(sala) {
        const admin = soyAdmin();
        const enPartido = !!sala.partido;
        $('infoNoAdmin').hidden = admin;
        llenarSelect($('cfgTiempo'), sala.tiempos.map(minutos => [minutos, `${minutos} min`]));
        llenarSelect($('cfgGoles'), sala.golesValidos.map(goles => [goles, goles ? `${goles}` : 'Sin límite']));
        $('cfgTiempo').value = String(sala.config.tiempoMin);
        $('cfgGoles').value = String(sala.config.goles);
        $('cfgPowerUps').checked = sala.config.powerUps;
        $('cfgBloqueo').checked = sala.config.equiposBloqueados;
        // Los que no son admin ven la configuración pero no la pueden tocar.
        ['cfgTiempo', 'cfgGoles', 'cfgPowerUps'].forEach(id => { $(id).disabled = !admin || enPartido; });
        $('cfgBloqueo').disabled = !admin;
        ['mapaAnterior', 'mapaSiguiente'].forEach(id => { $(id).hidden = !admin; $(id).disabled = enPartido; });
        document.querySelectorAll('.online-miniatura').forEach(boton => {
            const elegida = boton.dataset.mapa === sala.config.mapaId;
            boton.classList.toggle('online-miniatura--elegida', elegida);
            boton.setAttribute('aria-selected', String(elegida));
            boton.disabled = !admin || enPartido;
        });
        const mapa = mapaPorId(sala.config.mapaId);
        $('nombreMapa').textContent = mapa ? mapa.name : sala.mapa.name;
        document.querySelector('.online-admin__botones').hidden = !admin;
        $('mezclar').disabled = enPartido;
        $('pausa').disabled = !enPartido;
        $('pausa').textContent = enPartido && sala.partido.pausado ? 'Seguir (P)' : 'Pausa (P)';
        $('iniciarDetener').textContent = enPartido ? 'Detener partido' : 'Iniciar partido';
        $('iniciarDetener').classList.toggle('ssf-button-danger', enPartido);
    }

    function mapaPorId(id) {
        return estado.mapas.find(mapa => mapa.id === id) || null;
    }

    // Miniaturas de todas las canchas: se dibujan una vez con el mismo dibujo del partido.
    function dibujarMiniaturas() {
        const contenedor = $('miniaturas');
        contenedor.textContent = '';
        estado.mapas.forEach(mapa => {
            const boton = crearElemento('button', 'online-miniatura');
            boton.type = 'button';
            boton.dataset.mapa = mapa.id;
            boton.setAttribute('role', 'option');
            boton.title = mapa.name;
            const lienzo = crearElemento('canvas');
            lienzo.width = mapa.width;
            lienzo.height = mapa.height;
            DibujoOnline.crearDibujante(lienzo).dibujar(DibujoOnline.estadoVacio(mapa), 0, null);
            boton.append(lienzo, crearElemento('span', '', mapa.name));
            boton.addEventListener('click', () => elegirMapa(mapa.id));
            contenedor.appendChild(boton);
        });
    }

    function elegirMapa(mapaId) {
        if (!soyAdmin() || !estado.sala || estado.sala.config.mapaId === mapaId) return;
        accion('sala:config', { mapaId });
    }

    function moverCarrusel(paso) {
        if (!estado.sala || !estado.mapas.length) return;
        const indice = estado.mapas.findIndex(mapa => mapa.id === estado.sala.config.mapaId);
        const siguiente = estado.mapas[(indice + paso + estado.mapas.length) % estado.mapas.length];
        elegirMapa(siguiente.id);
    }

    $('mapaAnterior').addEventListener('click', () => moverCarrusel(-1));
    $('mapaSiguiente').addEventListener('click', () => moverCarrusel(1));

    // Vista previa grande de la cancha elegida (animada como en el partido).
    function dibujarPreview() {
        if (!estado.panelVisible || !estado.sala) return;
        const mapa = mapaPorId(estado.sala.config.mapaId) || estado.sala.mapa;
        if (preview.width !== mapa.width || preview.height !== mapa.height) {
            preview.width = mapa.width;
            preview.height = mapa.height;
        }
        dibujantePreview.dibujar(DibujoOnline.estadoVacio(mapa), 0, null);
    }

    function dibujarUltimoResultado(sala) {
        const elemento = $('ultimoResultado');
        const resultado = sala.ultimoResultado;
        elemento.hidden = !resultado;
        if (!resultado) return;
        const goleadores = {};
        resultado.goles.filter(gol => gol.autor && !gol.enContra).forEach(gol => {
            goleadores[gol.autor] = (goleadores[gol.autor] || 0) + 1;
        });
        const lista = Object.entries(goleadores).map(([nombre, goles]) => (goles > 1 ? `${nombre} (${goles})` : nombre)).join(', ');
        const ganador = resultado.ganador ? `Ganó ${NOMBRE_EQUIPO[resultado.ganador]}` : 'Empate';
        elemento.textContent = `Último partido: ${ganador} · Rojo ${resultado.marcador.red} - ${resultado.marcador.blue} Azul${lista ? ` · Goles: ${lista}` : ''}`;
    }

    ['cfgTiempo', 'cfgGoles'].forEach(id => {
        $(id).addEventListener('change', evento => {
            const clave = { cfgTiempo: 'tiempoMin', cfgGoles: 'goles' }[id];
            accion('sala:config', { [clave]: Number(evento.target.value) });
            evento.target.blur();
        });
    });
    $('cfgPowerUps').addEventListener('change', evento => accion('sala:config', { powerUps: evento.target.checked }));
    $('cfgBloqueo').addEventListener('change', evento => accion('sala:config', { equiposBloqueados: evento.target.checked }));
    $('mezclar').addEventListener('click', () => accion('sala:mezclar'));
    $('pausa').addEventListener('click', () => accion('partido:pausa'));
    $('iniciarDetener').addEventListener('click', () => accion(estado.sala && estado.sala.partido ? 'partido:detener' : 'partido:iniciar'));

    function mostrarPanel(visible) {
        estado.panelVisible = visible;
        $('panelSala').hidden = !visible;
    }

    $('botonPanel').addEventListener('click', () => mostrarPanel(!estado.panelVisible));

    /* ========================= */
    /* CHAT                      */
    /* ========================= */

    socket.on('sala:chat', mensaje => {
        const contenedor = $('chatMensajes');
        const linea = crearElemento('p', mensaje.sistema ? 'online-chat__sistema' : 'online-chat__mensaje');
        if (!mensaje.sistema) {
            const autor = crearElemento('strong', `online-chat__autor online-chat__autor--${mensaje.equipo || 'spec'}`, `${mensaje.admin ? '★ ' : ''}${mensaje.de}: `);
            linea.appendChild(autor);
        }
        linea.appendChild(document.createTextNode(mensaje.texto));
        contenedor.appendChild(linea);
        while (contenedor.children.length > 150) contenedor.removeChild(contenedor.firstChild);
        contenedor.scrollTop = contenedor.scrollHeight;
    });

    $('formChat').addEventListener('submit', evento => {
        evento.preventDefault();
        const texto = $('chatTexto').value.trim();
        $('chatTexto').value = '';
        $('chatTexto').blur();
        if (texto) accion('sala:chat', { texto });
    });

    $('chatTexto').addEventListener('focus', soltarTeclas);

    /* ========================= */
    /* PARTIDO                   */
    /* ========================= */

    socket.on('partido:inicio', ({ mapa }) => {
        if (estado.sala) estado.sala.mapa = mapa;
        ajustarCanvas(mapa);
        dibujante.reiniciarEfectos();
        estado.fotos = [];
        mostrarPanel(false);
        if (document.activeElement) document.activeElement.blur();
    });

    socket.on('partido:estado', foto => {
        estado.fotos.push({ hora: performance.now(), foto });
        if (estado.fotos.length > 30) estado.fotos.shift();
    });

    socket.on('partido:detenido', () => {
        estado.fotos = [];
        mostrarPanel(true);
    });

    function mostrarCartel(texto, equipo, duracionMs) {
        const cartel = $('cartelGol');
        cartel.textContent = texto;
        cartel.className = `online-cartel online-cartel--${equipo || 'neutro'}`;
        cartel.hidden = false;
        clearTimeout(estado.cartelTimeout);
        estado.cartelTimeout = setTimeout(() => { cartel.hidden = true; }, duracionMs);
    }

    socket.on('partido:evento', evento => {
        // El gol se festeja dentro de la cancha (mismo dibujo que el arcade).
        if (evento.tipo === 'tiempoExtra') {
            mostrarCartel('¡TIEMPO EXTRA!', null, 2000);
        }
    });

    socket.on('partido:fin', evento => {
        const texto = evento.ganador ? `¡GANÓ ${NOMBRE_EQUIPO[evento.ganador].toUpperCase()}!` : '¡EMPATE!';
        mostrarCartel(`${texto} ${evento.marcador.red} - ${evento.marcador.blue}`, evento.ganador, 4000);
        estado.fotos = [];
        setTimeout(() => mostrarPanel(true), 1500);
    });

    function interpolar(a, b, t) {
        return a + (b - a) * t;
    }

    // Devuelve la foto a dibujar: un poco "en el pasado" para tener dos fotos entre las que interpolar.
    function fotoParaDibujar() {
        const fotos = estado.fotos;
        if (!fotos.length) return null;
        const momento = performance.now() - RETARDO_INTERPOLACION_MS;
        let siguiente = fotos.findIndex(item => item.hora >= momento);
        if (siguiente === -1) return fotos[fotos.length - 1].foto;
        if (siguiente === 0) return fotos[0].foto;
        const a = fotos[siguiente - 1];
        const b = fotos[siguiente];
        const t = (momento - a.hora) / Math.max(1, b.hora - a.hora);
        const posiciones = new Map(a.foto.j.map(jugador => [jugador[0], jugador]));
        return {
            ...b.foto,
            b: [interpolar(a.foto.b[0], b.foto.b[0], t), interpolar(a.foto.b[1], b.foto.b[1], t), b.foto.b[2]],
            j: b.foto.j.map(jugador => {
                const previo = posiciones.get(jugador[0]);
                if (!previo) return jugador;
                return [jugador[0], interpolar(previo[1], jugador[1], t), interpolar(previo[2], jugador[2], t), ...jugador.slice(3)];
            })
        };
    }

    function textoFase(foto) {
        if (foto.p) return 'PAUSA';
        if (foto.f === 'SAQUE') return `SAQUE ${foto.s === 'red' ? 'ROJO' : 'AZUL'}`;
        if (foto.f === 'GOL') return '¡GOL!';
        if (foto.f === 'TIEMPO_EXTRA' || foto.x) return 'TIEMPO EXTRA';
        return '';
    }

    function actualizarHud(foto) {
        $('golesRojo').textContent = foto ? foto.m[0] : (estado.sala && estado.sala.partido ? estado.sala.partido.marcador.red : 0);
        $('golesAzul').textContent = foto ? foto.m[1] : (estado.sala && estado.sala.partido ? estado.sala.partido.marcador.blue : 0);
        $('reloj').textContent = foto ? formatearTiempo(foto.t) : '--:--';
        $('faseTexto').textContent = foto ? textoFase(foto) : (estado.sala && estado.sala.partido ? '' : 'ESPERANDO');
    }

    // Arma el "estado" que esperan las funciones de dibujo de develop a partir de la foto del servidor.
    function estadoParaDibujar(foto) {
        const sala = estado.sala;
        const base = DibujoOnline.estadoVacio(sala.mapa);
        if (!foto) return base;
        const datos = new Map(sala.jugadores.map(jugador => [jugador.id, jugador]));
        const numeros = new Map();
        ['red', 'blue'].forEach(equipo => sala.jugadores
            .filter(jugador => jugador.equipo === equipo)
            .forEach((jugador, indice) => numeros.set(jugador.id, indice + 1)));
        base.ball = { x: foto.b[0], y: foto.b[1], r: foto.b[2] };
        base.activePowerUps = (foto.u || []).map(([x, y, type, r]) => ({ x, y, type, r }));
        base.lastPowerImpact = foto.i ? { id: foto.i[0], x: foto.i[1], y: foto.i[2] } : null;
        base.players = foto.j.map(([id, x, y, r, pateando, power]) => {
            const jugador = datos.get(id) || {};
            return {
                id, x, y, r,
                equipo: jugador.equipo,
                pateando: !!pateando,
                activePower: power || null,
                nombre: jugador.nombre || '',
                numero: numeros.get(id) || '',
                esVos: id === estado.tuId
            };
        });
        return base;
    }

    function celebracionDe(foto) {
        if (!foto || foto.f !== 'GOL' || !foto.ug) return null;
        const [equipo, autor, enContra] = foto.ug;
        return {
            fase: 'GOL',
            golTranscurridoMs: foto.g || 0,
            duracionGolMs: 2500,
            ultimoGol: { equipo, jugadorId: autor || null, enContra: !!enContra }
        };
    }

    function bucle(ahora) {
        const delta = estado.ultimoDibujo === null ? 0 : ahora - estado.ultimoDibujo;
        estado.ultimoDibujo = ahora;
        if (estado.sala) {
            const foto = fotoParaDibujar();
            dibujante.dibujar(estadoParaDibujar(foto), foto && !foto.p ? delta : 0, celebracionDe(foto));
            actualizarHud(foto);
            dibujarPreview();
        }
        requestAnimationFrame(bucle);
    }

    /* ========================= */
    /* TECLADO                   */
    /* ========================= */

    function enviarTeclas() {
        let bits = 0;
        estado.teclas.forEach(codigo => { bits |= BITS_TECLA[codigo] || 0; });
        if (bits !== estado.bits) {
            estado.bits = bits;
            socket.emit('entrada', bits);
        }
    }

    function soltarTeclas() {
        estado.teclas.clear();
        enviarTeclas();
    }

    function escribiendo(elemento) {
        if (!elemento) return false;
        const tag = elemento.tagName;
        return tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'button', 'submit'].includes(elemento.type));
    }

    window.addEventListener('keydown', evento => {
        if (!estado.salaId || $('dialogoClave').open) return;
        const enTexto = escribiendo(evento.target);
        if (evento.code === 'Escape') {
            if (enTexto) evento.target.blur();
            else mostrarPanel(!estado.panelVisible);
            return;
        }
        if (enTexto) return;
        if (evento.code === 'Enter') {
            evento.preventDefault();
            $('chatTexto').focus();
            return;
        }
        if (evento.code === 'KeyP' && !evento.repeat && soyAdmin() && estado.sala.partido) {
            accion('partido:pausa');
            return;
        }
        if (BITS_TECLA[evento.code]) {
            // Que Espacio o las flechas no aprieten botones ni cambien selects.
            evento.preventDefault();
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            estado.teclas.add(evento.code);
            enviarTeclas();
        }
    });

    window.addEventListener('keyup', evento => {
        if (!BITS_TECLA[evento.code]) return;
        estado.teclas.delete(evento.code);
        enviarTeclas();
    });

    window.addEventListener('blur', soltarTeclas);

    /* ========================= */
    /* INICIO                    */
    /* ========================= */

    $('nombreJugador').value = nombreGuardado();
    $('nombreJugador').addEventListener('change', () => {
        const nombre = $('nombreJugador').value.trim();
        if (nombre) localStorage.setItem(CLAVE_NOMBRE, nombre);
    });
    requestAnimationFrame(bucle);
})();
