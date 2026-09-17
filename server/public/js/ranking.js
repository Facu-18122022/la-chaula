const rankingBody = document.getElementById("rankingBody");

let socket = null;

if (typeof io !== "undefined") {
    socket = io();
}

const localNick = localStorage.getItem("jugador") || null;

const playersMap = {};

// Cargar ranking guardado
const rankingGuardado = JSON.parse(
    localStorage.getItem("rankingData")
);

if (rankingGuardado) {

    Object.assign(
        playersMap,
        rankingGuardado
    );

}

function guardarRanking() {

    localStorage.setItem(
        "rankingData",
        JSON.stringify(playersMap)
    );

}

function renderRanking(players) {

    if (!rankingBody) return;

    rankingBody.innerHTML = "";

    players.sort(
        (a, b) =>
        (b.stats?.points || 0) -
        (a.stats?.points || 0)
    );

    updatePodium(players);

    players.forEach((player, index) => {

        rankingBody.innerHTML += `

        <tr>

            <td>${index + 1}</td>

            <td>${player.nickname}</td>

            <td>${player.stats?.goals || 0}</td>

            <td>${player.stats?.matches || 0}</td>

            <td>${player.stats?.wins || 0}</td>

            <td>${player.stats?.points || 0}</td>

        </tr>

        `;

    });

}

function updatePodium(players) {

    try {

        const sorted = players
        .slice()
        .sort(
            (a,b)=>
            (b.stats?.points || 0) -
            (a.stats?.points || 0)
        );

        const positions = [

            sorted[0],

            sorted[1],

            sorted[2]

        ];

        ["first","second","third"]

        .forEach((pos,index)=>{

            const card = document.querySelector(
                `.podium-card.${pos}`
            );

            if(!card) return;

            const jugador =
            positions[index];

            card.querySelector("h2")
            .textContent = jugador
            ? jugador.nickname
            : "—";

            card.querySelector("p")
            .textContent = jugador
            ? `${jugador.stats.points} PTS`
            : "";

        });

    }

    catch(e){}

}

// Crear jugador local si no existe

if(localNick && !playersMap[localNick]){

    playersMap[localNick]={

        nickname: localNick,

        stats:{

            goals:0,

            assists:0,

            saves:0,

            matches:0,

            wins:0,

            points:0

        }

    };

}

// Mostrar ranking al abrir la página

renderRanking(

    Object.values(playersMap)

);

guardarRanking();

if(socket){

    socket.on("lobby:update",(state)=>{

        if(!state || !state.players)

        return;

        state.players.forEach(p=>{

            playersMap[p.nickname]=p;

        });

        guardarRanking();

        renderRanking(

            Object.values(playersMap)

        );

    });

    socket.on("game:goal",(data)=>{

        if(!data || !data.scorer)

        return;

        const jugador = data.scorer;

        if(!playersMap[jugador]){

            playersMap[jugador]={

                nickname: jugador,

                stats:{

                    goals:0,

                    assists:0,

                    saves:0,

                    matches:0,

                    wins:0,

                    points:0

                }

            };

        }

        playersMap[jugador]

        .stats.goals++;

        playersMap[jugador]

        .stats.points += 100;

        if(data.assister){

            const as = data.assister;

            if(!playersMap[as]){

                playersMap[as]={

                    nickname: as,

                    stats:{

                        goals:0,

                        assists:0,

                        saves:0,

                        matches:0,

                        wins:0,

                        points:0

                    }

                };

            }

            playersMap[as]

            .stats.assists++;

            playersMap[as]

            .stats.points += 50;

        }

        guardarRanking();

        renderRanking(

            Object.values(playersMap)

        );

    });

    socket.on("game:save",(data)=>{

        if(!data ||

        !data.nickname)

        return;

        const jugador = data.nickname;

        if(!playersMap[jugador]){

            playersMap[jugador]={

                nickname: jugador,

                stats:{

                    goals:0,

                    assists:0,

                    saves:0,

                    matches:0,

                    wins:0,

                    points:0

                }

            };

        }

        playersMap[jugador]

        .stats.saves++;

        playersMap[jugador]

        .stats.points += 15;

        guardarRanking();

        renderRanking(

            Object.values(playersMap)

        );

    });

    socket.on("match:ended",(data)=>{

        if(!data)

        return;

        const ganador =

        data.winnerName;

        if(ganador){

            if(playersMap[ganador]){

                playersMap[ganador]

                .stats.matches++;

                playersMap[ganador]

                .stats.wins++;

                playersMap[ganador]

                .stats.points += 30;

            }

            Object.values(playersMap)

            .forEach(p=>{

                if(

                p.nickname !== ganador

                ){

                    p.stats.matches++;

                }

            });

        }

        guardarRanking();

        renderRanking(

            Object.values(playersMap)

        );

    });

}

document

.getElementById("backButton")

.addEventListener("click",()=>{

window.location.href=

"../pages/menu.html";

});
document.getElementById("backButton").addEventListener("click", () => {
    window.location.href = "../pages/menu.html";
});