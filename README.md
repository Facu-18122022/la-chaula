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
- **Música automática**: todo archivo de audio que copies en `server/public/musica/` rota al azar en los menús; los de `server/public/musica/partido/` suenan solo en el partido. No hace falta tocar código.
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
   (Para desarrollo, `npm run dev` reinicia el servidor solo cada vez que guardás un archivo.)
5. **Juega**: Abre tu navegador y dirígete a `http://localhost:3000`. 
   > *Nota: Si quieres jugar en red LAN con otros dispositivos, tus amigos deben conectarse a la dirección IP local de tu computadora seguida del puerto 3000 (Ej: `http://192.168.0.10:3000`).*
6. **Pruebas automáticas** de la física y del partido:
   ```bash
   npm test
   ```

## Modo Arcade (cabina) 🕹️

El modo local está pensado para la cabina: se juega y se navega **sin mouse**, solo con palanca y botones.

### Controles por defecto

| Acción | Jugador 1 | Jugador 2 |
| --- | --- | --- |
| Moverse | `W` `A` `S` `D` | Flechas |
| Patear / Aceptar | `Espacio` o `V` | `L` o `0` del teclado numérico |
| Atrás | `C` | `K` |
| Start / Pausa | `1` | `2` |
| Insertar ficha | `5` | — |

- En los **menús solo navega el Jugador 1** (el Jugador 2 queda ignorado). `Enter` y `Esc` también sirven como aceptar/atrás.
- En el partido, `Start` de cualquiera de los dos (o `Esc`) pausa.
- Todo se puede cambiar en **Configuración → Probar y asignar controles**.

### Ghosting del teclado

Muchos teclados comunes no pueden mandar ciertas combinaciones de 3 o más teclas a la vez (*ghosting*): es una limitación del hardware y ningún programa puede recuperar una tecla que el teclado no envía. Lo que sí hace el juego:

- Lee las teclas por posición física (`event.code`), así no se "traban" con Shift, Bloq Mayús o teclados en español.
- Ya no borra las teclas mantenidas al hacer un gol o pausar (antes parecía que una tecla "dejaba de andar").
- Acepta varias teclas por acción y permite reasignarlas.
- La pantalla **Controles** tiene una *prueba de ghosting*: los dos jugadores mantienen diagonal + patear (6 teclas, el peor caso de un partido) y se ve en vivo qué teclas llegan. Si alguna no se prende, asignale otra tecla a ese jugador.
- Evitá asignar `Ctrl` (con `W` cierra la pestaña) y, en Windows, `Shift` (5 veces seguidas abre "Teclas especiales").

Con las placas USB de los joysticks el problema desaparece, porque cada jugador tiene su propia placa.

### Joysticks y placas USB

- **Placas que se presentan como joystick** (Zero Delay, DragonRise, etc.): se detectan solas con la Gamepad API. La primera placa es del Jugador 1 y la segunda del Jugador 2 (se pueden intercambiar desde Controles). El navegador las detecta recién después de apretar un botón.
- **Placas que se presentan como teclado** (I-PAC y similares): en Controles se elige cada acción y se aprieta el botón de la cabina para asignarlo.

### Lanzar en la cabina (pantalla completa)

Con el servidor corriendo (`npm start`), abrí Chrome en modo kiosco. El segundo parámetro permite que suenen la música y los efectos aunque solo se use la palanca:

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required http://localhost:3000
# Linux
chromium --kiosk --autoplay-policy=no-user-gesture-required http://localhost:3000
```

### Jugabilidad estilo HaxBall

El modo local usa `js/local/fisica-haxball.js`, que copia las reglas de HaxBall con los valores de los estadios **Futsal**: aceleración 0.11 (0.083 pateando) y amortiguación 0.96 del jugador, que no rebota (bCoef 0); jugador de radio 16 (un toque más grande que el 15 de HaxBall); pelota de radio 8 (entre la del futsal, 6.25, y la del Classic, 10) con invMass 1.2, bCoef 0.4 y amortiguación 0.99; patada de fuerza 5 (sale a 6 px/tick; el súper tiro ×1.8) que se arma al mantener el botón cuando la pelota está a menos de 4 px (y mientras se mantiene el jugador va más lento, con borde blanco), postes finitos redondos, redes que casi no rebotan, barreras de saque (el equipo que no saca no entra al círculo), saque para el equipo que recibió el gol, reloj que solo corre con la pelota en juego y tiempo extra con gol de oro. Esos valores son los del mapa de referencia (840x400). Como el canvas se estira a toda la pantalla, cada mapa tiene una **escala** por área, `raíz(ancho × alto / (840 × 400))` entre 1 y 2 (Frozen ×1.24, Champions ×1.57, Volcanic ×1.34, The Tunnel ×1.12, Titan ×1.95; un mapa puede fijar la suya con `escala`), que multiplica los radios de jugadores, pelota, postes y power-ups, el alcance de la patada, las distancias entre discos y también la aceleración y la patada: así en cualquier cancha el jugador ocupa en pantalla lo mismo que en HaxBall y se tarda lo mismo en cruzarla. La pelota choca contra paredes y postes con barrido, así ni el súper tiro en el mapa más grande los atraviesa. El mapa **HaxBall Classic** conserva las medidas del estadio original.

Los power-ups (velocidad, grande y súper patada) aparecen cada 4 a 9 segundos al azar, en un lugar libre de la cancha, y salen de una "bolsa" mezclada: aparecen los tres antes de repetir y nunca el mismo dos veces seguidas. Vienen activados por defecto y se pueden apagar en la configuración de la partida.

## Estructura del Proyecto 📂

- `server/server.js`: El corazón del backend y donde sucede la magia de Socket.IO.
- `server/public/`: Carpeta con todos los archivos estáticos (Frontend).
  - `css/` y `img/`: Estilos visuales e imágenes del juego.
  - `pages/`: Diferentes vistas HTML (menú, configuraciones, lobby).
  - `js/`: Lógica del cliente, dividida en:
    - `arcade/`: Controles de la cabina (teclado + joysticks), navegación de menús con palanca y sonidos.
    - `core/`: Motor del juego (`PhysicsEngine`, `InputManager`, `Renderer`).
    - `local/`: Físicas y lógica exclusiva del modo offline (`fisica-haxball.js` es la del modo local; `fisica-local.js` la sigue usando el servidor online).
    - `network/`: Gestión de Socket.IO para el modo online.
    - `ui/`: Controladores de paneles, botones y el chat del lobby.
  - `sonidos/`: Efectos 8-bit de la interfaz (se regeneran con `node scripts/generar-sonidos.js`).
  - `fonts/`: Fuente pixel *Press Start 2P* (licencia OFL), incluida para que funcione sin internet.
- `test/`: Pruebas automáticas (`npm test`).

## Desarrollo y Contribución 🤝

Todo el código está completamente documentado y comentado en español para facilitar la lectura de la lógica base. Siéntete libre de experimentar, clonar el repositorio y agregar nuevas mecánicas (como power-ups o nuevos mapas).
