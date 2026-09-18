(function (global) {
    const MAPAS = [
        { name: 'Classic Arena (1v1)', width: 800, height: 400, fieldColor: '#333b42', lineColor: '#ffffff', goalHeight: 110, bg: '#121212', goalBg: '#22272b', theme: 'classic' },
        { name: 'Street Arena (1v1)', width: 820, height: 390, fieldColor: '#2c3e50', lineColor: '#ff9f43', goalHeight: 95, bg: '#1e293b', goalBg: '#111827', theme: 'street' },
        { name: 'Frozen Arena (3v3)', width: 1020, height: 510, fieldColor: '#a5d8ff', lineColor: '#ffffff', goalHeight: 140, bg: '#4dabf7', goalBg: '#74c0fc', theme: 'frozen' },
        { name: 'Desert Arena (3v3)', width: 1000, height: 500, fieldColor: '#f4d03f', lineColor: '#784212', goalHeight: 135, bg: '#5e35b1', goalBg: '#7e57c2', theme: 'desert' },
        { name: 'Champions Arena (6v6)', width: 1300, height: 640, fieldColor: '#228be6', lineColor: '#ffffff', goalHeight: 180, bg: '#1a252f', goalBg: '#2c3e50', theme: 'champions' }
    ];

    global.MAPAS = MAPAS;
    if (typeof module !== 'undefined' && module.exports) module.exports = MAPAS;
})(typeof globalThis !== 'undefined' ? globalThis : this);