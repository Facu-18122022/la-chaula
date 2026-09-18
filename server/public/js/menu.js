const btnCreateRoom =
document.getElementById("btnCreateRoom");

const btnSettings =
document.getElementById("btnSettings");

const btnExit =
document.getElementById("btnExit");

/* ========================= */
/* JUGAR (antes CREAR SALA) */
/* ========================= */

btnCreateRoom.addEventListener("click", () => {

    window.location.href =
    "../pages/jugar.html";

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