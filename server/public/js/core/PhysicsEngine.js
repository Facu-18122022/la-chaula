export default class PhysicsEngine{

    static circleCollision(a, b){

        const dx = b.x - a.x;

        const dy = b.y - a.y;

        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < a.radius + b.radius;

    }

    static resolveCollision(a, b){

        const dx = b.x - a.x;

        const dy = b.y - a.y;

        const angle = Math.atan2(dy, dx);

        const force = 2;

        a.velocityX -= Math.cos(angle) * force;
        a.velocityY -= Math.sin(angle) * force;

        b.velocityX += Math.cos(angle) * force;
        b.velocityY += Math.sin(angle) * force;

    }

}