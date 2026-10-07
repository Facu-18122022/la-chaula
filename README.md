# La Chaula ⚽

**La Chaula** es un dinámico juego de fútbol 2D, jugable tanto en modo multijugador local (offline) como en multijugador **online hasta 5 vs 5**, al estilo HaxBall. Construido con Vanilla JavaScript, Canvas API y Node.js + Socket.IO, el juego incluye un motor físico desarrollado desde cero para manejar colisiones, fricción y físicas de la pelota.

> Esta es la rama **`version-online`**. La versión para la cabina arcade está en la rama `develop`.

## Características Principales 🚀

- **Multijugador Online y Local**: 
  - Juega online con tus amigos en salas de hasta 5 vs 5 (por internet o red LAN).
  - O disfruta de un modo de juego en la misma pantalla (Local).
- **Física Realista 2D**: Motor de física propio para gestionar la aceleración de jugadores, el rebote de la pelota en los bordes y las colisiones entre jugadores y pelota.
- **Mapas Dinámicos y Gamificados**: Una variedad de mapas con distintos tamaños (desde 1v1 hasta 5v5), temáticas y colores (Cyberpunk, Volcánico, Micro Arena, etc.).
- **Salas online estilo HaxBall**: cualquiera crea una sala (con contraseña opcional), los demás entran desde la lista o con un link, y el admin elige quién juega en Rojo, Azul o queda de espectador. Chat por sala en tiempo real.
- **Configuración Personalizada**: Ajustes de música y temas que persisten gracias al uso de `localStorage`.
- **Sistema de Audio**: Banda sonora integrada que cambia dinámicamente dependiendo si te encuentras en un menú o dentro de una partida.

## Tecnologías Utilizadas 🛠️

- **Frontend**:
  - HTML5, CSS3, y Vanilla JavaScript.
  - HTML5 `<canvas>` para el renderizado a 60FPS a través de `requestAnimationFrame`.
- **Backend**:
  - Node.js
  - Express.js (para servir archivos estáticos)
  - Socket.IO (para el flujo de datos en tiempo real y arquitectura de red)

## Instalación y Ejecución 💻

Asegúrate de tener instalado [Node.js](https://nodejs.org/) (versión 18 o superior) en tu máquina.

1. **Clona o descarga este repositorio** en tu computadora.
2. **Abre la terminal** en la carpeta principal del proyecto (`la-chaula`).
3. **Instala las dependencias** necesarias (Socket.IO y Express) ejecutando:
   ```bash
   npm install
   ```
4. **Inicia el servidor**:
   ```bash
   npm start
   ```
5. **Juega**: Abre tu navegador y dirígete a `http://localhost:3000`. 
   > *Nota: Si quieres jugar en red LAN con otros dispositivos, tus amigos deben conectarse a la dirección IP local de tu computadora seguida del puerto 3000 (Ej: `http://192.168.0.10:3000`).*
6. **Pruebas automáticas** (salas, admin, partido y sockets):
   ```bash
   npm test
   ```

## Modo Online 🌐

Desde el menú: **JUGAR ONLINE**.

1. Escribí tu nombre y **creá una sala** (nombre, contraseña opcional y máximo de jugadores: de 2 a 10) o **entrá** a una de la lista. También se puede entrar con el código de la sala o con el link que se copia con *Copiar link*.
2. Dentro de la sala aparece el panel con tres columnas: **Rojo · Espectadores · Azul** (máximo 5 por equipo). Los que entran caen en Espectadores.
3. El **admin** (★, el que creó la sala):
   - mueve a cada jugador con las flechas ◀ ▶ o arrastrándolo a otra columna,
   - elige cancha, tiempo, límite de goles y power-ups,
   - puede *Mezclar equipos*, dar admin (★) o echar (✕) a alguien,
   - inicia, pausa (`P`) y detiene el partido.
   Si el admin se va, el admin pasa al jugador más antiguo. Si se destilda *Solo el admin arma equipos*, cada uno puede elegir su lado con *Unirme*.
4. Controles: **flechas o WASD** para moverse, **Espacio o X** para patear (mantenido, como en HaxBall), **Enter** para chatear y **Esc** para mostrar u ocultar el panel de la sala.

Si se corta la conexión (o se recarga la página) hay 15 segundos para volver sin perder el lugar ni el equipo.

**Canchas para muchos jugadores:** *HaxBall Big* (3v3 a 5v5) y *HaxBall Huge* (4v4 a 5v5) replican los estadios grandes de HaxBall; *HaxBall Classic* y las temáticas chicas son mejores para 1v1 a 3v3.

### Cómo funciona por dentro

- El **servidor es el que juega el partido**: corre la física a 60 ticks por segundo y le manda la posición de todo a cada sala 30 veces por segundo. Los navegadores solo mandan qué teclas están apretadas y dibujan, interpolando entre fotos para que se vea fluido. Así nadie puede hacer trampa moviendo su jugador desde el navegador.
- La física es la misma del modo arcade (`fisica-haxball.js`, traída de la rama `develop`).
- Toda la experiencia online es una sola página (`pages/online.html`), así la conexión no se corta al pasar de la lista de salas al partido.

### Subirlo a un servidor (para jugar por internet)

El juego es una sola app de Node que sirve las páginas y los sockets, así que alcanza con cualquier hosting de Node con WebSockets (Render, Railway, Fly.io, un VPS, etc.):

- **Comando de build:** `npm install`
- **Comando de inicio:** `npm start`
- El puerto lo toma de la variable `PORT` (los hostings la ponen solos).
- `GET /salud` responde `{"ok":true}` para el chequeo de salud del hosting.

En un VPS propio: `npm install && PORT=80 npm start` (o detrás de nginx con soporte de WebSockets).

## Estructura del Proyecto 📂

- `server/server.js`: Arranca Express (páginas) y Socket.IO (tiempo real).
- `server/online/`: Todo el modo online del lado del servidor:
  - `salas.js`: salas, equipos (máx. 5v5), admin, chat, reconexión.
  - `partido.js`: el partido (reloj, goles, saque, tiempo extra) sobre la física.
  - `sockets.js`: conecta los eventos de Socket.IO y corre el bucle a 60 Hz.
  - `mapas.js`: canchas disponibles online.
- `server/public/`: Carpeta con todos los archivos estáticos (Frontend).
  - `css/` y `img/`: Estilos visuales e imágenes del juego.
  - `pages/`: Vistas HTML (menú, configuración, partida local y `online.html`).
  - `js/`: Lógica del cliente, dividida en:
    - `online/`: cliente online (`cliente.js`) y dibujo de la cancha (`dibujo.js`).
    - `local/`: Físicas y lógica del modo local (`fisica-haxball.js` es la física compartida con el servidor).
- `test/`: Pruebas automáticas (`npm test`).

## Desarrollo y Contribución 🤝

Todo el código está completamente documentado y comentado en español para facilitar la lectura de la lógica base. Siéntete libre de experimentar, clonar el repositorio y agregar nuevas mecánicas (como power-ups o nuevos mapas).
