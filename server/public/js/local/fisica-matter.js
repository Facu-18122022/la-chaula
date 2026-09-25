(function (global) {
    const MatterApi = global.Matter || (typeof require === 'function' ? require('matter-js') : null);
    const FIXED_STEP_MS = 16.666;
    const ACCEL = 0.25;
    const MAX_VEL = 3.4;
    const FRICTION_AIR = 0;
    const BALL_FRICTION_AIR = 0;
    const CONTACT_FRICTION = 0;
    const PLAYER_RESTITUTION = 0.05;
    const BALL_RESTITUTION = 0.8;
    const FIELD_MARGIN_X = 80;
    const FIELD_MARGIN_Y = 40;
    const GOAL_WIDTH = 45;
    const KICK_BUFFER_MS = 100;
    const BALL_CONTROL_RESPONSE = 0.25;
    const MIN_DELTA_MS = 0;
    const runtimeByState = new WeakMap();

    function assertMatter() {
        if (!MatterApi) throw new Error('Matter.js debe cargarse antes de fisica-matter.js');
    }

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

    function velocityMagnitude(body) {
        return Math.hypot(body.velocity.x, body.velocity.y);
    }

    function clampVelocity(body, maxSpeed) {
        const speed = velocityMagnitude(body);
        if (speed <= maxSpeed || speed === 0) return;
        MatterApi.Body.setVelocity(body, {
            x: body.velocity.x / speed * maxSpeed,
            y: body.velocity.y / speed * maxSpeed
        });
    }

    function setBodyPosition(body, x, y) {
        MatterApi.Body.setPosition(body, { x, y });
        MatterApi.Body.setVelocity(body, { x: 0, y: 0 });
        MatterApi.Body.setAngularVelocity(body, 0);
    }

    function createWalls(map) {
        const Bodies = MatterApi.Bodies;
        const field = map.field;
        const goalTop = map.goalTop;
        const goalBottom = map.goalBottom;
        const wallOptions = { isStatic: true, friction: CONTACT_FRICTION, restitution: BALL_RESTITUTION };
        const walls = [
            Bodies.rectangle(map.width / 2, -10, map.width, 20, { ...wallOptions, label: 'outer-top' }),
            Bodies.rectangle(map.width / 2, map.height + 10, map.width, 20, { ...wallOptions, label: 'outer-bottom' }),
            Bodies.rectangle(-10, map.height / 2, 20, map.height, { ...wallOptions, label: 'outer-left' }),
            Bodies.rectangle(map.width + 10, map.height / 2, 20, map.height, { ...wallOptions, label: 'outer-right' })
        ];
        const topSegmentHeight = goalTop - field.top;
        const bottomSegmentHeight = field.bottom - goalBottom;
        if (topSegmentHeight > 0) {
            walls.push(
                Bodies.rectangle(field.left - 10, (field.top + goalTop) / 2, 20, topSegmentHeight, { ...wallOptions, label: 'field-left-top' }),
                Bodies.rectangle(field.right + 10, (field.top + goalTop) / 2, 20, topSegmentHeight, { ...wallOptions, label: 'field-right-top' })
            );
        }
        if (bottomSegmentHeight > 0) {
            walls.push(
                Bodies.rectangle(field.left - 10, (goalBottom + field.bottom) / 2, 20, bottomSegmentHeight, { ...wallOptions, label: 'field-left-bottom' }),
                Bodies.rectangle(field.right + 10, (goalBottom + field.bottom) / 2, 20, bottomSegmentHeight, { ...wallOptions, label: 'field-right-bottom' })
            );
        }
        walls.push(
            Bodies.rectangle((field.left + field.right) / 2, field.top - 10, field.right - field.left, 20, { ...wallOptions, label: 'field-top' }),
            Bodies.rectangle((field.left + field.right) / 2, field.bottom + 10, field.right - field.left, 20, { ...wallOptions, label: 'field-bottom' })
        );
        return walls;
    }

    function createGoalSensors(map) {
        const sensorOptions = { isStatic: true, isSensor: true, label: 'goal-sensor' };
        return [
            MatterApi.Bodies.rectangle(map.field.left - GOAL_WIDTH / 2, (map.goalTop + map.goalBottom) / 2, GOAL_WIDTH, map.goalHeight, {
                ...sensorOptions,
                goalTeam: 'blue',
                goalId: 'goal-left',
                label: 'goal-left'
            }),
            MatterApi.Bodies.rectangle(map.field.right + GOAL_WIDTH / 2, (map.goalTop + map.goalBottom) / 2, GOAL_WIDTH, map.goalHeight, {
                ...sensorOptions,
                goalTeam: 'red',
                goalId: 'goal-right',
                label: 'goal-right'
            })
        ];
    }

    function createPlayerBody(player) {
        return MatterApi.Bodies.circle(player.x, player.y, player.r, {
            label: `player-${player.id}`,
            playerId: player.id,
            friction: CONTACT_FRICTION,
            frictionAir: 0,
            restitution: PLAYER_RESTITUTION,
            density: player.massa / (Math.PI * player.r * player.r)
        });
    }

    function createBallBody(ball) {
        return MatterApi.Bodies.circle(ball.x, ball.y, ball.r, {
            label: 'ball',
            friction: CONTACT_FRICTION,
            frictionAir: 0,
            restitution: BALL_RESTITUTION,
            density: ball.massa / (Math.PI * ball.r * ball.r)
        });
    }

    function isServingTeam(player, state) {
        if (state.kickoffTeam === 'red' || state.kickoffTeam === 'blue') {
            return player.equipo === state.kickoffTeam;
        }
        return player.id === state.kickoffPlayerId;
    }

    function isInsideGoalMouth(state, y) {
        return y >= state.goalTop && y <= state.goalBottom;
    }

    function constrainBallToField(state, runtime) {
        const ball = runtime.ballBody;
        const field = state.field;
        let x = ball.position.x;
        let y = ball.position.y;
        let vx = ball.velocity.x;
        let vy = ball.velocity.y;

        if (y - state.ball.r < field.top) {
            y = field.top + state.ball.r;
            if (vy < 0) vy = -vy * BALL_RESTITUTION;
        } else if (y + state.ball.r > field.bottom) {
            y = field.bottom - state.ball.r;
            if (vy > 0) vy = -vy * BALL_RESTITUTION;
        }

        if (!isInsideGoalMouth(state, y)) {
            if (x - state.ball.r < field.left) {
                x = field.left + state.ball.r;
                if (vx < 0) vx = -vx * BALL_RESTITUTION;
            } else if (x + state.ball.r > field.right) {
                x = field.right - state.ball.r;
                if (vx > 0) vx = -vx * BALL_RESTITUTION;
            }
        }

        if (x !== ball.position.x || y !== ball.position.y) {
            MatterApi.Body.setPosition(ball, { x, y });
        }
        if (vx !== ball.velocity.x || vy !== ball.velocity.y) {
            MatterApi.Body.setVelocity(ball, { x: vx, y: vy });
        }
    }

    function crearEstado({ mapa, ladoIzquierdo = 'red', kickoffTeam = null, jugadores = [], debugTunneling = false } = {}) {
        assertMatter();
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
        const state = {
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
            kickoffPlayerId: players[0] ? players[0].id : null,
            kickoffTeam: kickoffTeam === 'blue' ? 'blue' : kickoffTeam === 'red' ? 'red' : null,
            timerStarted: false,
            lastTouch: null,
            secondLastTouch: null,
            lastGoalTeam: null,
            goalDetected: false
        };
        const engine = MatterApi.Engine.create({ enableSleeping: false });
        engine.gravity.x = 0;
        engine.gravity.y = 0;
        const playerBodies = players.map(createPlayerBody);
        const ballBody = createBallBody(state.ball);
        const walls = createWalls(map);
        const goals = createGoalSensors(map);
        MatterApi.Composite.add(engine.world, [...playerBodies, ballBody, ...walls, ...goals]);
        const runtime = {
            engine,
            playerBodies,
            ballBody,
            goals,
            events: [],
            goalHandled: false,
            inputs: {},
            sweptContacts: new Set(),
            previousPlayerPositions: playerBodies.map(body => ({ x: body.position.x, y: body.position.y })),
            clockMs: 0,
            lastKickPressAt: {},
            kickWasDown: {},
            debugTunneling,
            lastBallPosition: { x: ballBody.position.x, y: ballBody.position.y }
        };
        runtimeByState.set(state, runtime);
        MatterApi.Events.on(engine, 'collisionStart', event => {
            event.pairs.forEach(pair => handleCollision(pair, state, runtime));
        });
        return state;
    }

    function inputFor(inputs, player) {
        return inputs && inputs[player.id] ? inputs[player.id] : {};
    }

    function applyInputVelocity(body, input, player, state, step) {
        let moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (moveX && moveY) { moveX *= 0.7071; moveY *= 0.7071; }
        const speedMultiplier = player.activePower === 'SPEED' ? 1.55 : player.activePower === 'BIG' ? 0.7 : 1;
        let vx = body.velocity.x + moveX * ACCEL * speedMultiplier * step;
        let vy = body.velocity.y + moveY * ACCEL * speedMultiplier * step;
        const speed = Math.hypot(vx, vy);
        const maxSpeed = MAX_VEL * speedMultiplier;
        if (speed > maxSpeed) {
            vx = vx / speed * maxSpeed;
            vy = vy / speed * maxSpeed;
        }
        vx *= 0.93;
        vy *= 0.93;
        MatterApi.Body.setVelocity(body, {
            x: vx,
            y: vy
        });
        let x = body.position.x + vx * step;
        let y = body.position.y + vy * step;
        const inGoalMouth = y + player.r > state.goalTop && y - player.r < state.goalBottom;
        const centerX = state.mapa.width / 2;
        const isLeftTeam = player.equipo === state.ladoIzquierdo;
        const leftGoalBack = state.field.left - GOAL_WIDTH;
        const rightGoalBack = state.field.right + GOAL_WIDTH;
        const enteringLeftBack = inGoalMouth
            && body.position.x - player.r >= leftGoalBack && x - player.r < leftGoalBack;
        const enteringRightBack = inGoalMouth
            && body.position.x + player.r <= rightGoalBack && x + player.r > rightGoalBack;
        if (enteringLeftBack || enteringRightBack) {
            x = body.position.x;
            vx = 0;
        }
        const inLeftGoalDepth = x > leftGoalBack && x < state.field.left;
        const inRightGoalDepth = x > state.field.right && x < rightGoalBack;
        const enteringTopRail = (inLeftGoalDepth || inRightGoalDepth)
            && body.position.y - player.r >= state.goalTop && y - player.r < state.goalTop;
        const enteringBottomRail = (inLeftGoalDepth || inRightGoalDepth)
            && body.position.y + player.r <= state.goalBottom && y + player.r > state.goalBottom;
        if (enteringTopRail) {
            y = body.position.y;
            if (vy < 0) vy = 0;
        } else if (enteringBottomRail) {
            y = body.position.y;
            if (vy > 0) vy = 0;
        }
        if (state.waitingForKickOff) {
            const centerCircleRadius = state.mapa.width * 0.085;
            const servingTeam = isServingTeam(player, state);
            const halfLimit = isLeftTeam ? centerX - player.r : centerX + player.r;
            const restrictedLimit = isLeftTeam
                ? centerX - centerCircleRadius - player.r
                : centerX + centerCircleRadius + player.r;
            const limit = servingTeam ? halfLimit : restrictedLimit;
            x = isLeftTeam ? Math.min(x, limit) : Math.max(x, limit);
        }
        x = Math.max(player.r, Math.min(state.mapa.width - player.r, x));
        y = Math.max(player.r, Math.min(state.mapa.height - player.r, y));
        MatterApi.Body.setPosition(body, { x, y });
    }

    function collidePlayers(state, runtime) {
        for (let i = 0; i < state.players.length; i += 1) {
            for (let j = i + 1; j < state.players.length; j += 1) {
                const first = state.players[i];
                const second = state.players[j];
                const firstBody = runtime.playerBodies[i];
                const secondBody = runtime.playerBodies[j];
                const dx = secondBody.position.x - firstBody.position.x;
                const dy = secondBody.position.y - firstBody.position.y;
                const distance = Math.hypot(dx, dy);
                const minDistance = first.r + second.r;
                if (!distance || distance >= minDistance) continue;
                const nx = dx / distance;
                const ny = dy / distance;
                const overlap = minDistance - distance;
                const correction = overlap * 0.8;
                MatterApi.Body.setPosition(firstBody, {
                    x: firstBody.position.x - nx * correction / 2,
                    y: firstBody.position.y - ny * correction / 2
                });
                MatterApi.Body.setPosition(secondBody, {
                    x: secondBody.position.x + nx * correction / 2,
                    y: secondBody.position.y + ny * correction / 2
                });
                const relativeVelocity = nx * (firstBody.velocity.x - secondBody.velocity.x)
                    + ny * (firstBody.velocity.y - secondBody.velocity.y);
                if (relativeVelocity <= 0) continue;
                const impulse = 2 * relativeVelocity / (first.massa + second.massa);
                MatterApi.Body.setVelocity(firstBody, {
                    x: firstBody.velocity.x - impulse * second.massa * nx,
                    y: firstBody.velocity.y - impulse * second.massa * ny
                });
                MatterApi.Body.setVelocity(secondBody, {
                    x: secondBody.velocity.x + impulse * first.massa * nx,
                    y: secondBody.velocity.y + impulse * first.massa * ny
                });
            }
        }
    }

    function closestPointOnSegment(start, end, point) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        if (!lengthSquared) return { x: start.x, y: start.y, t: 0 };
        const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
        return { x: start.x + dx * t, y: start.y + dy * t, t };
    }

    function resolveSweptPlayerBall(state, runtime) {
        const ballBody = runtime.ballBody;
        state.players.forEach((player, index) => {
            if (state.waitingForKickOff && state.kickoffTeam && player.equipo !== state.kickoffTeam) return;
            const playerBody = runtime.playerBodies[index];
            const previous = runtime.previousPlayerPositions[index];
            const closest = closestPointOnSegment(previous, playerBody.position, ballBody.position);
            const minimum = player.r + state.ball.r;
            const distance = Math.hypot(ballBody.position.x - closest.x, ballBody.position.y - closest.y);
            if (distance > minimum + 2) return;
            runtime.sweptContacts.add(index);
            collideBall(player, playerBody, inputFor(runtime.inputs, player), state, runtime);
        });
    }

    function collideBall(player, playerBody, input, state, runtime) {
        if (state.waitingForKickOff && state.kickoffTeam && player.equipo !== state.kickoffTeam) return;
        const ball = state.ball;
        const ballBody = runtime.ballBody;
        const dx = ballBody.position.x - playerBody.position.x;
        const dy = ballBody.position.y - playerBody.position.y;
        const distance = Math.hypot(dx, dy);
        const normalRadius = player.r + ball.r;
        const playerSpeed = Math.hypot(playerBody.velocity.x, playerBody.velocity.y);
        const inputKick = !!input.kick || (
            runtime.clockMs - (runtime.lastKickPressAt[player.id] || -Infinity) <= KICK_BUFFER_MS
        );
        const kickingRadius = normalRadius + 4;
        const contactRadius = inputKick ? kickingRadius : normalRadius;
        if (distance > contactRadius) return;
        const normalX = distance > 0
            ? dx / distance
            : playerSpeed > 0 ? playerBody.velocity.x / playerSpeed : 1;
        const normalY = distance > 0
            ? dy / distance
            : playerSpeed > 0 ? playerBody.velocity.y / playerSpeed : 0;
        const correctedDistance = normalRadius + 0.01;
        if (distance < correctedDistance) {
            const overlap = correctedDistance - distance;
            MatterApi.Body.setPosition(ballBody, {
                x: playerBody.position.x + normalX * correctedDistance,
                y: playerBody.position.y + normalY * correctedDistance
            });
            MatterApi.Body.setPosition(playerBody, {
                x: playerBody.position.x - normalX * overlap * 0.7,
                y: playerBody.position.y - normalY * overlap * 0.7
            });
        }
        if (inputKick) {
            const force = player.activePower === 'SUPER_KICK'
                ? Math.max(10, 9 + playerSpeed * 0.5)
                : Math.max(6, 5 + playerSpeed * 0.5);
            MatterApi.Body.setVelocity(ballBody, {
                x: normalX * force + playerBody.velocity.x * 0.5,
                y: normalY * force + playerBody.velocity.y * 0.5
            });
        } else {
            const ballNormalSpeed = ballBody.velocity.x * normalX + ballBody.velocity.y * normalY;
            const playerNormalSpeed = playerBody.velocity.x * normalX + playerBody.velocity.y * normalY;
            const controlTarget = Math.max(0, playerNormalSpeed);
            const normalSpeedDelta = (controlTarget - ballNormalSpeed) * BALL_CONTROL_RESPONSE;
            if (Math.abs(normalSpeedDelta) > 0.001) {
                MatterApi.Body.setVelocity(ballBody, {
                    x: ballBody.velocity.x + normalX * normalSpeedDelta,
                    y: ballBody.velocity.y + normalY * normalSpeedDelta
                });
            }
        }
        const finalVelocity = ballBody.velocity;
        const finalNormalSpeed = finalVelocity.x * normalX + finalVelocity.y * normalY;
        if (finalNormalSpeed < 0) {
            const tangentX = finalVelocity.x - normalX * finalNormalSpeed;
            const tangentY = finalVelocity.y - normalY * finalNormalSpeed;
            const reboundNormalSpeed = -finalNormalSpeed * BALL_RESTITUTION;
            MatterApi.Body.setVelocity(ballBody, {
                x: tangentX + normalX * reboundNormalSpeed,
                y: tangentY + normalY * reboundNormalSpeed
            });
        }
        state.secondLastTouch = state.lastTouch;
        state.lastTouch = player.id;
        if (!state.timerStarted) {
            state.timerStarted = true;
            state.waitingForKickOff = false;
            runtime.events.push('primerToque');
        }
    }

    function applyKick(playerBody, ballBody, player, input) {
        if (!input.kick) return false;
        const dx = ballBody.position.x - playerBody.position.x;
        const dy = ballBody.position.y - playerBody.position.y;
        const distance = Math.hypot(dx, dy);
        const playerSpeed = velocityMagnitude(playerBody);
        const normalX = distance > 0 ? dx / distance : playerSpeed > 0 ? playerBody.velocity.x / playerSpeed : 1;
        const normalY = distance > 0 ? dy / distance : playerSpeed > 0 ? playerBody.velocity.y / playerSpeed : 0;
        const kickSpeed = player.activePower === 'SUPER_KICK'
            ? Math.max(10, 9 + playerSpeed * 0.5)
            : Math.max(6, 5 + playerSpeed * 0.5);
        MatterApi.Body.setVelocity(ballBody, {
            x: normalX * kickSpeed + playerBody.velocity.x * 0.5,
            y: normalY * kickSpeed + playerBody.velocity.y * 0.5
        });
        return true;
    }

    function handleBallContact(playerBody, ballBody, player, state, runtime) {
        if (state.waitingForKickOff && state.kickoffTeam && player.equipo !== state.kickoffTeam) return;
        state.secondLastTouch = state.lastTouch;
        state.lastTouch = player.id;
        if (!state.timerStarted) {
            state.timerStarted = true;
            state.waitingForKickOff = false;
            runtime.events.push('primerToque');
        }
        applyKick(playerBody, ballBody, player, inputFor(runtime.inputs, player));
    }

    function handleCollision(pair, state, runtime) {
        const first = pair.bodyA;
        const second = pair.bodyB;
        const ballBody = first.label === 'ball' ? first : second.label === 'ball' ? second : null;
        const otherBody = ballBody === first ? second : ballBody === second ? first : null;
        if (ballBody && otherBody && otherBody.playerId) {
            return;
        }
        const goalBody = first.goalTeam ? first : second.goalTeam ? second : null;
        if (ballBody && goalBody && !runtime.goalHandled) {
            runtime.goalHandled = true;
            state.goalDetected = true;
            state.lastGoalTeam = goalBody.goalTeam;
            runtime.events.push('gol');
        }
    }

    function enforceKickoff(state, runtime) {
        if (!state.waitingForKickOff) return;
        const centerX = state.mapa.width / 2;
        const centerCircleRadius = state.mapa.width * 0.085;
        state.players.forEach((player, index) => {
            const body = runtime.playerBodies[index];
            const servingTeam = isServingTeam(player, state);
            const isLeftTeam = player.equipo === state.ladoIzquierdo;
            const halfLimit = isLeftTeam ? centerX - player.r : centerX + player.r;
            const restrictedLimit = isLeftTeam
                ? centerX - centerCircleRadius - player.r
                : centerX + centerCircleRadius + player.r;
            if (isLeftTeam) {
                MatterApi.Body.setPosition(body, {
                    x: Math.min(body.position.x, servingTeam ? halfLimit : restrictedLimit),
                    y: body.position.y
                });
            } else {
                MatterApi.Body.setPosition(body, {
                    x: Math.max(body.position.x, servingTeam ? halfLimit : restrictedLimit),
                    y: body.position.y
                });
            }
        });
    }

    function resetKickoffPositions(state, runtime) {
        const centerX = state.mapa.width / 2;
        state.players.forEach((player, index) => {
            const sameTeam = state.players.filter(item => item.equipo === player.equipo).indexOf(player);
            const offset = 150 + sameTeam * 50;
            setBodyPosition(runtime.playerBodies[index], player.equipo === state.ladoIzquierdo ? centerX - offset : centerX + offset, state.mapa.height / 2);
        });
    }

    function resetAfterGoal(state, runtime) {
        setBodyPosition(runtime.ballBody, state.mapa.width / 2, state.mapa.height / 2);
        resetKickoffPositions(state, runtime);
        state.activePowerUps.length = 0;
        state.powerUpSpawnTimer = 0;
        state.players.forEach((player, index) => {
            player.activePower = null;
            player.powerTimer = 0;
            if (player.r !== player.rBase) {
                const body = runtime.playerBodies[index];
                const currentRadius = body.circleRadius;
                player.r = player.rBase;
                MatterApi.Body.scale(body, player.rBase / currentRadius, player.rBase / currentRadius);
            }
        });
        state.waitingForKickOff = true;
        state.timerStarted = false;
        state.kickoffTeam = state.lastGoalTeam === 'red' ? 'blue' : 'red';
        const kickoffPlayer = state.players.find(player => player.equipo === state.kickoffTeam);
        state.kickoffPlayerId = kickoffPlayer ? kickoffPlayer.id : state.kickoffPlayerId;
        runtime.goalHandled = false;
    }

    function ballFullyCrossedGoal(ballBody, goalBody, ballRadius, field) {
        if (goalBody.goalId === 'goal-left') {
            return ballBody.position.x - ballRadius <= field.left - GOAL_WIDTH;
        }
        if (goalBody.goalId === 'goal-right') {
            return ballBody.position.x + ballRadius >= field.right + GOAL_WIDTH;
        }
        return false;
    }

    function crossedGoalLine(previous, current, state) {
        const inMouth = y => y >= state.goalTop - state.ball.r && y <= state.goalBottom + state.ball.r;
        if (!inMouth(current.y) && !inMouth(previous.y)) return null;
        if (previous.x > state.field.left - GOAL_WIDTH && current.x <= state.field.left - GOAL_WIDTH) return 'blue';
        if (previous.x < state.field.right + GOAL_WIDTH && current.x >= state.field.right + GOAL_WIDTH) return 'red';
        return null;
    }

    function advancePowerUps(state, runtime, events, step) {
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
            const playerIndex = state.players.findIndex(player => (
                Math.hypot(powerUp.x - player.x, powerUp.y - player.y) < powerUp.r + player.r
            ));
            if (playerIndex < 0) continue;
            const player = state.players[playerIndex];
            if (player.activePower === 'BIG') player.r = player.rBase;
            player.activePower = powerUp.type;
            player.powerTimer = 360;
            if (powerUp.type === 'BIG') player.r = player.rBase * 1.55;
            MatterApi.Body.scale(runtime.playerBodies[playerIndex], player.r / runtime.playerBodies[playerIndex].circleRadius, player.r / runtime.playerBodies[playerIndex].circleRadius);
            state.activePowerUps.splice(i, 1);
            events.push('powerUp');
        }

        state.players.forEach((player, index) => {
            if (player.powerTimer > 0 && (player.powerTimer -= step) <= 0) {
                if (player.activePower === 'BIG') {
                    const currentRadius = runtime.playerBodies[index].circleRadius;
                    player.r = player.rBase;
                    MatterApi.Body.scale(runtime.playerBodies[index], player.r / currentRadius, player.r / currentRadius);
                }
                player.activePower = null;
            }
        });
    }

    function syncState(state, runtime) {
        runtime.playerBodies.forEach((body, index) => {
            const player = state.players[index];
            player.x = body.position.x;
            player.y = body.position.y;
            player.vx = body.velocity.x;
            player.vy = body.velocity.y;
        });
        state.ball.x = runtime.ballBody.position.x;
        state.ball.y = runtime.ballBody.position.y;
        state.ball.vx = runtime.ballBody.velocity.x;
        state.ball.vy = runtime.ballBody.velocity.y;
    }

    function avanzar(state, deltaMs, inputs = {}) {
        if (!state || !state.ball) return { pasos: 0, eventos: [] };
        const runtime = runtimeByState.get(state);
        if (!runtime) throw new Error('El estado no fue creado con FisicaMatter.crearEstado');
        const elapsed = Math.max(Number(deltaMs) || MIN_DELTA_MS, MIN_DELTA_MS);
        if (!elapsed) return { pasos: 0, eventos: [] };
        const step = Math.min(elapsed / FIXED_STEP_MS, 2);
        runtime.events = [];
        runtime.inputs = inputs;
        runtime.sweptContacts.clear();
        runtime.clockMs += elapsed;
        const previousBallPosition = {
            x: runtime.ballBody.position.x,
            y: runtime.ballBody.position.y
        };
        state.players.forEach((player, index) => {
            runtime.previousPlayerPositions[index] = {
                x: runtime.playerBodies[index].position.x,
                y: runtime.playerBodies[index].position.y
            };
            const input = inputFor(inputs, player);
            const wasDown = !!runtime.kickWasDown[player.id];
            if (input.kick && !wasDown) runtime.lastKickPressAt[player.id] = runtime.clockMs;
            runtime.kickWasDown[player.id] = !!input.kick;
        });
        state.players.forEach((player, index) => {
            applyInputVelocity(runtime.playerBodies[index], inputFor(inputs, player), player, state, step);
        });
        enforceKickoff(state, runtime);
        collidePlayers(state, runtime);
        enforceKickoff(state, runtime);
        resolveSweptPlayerBall(state, runtime);
        const ballBody = runtime.ballBody;
        MatterApi.Body.setPosition(ballBody, {
            x: ballBody.position.x + ballBody.velocity.x * step,
            y: ballBody.position.y + ballBody.velocity.y * step
        });
        MatterApi.Body.setVelocity(ballBody, {
            x: ballBody.velocity.x * 0.985,
            y: ballBody.velocity.y * 0.985
        });
        if (runtime.debugTunneling) {
            const previous = runtime.lastBallPosition;
            const distance = Math.hypot(ballBody.position.x - previous.x, ballBody.position.y - previous.y);
            if (distance > state.ball.r + Math.max(...state.players.map(player => player.r))) {
                console.warn('[FisicaMatter] posible tunneling', {
                    before: previous,
                    after: { x: ballBody.position.x, y: ballBody.position.y },
                    distance
                });
            }
            runtime.lastBallPosition = { x: ballBody.position.x, y: ballBody.position.y };
        }
        state.players.forEach((player, index) => {
            if (!runtime.sweptContacts.has(index)) {
                collideBall(player, runtime.playerBodies[index], inputFor(inputs, player), state, runtime);
            }
        });
        constrainBallToField(state, runtime);
        const goalContacts = MatterApi.Query.collides(ballBody, runtime.goals);
        if (goalContacts.length && !runtime.goalHandled) {
            const goalBody = goalContacts[0].bodyA.goalTeam ? goalContacts[0].bodyA : goalContacts[0].bodyB;
            if (ballFullyCrossedGoal(ballBody, goalBody, state.ball.r, state.field)) {
                runtime.goalHandled = true;
                state.goalDetected = true;
                state.lastGoalTeam = goalBody.goalTeam;
                runtime.events.push('gol');
            }
        }
        if (!runtime.goalHandled) {
            const crossedTeam = crossedGoalLine(previousBallPosition, ballBody.position, state);
            if (crossedTeam) {
                runtime.goalHandled = true;
                state.goalDetected = true;
                state.lastGoalTeam = crossedTeam;
                runtime.events.push('gol');
            }
        }
        syncState(state, runtime);
        if (runtime.events.includes('gol')) resetAfterGoal(state, runtime);
        advancePowerUps(state, runtime, runtime.events, step);
        syncState(state, runtime);
        return { pasos: step, eventos: runtime.events.slice() };
    }

    const FisicaMatter = {
        crearEstado,
        avanzar,
        constantes: {
            ACCEL,
            MAX_VEL,
            FRICTION_AIR,
            BALL_FRICTION_AIR,
            CONTACT_FRICTION,
            PLAYER_RESTITUTION,
            BALL_RESTITUTION
        }
    };
    global.FisicaMatter = FisicaMatter;
    global.FisicaLocal = FisicaMatter;
    if (typeof module !== 'undefined' && module.exports) module.exports = FisicaMatter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
