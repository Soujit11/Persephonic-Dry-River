/**
 * How bright the world's light is at an hour under its weather, as one number: 1 at a clear noon,
 * about 0.2 deep at night. One model for every renderer, so the procedural world and a drawing never
 * disagree about what time it is (2026-10-04: "make the scene darker" set the hour and the drawn place
 * stayed at noon). Same sun path as ProceduralWorld's `daylight`: rise at 6, noon at 12, set at 18.
 */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export function daylightLevel(rawHour, overcast = 0) {
    const hour = Number.isFinite(rawHour) ? rawHour : 12;
    const elev = Math.sin(((hour - 6) / 12) * Math.PI);
    const day = clamp01((elev + 0.10) / 0.35);
    const glow = Math.exp(-((elev / 0.22) ** 2)) * (1 - day * 0.45);
    const level = 0.2 + 0.8 * day + 0.25 * glow * (1 - day);
    return Math.min(1, level) * (1 - 0.4 * clamp01(overcast));
}
/** The world's state as module params a drawing reads, and the runtime lights by (`world_light`). */
export function worldLightParams(spec) {
    const r = (v) => Math.round(v * 100) / 100;
    const { rain, wind, fog } = spec.weather;
    return { world_hour: r(spec.time.hour), world_rain: r(rain), world_wind: r(wind), world_fog: r(fog), world_light: r(daylightLevel(spec.time.hour, Math.max(rain, fog))) };
}
//# sourceMappingURL=daylight.js.map