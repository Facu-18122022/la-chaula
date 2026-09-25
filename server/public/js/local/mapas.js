/**
 * mapas.js
 * 
 * Este módulo contiene la definición de todos los mapas disponibles en el juego.
 * Se utiliza un patrón de módulo autoejecutable (IIFE) para asegurar que
 * sea compatible tanto en el navegador (frontend) como en Node.js (backend).
 */
(function (global) {
    /**
     * MAPAS
     * Array que almacena los diferentes diseños y configuraciones de las canchas.
     * 
     * Propiedades de cada mapa:
     * - name: Nombre visual que se muestra en la interfaz.
     * - width: Ancho de la cancha en píxeles.
     * - height: Alto de la cancha en píxeles.
     * - fieldColor: Color de fondo del área de juego.
     * - lineColor: Color de las líneas del centro y bordes.
     * - goalHeight: Tamaño de los arcos en píxeles.
     * - bg: Color principal del fondo exterior a la cancha.
     * - goalBg: Color de fondo dentro del área del arco.
     * - theme: Identificador temático usado para lógica de renderizado adicional.
     */
    const MAPAS = [
        // --- Mapas Clásicos y Base ---
        { name: 'Classic Arena (1v1)', width: 800, height: 400, fieldColor: '#333b42', lineColor: '#ffffff', goalHeight: 100, bg: '#121212', goalBg: '#22272b', theme: 'classic' },
        { name: 'Street Arena (1v1)', width: 820, height: 390, fieldColor: '#2c3e50', lineColor: '#ff9f43', goalHeight: 90, bg: '#1e293b', goalBg: '#111827', theme: 'street' },
        { name: 'Frozen Arena (1v1)', width: 1020, height: 510, fieldColor: '#a5d8ff', lineColor: '#ffffff', goalHeight: 110, bg: '#4dabf7', goalBg: '#74c0fc', theme: 'frozen' },
        { name: 'Desert Arena (1v1)', width: 1000, height: 500, fieldColor: '#f4d03f', lineColor: '#784212', goalHeight: 105, bg: '#5e35b1', goalBg: '#7e57c2', theme: 'desert' },
        { name: 'Champions Arena (1v1)', width: 1300, height: 640, fieldColor: '#228be6', lineColor: '#ffffff', goalHeight: 130, bg: '#1a252f', goalBg: '#2c3e50', theme: 'champions' },
        
        // --- Nuevos Mapas Interactivos y Gamificados ---
        { name: 'Neon Cyberpunk (1v1)', width: 900, height: 450, fieldColor: '#170b24', lineColor: '#00ffcc', goalHeight: 100, bg: '#090514', goalBg: '#2a0a4a', theme: 'cyberpunk' },
        { name: 'Micro Arena (1v1)', width: 500, height: 300, fieldColor: '#6e2c00', lineColor: '#f1c40f', goalHeight: 85, bg: '#421a00', goalBg: '#935116', theme: 'micro' },
        { name: 'Titan Colosseum (1v1)', width: 1600, height: 800, fieldColor: '#4a235a', lineColor: '#f5b041', goalHeight: 180, bg: '#290e36', goalBg: '#6c3483', theme: 'titan' },
        { name: 'The Tunnel (1v1)', width: 1200, height: 350, fieldColor: '#1e8449', lineColor: '#aed6f1', goalHeight: 100, bg: '#145a32', goalBg: '#27ae60', theme: 'tunnel' },
        { name: 'Volcanic Crater (1v1)', width: 1100, height: 550, fieldColor: '#641e16', lineColor: '#e74c3c', goalHeight: 120, bg: '#1b0a0a', goalBg: '#922b21', theme: 'volcanic' }
    ];

    // Asignación de la constante de mapas al entorno global para el navegador
    global.MAPAS = MAPAS;
    
    // Compatibilidad para exportar módulos usando CommonJS (Node.js backend)
    if (typeof module !== 'undefined' && module.exports) module.exports = MAPAS;
})(typeof globalThis !== 'undefined' ? globalThis : this);