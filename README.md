# La Chaula ⚽

**La Chaula** es un dinámico juego de fútbol 2D, jugable tanto en modo multijugador local (offline) como en multijugador online a través de una red local. Construido con Vanilla JavaScript, Canvas API y Node.js + Socket.IO, el juego incluye un motor físico desarrollado desde cero para manejar colisiones, fricción y físicas de la pelota.

## Características Principales 🚀

- **Multijugador Online y Local**: 
  - Juega con tus amigos conectándote a las diferentes salas mediante red LAN.
  - O disfruta de un modo de juego en la misma pantalla (Local).
- **Física Realista 2D**: Motor de física propio para gestionar la aceleración de jugadores, el rebote de la pelota en los bordes y las colisiones entre jugadores y pelota.
- **Mapas Dinámicos y Gamificados**: Una variedad de mapas con distintos tamaños (desde 1v1 hasta 8v8), temáticas y colores (Cyberpunk, Volcánico, Micro Arena, etc.).
- **Salas de Espera (Lobby)**: Sistema de salas de espera online con chat de texto en tiempo real.
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

Asegúrate de tener instalado [Node.js](https://nodejs.org/) en tu máquina.

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

## Estructura del Proyecto 📂

- `server/server.js`: El corazón del backend y donde sucede la magia de Socket.IO.
- `server/public/`: Carpeta con todos los archivos estáticos (Frontend).
  - `css/` y `img/`: Estilos visuales e imágenes del juego.
  - `pages/`: Diferentes vistas HTML (menú, configuraciones, lobby).
  - `js/`: Lógica del cliente, dividida en:
    - `core/`: Motor del juego (`PhysicsEngine`, `InputManager`, `Renderer`).
    - `local/`: Físicas y lógica exclusiva del modo offline.
    - `network/`: Gestión de Socket.IO para el modo online.
    - `ui/`: Controladores de paneles, botones y el chat del lobby.

## Desarrollo y Contribución 🤝

Todo el código está completamente documentado y comentado en español para facilitar la lectura de la lógica base. Siéntete libre de experimentar, clonar el repositorio y agregar nuevas mecánicas (como power-ups o nuevos mapas).
