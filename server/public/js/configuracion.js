const saveButton =
document.getElementById("saveButton");
loadSettings();

const inputs =
document.querySelectorAll(".setting-input");
loadSettings();

/* ========================= */
/* DETECTAR CAMBIOS */
/* ========================= */

inputs.forEach(input => {

    input.addEventListener(
        "input",
        enableSave
    );

    input.addEventListener(
        "change",
        enableSave
    );

});

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