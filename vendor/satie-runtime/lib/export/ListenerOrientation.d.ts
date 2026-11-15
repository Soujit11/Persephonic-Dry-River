/** Unit quaternion [x, y, z, w], rotating canonical +Z forward/+Y up into world space. */
export type ListenerQuaternion = [number, number, number, number];
type Vec3 = readonly [number, number, number];
export declare function validateListenerQuaternion(q: readonly number[]): ListenerQuaternion;
export declare function orientationFromVectors(forward: Vec3, up: Vec3): ListenerQuaternion;
export declare function orientationAxes(q: ListenerQuaternion): {
    right: [number, number, number];
    up: [number, number, number];
    forward: [number, number, number];
};
export declare function orientationFromYawPitch(yaw: number, pitch?: number): ListenerQuaternion;
export declare function interpolateOrientation(a: ListenerQuaternion, b: ListenerQuaternion, t: number): ListenerQuaternion;
export {};
//# sourceMappingURL=ListenerOrientation.d.ts.map