/**
 * music.js
 *
 * Controlador global de música y efectos de audio.
 * Maneja la reproducción continua de la banda sonora, cambiando las canciones
 * dinámicamente según si se está en un menú o dentro de una partida.
 * Se integra con los ajustes de volumen del localStorage del usuario.
 *
 * Las canciones se leen solas del servidor (/api/musica):
 *   - server/public/musica/          → rotan en los menús (orden al azar).
 *   - server/public/musica/partido/  → suenan solo en el partido.
 * Para agregar una canción alcanza con copiar el .mp3 a la carpeta.
 */
(function () {
    const path = window.location.pathname;
    const isGamePage = /\/(juego|jugar|juego-local|local-config)\.html$/.test(path);
    const modo = isGamePage ? 'partido' : 'menu';

    // Por si no hay servidor (página abierta como archivo) o falla la lista.
    const TRACKS_RESPALDO = {
        menu: ['/musica/' + encodeURIComponent('El Negro Tecla - Ahí Ahí (Lyric Video).mp3')],
        partido: ['/musica/partido/' + encodeURIComponent('NUEVA CHICAGO - ME GUSTA LA PASTA (CON LETRA).mp3')]
    };

    const KEY_TIME = isGamePage
        ? 'laChaula_music_time_game'
        : 'laChaula_music_time_main';
    // Canción que estaba sonando, para seguirla al cambiar de pantalla.
    const KEY_TRACK = isGamePage
        ? 'laChaula_music_track_game'
        : 'laChaula_music_track_main';
    const KEY_PLAY = 'laChaula_music_playing';

    let audio = document.createElement('audio');
    audio.id = 'la-chaula-music';
    audio.style.display = 'none';
    audio.preload = 'auto';
    audio.muted = false;
    document.body.appendChild(audio);

    let TRACKS = TRACKS_RESPALDO[modo].slice();
    let index = 0;
    let pistaCargada = null;

    /* ========================= */
    /* SETTINGS */
    /* ========================= */

    function getSettings() {
        try {
            return JSON.parse(localStorage.getItem("lachaula_settings")) || {};
        } catch (error) {
            return {};
        }
    }

    function applyVolume() {
        const settings = getSettings();

        let volume = 0.45;

        if (settings.music !== undefined && settings.music !== null) {
            volume = parseFloat(settings.music);
        }

        if (volume > 1) {
            volume = volume / 100;
        }

        if (settings.mute === true || settings.mute === "true") {
            volume = 0;
        }

        if (isNaN(volume)) volume = 0.45;
        if (volume < 0) volume = 0;
        if (volume > 1) volume = 1;

        audio.volume = volume;
    }

    /* ========================= */
    /* PLAYLIST */
    /* ========================= */

    function mezclar(lista) {
        const copia = lista.slice();
        for (let i = copia.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [copia[i], copia[j]] = [copia[j], copia[i]];
        }
        return copia;
    }

    // Arma la lista en orden al azar, arrancando por la canción que venía sonando.
    function armarLista(canciones) {
        const guardada = localStorage.getItem(KEY_TRACK);
        const lista = mezclar(canciones);
        const posicion = lista.indexOf(guardada);
        if (posicion > 0) lista.unshift(lista.splice(posicion, 1)[0]);
        TRACKS = lista;
        index = 0;
        if (posicion === -1) localStorage.setItem(KEY_TIME, '0');
    }

    function loadTrack(i) {
        if (!TRACKS.length) return;
        pistaCargada = TRACKS[i];
        audio.src = pistaCargada;
        audio.load();
        localStorage.setItem(KEY_TRACK, pistaCargada);
    }

    function siguiente() {
        if (!TRACKS.length) return;
        const anterior = TRACKS[index];
        index += 1;
        // Al terminar la vuelta se vuelve a mezclar, sin repetir la última.
        if (index >= TRACKS.length) {
            TRACKS = mezclar(TRACKS);
            if (TRACKS.length > 1 && TRACKS[0] === anterior) TRACKS.push(TRACKS.shift());
            index = 0;
        }
        localStorage.setItem(KEY_TIME, '0');
        loadTrack(index);
        audio.play().catch(() => {});
    }

    function play() {
        if (!TRACKS.length) return Promise.resolve(false);
        applyVolume();
        audio.muted = false;
        if (pistaCargada !== TRACKS[index]) loadTrack(index);

        const savedTime = parseFloat(localStorage.getItem(KEY_TIME) || '0');
        if (savedTime > 0 && Math.abs(audio.currentTime - savedTime) > 1) audio.currentTime = savedTime;

        return audio.play()
            .then(() => {
                localStorage.setItem(KEY_PLAY, '1');
            })
            .catch(() => {
                localStorage.setItem(KEY_PLAY, '0');
                return false;
            });
    }

    function pause() {
        audio.pause();
        localStorage.setItem(KEY_PLAY, '0');
    }

    /* ========================= */
    /* CARTEL "SONANDO" (estilo FIFA / Rocket League) */
    /* ========================= */

    const TECLA_CAMBIAR = 'KeyM';
    const DURACION_CARTEL_MS = 5000;
    // Canción ya anunciada: al pasar de pantalla con la misma canción no se repite el cartel.
    const KEY_ANUNCIADA = 'laChaula_music_anunciada_' + modo;
    let temporizadorCartel = null;

    const estilosCartel = document.createElement('style');
    estilosCartel.textContent = `
        .musica-cartel {
            position: fixed;
            top: calc(16px + env(safe-area-inset-top, 0px));
            right: 16px;
            z-index: 9998;
            display: flex;
            align-items: center;
            gap: 12px;
            max-width: min(420px, calc(100vw - 32px));
            padding: 10px 14px 10px 10px;
            border: 2px solid rgba(255, 255, 255, .75);
            border-right: 6px solid #ffe600;
            background: linear-gradient(135deg, rgba(13, 71, 161, .92), rgba(8, 10, 20, .94));
            box-shadow: 0 0 16px rgba(0, 188, 212, .45), 4px 4px 0 rgba(0, 0, 0, .45);
            color: #fff;
            font-family: "Press Start 2P", "Courier New", monospace;
            pointer-events: none;
            opacity: 0;
            transform: translateX(calc(100% + 24px));
            transition: transform .35s steps(6), opacity .35s steps(6);
        }
        .musica-cartel.visible { opacity: 1; transform: translateX(0); }
        .musica-cartel__icono {
            flex: none;
            display: grid;
            place-items: center;
            width: 38px;
            height: 38px;
            background: #ff2e88;
            color: #fff;
            font-size: 18px;
            box-shadow: 3px 3px 0 #0b0620;
        }
        .musica-cartel__texto { display: grid; gap: 6px; min-width: 0; }
        .musica-cartel__etiqueta { color: #00f0ff; font-size: 8px; letter-spacing: .12em; }
        .musica-cartel__titulo,
        .musica-cartel__artista {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            text-shadow: 2px 2px 0 #0b0620;
        }
        .musica-cartel__titulo { font-size: 11px; line-height: 1.4; }
        .musica-cartel__artista { color: #b9c6e4; font-size: 8px; }
        .musica-cartel__ayuda { color: #ffe600; font-size: 7px; letter-spacing: .08em; }
        @media (prefers-reduced-motion: reduce) { .musica-cartel { transition: none; } }
    `;
    document.head.appendChild(estilosCartel);

    const cartel = document.createElement('div');
    cartel.className = 'musica-cartel';
    cartel.setAttribute('role', 'status');
    cartel.setAttribute('aria-live', 'polite');
    cartel.innerHTML = `
        <span class="musica-cartel__icono" aria-hidden="true">♪</span>
        <span class="musica-cartel__texto">
            <span class="musica-cartel__etiqueta">SONANDO</span>
            <span class="musica-cartel__titulo"></span>
            <span class="musica-cartel__artista"></span>
            <span class="musica-cartel__ayuda">[M] CAMBIAR TEMA</span>
        </span>`;
    document.body.appendChild(cartel);

    // "Artista - Tema (Lyric Video).mp3" → { artista: 'Artista', titulo: 'Tema' }
    function datosDeCancion(url) {
        let nombre = String(url || '').split('/').pop();
        try { nombre = decodeURIComponent(nombre); } catch (error) { /* se deja como vino */ }
        nombre = nombre
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/\s*[([][^)\]]*(video|letra|lyric|audio|oficial|official)[^)\]]*[)\]]/gi, '')
            .replace(/[_]+/g, ' ')
            .trim();
        const partes = nombre.split(/\s+-\s+/);
        if (partes.length >= 2) return { artista: partes.shift().trim(), titulo: partes.join(' - ').trim() };
        return { artista: '', titulo: nombre };
    }

    function mostrarCartel() {
        if (!pistaCargada) return;
        const { artista, titulo } = datosDeCancion(pistaCargada);
        cartel.querySelector('.musica-cartel__titulo').textContent = titulo;
        const artistaEl = cartel.querySelector('.musica-cartel__artista');
        artistaEl.textContent = artista;
        artistaEl.hidden = !artista;
        cartel.querySelector('.musica-cartel__ayuda').hidden = TRACKS.length < 2;
        cartel.classList.add('visible');
        clearTimeout(temporizadorCartel);
        temporizadorCartel = setTimeout(() => cartel.classList.remove('visible'), DURACION_CARTEL_MS);
    }

    // Se anuncia cada canción nueva cuando realmente empieza a sonar.
    audio.addEventListener('playing', () => {
        if (sessionStorage.getItem(KEY_ANUNCIADA) === pistaCargada) return;
        sessionStorage.setItem(KEY_ANUNCIADA, pistaCargada);
        mostrarCartel();
    });

    function escribiendoTexto(evento) {
        const destino = evento.target;
        return !!destino && (destino.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(destino.tagName));
    }

    document.addEventListener('keydown', evento => {
        if (evento.code !== TECLA_CAMBIAR || evento.repeat || escribiendoTexto(evento)) return;
        if (TRACKS.length > 1) siguiente();
        else if (audio.paused) play();
        mostrarCartel();
    });

    /* ========================= */
    /* PROGRESO */
    /* ========================= */

    audio.addEventListener('timeupdate', () => {
        localStorage.setItem(KEY_TIME, audio.currentTime);
    });

    audio.addEventListener('ended', siguiente);

    // Si un archivo no se puede reproducir, pasa a la siguiente canción.
    audio.addEventListener('error', () => {
        if (TRACKS.length > 1) siguiente();
    });

    /* ========================= */
    /* API GLOBAL */
    /* ========================= */

    window.Music = {
        play,
        pause,
        next: siguiente,
        toggle: () => audio.paused ? play() : pause(),
        setVolume: (v) => {
            audio.volume = v;
        },
        applySettings: applyVolume
    };

    /* ========================= */
    /* INIT */
    /* ========================= */

    const unlockMusic = () => {
        if (!audio.paused) {
            document.removeEventListener('pointerdown', unlockMusic);
            document.removeEventListener('keydown', unlockMusic);
            return;
        }

        play().then(started => {
            if (started === false) return;

            document.removeEventListener('pointerdown', unlockMusic);
            document.removeEventListener('keydown', unlockMusic);
        });
    };

    function iniciar() {
        applyVolume();
        audio.autoplay = true;
        play();
        document.addEventListener('pointerdown', unlockMusic, { passive: true });
        document.addEventListener('keydown', unlockMusic);
    }

    fetch('/api/musica', { cache: 'no-store' })
        .then(respuesta => respuesta.ok ? respuesta.json() : null)
        .then(lista => {
            const canciones = lista && Array.isArray(lista[modo]) ? lista[modo] : [];
            armarLista(canciones.length ? canciones : TRACKS_RESPALDO[modo]);
        })
        .catch(() => armarLista(TRACKS_RESPALDO[modo]))
        .then(iniciar);

    window.addEventListener("storage", (e) => {
        if (e.key === "lachaula_settings") {
            applyVolume();
        }
    });

})();
