const btnCreateRoom =
document.getElementById("btnCreateRoom");

const btnSettings =
document.getElementById("btnSettings");

const btnRanking =
document.getElementById("btnRanking");

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
/* RANKING */
/* ========================= */

btnRanking.addEventListener("click", () => {

    window.location.href =
    "../pages/ranking.html";

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