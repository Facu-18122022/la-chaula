(function () {
    const mapas = Array.isArray(window.MAPAS) ? window.MAPAS : [];
    const matchTimeSelect = document.getElementById('localMatchTime');
    const goalLimitSelect = document.getElementById('localGoalLimit');
    const mapName = document.getElementById('mapName');
    const mapInfo = document.getElementById('mapInfo');
    const mapPreviewCanvas = document.getElementById('mapPreviewCanvas');
    const mapPreviewContext = mapPreviewCanvas.getContext('2d');
    const mapCard = mapInfo.closest('.panel-card');
    const adminContent = document.querySelector('.admin-content');
    const message = document.getElementById('localConfigMessage');
    const startButton = document.getElementById('startLocalMatch');
    const backButton = document.getElementById('backButton');
    let mapaIndex = 0;

    function ajustarLayoutPreview() {
        const esMovil = window.matchMedia('(max-width: 700px)').matches;
        adminContent.style.gridTemplateColumns = esMovil ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 2fr)';
        mapCard.style.gridColumn = 'auto';
    }

    function dibujarPreviewMapa(mapa) {
        mapPreviewCanvas.width = mapa.width;
        mapPreviewCanvas.height = mapa.height;
        mapPreviewCanvas.style.width = '100%';
        mapPreviewCanvas.style.height = 'auto';

        const fieldLeft = 80;
        const fieldRight = mapa.width - 80;
        const fieldTop = 40;
        const fieldBottom = mapa.height - 40;
        const goalWidth = 45;
        const goalTop = mapa.height / 2 - mapa.goalHeight / 2;
        const goalBottom = mapa.height / 2 + mapa.goalHeight / 2;
        const centerX = mapa.width / 2;
        const centerY = mapa.height / 2;

        mapPreviewContext.clearRect(0, 0, mapa.width, mapa.height);
        mapPreviewContext.fillStyle = mapa.bg;
        mapPreviewContext.fillRect(0, 0, mapa.width, mapa.height);
        mapPreviewContext.fillStyle = mapa.goalBg || mapa.bg;
        mapPreviewContext.fillRect(fieldLeft - goalWidth, goalTop, goalWidth, goalBottom - goalTop);
        mapPreviewContext.fillRect(fieldRight, goalTop, goalWidth, goalBottom - goalTop);
        mapPreviewContext.fillStyle = mapa.fieldColor;
        mapPreviewContext.fillRect(fieldLeft, fieldTop, fieldRight - fieldLeft, fieldBottom - fieldTop);

        mapPreviewContext.strokeStyle = mapa.lineColor || '#ffffff';
        mapPreviewContext.lineWidth = 3;
        mapPreviewContext.strokeRect(fieldLeft, fieldTop, fieldRight - fieldLeft, fieldBottom - fieldTop);
        mapPreviewContext.beginPath();
        mapPreviewContext.moveTo(centerX, fieldTop);
        mapPreviewContext.lineTo(centerX, fieldBottom);
        mapPreviewContext.stroke();
        mapPreviewContext.beginPath();
        mapPreviewContext.arc(centerX, centerY, mapa.width * 0.085, 0, Math.PI * 2);
        mapPreviewContext.stroke();
        mapPreviewContext.strokeRect(fieldLeft - goalWidth, goalTop, goalWidth, goalBottom - goalTop);
        mapPreviewContext.strokeRect(fieldRight, goalTop, goalWidth, goalBottom - goalTop);
    }

    function actualizarMapa() {
        if (!mapas.length) {
            mapName.textContent = 'No hay mapas disponibles';
            mapPreviewContext.clearRect(0, 0, mapPreviewCanvas.width, mapPreviewCanvas.height);
            return;
        }

        const mapa = mapas[mapaIndex];
        mapName.textContent = mapa.name;
        dibujarPreviewMapa(mapa);
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

    window.addEventListener('resize', ajustarLayoutPreview);
    ajustarLayoutPreview();
    actualizarMapa();
})();