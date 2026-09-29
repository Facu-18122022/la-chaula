/**
 * generar-sonidos.js
 *
 * Genera los efectos de sonido 8-bit de la interfaz en server/public/sonidos/.
 * No hace falta correrlo para jugar (los .wav ya están en el repo); sirve para
 * retocar un sonido: cambiá sus notas acá y ejecutá
 *
 *     node scripts/generar-sonidos.js
 *
 * También se puede reemplazar cualquier .wav por un sonido propio con el
 * mismo nombre.
 */
const fs = require('fs');
const path = require('path');

const FRECUENCIA_MUESTREO = 22050;
const CARPETA = path.join(__dirname, '..', 'server', 'public', 'sonidos');

// Formas de onda clásicas de consola vieja.
const ondas = {
    cuadrada: fase => (fase % 1 < 0.5 ? 1 : -1),
    pulso: fase => (fase % 1 < 0.25 ? 1 : -1),
    triangular: fase => 1 - 4 * Math.abs((fase % 1) - 0.5),
    seno: fase => Math.sin(fase * Math.PI * 2),
    ruido: () => Math.random() * 2 - 1
};

/**
 * Una nota: { f: frecuencia inicial, f2: frecuencia final (barrido), d: duración en s,
 * onda, vol, ataque, caida (s), vibrato: { f, profundidad } }.
 */
function renderizarNota(nota) {
    const total = Math.round(nota.d * FRECUENCIA_MUESTREO);
    const muestras = new Float32Array(total);
    const onda = ondas[nota.onda || 'cuadrada'];
    const ataque = nota.ataque ?? 0.004;
    const caida = nota.caida ?? nota.d * 0.6;
    let fase = 0;
    for (let i = 0; i < total; i += 1) {
        const t = i / FRECUENCIA_MUESTREO;
        const progreso = i / total;
        let frecuencia = nota.f + ((nota.f2 ?? nota.f) - nota.f) * progreso;
        if (nota.vibrato) frecuencia *= 1 + Math.sin(t * Math.PI * 2 * nota.vibrato.f) * nota.vibrato.profundidad;
        fase += frecuencia / FRECUENCIA_MUESTREO;
        const entrada = Math.min(1, t / ataque);
        const restante = nota.d - t;
        const salida = restante < caida ? Math.max(0, restante / caida) : 1;
        muestras[i] = onda(fase) * (nota.vol ?? 0.5) * entrada * salida;
    }
    return muestras;
}

/** Une notas en secuencia; cada elemento puede ser una nota o un arreglo (acorde/capas). */
function secuencia(partes) {
    const bloques = partes.map(parte => {
        const capas = (Array.isArray(parte) ? parte : [parte]).map(renderizarNota);
        const largo = Math.max(...capas.map(capa => capa.length));
        const mezcla = new Float32Array(largo);
        capas.forEach(capa => capa.forEach((valor, i) => { mezcla[i] += valor; }));
        return mezcla;
    });
    const largoTotal = bloques.reduce((suma, bloque) => suma + bloque.length, 0);
    const salida = new Float32Array(largoTotal);
    let posicion = 0;
    bloques.forEach(bloque => {
        salida.set(bloque, posicion);
        posicion += bloque.length;
    });
    return salida;
}

function escribirWav(nombre, muestras) {
    const datos = Buffer.alloc(muestras.length * 2);
    muestras.forEach((valor, i) => {
        const limitado = Math.max(-1, Math.min(1, valor));
        datos.writeInt16LE(Math.round(limitado * 32767), i * 2);
    });
    const cabecera = Buffer.alloc(44);
    cabecera.write('RIFF', 0);
    cabecera.writeUInt32LE(36 + datos.length, 4);
    cabecera.write('WAVE', 8);
    cabecera.write('fmt ', 12);
    cabecera.writeUInt32LE(16, 16);
    cabecera.writeUInt16LE(1, 20);
    cabecera.writeUInt16LE(1, 22);
    cabecera.writeUInt32LE(FRECUENCIA_MUESTREO, 24);
    cabecera.writeUInt32LE(FRECUENCIA_MUESTREO * 2, 28);
    cabecera.writeUInt16LE(2, 32);
    cabecera.writeUInt16LE(16, 34);
    cabecera.write('data', 36);
    cabecera.writeUInt32LE(datos.length, 40);
    fs.writeFileSync(path.join(CARPETA, `${nombre}.wav`), Buffer.concat([cabecera, datos]));
    console.log(`sonidos/${nombre}.wav`);
}

// Notas (Hz)
const DO5 = 523.25, MI5 = 659.25, SOL5 = 783.99, DO6 = 1046.5, MI6 = 1318.5, SOL6 = 1568;
const SI5 = 987.77, LA5 = 880;

const SONIDOS = {
    // Cada movimiento de la palanca en un menú: blip corto.
    mover: [{ f: 1200, d: 0.045, onda: 'pulso', vol: 0.28, caida: 0.03 }],
    // Aceptar una opción.
    confirmar: [
        { f: LA5, d: 0.05, vol: 0.32 },
        { f: MI6, d: 0.09, vol: 0.32 }
    ],
    // Elegir mapa / iniciar partido: fuerte y largo.
    elegir: [
        { f: DO5, d: 0.07, vol: 0.5 },
        { f: MI5, d: 0.07, vol: 0.5 },
        { f: SOL5, d: 0.07, vol: 0.5 },
        [{ f: DO6, d: 0.3, vol: 0.5 }, { f: SOL5, d: 0.3, onda: 'triangular', vol: 0.4 }]
    ],
    // Volver / cancelar.
    atras: [{ f: 700, f2: 380, d: 0.13, onda: 'cuadrada', vol: 0.3 }],
    // Ficha: el clásico "cling" de dos notas.
    ficha: [
        { f: SI5, d: 0.08, vol: 0.4, caida: 0.01 },
        { f: MI6, d: 0.4, vol: 0.4, caida: 0.35 }
    ],
    // Presionar start en la pantalla de inicio.
    start: [
        { f: SOL5, d: 0.06, vol: 0.45 },
        { f: DO6, d: 0.06, vol: 0.45 },
        { f: MI6, d: 0.06, vol: 0.45 },
        { f: SOL6, d: 0.22, vol: 0.45 }
    ],
    // Patada: golpe seco (ruido + bombo).
    patada: [[
        { f: 1, d: 0.05, onda: 'ruido', vol: 0.35, caida: 0.045 },
        { f: 180, f2: 60, d: 0.09, onda: 'seno', vol: 0.8, caida: 0.07 }
    ]],
    // Gol: fanfarria.
    gol: [
        { f: DO5, d: 0.09, vol: 0.45 },
        { f: MI5, d: 0.09, vol: 0.45 },
        { f: SOL5, d: 0.09, vol: 0.45 },
        { f: DO6, d: 0.16, vol: 0.45 },
        { f: SOL5, d: 0.09, vol: 0.45 },
        [{ f: DO6, d: 0.6, vol: 0.4, caida: 0.4 }, { f: MI6, d: 0.6, onda: 'pulso', vol: 0.25, caida: 0.4 }, { f: DO5, d: 0.6, onda: 'triangular', vol: 0.4, caida: 0.4 }]
    ],
    // Silbato del árbitro (saque y final).
    silbato: [
        { f: 2900, d: 0.16, onda: 'seno', vol: 0.35, vibrato: { f: 38, profundidad: 0.04 }, caida: 0.03 },
        { f: 1, d: 0.06, onda: 'seno', vol: 0 },
        { f: 2900, d: 0.42, onda: 'seno', vol: 0.35, vibrato: { f: 38, profundidad: 0.04 }, caida: 0.12 }
    ],
    // Acción no permitida.
    error: [{ f: 150, d: 0.22, onda: 'cuadrada', vol: 0.3 }]
};

fs.mkdirSync(CARPETA, { recursive: true });
Object.entries(SONIDOS).forEach(([nombre, partes]) => escribirWav(nombre, secuencia(partes)));
