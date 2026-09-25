/**
 * jugar.js
 * 
 * Script de interfaz que maneja la pantalla de selección de modo de juego,
 * donde el usuario decide si crear una sala, unirse a una existente o jugar local.
 */

/* ========================= */
/* BOTONES */
/* ========================= */

const btnCreateRoom = 
document.getElementById("btnCreateRoom");

const btnJoinRoom = 
document.getElementById("btnJoinRoom");

const btnBack = 
document.getElementById("btnBack");

/* ========================= */
/* CREAR SALA */
/* ========================= */

btnCreateRoom.addEventListener("click", () => {

    window.location.href = 
    "../pages/crear-sala.html";

});

/* ========================= */
/* SALAS DISPONIBLES */
/* ========================= */

btnJoinRoom.addEventListener("click", () => {

    window.location.href = 
    "../pages/salas-disponibles.html";

});

/* ========================= */
/* VOLVER AL MENÚ */
/* ========================= */

btnBack.addEventListener("click", () => {

    window.location.href = 
    "../pages/menu.html";

});