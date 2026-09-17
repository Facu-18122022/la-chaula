// Music controller con playlist + integración settings (La Chaula)

(function () {
    const TRACKS = [
        '/musica/cancion1.mp3',
        '/musica/cancion2.mp3',
        '/musica/cancion3.mp3'
    ];

    const KEY_INDEX = 'laChaula_music_index';
    const KEY_TIME = 'laChaula_music_time';
    const KEY_PLAY = 'laChaula_music_playing';

    let audio = document.createElement('audio');
    audio.id = 'la-chaula-music';
    audio.style.display = 'none';
    document.body.appendChild(audio);

    let index = parseInt(localStorage.getItem(KEY_INDEX) || '0');

    /* ========================= */
    /* SETTINGS */
    /* ========================= */

    function getSettings() {
        return JSON.parse(localStorage.getItem("lachaula_settings")) || {};
    }

    function applyVolume() {
        const settings = getSettings();

        let volume = 0.5;

        if (settings.music !== undefined && settings.music !== null) {
            volume = parseFloat(settings.music);
        }

        // Detecta automáticamente si es 0–100 o 0–1
        if (volume > 1) {
            volume = volume / 100;
        }

        if (settings.mute === true || settings.mute === "true") {
            volume = 0;
        }

        // seguridad final
        if (isNaN(volume)) volume = 0.5;
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

        loadTrack(index);

        const savedTime = parseFloat(localStorage.getItem(KEY_TIME) || '0');
        audio.currentTime = savedTime;

        audio.play().catch(() => {});

        localStorage.setItem(KEY_PLAY, '1');
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
        localStorage.setItem(KEY_INDEX, index);
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
        }
    };

    /* ========================= */
    /* INIT */
    /* ========================= */

    loadTrack(index);
    applyVolume();

    if (localStorage.getItem(KEY_PLAY) === '1') {
        play();
    }

    window.addEventListener("storage", (e) => {
        if (e.key === "lachaula_settings") {
            applyVolume();
        }
    });

})();