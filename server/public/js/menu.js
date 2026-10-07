/**
 * menu.js
 * 
 * Archivo de scripts auxiliares para los botones del menú principal.
 * Contiene referencias y manejadores de eventos (Ej: jugar online, opciones).
 */
const btnSettings =
document.getElementById("btnSettings");

const btnExit =
document.getElementById("btnExit");

/* ========================= */
/* JUGAR ONLINE */
/* ========================= */

const btnPlayOnline =
document.getElementById("btnPlayOnline");

btnPlayOnline.addEventListener("click", () => {

    window.location.href =
    "../pages/online.html";

});

/* ========================= */
/* CONFIGURACION */
/* ========================= */

btnSettings.addEventListener("click", () => {

    window.location.href =
    "../pages/configuracion.html";

});

/* ========================= */
/* SALIR */
/* ========================= */

btnExit.addEventListener("click", () => {

    const salir =
    confirm("¿Deseas salir?");

    if(salir){

        window.close();

    }

});