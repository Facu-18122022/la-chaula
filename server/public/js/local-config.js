(function () {
    const mapas = Array.isArray(window.MAPAS) ? window.MAPAS : [];
    const matchTimeSelect = document.getElementById('localMatchTime');
    const goalLimitSelect = document.getElementById('localGoalLimit');
    const mapName = document.getElementById('mapName');
    const mapInfo = document.getElementById('mapInfo');
    const message = document.getElementById('localConfigMessage');
    const startButton = document.getElementById('startLocalMatch');
    const backButton = document.getElementById('backButton');
    let mapaIndex = 0;

    function actualizarMapa() {
        if (!mapas.length) {
            mapName.textContent = 'No hay mapas disponibles';
            mapInfo.textContent = '';
            return;
        }

        const mapa = mapas[mapaIndex];
        mapName.textContent = mapa.name;
        mapInfo.textContent = `${mapa.width} x ${mapa.height} · Arco ${mapa.goalHeight}px`;
    }

    function mostrarError(texto) {
        message.textContent = texto;
    }

    function validarConfiguracion() {
        const matchTime = Number(matchTimeSelect.value);
        const rawGoalLimit = goalLimitSelect.value;
        const goalLimit = rawGoalLimit === 'null' ? null : Number(rawGoalLimit);

        if (![3, 5, 7].includes(matchTime)) return null;
        if (goalLimit !== null && ![3, 5, 10].includes(goalLimit)) return null;
        if (!mapas.length || !mapas[mapaIndex]) return null;

        return { matchTime, goalLimit };
    }

    document.getElementById('prevMap').addEventListener('click', function () {
        if (!mapas.length) return;
        mapaIndex = (mapaIndex - 1 + mapas.length) % mapas.length;
        actualizarMapa();
    });

    document.getElementById('nextMap').addEventListener('click', function () {
        if (!mapas.length) return;
        mapaIndex = (mapaIndex + 1) % mapas.length;
        actualizarMapa();
    });

    startButton.addEventListener('click', function () {
        const configuracion = validarConfiguracion();
        if (!configuracion) {
            mostrarError('Seleccioná un tiempo, un límite de goles y un mapa válidos.');
            return;
        }

        message.textContent = '';
        localStorage.setItem('localMatchTime', String(configuracion.matchTime));
        localStorage.setItem('localGoalLimit', configuracion.goalLimit === null ? 'null' : String(configuracion.goalLimit));
        localStorage.setItem('localMapIndex', String(mapaIndex));
        window.location.href = 'juego-local.html';
    });

    backButton.addEventListener('click', function () {
        window.location.href = 'menu.html';
    });

    actualizarMapa();
})();