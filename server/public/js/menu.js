/**
 * menu.js
 * 
 * Archivo de scripts auxiliares para los botones del menú principal.
 * Contiene referencias y manejadores de eventos (Ej: jugar local, opciones).
 */
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

    irA("../pages/local-config.html");

});

/* ========================= */
/* CONFIGURACION */
/* ========================= */

btnSettings.addEventListener("click", () => {

    irA("../pages/configuracion.html");

});

/* ========================= */
/* SALIR */
/* ========================= */

/* En la cabina no hay ventana que cerrar ni mouse para  */
/* responder un confirm(): SALIR vuelve a la pantalla de  */
/* "Insertá ficha".                                       */

btnExit.addEventListener("click", () => {

    irA("../inicio.html");

});

function irA(url){

    if(window.NavegacionArcade){

        window.NavegacionArcade.irA(url);

    }else{

        window.location.href = url;

    }

}

if(window.NavegacionArcade){

    window.NavegacionArcade.iniciar({
        alVolver: () => irA("../inicio.html")
    });

}