const LobbyUI = {

    init(socket){

        const nicknameElement =
            document.getElementById('nickname');

        nicknameElement.textContent =
            localStorage.getItem('jugador');

        socket.on('lobby:update', state => {

            this.renderPlayers(state.players);

            document.getElementById(
                'playerCount'
            ).textContent =
                `${state.players.length} jugadores`;

        });

    },

    renderPlayers(players){

        const container =
            document.getElementById('playersList');

        container.innerHTML = '';

        players.forEach(player => {

            const div = document.createElement('div');

            div.className = 'player-row';

            div.innerHTML = `
                <span>${player.nickname}</span>

                <span class="player-team player-team--${player.team.toLowerCase()}">
                    ${player.team}
                </span>
            `;

            container.appendChild(div);

        });

    }

};

export default LobbyUI;