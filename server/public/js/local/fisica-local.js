(function (global) {
    const ACCEL = 0.25;
    const MAX_VEL = 3.4;
    const FRICTION = 0.93;
    const BALL_FRICTION = 0.985;
    const RESTITUTION = -0.55;
    const FIELD_MARGIN_X = 80;
    const FIELD_MARGIN_Y = 40;
    const GOAL_WIDTH = 45;
    const BALL_CONTACT_TOLERANCE = 2;

    function normalizeMap(map) {
        const width = Number(map && map.width) || 800;
        const height = Number(map && map.height) || 400;
        const goalHeight = Number(map && map.goalHeight) || 110;
        return {
            ...map,
            width,
            height,
            goalHeight,
            field: { left: FIELD_MARGIN_X, right: width - FIELD_MARGIN_X, top: FIELD_MARGIN_Y, bottom: height - FIELD_MARGIN_Y },
            goalTop: height / 2 - goalHeight / 2,
            goalBottom: height / 2 + goalHeight / 2
        };
    }

    function crearEstado({ mapa, ladoIzquierdo = 'red', jugadores = [] } = {}) {
        const map = normalizeMap(mapa);
        const centerX = map.width / 2;
        const players = jugadores.map((player, index) => {
            const id = player.id === 'j2' ? 'j2' : 'j1';
            const team = player.equipo === 'blue' ? 'blue' : 'red';
            const isLeft = team === ladoIzquierdo;
            const sameTeam = jugadores.slice(0, index).filter(item => (item.equipo === 'blue' ? 'blue' : 'red') === team).length;
            const rBase = Number.isFinite(player.rBase) ? player.rBase : (Number.isFinite(player.r) ? player.r : 20);
            return {
                id,
                equipo: team,
                x: isLeft ? centerX - 150 - sameTeam * 50 : centerX + 150 + sameTeam * 50,
                y: map.height / 2 + ((sameTeam % 3) - 1) * 45,
                vx: 0,
                vy: 0,
                r: rBase,
                rBase,
                massa: 2,
                activePower: null,
                powerTimer: 0
            };
        });

        return {
            mapa: map,
            ladoIzquierdo,
            field: map.field,
            goalTop: map.goalTop,
            goalBottom: map.goalBottom,
            players,
            ball: { x: centerX, y: map.height / 2, vx: 0, vy: 0, r: 10, massa: 1 },
            activePowerUps: [],
            powerUpSpawnTimer: 0,
            waitingForKickOff: true,
            kickoffPlayerId: 'j1',
            timerStarted: false,
            lastTouch: null,
            secondLastTouch: null,
            lastGoalTeam: null,
            goalDetected: false
        };
    }

    function inputFor(inputs, player) {
        return inputs && inputs[player.id] ? inputs[player.id] : {};
    }

    function movePlayer(player, input, state, step) {
        let moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (moveX && moveY) { moveX *= 0.7071; moveY *= 0.7071; }
        const speedMultiplier = player.activePower === 'SPEED' ? 1.55 : 1;
        player.vx += moveX * ACCEL * speedMultiplier * step;
        player.vy += moveY * ACCEL * speedMultiplier * step;
        const speed = Math.hypot(player.vx, player.vy);
        const maxSpeed = MAX_VEL * speedMultiplier;
        if (speed > maxSpeed) {
            player.vx = player.vx / speed * maxSpeed;
            player.vy = player.vy / speed * maxSpeed;
        }
        player.vx *= FRICTION;
        player.vy *= FRICTION;
        player.x += player.vx * step;
        player.y += player.vy * step;

        const centerX = state.mapa.width / 2;
        if (state.waitingForKickOff) {
            const isKickoffPlayer = player.id === state.kickoffPlayerId;
            const centerCircleRadius = state.mapa.width * 0.085;
            if (isKickoffPlayer) {
                if (player.equipo === state.ladoIzquierdo) player.x = Math.min(player.x, centerX - player.r);
                else player.x = Math.max(player.x, centerX + player.r);
            } else if (player.equipo === state.ladoIzquierdo) {
                player.x = Math.min(player.x, centerX - centerCircleRadius - player.r);
            } else {
                player.x = Math.max(player.x, centerX + centerCircleRadius + player.r);
            }
        }
        player.x = Math.max(player.r, Math.min(state.mapa.width - player.r, player.x));
        player.y = Math.max(player.r, Math.min(state.mapa.height - player.r, player.y));
    }

    function collidePlayers(players) {
        for (let i = 0; i < players.length; i += 1) {
            for (let j = i + 1; j < players.length; j += 1) {
                const first = players[i];
                const second = players[j];
                const dx = second.x - first.x;
                const dy = second.y - first.y;
                const distance = Math.hypot(dx, dy);
                const minDistance = first.r + second.r;
                if (!distance || distance >= minDistance) continue;
                const nx = dx / distance;
                const ny = dy / distance;
                const overlap = minDistance - distance;
                const correction = overlap * 0.8;
                first.x -= nx * correction / 2;
                first.y -= ny * correction / 2;
                second.x += nx * correction / 2;
                second.y += ny * correction / 2;
                const relativeVelocity = nx * (first.vx - second.vx) + ny * (first.vy - second.vy);
                if (relativeVelocity <= 0) continue;
                const impulse = 2 * relativeVelocity / (first.massa + second.massa);
                first.vx -= impulse * second.massa * nx;
                first.vy -= impulse * second.massa * ny;
                second.vx += impulse * first.massa * nx;
                second.vy += impulse * first.massa * ny;
            }
        }
    }

    function collideBall(player, input, state, events) {
        const ball = state.ball;
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = player.r + ball.r;
        if (distance > minDistance + BALL_CONTACT_TOLERANCE) return;
        const playerSpeed = Math.hypot(player.vx, player.vy);
        const angle = distance > 0
            ? Math.atan2(dy, dx)
            : playerSpeed > 0 ? Math.atan2(player.vy, player.vx) : 0;
        if (distance < minDistance) {
            ball.x = player.x + Math.cos(angle) * minDistance;
            ball.y = player.y + Math.sin(angle) * minDistance;
        }
        state.secondLastTouch = state.lastTouch;
        state.lastTouch = player.id;
        if (!state.timerStarted) {
            state.timerStarted = true;
            state.waitingForKickOff = false;
            events.push('primerToque');
        }
        if (input.kick) {
            const speed = Math.hypot(player.vx, player.vy);
            const force = player.activePower === 'SUPER_KICK' ? Math.max(10, speed * 2) : Math.max(6, speed * 1.6);
            ball.vx = Math.cos(angle) * force + player.vx * 0.5;
            ball.vy = Math.sin(angle) * force + player.vy * 0.5;
        } else if (playerSpeed > 0) {
            const normalX = Math.cos(angle);
            const normalY = Math.sin(angle);
            const approachSpeed = player.vx * normalX + player.vy * normalY;
            if (approachSpeed > 0) {
                const ballNormalSpeed = ball.vx * normalX + ball.vy * normalY;
                const targetNormalSpeed = approachSpeed * 1.1;
                const normalSpeedDelta = Math.max(0, targetNormalSpeed - ballNormalSpeed);
                ball.vx += normalX * normalSpeedDelta;
                ball.vy += normalY * normalSpeedDelta;
            }
        }
    }

    function advancePowerUps(state, events, step) {
        state.powerUpSpawnTimer += step;
        if (state.powerUpSpawnTimer >= 480 && state.activePowerUps.length < 2) {
            state.powerUpSpawnTimer = 0;
            const types = ['SPEED', 'BIG', 'SUPER_KICK'];
            state.activePowerUps.push({
                x: FIELD_MARGIN_X + Math.random() * (state.mapa.width - FIELD_MARGIN_X * 2),
                y: FIELD_MARGIN_Y + Math.random() * (state.mapa.height - FIELD_MARGIN_Y * 2),
                r: 15,
                type: types[Math.floor(Math.random() * types.length)]
            });
        }
        for (let i = state.activePowerUps.length - 1; i >= 0; i -= 1) {
            const powerUp = state.activePowerUps[i];
            const picked = state.players.some(player => Math.hypot(powerUp.x - player.x, powerUp.y - player.y) < powerUp.r + player.r);
            if (picked) {
                const player = state.players.find(item => Math.hypot(powerUp.x - item.x, powerUp.y - item.y) < powerUp.r + item.r);
                if (player.activePower === 'BIG') player.r = player.rBase;
                player.activePower = powerUp.type;
                player.powerTimer = 360;
                if (powerUp.type === 'BIG') player.r = player.rBase * 1.55;
                state.activePowerUps.splice(i, 1);
                events.push('powerUp');
            }
        }
    }

    function resetKickoffPositions(state) {
        const centerX = state.mapa.width / 2;
        state.players.forEach(player => {
            const sameTeam = state.players.filter(item => item.equipo === player.equipo).indexOf(player);
            const offset = 150 + sameTeam * 50;
            player.x = player.equipo === state.ladoIzquierdo ? centerX - offset : centerX + offset;
            player.y = state.mapa.height / 2;
            player.vx = 0;
            player.vy = 0;
        });
    }

    function avanzar(state, deltaMs, inputs = {}) {
        if (!state || !state.ball) return { pasos: 0, eventos: [] };
        const step = Math.min(Math.max(Number(deltaMs) || 0, 0) / 16.666, 2);
        if (!step) return { pasos: 0, eventos: [] };
        const events = [];
        state.players.forEach(player => movePlayer(player, inputFor(inputs, player), state, step));
        collidePlayers(state.players);
        const ball = state.ball;
        ball.x += ball.vx * step;
        ball.y += ball.vy * step;
        ball.vx *= BALL_FRICTION;
        ball.vy *= BALL_FRICTION;

        state.players.forEach(player => collideBall(player, inputFor(inputs, player), state, events));
        const field = state.field;
        if (ball.y - ball.r < field.top) { ball.y = field.top + ball.r; ball.vy *= RESTITUTION; }
        if (ball.y + ball.r > field.bottom) { ball.y = field.bottom - ball.r; ball.vy *= RESTITUTION; }
        const inGoalMouth = ball.y >= state.goalTop && ball.y <= state.goalBottom;
        const leftGoal = ball.x - ball.r <= field.left && inGoalMouth;
        const rightGoal = ball.x + ball.r >= field.right && inGoalMouth;
        if (leftGoal || rightGoal) {
            state.goalDetected = true;
            state.lastGoalTeam = rightGoal ? 'red' : 'blue';
            events.push('gol');
            ball.x = state.mapa.width / 2;
            ball.y = state.mapa.height / 2;
            ball.vx = 0;
            ball.vy = 0;
            resetKickoffPositions(state);
            state.waitingForKickOff = true;
            state.timerStarted = false;
        } else {
            if (!inGoalMouth && ball.x - ball.r < field.left) { ball.x = field.left + ball.r; ball.vx *= RESTITUTION; }
            if (!inGoalMouth && ball.x + ball.r > field.right) { ball.x = field.right - ball.r; ball.vx *= RESTITUTION; }
        }
        advancePowerUps(state, events, step);
        state.players.forEach(player => {
            if (player.powerTimer > 0 && (player.powerTimer -= step) <= 0) {
                if (player.activePower === 'BIG') player.r = player.rBase;
                player.activePower = null;
            }
        });
        return { pasos: step, eventos: events };
    }

    const FisicaLocal = { crearEstado, avanzar, constantes: { ACCEL, MAX_VEL, FRICTION, BALL_FRICTION } };
    global.FisicaLocal = FisicaLocal;
    if (typeof module !== 'undefined' && module.exports) module.exports = FisicaLocal;
})(typeof globalThis !== 'undefined' ? globalThis : this);