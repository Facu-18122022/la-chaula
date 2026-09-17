/* ========================= */
/* SOCKET IO */
/* ========================= */

const serverURL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 3000}`;
const socket = io(serverURL);

/* ========================= */
/* TEAM SELECTOR */
/* ========================= */
const teamButtons = document.querySelectorAll(".team-option");
let selectedTeam = "red"; 

teamButtons.forEach(button => {
    button.addEventListener("click", () => {
        teamButtons.forEach(btn => btn.classList.remove("selected"));
        button.classList.add("selected");
        
        selectedTeam = button.getAttribute("data-team") || 
            (button.textContent.toLowerCase().includes("rojo") || button.textContent.toLowerCase().includes("red") ? "red" : "blue");
    });
});

/* ========================= */
/* MAPS (Aquí creamos los datos, apariencias y tamaños) */
/* ========================= */
const maps = [
    { name: "Classic Arena (1v1)", width: 800, height: 400, fieldColor: "#2c3e50", lineColor: "#ffffff", goalHeight: 110, bg: "#11141a" },
    { name: "Street Arena (1v1)", width: 820, height: 390, fieldColor: "#4b5563", lineColor: "#ff9f43", goalHeight: 95, bg: "#1e293b" },
    { name: "Frozen Arena (3v3)", width: 1020, height: 510, fieldColor: "#74b9ff", lineColor: "#ffffff", goalHeight: 140, bg: "#0984e3" },
    { name: "Desert Arena (3v3)", width: 1000, height: 500, fieldColor: "#f4d03f", lineColor: "#784212", goalHeight: 135, bg: "#5e35b1" },
    { name: "Champions Arena (6v6)", width: 1300, height: 640, fieldColor: "#27ae60", lineColor: "#ffffff", goalHeight: 180, bg: "#1a252f" }
];
// RUTAS CORREGIDAS APUNTANDO A TU CARPETA "img"
const mapImages = [
    "../img/classic.png",
    "../img/street.png",
    "../img/frozen.png",
    "../img/desert.png",
    "../img/champions.png"
];

let currentMap = 0;
const mapName = document.getElementById("mapName");
const mapPreviewImg = document.getElementById("mapPreviewImg"); // Capturamos la etiqueta img
const prevMap = document.getElementById("prevMap");
const nextMap = document.getElementById("nextMap");

function updateMap() {
    // Mostramos el nombre en la interfaz
    mapName.textContent = maps[currentMap].name;
    
    // CAMBIAMOS LA IMAGEN DINÁMICAMENTE SEGÚN EL MAPA ACTUAL
    if (mapPreviewImg) {
        mapPreviewImg.src = mapImages[currentMap];
    }
}

prevMap.addEventListener("click", () => {
    currentMap--;
    if (currentMap < 0) currentMap = maps.length - 1;
    updateMap();
});

nextMap.addEventListener("click", () => {
    currentMap++;
    if (currentMap >= maps.length) currentMap = 0;
    updateMap();
});

/* ========================= */
/* BACK */
/* ========================= */
const backButton = document.getElementById("backButton");
backButton.addEventListener("click", () => {
    window.location.href = "../pages/jugar.html";
});

/* ========================= */
/* CREATE ROOM (Registrar en servidor) */
/* ========================= */
const createRoomButton = document.getElementById("createRoomButton");

if (createRoomButton) {
    createRoomButton.addEventListener("click", () => {
        // 1. Capturar elementos de configuración del HTML
        const matchTimeSelect = document.getElementById('matchTime');
        const goalLimitSelect = document.getElementById('goalLimit');
        
        const matchTime = matchTimeSelect ? parseInt(matchTimeSelect.value, 10) : 3; 
        const goalLimit = goalLimitSelect ? parseInt(goalLimitSelect.value, 10) : 5;

        const nickname = localStorage.getItem('jugador') || 'Jugador';

        // 2. Crear objeto de sala
        const roomData = {
            roomName: `Sala de ${nickname}`,
            matchTime: matchTime,
            goalLimit: goalLimit,
            selectedMapIndex: currentMap,
            creatorTeam: selectedTeam,
            creatorNickname: nickname
        };

        // 3. Guardar en localStorage
        localStorage.setItem("equipoSeleccionado", selectedTeam);
        localStorage.setItem("matchTime", String(matchTime)); 
        localStorage.setItem("goalLimit", String(goalLimit));
        localStorage.setItem("selectedMapIndex", String(currentMap));

        // 4. Emitir evento al servidor para crear la sala
        socket.emit('room:create', roomData, (roomId) => {
            console.log('Sala creada con ID:', roomId);
            localStorage.setItem('roomId', roomId);
            window.location.href = "lobby.html";
        });
    });
}

/* ========================= */
/* INITIALIZATION */
/* ========================= */
updateMap();