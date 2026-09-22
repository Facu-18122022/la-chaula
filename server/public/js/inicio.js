/**
 * inicio.js
 * 
 * Script de comportamiento básico para la pantalla de inicio principal.
 * Maneja la interacción inicial del usuario con los menús de navegación, 
 * botones de jugar, opciones, etc.
 */
document.addEventListener("DOMContentLoaded", () => {

    // Pantallas
    const inicio = document.getElementById("inicio");
    

    // Botones
    const btnJugar = document.getElementById("btnJugar");
    

    // =========================
    // BOTÓN JUGAR
    // =========================

    btnJugar.addEventListener("click", () => {

        inicio.classList.add("oculto");

        localStorage.setItem("jugador", "Player 1");
        window.location.href = "pages/menu.html";

    });

});