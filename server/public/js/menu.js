const btnPlayLocal =
document.getElementById("btnPlayLocal");

const btnSettings =
document.getElementById("btnSettings");

const btnExit =
document.getElementById("btnExit");

/* ========================= */
/* JUGAR LOCAL */
/* ========================= */

btnPlayLocal.addEventListener("click", () => {

    window.location.href =
    "../pages/local-config.html";

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