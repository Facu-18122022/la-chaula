/**
 * server.js
 *
 * Punto de entrada principal para el backend del juego.
 * Configura el servidor Express para servir archivos estáticos (frontend),
 * e inicializa Socket.IO para el modo online: salas, panel de admin,
 * equipos de hasta 5v5, chat y los partidos (la física corre acá, en el
 * servidor, y los navegadores solo mandan sus teclas y dibujan).
 * La lógica online está en server/online/.
 */
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { iniciarOnline } = require("./online/sockets.js");
const ListaMusica = require("./lista-musica.js");

const publicPath = path.join(__dirname, 'public');

// Los hostings (Render, Railway, etc.) indican el puerto con la variable PORT.
const PORT = Number(process.env.PORT) || 3000;

function crearServidor() {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    app.use(express.static(publicPath));

    // Lista de canciones (como en develop): las de musica/ suenan en los menús
    // y las de musica/partido/ en el partido. Para sumar una, copiar el .mp3.
    app.get('/api/musica', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(ListaMusica.listarTodo('/musica/'));
    });
    try {
        ListaMusica.escribirListaArchivo();
    } catch (error) {
        console.warn('No se pudo actualizar musica/lista.js:', error.message);
    }

    // Redirigir raíz a index.html
    app.get('/', (req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });

    // Para que el hosting sepa que el servidor está vivo.
    app.get('/salud', (req, res) => {
        res.json({ ok: true });
    });

    const online = iniciarOnline(io);

    return {
        app,
        server,
        io,
        online,
        cerrar() {
            online.cerrar();
            io.close();
            server.close();
        }
    };
}

if (require.main === module) {
    const { server } = crearServidor();
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔══════════════════════════════════════╗
║          🟡  La Chaula  🟡            ║
╠══════════════════════════════════════╣
║  Servidor corriendo en               ║
║  http://localhost:${PORT}             ║
║                                      ║
║  Salas online hasta 5v5 habilitadas  ║
╚══════════════════════════════════════╝
`);
    });
}

module.exports = { crearServidor };
