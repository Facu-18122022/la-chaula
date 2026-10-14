/**
 * menu.js
 * 
 * Archivo de scripts auxiliares para los botones del menú principal.
 * Contiene referencias y manejadores de eventos (Ej: jugar online, opciones).
 */
const btnPlayOnline =
document.getElementById("btnPlayOnline");

const btnSettings =
document.getElementById("btnSettings");

const btnExit =
document.getElementById("btnExit");

/* ========================= */
/* JUGAR ONLINE */
/* ========================= */

btnPlayOnline.addEventListener("click", () => {

    irA("../pages/online.html");

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

/* SALIR cierra el juego (igual que en develop). En la web  */
/* el navegador casi nunca deja cerrar una pestaña que no   */
/* abrió un script: en ese caso se avisa en el pie.         */

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

    pie.textContent = "EL NAVEGADOR NO DEJA CERRAR SOLO · CERRA LA PESTANA";
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