/**
 * InputManager.js
 * 
 * Gestor de entradas del teclado.
 * Captura los eventos 'keydown' y 'keyup' y mantiene un estado
 * actualizado de qué teclas están siendo presionadas para que
 * puedan ser leídas en cualquier momento por la lógica de juego.
 */
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