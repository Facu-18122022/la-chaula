/**
 * ChatUI.js
 * 
 * Controlador de la interfaz de usuario para el chat de texto.
 * Gestiona el envío de mensajes desde el input del HTML y la recepción
 * de mensajes para inyectarlos en el panel de chat.
 */
const ChatUI = {

    init(socket){

        const input =
            document.getElementById('chatInput');

        const button =
            document.getElementById('sendMessage');

        button.addEventListener('click', () => {

            const message = input.value.trim();

            if(message.length < 1) return;

            socket.emit('chat:message', message);

            input.value = '';

        });

        socket.on('chat:message', data => {

            this.addMessage(data);

        });

    },

    addMessage(data){

        const container =
            document.getElementById('chatMessages');

        const div = document.createElement('div');

        div.className = 'chat-message';

        div.innerHTML = `
            <strong>${data.id}</strong>
            <p>${data.text}</p>
        `;

        container.appendChild(div);

        container.scrollTop = container.scrollHeight;

    }

};

export default ChatUI;