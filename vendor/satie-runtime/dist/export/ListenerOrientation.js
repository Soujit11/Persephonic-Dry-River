export function validateListenerQuaternion(q) {
    if (!Array.isArray(q) || q.length !== 4 || !q.every(Number.isFinite) || Math.abs(Math.hypot(...q) - 1) > 1e-4)
        throw new Error('Listener orientation requires a finite unit quaternion [x,y,z,w]');
    const n = Math.hypot(...q);
    return q.map(v => v / n);
}
export function orientationFromVectors(forward, up) {
    const normalize = (v) => {
        const n = Math.hypot(...v);
        if (v.length !== 3 || !v.every(Number.isFinite) || n < 1e-12)
            throw new Error('Listener orientation requires finite nonzero forward and up vectors');
        return [v[0] / n, v[1] / n, v[2] / n];
    };
    const f = normalize(forward), suppliedUp = normalize(up);
    const r = normalize([suppliedUp[1] * f[2] - suppliedUp[2] * f[1], suppliedUp[2] * f[0] - suppliedUp[0] * f[2], suppliedUp[0] * f[1] - suppliedUp[1] * f[0]]);
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    const m00 = r[0], m01 = u[0], m02 = f[0], m10 = r[1], m11 = u[1], m12 = f[1], m20 = r[2], m21 = u[2], m22 = f[2];
    const trace = m00 + m11 + m22;
    let q;
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
    }
    else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
    }
    else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
    }
    else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
    }
    return validateListenerQuaternion(q);
}
export function orientationAxes(q) {
    const [x, y, z, w] = q;
    return {
        right: [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
        up: [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
        forward: [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
    };
}
export function orientationFromYawPitch(yaw, pitch = 0) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    return orientationFromVectors([sy * cp, sp, cy * cp], [-sy * sp, cp, -cy * sp]);
}
export function interpolateOrientation(a, b, t) {
    let dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const end = dot < 0 ? b.map(v => -v) : b;
    dot = Math.min(1, Math.abs(dot));
    let wa = 1 - t, wb = t;
    if (dot < .9995) {
        const angle = Math.acos(dot), sin = Math.sin(angle);
        wa = Math.sin((1 - t) * angle) / sin;
        wb = Math.sin(t * angle) / sin;
    }
    const q = a.map((v, i) => wa * v + wb * end[i]);
    const n = Math.hypot(...q);
    return q.map(v => v / n);
}
//# sourceMappingURL=ListenerOrientation.js.map