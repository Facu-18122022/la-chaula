/**
 * configuracion.js
 * 
 * Maneja la lógica de la página de ajustes del juego.
 * Se encarga de cargar, mostrar y guardar las preferencias del usuario 
 * (como volumen, controles o video) utilizando localStorage para persistencia.
 */
const saveButton =
document.getElementById("saveButton");
loadSettings();

const inputs =
document.querySelectorAll(".setting-input");
loadSettings();
updateMuteUI();
syncAudioSettings();

/* ========================= */
/* DETECTAR CAMBIOS */
/* ========================= */

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

function syncAudioSettings(){

    if (!window.Music) return;

    const muteAll = document.getElementById("muteAll").checked;
    const musicVolume = Number(document.getElementById("musicVolume").value) / 100;

    window.Music.setVolume(muteAll ? 0 : musicVolume);

}

function updateMuteUI(){

    const muteAll = document.getElementById("muteAll");
    const status = document.getElementById("muteStatus");
    const icon = document.querySelector(".mute-toggle__icon");
    const volumeInputs = [
        document.getElementById("musicVolume"),
        document.getElementById("effectsVolume")
    ];

    status.textContent = muteAll.checked ? "Activado" : "Desactivado";
    icon.textContent = muteAll.checked ? "🔇" : "🔊";
    volumeInputs.forEach(input => {
        input.toggleAttribute("disabled", muteAll.checked);
    });

}

function enableSave(){

    saveButton.disabled = false;

}

/* ========================= */
/* GUARDAR */
/* ========================= */

saveButton.addEventListener("click", () => {

    const settings = {

        music:
        document.getElementById("musicVolume").value,

        effects:
        document.getElementById("effectsVolume").value,

        mute:
        document.getElementById("muteAll").checked,

        theme:
        document.getElementById("themeSelect").value,

        animations:
        document.getElementById("animations").value

    };

    localStorage.setItem(
        "lachaula_settings",
        JSON.stringify(settings)
    
    );
    loadSettings();
    syncAudioSettings();
    saveButton.disabled = true;

    alert("Configuración guardada");

});

/* ========================= */
/* VOLVER */
/* ========================= */

document
.getElementById("backButton")
.addEventListener("click", () => {

    window.location.href =
    "../pages/menu.html";

});
function loadSettings(){

    const settings =
    JSON.parse(
        localStorage.getItem(
            "lachaula_settings"
        )
    );

    if(!settings) return;

    document.getElementById(
        "musicVolume"
    ).value = settings.music;

    document.getElementById(
        "effectsVolume"
    ).value = settings.effects;

    document.getElementById(
        "muteAll"
    ).checked = settings.mute;

    document.getElementById(
        "themeSelect"
    ).value = settings.theme;

    document.getElementById(
        "animations"
    ).value = settings.animations;

function applyTheme(theme){

    document.body.classList.remove(
        "theme-dark",
        "theme-light",
        "theme-neon"
    );

    document.body.classList.add(
        "theme-" + theme
    );

}
}
const themeSelect =
document.getElementById(
    "themeSelect"
);

themeSelect.addEventListener(
    "change",
    () => {

        applyTheme(
            themeSelect.value
        );

    }
);
function applyTheme(theme){

    document.body.classList.remove(
        "theme-dark",
        "theme-light",
        "theme-neon"
    );

    document.body.classList.add(
        "theme-" + theme
    );

}

function applyAnimations(){

    const animations =
    document.getElementById(
        "animations"
    ).value;

    if(
        animations === "off"
    ){

        document.body.classList.add(
            "animations-disabled"
        );

    }
    else{

        document.body.classList.remove(
            "animations-disabled"
        );

    }

}