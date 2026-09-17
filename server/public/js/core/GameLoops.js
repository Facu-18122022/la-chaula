export default class GameLoop{

    constructor(update, render){

        this.update = update;
        this.render = render;

        this.lastTime = 0;

        this.running = false;

        this.loop = this.loop.bind(this);

    }

    start(){

        this.running = true;

        requestAnimationFrame(this.loop);

    }

    stop(){

        this.running = false;

    }

    loop(timestamp){

        if(!this.running) return;

        const deltaTime = timestamp - this.lastTime;

        this.lastTime = timestamp;

        this.update(deltaTime);

        this.render();

        requestAnimationFrame(this.loop);

    }

}