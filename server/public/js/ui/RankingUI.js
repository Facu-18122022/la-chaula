const RankingUI = {

    init(){

        this.render([
            {
                nickname:'Facu',
                goals:12,
                matches:20,
                losses:4
            },
            {
                nickname:'Juan',
                goals:9,
                matches:15,
                losses:6
            }
        ]);

    },

    render(players){

        const container =
            document.getElementById('rankingContent');

        container.innerHTML = '';

        players.forEach(player => {

            const row = document.createElement('div');

            row.className = 'ranking-row';

            row.innerHTML = `
                <span>${player.nickname}</span>
                <span>${player.goals}</span>
                <span>${player.matches}</span>
                <span>${player.losses}</span>
            `;

            container.appendChild(row);

        });

    }

};

export default RankingUI;