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
    if (!window.Music) return;

    const muteAll = document.getElementById("muteAll").checked;
    const musicVolume = Number(document.getElementById("musicVolume").value) / 100;

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
    alert("Configuración guardada");
});

document.getElementById("backButton").addEventListener("click", () => {
    window.location.href = "../pages/menu.html";
});
