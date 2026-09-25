/**
 * fisica-local.js
 * 
 * Motor de físicas de simulación de juego.
 * Calcula colisiones, aceleración, fricción y rebotes de la pelota 
 * y jugadores usando física 2D de círculo a círculo y límites rectangulares.
 * Diseñado de forma agnóstica para correr tanto en frontend como en Node.js.
 */
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
    const KICK_BUFFER_MS = 100;
    const KICK_RADIUS_EXTRA = 4;

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

    function crearEstado({ mapa, ladoIzquierdo = 'red', kickoffTeam = null, jugadores = [] } = {}) {
        const map = normalizeMap(mapa);
        const centerX = map.width / 2;
        const players = jugadores.map((player, index) => {
            const id = player.id == null ? `j${index + 1}` : String(player.id);
            const team = player.equipo === 'blue' ? 'blue' : 'red';
            const isLeft = team === ladoIzquierdo;
            const sameTeam = jugadores.slice(0, index).filter(item => (item.equipo === 'blue' ? 'blue' : 'red') === team).length;
            const rBase = Number.isFinite(player.rBase) ? player.rBase : (Number.isFinite(player.r) ? player.r : 20);
            return {
                id,
                equipo: team,
                x: isLeft ? centerX - 150 - sameTeam * 50 : centerX + 150 + sameTeam * 50,
                y: map.height / 2,
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
            kickoffTeam: kickoffTeam === 'blue' ? 'blue' : kickoffTeam === 'red' ? 'red' : null,
            clockMs: 0,
            lastKickPressAt: {},
            kickWasDown: {},
            timerStarted: false,
            goalResetPending: false,
            lastTouch: null,
            secondLastTouch: null,
            lastGoalTeam: null,
            goalDetected: false
        };
    }

    function inputFor(inputs, player) {
        return inputs && inputs[player.id] ? inputs[player.id] : {};
    }

    function isServingTeam(player, state) {
        if (state.kickoffTeam === 'red' || state.kickoffTeam === 'blue') {
            return player.equipo === state.kickoffTeam;
        }
        return player.id === state.kickoffPlayerId;
    }

    function movePlayer(player, input, state, step) {
        let moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (moveX && moveY) { moveX *= 0.7071; moveY *= 0.7071; }
        const speedMultiplier = player.activePower === 'SPEED' ? 1.55 : player.activePower === 'BIG' ? 0.7 : 1;
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
        let nextX = player.x + player.vx * step;
        let nextY = player.y + player.vy * step;
        const inGoalMouth = nextY + player.r > state.goalTop && nextY - player.r < state.goalBottom;
        const isLeftTeam = player.equipo === state.ladoIzquierdo;
        const leftGoalBack = state.field.left - GOAL_WIDTH;
        const rightGoalBack = state.field.right + GOAL_WIDTH;
        const enteringLeftBack = inGoalMouth && player.x - player.r >= leftGoalBack && nextX - player.r < leftGoalBack;
        const enteringRightBack = inGoalMouth && player.x + player.r <= rightGoalBack && nextX + player.r > rightGoalBack;
        if (enteringLeftBack || enteringRightBack) {
            nextX = player.x;
            player.vx = 0;
        }
        player.x = nextX;
        const inLeftGoalDepth = player.x > leftGoalBack && player.x < state.field.left;
        const inRightGoalDepth = player.x > state.field.right && player.x < rightGoalBack;
        const enteringTopRail = (inLeftGoalDepth || inRightGoalDepth)
            && player.y - player.r >= state.goalTop && nextY - player.r < state.goalTop;
        const enteringBottomRail = (inLeftGoalDepth || inRightGoalDepth)
            && player.y + player.r <= state.goalBottom && nextY + player.r > state.goalBottom;
        if (enteringTopRail) {
            nextY = player.y;
            if (player.vy < 0) player.vy = 0;
        } else if (enteringBottomRail) {
            nextY = player.y;
            if (player.vy > 0) player.vy = 0;
        }
        player.y = nextY;

        const centerX = state.mapa.width / 2;
        if (state.waitingForKickOff) {
            const centerCircleRadius = state.mapa.width * 0.085;
            const servingTeam = isServingTeam(player, state);
            const lineLimit = isLeftTeam ? centerX - player.r : centerX + player.r;
            if (isLeftTeam) player.x = Math.min(player.x, lineLimit);
            else player.x = Math.max(player.x, lineLimit);
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

    function enforceKickoffLimits(state) {
        if (!state.waitingForKickOff) return;
        const centerX = state.mapa.width / 2;
        const centerCircleRadius = state.mapa.width * 0.085;
        const centerY = state.mapa.height / 2;
        state.players.forEach(player => {
            const servingTeam = isServingTeam(player, state);
            const isLeftTeam = player.equipo === state.ladoIzquierdo;
            const lineLimit = isLeftTeam ? centerX - player.r : centerX + player.r;
            if (isLeftTeam && player.x > lineLimit) {
                player.x = lineLimit;
                if (player.vx > 0) player.vx = 0;
            } else if (!isLeftTeam && player.x < lineLimit) {
                player.x = lineLimit;
                if (player.vx < 0) player.vx = 0;
            }
            if (servingTeam) return;
            const dx = player.x - centerX;
            const dy = player.y - centerY;
            const distance = Math.hypot(dx, dy);
            const minimumDistance = centerCircleRadius + player.r;
            if (distance >= minimumDistance) return;
            const normalX = distance > 0 ? dx / distance : (isLeftTeam ? -1 : 1);
            const normalY = distance > 0 ? dy / distance : 0;
            player.x = centerX + normalX * minimumDistance;
            player.y = centerY + normalY * minimumDistance;
            const inwardVelocity = player.vx * normalX + player.vy * normalY;
            if (inwardVelocity < 0) {
                player.vx -= normalX * inwardVelocity;
                player.vy -= normalY * inwardVelocity;
            }
        });
    }

    function collideBall(player, input, state, events) {
        const ball = state.ball;
        if (state.waitingForKickOff && state.kickoffTeam && player.equipo !== state.kickoffTeam) return;
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        const distance = Math.hypot(dx, dy);
        const normalRadius = player.r + ball.r;
        const inputKick = !!input.kick || (
            state.clockMs - (state.lastKickPressAt[player.id] || -Infinity) <= KICK_BUFFER_MS
        );
        const kickingRadius = normalRadius + KICK_RADIUS_EXTRA;
        const contactRadius = inputKick ? kickingRadius : normalRadius + BALL_CONTACT_TOLERANCE;
        if (distance > contactRadius) return;
        const playerSpeed = Math.hypot(player.vx, player.vy);
        const angle = distance > 0
            ? Math.atan2(dy, dx)
            : (playerSpeed > 0 ? Math.atan2(player.vy, player.vx) : Math.atan2(1, 1));
        if (distance < normalRadius) {
            const overlap = normalRadius - distance;
            ball.x = player.x + Math.cos(angle) * normalRadius;
            ball.y = player.y + Math.sin(angle) * normalRadius;
            player.x -= Math.cos(angle) * overlap * 0.7;
            player.y -= Math.sin(angle) * overlap * 0.7;
        }
        state.secondLastTouch = state.lastTouch;
        state.lastTouch = player.id;
        if (!state.timerStarted) {
            state.timerStarted = true;
            state.waitingForKickOff = false;
            events.push('primerToque');
        }
        if (inputKick) {
            const speed = Math.hypot(player.vx, player.vy);
            const force = player.activePower === 'SUPER_KICK'
                ? Math.max(10, 9 + speed * 0.5)
                : Math.max(6, 5 + speed * 0.5);
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
        if (state.goalResetPending) {
            state.ball.x = state.mapa.width / 2;
            state.ball.y = state.mapa.height / 2;
            state.ball.vx = 0;
            state.ball.vy = 0;
            resetKickoffPositions(state);
            state.goalResetPending = false;
        }
        const events = [];
        state.clockMs += Math.max(Number(deltaMs) || 0, 0);
        state.players.forEach(player => {
            const input = inputFor(inputs, player);
            const wasDown = !!state.kickWasDown[player.id];
            if (input.kick && !wasDown) state.lastKickPressAt[player.id] = state.clockMs;
            state.kickWasDown[player.id] = !!input.kick;
        });
        state.players.forEach(player => movePlayer(player, inputFor(inputs, player), state, step));
        collidePlayers(state.players);
        enforceKickoffLimits(state);
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
        const leftGoal = ball.x <= field.left && inGoalMouth;
        const rightGoal = ball.x >= field.right && inGoalMouth;
        if (leftGoal || rightGoal) {
            state.goalDetected = true;
            const oppositeTeam = state.ladoIzquierdo === 'red' ? 'blue' : 'red';
            state.lastGoalTeam = rightGoal ? state.ladoIzquierdo : oppositeTeam;
            events.push('gol');
            state.activePowerUps.length = 0;
            state.powerUpSpawnTimer = 0;
            state.players.forEach(player => {
                player.activePower = null;
                player.powerTimer = 0;
                player.r = player.rBase;
            });
            state.goalResetPending = true;
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