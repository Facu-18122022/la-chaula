// Music controller con playlist + integración settings (La Chaula)

(function () {
    const path = window.location.pathname;
    const isGamePage = /\/(juego|jugar|juego-local|local-config)\.html$/.test(path);
    const trackName = isGamePage
        ? 'NUEVA CHICAGO - ME GUSTA LA PASTA (CON LETRA).mp3'
        : 'El Negro Tecla - Ahí Ahí (Lyric Video).mp3';
    const TRACKS = [
        '/musica/' + encodeURIComponent(trackName)
    ];

    const KEY_TIME = isGamePage
        ? 'laChaula_music_time_game'
        : 'laChaula_music_time_main';
    const KEY_PLAY = 'laChaula_music_playing';

    let audio = document.createElement('audio');
    audio.id = 'la-chaula-music';
    audio.style.display = 'none';
    audio.preload = 'auto';
    audio.muted = false;
    document.body.appendChild(audio);

    let index = 0;

    /* ========================= */
    /* SETTINGS */
    /* ========================= */

    function getSettings() {
        return JSON.parse(localStorage.getItem("lachaula_settings")) || {};
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

    function loadTrack(i) {
        audio.src = TRACKS[i];
        audio.load();
    }

    function play() {
        applyVolume();
        audio.muted = false;
        loadTrack(index);

        const savedTime = parseFloat(localStorage.getItem(KEY_TIME) || '0');
        audio.currentTime = savedTime;

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
    /* PROGRESO */
    /* ========================= */

    audio.addEventListener('timeupdate', () => {
        localStorage.setItem(KEY_TIME, audio.currentTime);
    });

    audio.addEventListener('ended', () => {
        index = (index + 1) % TRACKS.length;
        loadTrack(index);
        audio.play();
    });

    /* ========================= */
    /* API GLOBAL */
    /* ========================= */

    window.Music = {
        play,
        pause,
        toggle: () => audio.paused ? play() : pause(),
        setVolume: (v) => {
            audio.volume = v;
        },
        applySettings: applyVolume
    };

    /* ========================= */
    /* INIT */
    /* ========================= */

    loadTrack(index);
    applyVolume();

    audio.autoplay = true;
    play();

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

    document.addEventListener('pointerdown', unlockMusic, { passive: true });
    document.addEventListener('keydown', unlockMusic);

    window.addEventListener("storage", (e) => {
        if (e.key === "lachaula_settings") {
            applyVolume();
        }
    });

})();