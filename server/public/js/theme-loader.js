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