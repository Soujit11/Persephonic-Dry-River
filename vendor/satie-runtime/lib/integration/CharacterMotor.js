import { FootContactTracker } from './FootContactTracker.js';
export class CharacterMotor {
    options;
    position = { x: 0, y: 0, z: 0 };
    velocity = { x: 0, y: 0, z: 0 };
    grounded = true;
    immersion = 0;
    impact = 0;
    /** Resolved self-propelled horizontal travel per second; zero at walls/at rest. */
    movementSpeed = 0;
    /** Shared resolved-distance gait. Its phase may also drive the host's walk animation. */
    gait;
    time = 0;
    wet = false;
    contactBody = '';
    radius;
    eyeHeight;
    constructor(options) {
        this.options = options;
        this.radius = options.radius ?? 0.3;
        this.eyeHeight = options.eyeHeight ?? 1.7;
        for (const n of [this.radius, this.eyeHeight, options.stride ?? 0.75, options.speed ?? 1.8, options.gravity ?? 18, options.runSpeedMultiplier ?? 2, options.runStrideMultiplier ?? 1.5]) {
            if (!Number.isFinite(n) || n <= 0)
                throw new Error('Motor dimensions and rates must be positive and finite.');
        }
        if (!Number.isFinite(options.strideVariation ?? 0) || (options.strideVariation ?? 0) < 0 || (options.strideVariation ?? 0) > 0.25)
            throw new Error('Stride variation must be between zero and 0.25.');
        if (!Number.isFinite(options.waterResistance ?? 2) || (options.waterResistance ?? 2) < 0)
            throw new Error('Water resistance must be finite and nonnegative.');
        this.gait = new FootContactTracker({
            mode: 'distance', stepLength: options.stride ?? 0.75,
            strideVariation: options.strideVariation, random: options.random,
            maximumSpeed: Math.max(15, (options.speed ?? 1.8) * (options.runSpeedMultiplier ?? 2) + 1),
            onContact: event => this.options.contact(event),
        });
    }
    /** Teleports reset stride/impulse history. Position is the foot of the capsule. */
    teleport(x, y, z) {
        if (![x, y, z].every(Number.isFinite))
            throw new Error('Invalid character position');
        Object.assign(this.position, { x, y, z });
        Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
        this.gait.reset();
        this.impact = 0;
        this.contactBody = '';
        this.wet = false;
        this.movementSpeed = 0;
    }
    update(dt, inputX, inputZ, running, bodies) {
        if (![dt, inputX, inputZ].every(Number.isFinite) || dt <= 0)
            return;
        dt = Math.min(dt, 0.1);
        this.time += dt;
        const p = this.position, initial = this.options.surface(p.x, p.z);
        const speed = (this.options.speed ?? 1.8) * (running ? this.options.runSpeedMultiplier ?? 2 : 1) / (1 + Math.max(0, initial.depth) * (this.options.waterResistance ?? 2));
        const norm = Math.max(1, Math.hypot(inputX, inputZ));
        const control = this.impact > 0.15 ? 0 : 1;
        const vx = inputX / norm * speed * control, vz = inputZ / norm * speed * control;
        const bodySpeed = bodies.reduce((max, b) => Math.max(max, Math.hypot(b.velocityX ?? 0, b.velocityZ ?? 0)), 0);
        const slices = Math.max(1, Math.ceil((Math.hypot(vx + this.velocity.x, vz + this.velocity.z) + bodySpeed) * dt / (this.radius * 0.5)));
        const h = dt / slices;
        let touched = '';
        let travel = 0;
        for (let i = 0; i < slices; i++) {
            const oldX = p.x, oldZ = p.z;
            p.x += (vx + this.velocity.x) * h;
            p.z += (vz + this.velocity.z) * h;
            const remaining = dt - (i + 1) * h;
            for (const b of bodies) {
                if (b.maxY <= p.y + 0.15 || b.minY >= p.y + this.eyeHeight)
                    continue;
                // Bodies are supplied at frame end. Sweep their previous-to-current bounds with the player.
                const bx = (b.velocityX ?? 0) * remaining, bz = (b.velocityZ ?? 0) * remaining;
                const minX = b.minX - bx - this.radius, maxX = b.maxX - bx + this.radius;
                const minZ = b.minZ - bz - this.radius, maxZ = b.maxZ - bz + this.radius;
                if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ)
                    continue;
                const left = p.x - minX, right = maxX - p.x, back = p.z - minZ, front = maxZ - p.z;
                const penetration = Math.min(left, right, back, front);
                if (penetration === left)
                    p.x = minX;
                else if (penetration === right)
                    p.x = maxX;
                else if (penetration === back)
                    p.z = minZ;
                else
                    p.z = maxZ;
                const hitSpeed = Math.hypot(b.velocityX ?? 0, b.velocityZ ?? 0);
                if (hitSpeed > 0.5) {
                    touched = b.id;
                    if (this.contactBody !== b.id) {
                        this.contactBody = b.id;
                        this.gait.reset();
                        this.velocity.x = (b.velocityX ?? 0) * 0.65;
                        this.velocity.z = (b.velocityZ ?? 0) * 0.65;
                        this.velocity.y = Math.min(3, hitSpeed * 0.2);
                        this.impact = Math.min(1, hitSpeed / 8);
                        this.grounded = false;
                        this.options.contact({ kind: 'impact', body: b.id, surface: initial.material, speed: hitSpeed });
                    }
                }
            }
            // Only resolved progress in each commanded direction is self-propelled.
            // An obstacle can push a capsule backwards or sideways even below the
            // impact threshold; the magnitude of that correction is not walking.
            const walkedX = Math.min(Math.max(0, (p.x - oldX) * Math.sign(vx)), Math.abs(vx) * h);
            const walkedZ = Math.min(Math.max(0, (p.z - oldZ) * Math.sign(vz)), Math.abs(vz) * h);
            if (this.grounded && this.impact === 0)
                travel += Math.hypot(walkedX, walkedZ);
            const ground = this.options.surface(p.x, p.z);
            this.velocity.y -= (this.options.gravity ?? 18) * h;
            p.y += this.velocity.y * h;
            if (p.y <= ground.height) {
                if (!this.grounded && this.velocity.y < -1)
                    this.options.contact({ kind: 'land', surface: ground.material, speed: -this.velocity.y });
                p.y = ground.height;
                this.velocity.y = 0;
                this.grounded = true;
            }
            else
                this.grounded = false;
        }
        this.movementSpeed = travel / dt;
        if (!touched)
            this.contactBody = '';
        this.velocity.x *= Math.exp(-6 * dt);
        this.velocity.z *= Math.exp(-6 * dt);
        this.impact = Math.max(0, this.impact - dt * 0.65);
        const surface = this.options.surface(p.x, p.z);
        this.immersion = Math.max(0, Math.min(1, surface.depth / this.eyeHeight));
        const wet = surface.depth > (this.wet ? 0.01 : 0.03);
        if (wet !== this.wet) {
            this.wet = wet;
            this.gait.reset();
            this.options.contact({ kind: wet ? 'enter' : 'exit', surface: surface.material, speed: this.movementSpeed });
        }
        const stride = (this.options.stride ?? 0.75) * (running ? this.options.runStrideMultiplier ?? 1.5 : 1);
        this.gait.advance({ distance: travel, deltaSeconds: dt, grounded: this.grounded,
            enabled: this.impact === 0, position: p, surface: surface.material, time: this.time,
            heading: Math.atan2(vx, -vz), stepLength: stride });
    }
}
//# sourceMappingURL=CharacterMotor.js.map