/**
 * inicio.js
 * 
 * Script de comportamiento básico para la pantalla de inicio principal.
 * Maneja la interacción inicial del usuario con los menús de navegación, 
 * botones de jugar, opciones, etc.
 */
document.addEventListener("DOMContentLoaded", () => {

    const settings = JSON.parse(
        localStorage.getItem("lachaula_settings") || "null"
    );
    const selectedTheme = settings && ["light", "neon"].includes(settings.theme)
        ? settings.theme
        : "dark";

    document.body.classList.add(
        selectedTheme === "light" ? "tema-claro" : `tema-${selectedTheme}`
    );

    // Botones
    const btnJugar = document.getElementById("btnJugar");
    

    // =========================
    // BOTÓN JUGAR
    // =========================

    btnJugar.addEventListener("click", () => {

        gastarCredito();
        localStorage.setItem("jugador", "Player 1");

        if (window.NavegacionArcade) {
            window.NavegacionArcade.irA("pages/menu.html", 350);
        } else {
            window.location.href = "pages/menu.html";
        }

    });

    // =========================
    // FICHAS (tecla 5 o el botón de ficha de la cabina)
    // Por ahora la cabina es "free play": las fichas solo se muestran.
    // =========================

    const creditos = document.getElementById("creditos");

    function leerCreditos() {
        return Number.parseInt(sessionStorage.getItem("lachaula_creditos") || "0", 10) || 0;
    }

    function mostrarCreditos() {
        const cantidad = leerCreditos();
        creditos.textContent = cantidad > 0
            ? `Créditos ${String(cantidad).padStart(2, "0")}`
            : "Free play";
    }

    function gastarCredito() {
        const cantidad = leerCreditos();
        if (cantidad > 0) sessionStorage.setItem("lachaula_creditos", String(cantidad - 1));
    }

    document.addEventListener("arcade:ficha", () => {
        sessionStorage.setItem("lachaula_creditos", String(Math.min(99, leerCreditos() + 1)));
        mostrarCreditos();
    });

    mostrarCreditos();

    if (window.NavegacionArcade) {
        window.NavegacionArcade.iniciar();
    }

});