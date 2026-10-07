/**
 * Prueba de punta a punta del modo online con sockets reales:
 * levanta el servidor, conecta varios clientes, arma la sala y juega.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: conectar } = require('socket.io-client');
const { crearServidor } = require('../server/server.js');

function emitir(cliente, evento, datos = {}) {
    return new Promise(resolve => cliente.emit(evento, datos, resolve));
}

function esperar(cliente, evento, condicion = () => true, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const temporizador = setTimeout(() => {
            cliente.off(evento, oyente);
            reject(new Error(`no llegó ${evento}`));
        }, timeoutMs);
        function oyente(datos) {
            if (!condicion(datos)) return;
            clearTimeout(temporizador);
            cliente.off(evento, oyente);
            resolve(datos);
        }
        cliente.on(evento, oyente);
    });
}

test('online: crear sala, unirse, armar equipos, jugar y chatear', async () => {
    const servidor = crearServidor();
    await new Promise(resolve => servidor.server.listen(0, resolve));
    const url = `http://localhost:${servidor.server.address().port}`;
    const clientes = [];
    const nuevoCliente = () => {
        const cliente = conectar(url, { transports: ['websocket'], forceNew: true });
        clientes.push(cliente);
        return new Promise(resolve => cliente.on('connect', () => resolve(cliente)));
    };

    try {
        const admin = await nuevoCliente();
        const invitado = await nuevoCliente();
        const curioso = await nuevoCliente();

        const listaActualizada = esperar(curioso, 'salas:lista', lista => lista.length === 1);
        const creada = await emitir(admin, 'sala:crear', { nombreJugador: 'Admin', nombre: 'Sala test', clave: '1234' });
        assert.equal(creada.ok, true);
        const lista = await listaActualizada;
        assert.equal(lista[0].conClave, true);

        assert.equal((await emitir(invitado, 'sala:unirse', { salaId: creada.salaId, nombreJugador: 'Invitado', clave: 'x' })).pideClave, true);
        const unido = await emitir(invitado, 'sala:unirse', { salaId: creada.salaId, nombreJugador: 'Invitado', clave: '1234' });
        assert.equal(unido.ok, true);

        // El invitado no puede elegir equipo; el admin sí.
        assert.ok((await emitir(invitado, 'sala:mover', { jugadorId: unido.tuId, equipo: 'blue' })).error);
        const estadoConAzul = esperar(invitado, 'sala:estado', sala => sala.jugadores.some(j => j.id === unido.tuId && j.equipo === 'blue'));
        assert.equal((await emitir(admin, 'sala:mover', { jugadorId: unido.tuId, equipo: 'blue' })).ok, true);
        await estadoConAzul;

        const chat = esperar(admin, 'sala:chat', mensaje => mensaje.texto === 'buenas');
        await emitir(invitado, 'sala:chat', { texto: 'buenas' });
        assert.equal((await chat).de, 'Invitado');

        const inicio = esperar(invitado, 'partido:inicio');
        assert.equal((await emitir(admin, 'partido:iniciar')).ok, true);
        assert.equal((await inicio).mapa.id, 'hb-big');

        // El invitado (azul) se mueve hacia arriba y el servidor lo refleja.
        const primera = await esperar(invitado, 'partido:estado');
        const yInicial = primera.j.find(j => j[0] === unido.tuId)[2];
        invitado.emit('entrada', 1);
        const despues = await esperar(invitado, 'partido:estado', foto => foto.j.find(j => j[0] === unido.tuId)[2] < yInicial - 20);
        assert.ok(despues.j.length === 2);
        invitado.emit('entrada', 0);

        // Pausa y detener.
        await emitir(admin, 'partido:pausa');
        const pausado = await esperar(admin, 'partido:estado', foto => foto.p === 1);
        assert.equal(pausado.p, 1);
        const detenido = esperar(invitado, 'partido:detenido');
        await emitir(admin, 'partido:detener');
        await detenido;
    } finally {
        clientes.forEach(cliente => cliente.close());
        servidor.cerrar();
    }
});
