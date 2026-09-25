/**
 * local-config.js
 * 
 * Interfaz de configuración para el modo local.
 * Permite a los jugadores configurar las opciones de una partida offline,
 * como la duración del partido, límite de goles y elegir el mapa,
 * mostrando un render de previsualización del diseño seleccionado.
 */
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

    function dibujarFondoPreviewTematico(mapa, time) {
        const width = mapa.width;
        const height = mapa.height;
        const gradient = mapPreviewContext.createRadialGradient(width / 2, height / 2, 30, width / 2, height / 2, Math.max(width, height));

        switch (mapa.theme) {
            case 'frozen': gradient.addColorStop(0, '#bfe6ff'); gradient.addColorStop(1, '#1d4ed8'); break;
            case 'desert': gradient.addColorStop(0, '#f7d28d'); gradient.addColorStop(1, '#7c2d12'); break;
            case 'street': gradient.addColorStop(0, '#3b4252'); gradient.addColorStop(1, '#111827'); break;
            case 'champions': gradient.addColorStop(0, '#214a7a'); gradient.addColorStop(1, '#0f172a'); break;
            case 'cyberpunk': gradient.addColorStop(0, '#32104d'); gradient.addColorStop(1, '#090b18'); break;
            case 'micro': gradient.addColorStop(0, '#9a4d18'); gradient.addColorStop(1, '#2d160b'); break;
            case 'titan': gradient.addColorStop(0, '#4c245f'); gradient.addColorStop(1, '#1b1022'); break;
            case 'tunnel': gradient.addColorStop(0, '#14532d'); gradient.addColorStop(1, '#062312'); break;
            case 'volcanic': gradient.addColorStop(0, '#8b2f1c'); gradient.addColorStop(1, '#160b0b'); break;
            default: gradient.addColorStop(0, '#1f2937'); gradient.addColorStop(1, '#050813'); break;
        }

        mapPreviewContext.fillStyle = gradient;
        mapPreviewContext.fillRect(0, 0, width, height);

        if (mapa.theme === 'classic') {
            for (let i = 0; i < 14; i++) {
                const x = ((i * 91 + time * 18) % (width + 50)) - 25;
                const y = ((i * 53 + time * 14) % (height + 30)) - 15;
                mapPreviewContext.fillStyle = `rgba(255,255,255,${0.08 + (i % 4) * 0.04})`;
                mapPreviewContext.fillRect(x, y, 4, 4);
            }
        }

        if (mapa.theme === 'street') {
            for (let i = -2; i < 12; i++) {
                const offset = (time * 120 + i * 120) % (width + 200);
                mapPreviewContext.fillStyle = `rgba(255, 159, 67, ${0.10 + (i % 3) * 0.05})`;
                mapPreviewContext.fillRect(offset - 90, 0, 28, height);
            }
        }

        if (mapa.theme === 'frozen') {
            for (let i = 0; i < 28; i++) {
                const x = ((i * 113 + time * 28) % (width + 40)) - 20;
                const y = ((i * 71 + time * (18 + (i % 3) * 7)) % (height + 30)) - 15;
                mapPreviewContext.fillStyle = `rgba(255,255,255,${0.55 + (i % 5) * 0.08})`;
                mapPreviewContext.beginPath();
                mapPreviewContext.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
                mapPreviewContext.fill();
            }
        }

        if (mapa.theme === 'desert') {
            for (let i = 0; i < 10; i++) {
                const y = height * 0.2 + i * (height / 10);
                mapPreviewContext.beginPath();
                mapPreviewContext.moveTo(-15, y + 18);
                for (let x = -15; x <= width + 15; x += 22) {
                    const wave = Math.sin((x * 0.04) + time * 1.2 + i) * 16;
                    mapPreviewContext.lineTo(x, y + wave);
                }
                mapPreviewContext.strokeStyle = `rgba(245, 158, 11, ${0.18 + i * 0.04})`;
                mapPreviewContext.lineWidth = 2;
                mapPreviewContext.stroke();
            }
        }

        if (mapa.theme === 'champions') {
            for (let i = 0; i < 8; i++) {
                const x = ((i * 170 + time * 80) % (width + 160)) - 80;
                mapPreviewContext.fillStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.02})`;
                mapPreviewContext.fillRect(x, 0, 34, height);
            }
        }

        if (mapa.theme === 'cyberpunk') {
            for (let i = 0; i < 12; i++) {
                const y = (i * 56 + time * 35) % (height + 35);
                mapPreviewContext.strokeStyle = `rgba(0,255,204,${0.12 + i * 0.03})`;
                mapPreviewContext.beginPath();
                mapPreviewContext.moveTo(0, y);
                mapPreviewContext.lineTo(width, y + Math.sin(time + i) * 10);
                mapPreviewContext.stroke();
            }
        }

        if (mapa.theme === 'micro') {
            for (let i = 0; i < 24; i++) {
                const x = ((i * 55 + time * 26) % (width + 20)) - 10;
                const y = ((i * 41 + time * 16) % (height + 20)) - 10;
                mapPreviewContext.fillStyle = `rgba(251, 191, 36, ${0.18 + (i % 4) * 0.06})`;
                mapPreviewContext.beginPath();
                mapPreviewContext.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
                mapPreviewContext.fill();
            }
        }

        if (mapa.theme === 'titan') {
            for (let i = 0; i < 6; i++) {
                const radius = 110 + i * 40 + Math.sin(time + i) * 20;
                const x = width * 0.5 + Math.sin(time * 0.7 + i) * (width * 0.25);
                const y = height * 0.5 + Math.cos(time * 0.8 + i) * (height * 0.18);
                mapPreviewContext.beginPath();
                mapPreviewContext.arc(x, y, radius, 0, Math.PI * 2);
                mapPreviewContext.strokeStyle = `rgba(245, 158, 11, ${0.08 + i * 0.03})`;
                mapPreviewContext.lineWidth = 2;
                mapPreviewContext.stroke();
            }
        }

        if (mapa.theme === 'tunnel') {
            for (let i = 0; i < 9; i++) {
                const offset = ((time * 80 + i * 90) % (width + 60)) - 30;
                mapPreviewContext.strokeStyle = `rgba(186, 230, 253, ${0.16 + i * 0.04})`;
                mapPreviewContext.beginPath();
                mapPreviewContext.moveTo(offset, height * 0.2);
                mapPreviewContext.lineTo(offset + 80, height * 0.8);
                mapPreviewContext.stroke();
            }
        }

        if (mapa.theme === 'volcanic') {
            for (let i = 0; i < 24; i++) {
                const x = ((i * 91 + time * 42) % (width + 30)) - 15;
                const y = ((i * 64 + time * (18 + (i % 2) * 12)) % (height + 28)) - 14;
                mapPreviewContext.fillStyle = `rgba(251, 146, 60, ${0.18 + (i % 3) * 0.08})`;
                mapPreviewContext.beginPath();
                mapPreviewContext.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
                mapPreviewContext.fill();
            }
        }
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

        const tiempo = performance.now() * 0.001;
        mapPreviewContext.clearRect(0, 0, mapa.width, mapa.height);
        dibujarFondoPreviewTematico(mapa, tiempo);
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

    function animarPreview() {
        actualizarMapa();
        requestAnimationFrame(animarPreview);
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
    animarPreview();
})();