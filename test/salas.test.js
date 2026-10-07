/**
 * Pruebas de la lógica de salas online (sin red).
 * Se corren con: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { GestorSalas, MAX_POR_EQUIPO } = require('../server/online/salas.js');

function crearGestor({ ahora = () => 1000 } = {}) {
    const enviados = [];
    const gestor = new GestorSalas({
        ahora,
        aleatorio: () => 0.42,
        emisor: {
            aSala: (salaId, evento, datos) => enviados.push({ a: `sala:${salaId}`, evento, datos }),
            aSocket: (socketId, evento, datos) => enviados.push({ a: socketId, evento, datos }),
            aVestibulo: (evento, datos) => enviados.push({ a: 'vestibulo', evento, datos }),
            unirSocket: () => {},
            sacarSocket: () => {}
        }
    });
    return { gestor, enviados };
}

function salaConGente(cantidad) {
    const contexto = crearGestor();
    const creada = contexto.gestor.crearSala('s0', { nombreJugador: 'Admin', nombre: 'Prueba' });
    for (let i = 1; i < cantidad; i += 1) contexto.gestor.unirse(`s${i}`, { salaId: creada.salaId, nombreJugador: `Jugador${i}` });
    const sala = contexto.gestor.salas.get(creada.salaId);
    return { ...contexto, sala, salaId: creada.salaId };
}

test('crear sala: el creador es admin y empieza en Rojo', () => {
    const { gestor } = crearGestor();
    const respuesta = gestor.crearSala('s1', { nombreJugador: '  Facu  ', nombre: 'Los pibes' });
    assert.equal(respuesta.ok, true);
    const jugador = respuesta.sala.jugadores[0];
    assert.equal(jugador.nombre, 'Facu');
    assert.equal(jugador.admin, true);
    assert.equal(jugador.equipo, 'red');
    assert.equal(respuesta.sala.nombre, 'Los pibes');
    assert.equal(gestor.listaPublica().length, 1);
});

test('los que entran quedan en espectadores y los nombres repetidos se numeran', () => {
    const { sala, gestor, salaId } = salaConGente(2);
    const otro = gestor.unirse('sx', { salaId, nombreJugador: 'jugador1' });
    assert.equal(sala.jugadores[1].equipo, null);
    assert.equal(otro.ok, true);
    assert.equal(sala.jugadores[2].nombre, 'jugador1 2');
});

test('sala con contraseña y sala llena', () => {
    const { gestor } = crearGestor();
    const { salaId } = gestor.crearSala('a', { nombreJugador: 'A', clave: 'secreta', maxJugadores: 2 });
    assert.equal(gestor.unirse('b', { salaId, nombreJugador: 'B', clave: 'mal' }).pideClave, true);
    assert.equal(gestor.unirse('b', { salaId, nombreJugador: 'B', clave: 'secreta' }).ok, true);
    assert.match(gestor.unirse('c', { salaId, nombreJugador: 'C', clave: 'secreta' }).error, /llena/);
});

test('solo el admin mueve jugadores y hay máximo 5 por equipo', () => {
    const { gestor, sala } = salaConGente(10);
    const [admin, ...resto] = sala.jugadores;
    assert.match(gestor.mover('s1', { jugadorId: resto[1].id, equipo: 'blue' }).error, /admin/);
    resto.slice(0, 4).forEach((jugador, i) => assert.equal(gestor.mover('s0', { jugadorId: jugador.id, equipo: 'red' }).ok, true, `rojo ${i}`));
    assert.equal(sala.jugadores.filter(j => j.equipo === 'red').length, MAX_POR_EQUIPO);
    assert.match(gestor.mover('s0', { jugadorId: resto[4].id, equipo: 'red' }).error, /5 jugadores/);
    resto.slice(4, 9).forEach(jugador => gestor.mover('s0', { jugadorId: jugador.id, equipo: 'blue' }));
    assert.equal(sala.jugadores.filter(j => j.equipo === 'blue').length, 5);
    assert.equal(admin.equipo, 'red');
});

test('con equipos desbloqueados cada uno puede cambiarse solo', () => {
    const { gestor, sala } = salaConGente(2);
    const invitado = sala.jugadores[1];
    assert.ok(gestor.mover('s1', { jugadorId: invitado.id, equipo: 'blue' }).error);
    gestor.configurar('s0', { equiposBloqueados: false });
    assert.equal(gestor.mover('s1', { jugadorId: invitado.id, equipo: 'blue' }).ok, true);
    assert.ok(gestor.mover('s1', { jugadorId: sala.jugadores[0].id, equipo: 'blue' }).error, 'no puede mover a otro');
});

test('si el admin se va, el admin pasa al más antiguo; si se van todos la sala se cierra', () => {
    const { gestor, sala, salaId } = salaConGente(3);
    gestor.salir('s0');
    assert.equal(sala.jugadores[0].admin, true);
    assert.equal(sala.jugadores[0].nombre, 'Jugador1');
    gestor.salir('s1');
    gestor.salir('s2');
    assert.equal(gestor.salas.has(salaId), false);
});

test('reconexión: vuelve con el mismo lugar si entra a tiempo con su token', () => {
    let reloj = 1000;
    const { gestor } = crearGestor({ ahora: () => reloj });
    const creada = gestor.crearSala('a', { nombreJugador: 'Admin' });
    const sala = gestor.salas.get(creada.salaId);
    gestor.desconectar('a');
    assert.equal(sala.jugadores[0].desconectadoDesde, 1000);
    reloj += 5000;
    gestor.limpiarDesconectados();
    const vuelta = gestor.unirse('a2', { salaId: creada.salaId, token: creada.token });
    assert.equal(vuelta.reconectado, true);
    assert.equal(vuelta.tuId, creada.tuId);
    assert.equal(sala.jugadores[0].admin, true);
    assert.equal(sala.jugadores[0].equipo, 'red');

    gestor.desconectar('a2');
    reloj += 20000;
    gestor.limpiarDesconectados();
    assert.equal(gestor.salas.has(creada.salaId), false, 'pasada la gracia se lo saca');
});

test('echar a un jugador lo saca de la sala y le avisa', () => {
    const { gestor, sala, enviados } = salaConGente(2);
    const echado = sala.jugadores[1];
    assert.equal(gestor.echar('s0', { jugadorId: echado.id }).ok, true);
    assert.equal(sala.jugadores.length, 1);
    assert.ok(enviados.some(envio => envio.a === 's1' && envio.evento === 'sala:expulsado'));
    assert.ok(gestor.echar('s0', { jugadorId: sala.jugadores[0].id }).error);
});

test('chat: limpia el texto y frena el spam', () => {
    const { gestor, enviados } = salaConGente(1);
    gestor.chat('s0', '  hola\u0007   che  ');
    const mensaje = enviados.filter(envio => envio.evento === 'sala:chat' && !envio.datos.sistema).pop();
    assert.equal(mensaje.datos.texto, 'hola che');
    for (let i = 0; i < 4; i += 1) gestor.chat('s0', `msg ${i}`);
    assert.match(gestor.chat('s0', 'uno más').error, /rápido/);
});

test('configuración: solo valores válidos y no durante el partido', () => {
    const { gestor, sala } = salaConGente(2);
    assert.ok(gestor.configurar('s0', { tiempoMin: 4 }).error);
    assert.equal(gestor.configurar('s0', { tiempoMin: 5, goles: 0, mapaId: 'hb-huge', powerUps: true }).ok, true);
    assert.deepEqual(sala.config, { mapaId: 'hb-huge', tiempoMin: 5, goles: 0, powerUps: true, equiposBloqueados: true });
    assert.ok(gestor.configurar('s1', { tiempoMin: 3 }).error, 'no admin');
    gestor.iniciarPartido('s0');
    assert.match(gestor.configurar('s0', { mapaId: 'hb-classic' }).error, /Detené/);
});

test('mezclar reparte parejo en dos equipos', () => {
    const { gestor, sala } = salaConGente(7);
    gestor.mezclarEquipos('s0');
    const rojos = sala.jugadores.filter(j => j.equipo === 'red').length;
    const azules = sala.jugadores.filter(j => j.equipo === 'blue').length;
    assert.equal(rojos + azules, 7);
    assert.ok(Math.abs(rojos - azules) <= 1);
});

test('partido 5v5: arranca, el saque y un gol con goleador', () => {
    const { gestor, sala, enviados } = salaConGente(10);
    sala.jugadores.slice(1, 5).forEach(j => gestor.mover('s0', { jugadorId: j.id, equipo: 'red' }));
    sala.jugadores.slice(5, 10).forEach(j => gestor.mover('s0', { jugadorId: j.id, equipo: 'blue' }));
    assert.equal(gestor.iniciarPartido('s0').ok, true);
    assert.equal(sala.partido.estado.players.length, 10);

    // El admin (rojo) patea la pelota parada hacia el arco azul.
    const estado = sala.partido.estado;
    const admin = estado.players.find(j => j.id === sala.jugadores[0].id);
    estado.players.forEach(j => { if (j !== admin) j.y = estado.field.top + 20; });
    admin.x = estado.ball.x - (admin.r + estado.ball.r + 1);
    admin.y = estado.ball.y;
    gestor.entrada('s0', 16);
    gestor.tick(1000 / 60);
    gestor.entrada('s0', 0);
    assert.equal(sala.partido.fase, 'JUGANDO');
    estado.ball.x = estado.field.right - 30;
    estado.ball.vx = 8;
    for (let i = 0; i < 30 && sala.partido.fase !== 'GOL'; i += 1) gestor.tick(1000 / 60);
    assert.equal(sala.partido.fase, 'GOL');
    assert.deepEqual(sala.partido.marcador, { red: 1, blue: 0 });
    const gol = enviados.find(envio => envio.evento === 'partido:evento' && envio.datos.tipo === 'gol');
    assert.equal(gol.datos.autor, 'Admin');
    assert.ok(enviados.some(envio => envio.evento === 'partido:estado'));
});

test('entrar, salir o cambiar de equipo con el partido en curso', () => {
    const { gestor, sala } = salaConGente(3);
    gestor.iniciarPartido('s0');
    assert.equal(sala.partido.estado.players.length, 1);
    gestor.mover('s0', { jugadorId: sala.jugadores[1].id, equipo: 'blue' });
    assert.equal(sala.partido.estado.players.length, 2);
    assert.equal(sala.partido.estado.kickoffTeam, 'red');
    gestor.mover('s0', { jugadorId: sala.jugadores[0].id, equipo: null });
    assert.equal(sala.partido.estado.players.length, 1);
    assert.equal(sala.partido.estado.kickoffTeam, 'blue', 'si Rojo queda vacío saca Azul');
    gestor.salir('s1');
    assert.equal(sala.partido.estado.players.length, 0);
});

test('el partido termina por límite de goles y la sala vuelve a la espera', () => {
    const { gestor, sala, enviados } = salaConGente(2);
    gestor.configurar('s0', { goles: 1 });
    gestor.mover('s0', { jugadorId: sala.jugadores[1].id, equipo: 'blue' });
    gestor.iniciarPartido('s0');
    const estado = sala.partido.estado;
    estado.waitingForKickOff = false;
    estado.ball.x = estado.field.left + 30;
    estado.ball.vx = -8;
    for (let i = 0; i < 400 && sala.partido; i += 1) gestor.tick(1000 / 60);
    assert.equal(sala.partido, null);
    assert.equal(sala.ultimoResultado.ganador, 'blue');
    assert.ok(enviados.some(envio => envio.evento === 'partido:fin'));
});
