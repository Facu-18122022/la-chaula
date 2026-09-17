export default class InputManager{

    constructor(){

        this.keys = {};

        window.addEventListener(
            'keydown',
            event => {
                this.keys[event.key.toLowerCase()] = true;
            }
        );

        window.addEventListener(
            'keyup',
            event => {
                this.keys[event.key.toLowerCase()] = false;
            }
        );

    }

    update(){

        // Movimiento futuro

    }

    isPressed(key){

        return this.keys[key.toLowerCase()];

    }

}