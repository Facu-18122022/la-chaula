const saveButton = document.getElementById("saveButton");
const inputs = document.querySelectorAll(".setting-input");

loadSettings();
updateMuteUI();
syncAudioSettings();

inputs.forEach(input => {
    input.addEventListener("input", () => {
        enableSave();
        syncAudioSettings();
    });

    input.addEventListener("change", () => {
        enableSave();
        syncAudioSettings();
    });
});

document.getElementById("muteAll").addEventListener("change", () => {
    updateMuteUI();
    enableSave();
    syncAudioSettings();
});

function syncAudioSettings() {
    const muteAll = document.getElementById("muteAll").checked;
    const musicVolume = Number(document.getElementById("musicVolume").value) / 100;
    const effectsVolume = Number(document.getElementById("effectsVolume").value) / 100;

    // Mientras se edita, los efectos suenan con el volumen elegido (aunque no esté guardado).
    if (window.Sonidos) window.Sonidos.setVolumenTemporal(muteAll ? 0 : effectsVolume);
    if (!window.Music) return;

    window.Music.setVolume(muteAll ? 0 : musicVolume);
}

function updateMuteUI() {
    const muteAll = document.getElementById("muteAll");
    const status = document.getElementById("muteStatus");
    const icon = document.querySelector(".mute-toggle__icon");
    const volumeInputs = [
        document.getElementById("musicVolume"),
        document.getElementById("effectsVolume")
    ];

    status.textContent = muteAll.checked ? "Activado" : "Desactivado";
    icon.textContent = muteAll.checked ? "🔇" : "🔊";
    volumeInputs.forEach(input => input.toggleAttribute("disabled", muteAll.checked));
}

function enableSave() {
    saveButton.disabled = false;
}

function loadSettings() {
    const settings = JSON.parse(
        localStorage.getItem("lachaula_settings") || "null"
    );

    if (!settings) return;

    document.getElementById("musicVolume").value = settings.music ?? 70;
    document.getElementById("effectsVolume").value = settings.effects ?? 80;
    document.getElementById("muteAll").checked = Boolean(settings.mute);
}

saveButton.addEventListener("click", () => {
    const settings = {
        music: document.getElementById("musicVolume").value,
        effects: document.getElementById("effectsVolume").value,
        mute: document.getElementById("muteAll").checked,
        theme: "dark"
    };

    localStorage.setItem("lachaula_settings", JSON.stringify(settings));
    syncAudioSettings();
    saveButton.disabled = true;
    // Sin alert(): en la cabina no hay mouse para cerrarlo.
    const status = document.getElementById("saveStatus");
    status.textContent = "¡Configuración guardada!";
    setTimeout(() => { status.textContent = ""; }, 2500);
    if (window.NavegacionArcade) window.NavegacionArcade.seleccionar(document.getElementById("backButton"));
});

document.getElementById("backButton").addEventListener("click", () => {
    irA("../pages/menu.html");
});

document.getElementById("controlsButton").addEventListener("click", () => {
    irA("../pages/controles.html");
});

function irA(url) {
    if (window.NavegacionArcade) window.NavegacionArcade.irA(url);
    else window.location.href = url;
}

if (window.NavegacionArcade) {
    window.NavegacionArcade.iniciar({ botonVolver: "#backButton" });
}
