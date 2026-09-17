document.addEventListener("DOMContentLoaded", () => {

    // Pantallas
    const inicio = document.getElementById("inicio");
    const nombreJugador = document.getElementById("nombreJugador");

    // Botones
    const btnJugar = document.getElementById("btnJugar");
    const btnContinuar = document.getElementById("btnContinuar");

    // Input
    const nickname = document.getElementById("nickname");

    // =========================
    // BOTÓN JUGAR
    // =========================

    btnJugar.addEventListener("click", () => {

        inicio.classList.add("oculto");

        nombreJugador.classList.remove("oculto");

    });

    // =========================
    // VALIDACIÓN NOMBRE
    // =========================

    nickname.addEventListener("input", () => {

        // Elimina espacios innecesarios
        const valor = nickname.value.trim();

        // Habilitar botón si tiene mínimo 1 carácter
        btnContinuar.disabled = valor.length < 1;

    });

    // =========================
    // CONTINUAR
    // =========================

    btnContinuar.addEventListener("click", () => {

        const nombre = nickname.value.trim();

        // Seguridad extra
        if(nombre.length < 1){
            return;
        }

        // Guardar nombre
        localStorage.setItem("jugador", nombre);

        // Ir al menú principal
        window.location.href = "pages/menu.html";

    });

});