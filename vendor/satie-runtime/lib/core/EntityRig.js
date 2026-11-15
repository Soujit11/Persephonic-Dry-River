/** Pinned, locally served reference rigs. Bounds describe the supplied declared reference pose, not a species prior. */
const MODULAR_HUMAN = {
    referencePose: 'CharacterArmature|Idle',
    clips: ["CharacterArmature|Death", "CharacterArmature|Gun_Shoot", "CharacterArmature|HitRecieve", "CharacterArmature|HitRecieve_2", "CharacterArmature|Idle", "CharacterArmature|Idle_Gun", "CharacterArmature|Idle_Gun_Pointing", "CharacterArmature|Idle_Gun_Shoot", "CharacterArmature|Idle_Neutral", "CharacterArmature|Idle_Sword", "CharacterArmature|Interact", "CharacterArmature|Kick_Left", "CharacterArmature|Kick_Right", "CharacterArmature|Punch_Left", "CharacterArmature|Punch_Right", "CharacterArmature|Roll", "CharacterArmature|Run", "CharacterArmature|Run_Back", "CharacterArmature|Run_Left", "CharacterArmature|Run_Right", "CharacterArmature|Run_Shoot", "CharacterArmature|Sword_Slash", "CharacterArmature|Walk", "CharacterArmature|Wave"],
    once: ["CharacterArmature|Death", "CharacterArmature|Gun_Shoot", "CharacterArmature|HitRecieve", "CharacterArmature|HitRecieve_2", "CharacterArmature|Interact", "CharacterArmature|Kick_Left", "CharacterArmature|Kick_Right", "CharacterArmature|Punch_Left", "CharacterArmature|Punch_Right", "CharacterArmature|Roll", "CharacterArmature|Sword_Slash", "CharacterArmature|Wave"],
    idle: 'CharacterArmature|Idle', move: 'CharacterArmature|Walk', run: 'CharacterArmature|Run',
    attribution: 'Quaternius, Ultimate Modular Characters (CC0 1.0).',
    license: '/rigs/modular-human-license.md',
};
export const ENTITY_RIGS = {
    human_casual_v1: {
        ...MODULAR_HUMAN, label: "Casual man", path: "/rigs/human-casual.glb",
        sha256: "fea7e71271203e7073f1a073fa1208de7402df276f87f80e149bf7589b5d46b4",
        bounds: [0.5963969782543219, 1.8159395680119992, 0.6427058433419748],
    },
    human_suit_v1: {
        ...MODULAR_HUMAN, label: "Man in a suit", path: "/rigs/human-suit.glb",
        sha256: "82b81257c1e94cd9ee48cb1dcbe5ff506e81c9ce67cd0c5af542d8712dca546e",
        bounds: [0.596688579200739, 1.8164848424912121, 0.642943746187846],
    },
    human_dress_v1: {
        ...MODULAR_HUMAN, label: "Woman in a dress", path: "/rigs/human-woman.glb",
        sha256: "a6522fe53d15de21130a957d1bf2b8a9a58d4e4e9a12af646645b667a9bb2d17",
        bounds: [0.5343572993605619, 1.800275589096635, 0.5932997005422072],
    },
    human_v1: {
        label: 'Human animation reference', path: '/rigs/human.glb',
        sha256: '69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997',
        bounds: [.7244816900606041, 1.7827076911733768, .6928385691363594],
        referencePose: 'Idle_Loop',
        clips: ["A_TPose", "Crouch_Fwd_Loop", "Crouch_Idle_Loop", "Dance_Loop", "Death01", "Driving_Loop", "Fixing_Kneeling", "Hit_Chest", "Hit_Head", "Idle_Loop", "Idle_Talking_Loop", "Idle_Torch_Loop", "Interact", "Jog_Fwd_Loop", "Jump_Land", "Jump_Loop", "Jump_Start", "PickUp_Table", "Pistol_Aim_Down", "Pistol_Aim_Neutral", "Pistol_Aim_Up", "Pistol_Idle_Loop", "Pistol_Reload", "Pistol_Shoot", "Punch_Cross", "Punch_Jab", "Push_Loop", "Roll", "Sitting_Enter", "Sitting_Exit", "Sitting_Idle_Loop", "Sitting_Talking_Loop", "Spell_Simple_Enter", "Spell_Simple_Exit", "Spell_Simple_Idle_Loop", "Spell_Simple_Shoot", "Sprint_Loop", "Swim_Fwd_Loop", "Swim_Idle_Loop", "Sword_Attack", "Sword_Idle", "Walk_Formal_Loop", "Walk_Loop"],
        once: ["Death01", "Fixing_Kneeling", "Hit_Chest", "Hit_Head", "Interact", "Jump_Land", "Jump_Start", "PickUp_Table", "Pistol_Aim_Down", "Pistol_Aim_Neutral", "Pistol_Aim_Up", "Pistol_Reload", "Pistol_Shoot", "Punch_Cross", "Punch_Jab", "Roll", "Sitting_Enter", "Sitting_Exit", "Spell_Simple_Enter", "Spell_Simple_Exit", "Spell_Simple_Shoot", "Sword_Attack", "Sword_Idle"],
        idle: 'Idle_Loop', move: 'Walk_Loop', run: 'Jog_Fwd_Loop',
        attribution: 'Quaternius, Universal Animation Library Standard (CC0 1.0).',
        license: '/rigs/human-license.md',
    },
    fox_v1: {
        label: 'Fox reference', path: '/rigs/fox.glb',
        sha256: 'd97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7',
        bounds: [25.1854362488, 79.0289418321, 154.7198655647],
        clips: ['Survey', 'Walk', 'Run'], idle: 'Survey', move: 'Walk', run: 'Run',
        attribution: 'Model: PixelMannen (CC0). Rig/animation: tomkranis; glTF: Asobo Studio/scurest (CC BY 4.0).',
        license: '/rigs/fox-license.md',
    },
    cesium_man_v1: {
        label: 'Cesium human reference', path: '/rigs/cesium-man.glb',
        sha256: 'b7001eaeea8254bd44773bcd247e78696d94169388fbb2a1800fc69434e777d9',
        bounds: [1.1382738501, 1.5065504803, .3119541099],
        clips: ['animation_0'], idle: null, move: 'animation_0', run: null,
        attribution: 'Cesium, 2017 (CC BY 4.0). Cesium logo/trademark excluded from that copyright license.',
        license: '/rigs/cesium-man-license.md',
    },
    robot_expressive_v1: {
        label: 'Expressive robot', path: '/rigs/robot-expressive.glb',
        sha256: '047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319',
        bounds: [3.0994591557, 4.4612224463, 2.6851855605],
        clips: ['Dance', 'Death', 'Idle', 'Jump', 'No', 'Punch', 'Running', 'Sitting', 'Standing', 'ThumbsUp', 'Walking', 'WalkJump', 'Wave', 'Yes'],
        idle: 'Idle', move: 'Walking', run: 'Running',
        attribution: 'Tomás Laulhé / Quaternius, modified by Don McCurdy (CC0 1.0).',
        license: '/rigs/robot-license.md',
    },
};
/**
 * Where the clips touch the world, in seconds from the clip's start, MEASURED
 * from the bone tracks of `public/rigs/human.glb` by `scripts/clip-contacts.ts`
 * (sit: the pelvis settles on the seat; stand: it settles upright; grasp: the
 * bend over the table is deepest; drag: once per loop). The test
 * `EntityRig.contacts.test.ts` re-measures the GLB, so a number here is never
 * a guess. An action whose `animation` is one of these clips fires the
 * instance's `on <contact>` members at these times with the material of what
 * the body touches (EntityRuntime). The modular people rigs do not carry these
 * clips yet (2026-11-04); their bodies play the nearest clip they have while the
 * sound still fires, and the table serves them the moment the clips are
 * retargeted onto them.
 */
export const CLIP_CONTACTS = {
    Sitting_Enter: [{ at: 0.87, contact: 'sit' }],
    Sitting_Exit: [{ at: 0.7, contact: 'stand' }],
    PickUp_Table: [{ at: 0.5, contact: 'grasp' }],
    Push_Loop: [{ at: 0, contact: 'drag' }],
};
/** The contacts of a clip, in time order; none for a clip the table does not know. */
export function clipContactsFor(clip) {
    return (clip && Object.hasOwn(CLIP_CONTACTS, clip) ? CLIP_CONTACTS[clip] : []);
}
/** The bundled rigs that share the modular human's skeleton and clips: interchangeable bodies for one population. */
export function humanRigIds() {
    return Object.keys(ENTITY_RIGS).filter(id => ENTITY_RIGS[id].referencePose === MODULAR_HUMAN.referencePose);
}
/**
 * The rig one individual of a population wears. A class names one asset; a crowd of the same
 * body is a crowd of clones (Mateo, 2026-10-09: "the same two idiots"), so when the asset is a
 * modular human each individual takes the next human body in turn and a height of its own
 * (plus or minus six percent), seeded by its instance number so it keeps its look across edits.
 */
export function rigForInstance(spec, n) {
    const humans = humanRigIds();
    const start = humans.indexOf(spec.asset);
    const jitter = 0.94 + 0.12 * (((n * 0.6180339887) % 1 + 1) % 1);
    const heightM = Math.round(spec.heightM * jitter * 100) / 100;
    if (start < 0 || humans.length < 2)
        return { asset: spec.asset, heightM };
    return { asset: humans[(start + n) % humans.length], heightM };
}
export function parseEntityRig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const raw = value;
    if (Object.keys(raw).some(k => k !== 'asset' && k !== 'heightM') || typeof raw.asset !== 'string'
        || !Object.hasOwn(ENTITY_RIGS, raw.asset) || typeof raw.heightM !== 'number' || !Number.isFinite(raw.heightM)
        || raw.heightM < .03 || raw.heightM > 30)
        return null;
    const rig = { asset: raw.asset, heightM: raw.heightM };
    if (entityRigSize(rig).some(n => n > 30))
        return null;
    return rig;
}
/** Uniform normalization preserves the asset's proportions. Height is explicitly authored in metres. */
export function entityRigSize(rig) {
    const b = ENTITY_RIGS[rig.asset].bounds;
    return [b[0] / b[1] * rig.heightM, rig.heightM, b[2] / b[1] * rig.heightM];
}
//# sourceMappingURL=EntityRig.js.map