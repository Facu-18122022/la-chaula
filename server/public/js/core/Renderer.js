export default class Renderer{

    constructor(canvas){

        this.canvas = canvas;

        this.ctx = canvas.getContext('2d');

    }

    clear(){

        this.ctx.clearRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );

    }

    drawField(){

        const ctx = this.ctx;

        ctx.fillStyle = '#166534';

        ctx.fillRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );

        ctx.strokeStyle = '#ffffff';

        ctx.lineWidth = 4;

        ctx.strokeRect(
            20,
            20,
            this.canvas.width - 40,
            this.canvas.height - 40
        );

        ctx.beginPath();

        ctx.moveTo(this.canvas.width / 2, 20);

        ctx.lineTo(
            this.canvas.width / 2,
            this.canvas.height - 20
        );

        ctx.stroke();

        ctx.beginPath();

        ctx.arc(
            this.canvas.width / 2,
            this.canvas.height / 2,
            90,
            0,
            Math.PI * 2
        );

        ctx.stroke();
}

    drawPlayer(player){

        const ctx = this.ctx;

        ctx.beginPath();

        ctx.fillStyle = player.team === 'RED'
            ? '#dc2626'
            : '#2563eb';

        ctx.arc(
            player.x,
            player.y,
            player.radius,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle = 'white';

        ctx.font = '16px Arial';

        ctx.textAlign = 'center';

        ctx.fillText(
            player.nickname,
            player.x,
            player.y - 28
        );

    }

}