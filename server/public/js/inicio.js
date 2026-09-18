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