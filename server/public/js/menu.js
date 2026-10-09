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

/* SALIR cierra el juego. En la cabina el navegador lo abre */
/* Batocera: al cerrarse vuelve al menú de Batocera. Sin    */
/* confirm(): no hay mouse para responderlo.                */

btnExit.addEventListener("click", () => {

    salir();

});

const pie = document.querySelector(".arcade-pie");
const textoPie = pie.textContent;
let temporizadorAviso = null;

function salir(){

    if(window.NavegacionArcade){

        window.NavegacionArcade.salir(avisarQueNoSeCerro);

    }else{

        window.close();
        setTimeout(avisarQueNoSeCerro, 700);

    }

}

/* El navegador no dejó cerrar la ventana (por ejemplo, la abrieron con otra  */
/* página antes en el historial): se avisa cómo salir. Mayúsculas sin tilde   */
/* porque la fuente pixel dibuja mal las acentuadas.                           */
function avisarQueNoSeCerro(){

    pie.textContent = "NO SE PUDO CERRAR SOLO · SALI CON HOTKEY+START (BATOCERA)";
    pie.classList.add("arcade-pie--aviso");

    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => {

        pie.textContent = textoPie;
        pie.classList.remove("arcade-pie--aviso");

    }, 8000);

}

function irA(url){

    if(window.NavegacionArcade){

        window.NavegacionArcade.irA(url);

    }else{

        window.location.href = url;

    }

}

if(window.NavegacionArcade){

    window.NavegacionArcade.iniciar({
        alVolver: () => irA("../index.html")
    });

}