export declare function daylightLevel(rawHour: number, overcast?: number): number;
/** The world's state as module params a drawing reads, and the runtime lights by (`world_light`). */
export declare function worldLightParams(spec: {
    time: {
        hour: number;
    };
    weather: {
        rain: number;
        wind: number;
        fog: number;
    };
}): Record<string, number>;
//# sourceMappingURL=daylight.d.ts.map