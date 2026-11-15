/**
 * Foot-ground edges are authoritative. Hosts without foot collision or animation
 * contact data can opt into a distance gait and use its phase for BOTH animation
 * and sound. This class never schedules audio, reads input keys, or runs a timer.
 */
export class FootContactTracker {
    options;
    /** Unwrapped radians. In distance mode, contacts occur at π, 2π, 3π, ... . */
    get phase() { return this.phaseRadians; }
    phaseRadians = 0;
    progress = 0;
    completed = 0;
    sequence = 0;
    strideScale = 1;
    nextFoot = -1;
    leftGrounded = false;
    rightGrounded = false;
    leftTime = -Infinity;
    rightTime = -Infinity;
    travelTime = -Infinity;
    stepLength;
    footSeparation;
    minimumSpeed;
    maximumSpeed;
    maximumDeltaSeconds;
    variation;
    constructor(options) {
        this.options = options;
        // Authority is part of the contact contract, not a live mutable host setting.
        this.options = Object.freeze({ ...options });
        if (options.mode !== 'contacts' && options.mode !== 'distance')
            throw new Error('Choose contacts or distance foot-contact mode.');
        if (options.mode === 'contacts' && options.contactSource !== 'physics' && options.contactSource !== 'animation') {
            throw new Error('Declare whether authoritative foot contacts come from physics or animation.');
        }
        this.stepLength = options.stepLength ?? 0.75;
        this.footSeparation = options.footSeparation ?? 0.28;
        this.minimumSpeed = options.minimumSpeed ?? 0.05;
        this.maximumSpeed = options.maximumSpeed ?? 15;
        this.maximumDeltaSeconds = options.maximumDeltaSeconds ?? 0.25;
        this.variation = options.strideVariation ?? 0;
        if (!Number.isFinite(this.stepLength) || this.stepLength <= 0 ||
            !Number.isFinite(this.footSeparation) || this.footSeparation < 0 ||
            !Number.isFinite(this.minimumSpeed) || this.minimumSpeed < 0 ||
            !Number.isFinite(this.maximumSpeed) || this.maximumSpeed <= this.minimumSpeed ||
            !Number.isFinite(this.maximumDeltaSeconds) || this.maximumDeltaSeconds <= 0 ||
            !Number.isFinite(this.variation) || this.variation < 0 || this.variation > 0.25) {
            throw new Error('Invalid foot-contact dimensions, motion limits or stride variation.');
        }
    }
    /** Rebase on respawn, teleport or locomotion-mode change. Contact sequence IDs remain unique. */
    reset() {
        this.resetGait();
        this.leftGrounded = false;
        this.rightGrounded = false;
        this.leftTime = -Infinity;
        this.rightTime = -Infinity;
        this.travelTime = -Infinity;
    }
    /** Returns true exactly when a valid new physical foot contact was emitted. */
    contact(input) {
        if (this.options.mode !== 'contacts')
            throw new Error('Authoritative contacts require contacts mode.');
        validatePosition(input.position);
        if ((input.foot !== -1 && input.foot !== 1) || !Number.isFinite(input.time) || input.time < 0 ||
            !Number.isFinite(input.speed) || input.speed < 0 ||
            (input.normalImpulse !== undefined && (!Number.isFinite(input.normalImpulse) || input.normalImpulse < 0)) ||
            (input.normalSpeed !== undefined && (!Number.isFinite(input.normalSpeed) || input.normalSpeed < 0))) {
            throw new Error('Invalid foot contact.');
        }
        const left = input.foot === -1;
        if (input.time < (left ? this.leftTime : this.rightTime))
            return false;
        const wasGrounded = left ? this.leftGrounded : this.rightGrounded;
        // Even disabled/quiet contacts update the latch. Enabling audio while a foot
        // is planted does not synthesize a new landing.
        if (left) {
            this.leftGrounded = input.grounded;
            this.leftTime = input.time;
        }
        else {
            this.rightGrounded = input.grounded;
            this.rightTime = input.time;
        }
        if (input.enabled === false || !input.grounded || wasGrounded)
            return false;
        const kind = input.kind ?? 'step';
        if (kind === 'step' && input.speed <= this.minimumSpeed)
            return false;
        if (kind === 'land' && !(input.normalImpulse || input.normalSpeed))
            return false;
        this.options.onContact({
            kind, foot: input.foot, position: { ...input.position }, surface: input.surface,
            speed: input.speed, time: input.time, normalImpulse: input.normalImpulse,
            normalSpeed: input.normalSpeed, provenance: this.options.contactSource === 'physics' ? 'physics-contact' : 'animation-contact', sequence: ++this.sequence,
        });
        return true;
    }
    /** Returns contacts crossed by this resolved motion sample; never extrapolates missing motion. */
    advance(input) {
        if (this.options.mode !== 'distance')
            throw new Error('Resolved travel requires explicit distance fallback mode.');
        validatePosition(input.position);
        const length = input.stepLength ?? this.stepLength;
        const heading = input.heading ?? 0;
        if (!Number.isFinite(input.distance) || input.distance < 0 ||
            !Number.isFinite(input.deltaSeconds) || input.deltaSeconds < 0 ||
            !Number.isFinite(input.time) || input.time < 0 || !Number.isFinite(heading) ||
            !Number.isFinite(length) || length <= 0)
            throw new Error('Invalid resolved ground travel.');
        if (input.time <= this.travelTime)
            return 0;
        this.travelTime = input.time;
        const speed = input.deltaSeconds > 0 ? input.distance / input.deltaSeconds : 0;
        if (input.teleported || input.enabled === false || !input.grounded ||
            input.deltaSeconds > this.maximumDeltaSeconds || speed > this.maximumSpeed ||
            input.distance / (length * (1 - this.variation)) > 32) {
            this.resetGait();
            return 0;
        }
        if (input.deltaSeconds === 0 || speed <= this.minimumSpeed)
            return 0;
        let distance = input.distance;
        let emitted = 0;
        // One physics update may cross multiple real contacts. Preserve those contacts
        // rather than limiting cadence to render frame rate; discontinuity guards above
        // prevent a resumed tab/teleport from producing an audio burst.
        while (distance > 0) {
            const spacing = length * this.strideScale;
            const untilContact = (1 - this.progress) * spacing;
            if (distance + 1e-10 < untilContact) {
                this.progress += distance / spacing;
                break;
            }
            distance = Math.max(0, distance - untilContact);
            this.progress = 0;
            this.completed++;
            this.phaseRadians = this.completed * Math.PI;
            const offset = this.nextFoot * this.footSeparation * 0.5;
            const event = {
                kind: 'step', foot: this.nextFoot,
                position: { x: input.position.x + Math.cos(heading) * offset,
                    y: input.position.y, z: input.position.z + Math.sin(heading) * offset },
                surface: input.surface, speed,
                time: Math.max(0, input.time - (speed > 0 ? distance / speed : 0)),
                provenance: 'distance-fallback', sequence: ++this.sequence,
            };
            this.nextFoot = this.nextFoot === -1 ? 1 : -1;
            this.strideScale = this.variation > 0
                ? 1 + ((this.options.random ?? Math.random)() * 2 - 1) * this.variation : 1;
            emitted++;
            this.options.onContact(event);
        }
        this.phaseRadians = (this.completed + this.progress) * Math.PI;
        return emitted;
    }
    resetGait() {
        this.phaseRadians = 0;
        this.progress = 0;
        this.completed = 0;
        this.strideScale = 1;
        this.nextFoot = -1;
    }
}
function validatePosition(position) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
        throw new Error('Foot contact position must be finite metres.');
    }
}
//# sourceMappingURL=FootContactTracker.js.map