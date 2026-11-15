/**
 * Trajectory generation via AI providers (Claude, OpenAI, Gemini).
 * Produces JavaScript code that generates a Float32Array LUT for spatial trajectories.
 */
const TRAJECTORY_GEN_SYSTEM_PROMPT = `You are a spatial trajectory designer for a 3D audio spatialization engine.

Given a behavioral description, output ONLY a JSON object with:
- "name": a short lowercase slug (1-3 words, underscores, no spaces). Examples: "bird_flight", "rossler_attractor", "falling_leaf"
- "code": a JavaScript function body that returns a Float32Array of interleaved [x,y,z,x,y,z,...] positions, normalized to [0,1] range.

The function receives these parameters:
- SIZE: number of points to generate (provided, typically 8192)
- SEED: integer random seed for reproducibility (0 = use any seed)
- Math: standard Math object

The code MUST:
1. Create a Float32Array of length SIZE * 3
2. Fill it with normalized [0,1] xyz positions
3. Return the array
4. Be self-contained (no imports, no external dependencies)
5. Produce smooth, interesting motion that matches the description
6. Use the provided SEED for any randomness (deterministic when SEED > 0)

BEHAVIORAL TRAJECTORIES (not just math):
- You can simulate state machines (fly, pause, fly again)
- Use noise/randomness with a seed for reproducibility
- Encode acceleration, deceleration, pauses
- Mix multiple behaviors across the timeline
- For attractors, use proper numerical integration (RK4)
- Always normalize output to [0,1] per axis at the end

The user may also provide these parameters:
- duration: cycle length in seconds (affects how many simulation steps per point)
- smoothing: 0-1, how much to smooth the path (apply moving average if > 0)
- ground: if true, constrain Y to 0 (ground plane movement only)
- variation: 0-1, how much speed varies (0=constant velocity, 1=lots of pauses and bursts)

Incorporate these parameters naturally into the generated code.

STRICT RULES:
- Output ONLY the JSON object, nothing else
- No markdown, no explanation
- The code must be valid JS that can be passed to new Function('SIZE', 'SEED', 'Math', code)
- Always normalize to [0,1] at the end

Example for a simple orbit:
{"name":"orbit","code":"const out = new Float32Array(SIZE * 3);\\nfor (let i = 0; i < SIZE; i++) {\\n  const t = i / SIZE * Math.PI * 2;\\n  out[i*3] = (Math.cos(t) + 1) * 0.5;\\n  out[i*3+1] = 0.5;\\n  out[i*3+2] = (Math.sin(t) + 1) * 0.5;\\n}\\nreturn out;"}

Example for a bird that perches:
{"name":"bird_flight","code":"const out = new Float32Array(SIZE * 3);\\nlet x=0.5,y=0.7,z=0.5,vx=0,vy=0,vz=0;\\nlet state='fly',timer=0;\\nlet s=SEED||42;\\nfunction rand(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;}\\nfor(let i=0;i<SIZE;i++){\\ntimer--;\\nif(timer<=0){state=rand()>0.7?'perch':'fly';timer=Math.floor(rand()*800+200);}\\nif(state==='fly'){vx+=(rand()-0.5)*0.002;vy+=(rand()-0.5)*0.001;vz+=(rand()-0.5)*0.002;vx*=0.99;vy*=0.99;vz*=0.99;x+=vx;y+=vy;z+=vz;}else{vx*=0.95;vy*=0.95;vz*=0.95;x+=vx;y+=vy;z+=vz;}\\nx=Math.max(0,Math.min(1,x));y=Math.max(0,Math.min(1,y));z=Math.max(0,Math.min(1,z));\\nout[i*3]=x;out[i*3+1]=y;out[i*3+2]=z;}\\nreturn out;"}`;
export async function generateTrajectoryFromPrompt(provider, userPrompt, params) {
    // Build enriched prompt with parameters
    let enriched = userPrompt;
    if (params) {
        const parts = [];
        if (params.duration !== undefined && params.duration !== 30)
            parts.push(`duration: ${params.duration}s`);
        if (params.resolution !== undefined && params.resolution !== 8192)
            parts.push(`resolution: ${params.resolution} points`);
        if (params.smoothing !== undefined && params.smoothing > 0)
            parts.push(`smoothing: ${params.smoothing}`);
        if (params.seed !== undefined && params.seed > 0)
            parts.push(`seed: ${params.seed}`);
        if (params.ground)
            parts.push('ground: constrain to Y=0 ground plane');
        if (params.variation !== undefined && params.variation !== 0.5)
            parts.push(`variation: ${params.variation} (0=constant, 1=very dynamic)`);
        if (parts.length > 0) {
            enriched += `\n\nParameters: ${parts.join(', ')}`;
        }
    }
    const raw = await provider.call({
        systemPrompt: TRAJECTORY_GEN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: enriched }],
        maxTokens: 2048,
    });
    const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
        name: String(parsed.name ?? 'trajectory').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        code: String(parsed.code),
    };
}
/** Longest code body accepted from the model. Real trajectories are a few hundred chars. */
export const TRAJECTORY_CODE_MAX_CHARS = 20_000;
/** A trajectory that has not returned in this long is a runaway loop, not a slow one. */
export const TRAJECTORY_EXEC_TIMEOUT_MS = 5_000;
function assertLut(points, size) {
    if (!(points instanceof Float32Array) || points.length !== size * 3) {
        const got = points instanceof Float32Array ? points.length : typeof points;
        throw new Error(`Trajectory code must return Float32Array of ${size * 3} elements, got ${got}`);
    }
    return points;
}
/**
 * Source of the sandbox worker. It strips the worker's network and storage
 * capabilities before evaluating the model's code, so a hostile trajectory
 * (a `move gen` prompt in a forked sketch is model-authored code the victim
 * runs) can burn CPU but cannot read the page, its storage, or the network.
 */
const SANDBOX_WORKER_SOURCE = `
const reply = self.postMessage.bind(self);
for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
  'indexedDB', 'caches', 'navigator', 'postMessage', 'Worker', 'SharedWorker', 'BroadcastChannel']) {
  try { Object.defineProperty(self, key, { value: undefined, configurable: false, writable: false }); } catch {}
}
self.onmessage = (event) => {
  const { code, size, seed } = event.data;
  try {
    const fn = new Function('SIZE', 'SEED', 'Math', code);
    const out = fn(size, seed, Math);
    if (out instanceof Float32Array) reply({ ok: true, points: out }, [out.buffer]);
    else reply({ ok: true, points: out });
  } catch (err) {
    reply({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
`;
function runInSandboxWorker(code, size, seed) {
    const url = URL.createObjectURL(new Blob([SANDBOX_WORKER_SOURCE], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return new Promise((resolve, reject) => {
        const finish = (settle) => { clearTimeout(timer); worker.terminate(); settle(); };
        const timer = setTimeout(() => finish(() => reject(new Error(`Trajectory code did not finish within ${TRAJECTORY_EXEC_TIMEOUT_MS} ms`))), TRAJECTORY_EXEC_TIMEOUT_MS);
        worker.onerror = (e) => finish(() => reject(new Error(e.message || 'Trajectory code failed')));
        worker.onmessage = (e) => finish(() => {
            if (!e.data.ok)
                return reject(new Error(e.data.error ?? 'Trajectory code failed'));
            try {
                resolve(assertLut(e.data.points, size));
            }
            catch (err) {
                reject(err);
            }
        });
        worker.postMessage({ code, size, seed });
    });
}
/**
 * Execute model-generated trajectory code and return the Float32Array LUT.
 *
 * In a browser the code runs in a capability-stripped Web Worker with a
 * timeout. Outside one (Node tests, offline scripts) there is no page to
 * protect and no Worker API, so it runs in-process.
 */
export async function executeTrajectoryCode(code, size = 8192, seed = 0) {
    if (code.length > TRAJECTORY_CODE_MAX_CHARS) {
        throw new Error(`Trajectory code is ${code.length} chars; the limit is ${TRAJECTORY_CODE_MAX_CHARS}`);
    }
    const hasWorkerRealm = typeof Worker !== 'undefined' && typeof Blob !== 'undefined'
        && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    if (hasWorkerRealm)
        return runInSandboxWorker(code, size, seed);
    const fn = new Function('SIZE', 'SEED', 'Math', code);
    return assertLut(fn(size, seed, Math), size);
}
/**
 * Post-process a trajectory LUT: apply smoothing and ground constraint.
 */
export function postProcessTrajectory(points, pointCount, smoothing, ground) {
    let result = points;
    // Apply moving average smoothing
    if (smoothing > 0) {
        const windowSize = Math.max(1, Math.floor(smoothing * 64));
        const smoothed = new Float32Array(result.length);
        for (let i = 0; i < pointCount; i++) {
            let sx = 0, sy = 0, sz = 0, count = 0;
            for (let j = -windowSize; j <= windowSize; j++) {
                const idx = ((i + j) % pointCount + pointCount) % pointCount;
                sx += result[idx * 3];
                sy += result[idx * 3 + 1];
                sz += result[idx * 3 + 2];
                count++;
            }
            smoothed[i * 3] = sx / count;
            smoothed[i * 3 + 1] = sy / count;
            smoothed[i * 3 + 2] = sz / count;
        }
        result = smoothed;
    }
    // Constrain to ground plane. By contract, normalized y=0 means ground level:
    // the engine remaps it to areaMin.y, and parser defaults keep areaMin.y >= 0.
    if (ground) {
        for (let i = 0; i < pointCount; i++) {
            result[i * 3 + 1] = 0;
        }
    }
    return result;
}
//# sourceMappingURL=TrajectoryGen.js.map