/**
 * AdminPanel.js
 * 
 * Controlador de la interfaz del creador/administrador de la sala.
 * Permite al creador iniciar la partida u otras acciones de administración,
 * comunicándose con el servidor a través de WebSockets.
 */
const AdminPanel = {

    init(socket){

        const startButton =
            document.getElementById('startMatchButton');

        startButton.addEventListener('click', () => {

            socket.emit('match:start');

        });

        const settingsInputs = [

            document.getElementById('timeLimit'),
            document.getElementById('goalLimit'),
            document.getElementById('powersEnabled')

        ];

        settingsInputs.forEach(input => {

            input.addEventListener('change', () => {

                socket.emit('admin:updateSettings', {

                    timeLimit:
                        document.getElementById('timeLimit').value,

                    goalLimit:
                        document.getElementById('goalLimit').value,

                    powersEnabled:
                        document.getElementById('powersEnabled').checked

                });

            });

        });

    }

};

export default AdminPanel;