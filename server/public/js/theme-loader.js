/**
 * theme-loader.js
 * 
 * Script que se ejecuta tempranamente para aplicar el tema de color
 * configurado por el usuario en localStorage. Modifica el body de la
 * página antes de que termine de renderizarse para evitar parpadeos visuales.
 */
const settings = JSON.parse(
    localStorage.getItem("lachaula_settings")
);

if(settings){

    document.body.classList.add(
        "theme-" + settings.theme
    );

    if(!settings.animations){

        document.body.classList.add(
            "animations-disabled"
        );

    }

}