/**
 * dibujo.js (online)
 *
 * Dibuja la cancha, los jugadores y la pelota en el canvas, al estilo HaxBall:
 * discos de colores con número, nombre abajo, borde blanco mientras se
 * mantiene "patear", postes redondos y redes.
 * Solo dibuja: las posiciones vienen del servidor.
 */
(function (global) {
    const COLORES = { red: '#e56e56', blue: '#5689e5' };
    const COLOR_POWER = { SPEED: '#ffd700', BIG: '#ff9f43', SUPER_KICK: '#ff0055' };
    const LETRA_POWER = { SPEED: 'V', BIG: 'G', SUPER_KICK: 'P' };

    function dibujarCancha(ctx, mapa) {
        const { field, goalTop, goalBottom } = mapa;
        const profundidad = mapa.profundidadArco;
        const centroX = mapa.width / 2;
        const centroY = mapa.height / 2;

        ctx.fillStyle = mapa.bg || '#111827';
        ctx.fillRect(0, 0, mapa.width, mapa.height);
        ctx.fillStyle = mapa.goalBg || '#0b1220';
        ctx.fillRect(field.left - profundidad, goalTop, profundidad, goalBottom - goalTop);
        ctx.fillRect(field.right, goalTop, profundidad, goalBottom - goalTop);
        ctx.fillStyle = mapa.fieldColor || '#273444';
        ctx.fillRect(field.left, field.top, field.right - field.left, field.bottom - field.top);

        if (mapa.theme === 'haxball') {
            // Césped a franjas como el fondo "grass" de HaxBall.
            ctx.fillStyle = 'rgba(0, 0, 0, .045)';
            for (let x = field.left; x < field.right; x += 128) {
                ctx.fillRect(x, field.top, Math.min(64, field.right - x), field.bottom - field.top);
            }
        }

        ctx.strokeStyle = mapa.lineColor || '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(field.left, field.top, field.right - field.left, field.bottom - field.top);
        ctx.beginPath();
        ctx.moveTo(centroX, field.top);
        ctx.lineTo(centroX, field.bottom);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centroX, centroY, mapa.radioSaque, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        [[field.left, field.left - profundidad], [field.right, field.right + profundidad]].forEach(([boca, fondo]) => {
            ctx.beginPath();
            ctx.moveTo(boca, goalTop);
            ctx.lineTo(fondo, goalTop);
            ctx.lineTo(fondo, goalBottom);
            ctx.lineTo(boca, goalBottom);
            ctx.stroke();
        });
    }

    function dibujarPostes(ctx, mapa) {
        const { field, goalTop, goalBottom } = mapa;
        [[field.left, goalTop, 'red'], [field.left, goalBottom, 'red'], [field.right, goalTop, 'blue'], [field.right, goalBottom, 'blue']]
            .forEach(([x, y, lado]) => {
                ctx.beginPath();
                ctx.arc(x, y, mapa.radioPoste || 5, 0, Math.PI * 2);
                ctx.fillStyle = lado === 'red' ? '#ffcccc' : '#ccccff';
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
    }

    function dibujarPowerUps(ctx, powerUps) {
        powerUps.forEach(([x, y, tipo, r]) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = COLOR_POWER[tipo] || '#fff';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = '#000';
            ctx.font = `700 ${Math.round(r)}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(LETRA_POWER[tipo] || '?', x, y + 1);
        });
    }

    /**
     * jugador: { x, y, r, equipo, pateando, power, nombre, numero, esVos }
     */
    function dibujarJugador(ctx, jugador) {
        const { x, y, r } = jugador;
        if (jugador.esVos) {
            // Halo para encontrarse rápido en la cancha.
            ctx.beginPath();
            ctx.arc(x, y, r + 6, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, .45)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORES[jugador.equipo] || '#999';
        ctx.fill();
        if (jugador.power) {
            ctx.strokeStyle = COLOR_POWER[jugador.power] || '#fff';
            ctx.lineWidth = 6;
            ctx.stroke();
        }
        ctx.strokeStyle = jugador.pateando ? '#fff' : '#000';
        ctx.lineWidth = jugador.pateando ? 3 : 2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(r * 0.95)}px Arial, sans-serif`;
        ctx.fillText(String(jugador.numero || ''), x, y + 1);

        ctx.font = '700 13px Arial, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
        ctx.strokeText(jugador.nombre || '', x, y + r + 12);
        ctx.fillStyle = jugador.esVos ? '#ffe600' : '#fff';
        ctx.fillText(jugador.nombre || '', x, y + r + 12);
    }

    function dibujarPelota(ctx, pelota) {
        ctx.beginPath();
        ctx.arc(pelota.x, pelota.y, pelota.r, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function dibujarCartel(ctx, mapa, texto) {
        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, .45)';
        ctx.fillRect(0, 0, mapa.width, mapa.height);
        ctx.font = `900 ${Math.round(Math.max(36, mapa.width * 0.06))}px "Arial Black", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#020617';
        ctx.strokeText(texto, mapa.width / 2, mapa.height / 2);
        ctx.fillStyle = '#fff';
        ctx.fillText(texto, mapa.width / 2, mapa.height / 2);
        ctx.restore();
    }

    /**
     * escena: { mapa, jugadores: [...], pelota | null, powerUps: [], cartel: string | null }
     */
    function dibujarEscena(ctx, escena) {
        const { mapa } = escena;
        ctx.clearRect(0, 0, mapa.width, mapa.height);
        dibujarCancha(ctx, mapa);
        dibujarPowerUps(ctx, escena.powerUps || []);
        (escena.jugadores || []).forEach(jugador => dibujarJugador(ctx, jugador));
        if (escena.pelota) dibujarPelota(ctx, escena.pelota);
        dibujarPostes(ctx, mapa);
        if (escena.cartel) dibujarCartel(ctx, mapa, escena.cartel);
    }

    global.DibujoOnline = { dibujarEscena, COLORES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
