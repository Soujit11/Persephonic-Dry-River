/**
 * Visual blocks of the `.satie` document (visual sonic designer, phase 2).
 *
 * Four scene-level declarations keep a Three.js visual inside the one
 * canonical document instead of beside it:
 *
 *   module <id> [key value ...]        the model-written Three.js module, raw
 *     ...javascript...                 lines, kept byte for byte (no comment
 *   endmodule                          stripping, no property parsing)
 *
 *   override <nodeId>                  edits applied to a visual node after the
 *     position x y z                   module's init: transform, visibility,
 *     rotation x y z   (degrees)       parent, removal, declared props
 *     scale s | x y z
 *     visible on|off
 *     parent <nodeId>|none
 *     removed
 *     prop <path> <value>
 *
 *   binding <nodeId>                   what a visual node IS physically; nothing
 *     body static|kinematic|dynamic    is inferred from pixels or names
 *          box WxHxD | sphere r | capsule h r | hull | mesh | none
 *     surface <material text>
 *     acoustic solid|none|porous <0..1>
 *     host <world host id>
 *     emitter
 *     decorative
 *     friction <n>  restitution <n>
 *
 *   automation <nodeId>                keyframes, read by the sequencer (phase 6)
 *     key <path> <time s> <value> [easing]
 *
 * Node ids are the ids the module declares (`userData.satie.id` or `name`),
 * so overrides and bindings survive renames of anything else in the script
 * (ADR-0004: overrides keyed by stable id, never by path).
 */
export type NodeId = string;
export declare const VISUAL_NODE_ID_RX: RegExp;
export type VisualPropValue = number | string | boolean;
export interface VisualModuleBlock {
    id: NodeId;
    /** Header tokens after the id, as written (`three`, `sha256`, and any future key). */
    meta: Record<string, string>;
    /** The lines between `module` and `endmodule`, joined with '\n', exactly as authored. */
    source: string;
    /** 1-based line of the `module` header. */
    lineNumber: number;
    /** 1-based line of `endmodule` (or the last line when unterminated). */
    endLine: number;
}
export interface VisualOverride {
    nodeId: NodeId;
    position?: [number, number, number];
    /** Degrees, as authored. */
    rotation?: [number, number, number];
    scale?: [number, number, number];
    visible?: boolean;
    /** `none` clears the parent (reparents to the scene root). */
    parent?: NodeId | 'none';
    removed?: boolean;
    props: Record<string, VisualPropValue>;
    lineNumber: number;
}
export type BodyMotion = 'static' | 'kinematic' | 'dynamic';
export type BodyShape = {
    type: 'box';
    size: [number, number, number];
} | {
    type: 'sphere';
    radius: number;
} | {
    type: 'capsule';
    height: number;
    radius: number;
} | {
    type: 'hull';
} | {
    type: 'mesh';
} | {
    type: 'none';
};
export interface VisualBinding {
    nodeId: NodeId;
    body?: {
        motion: BodyMotion;
        shape: BodyShape;
    };
    surface?: string;
    acoustic?: {
        kind: 'solid';
    } | {
        kind: 'none';
    } | {
        kind: 'porous';
        porous: number;
    };
    host?: string;
    emitter: boolean;
    decorative: boolean;
    friction?: number;
    restitution?: number;
    lineNumber: number;
}
export interface AutomationKey {
    path: string;
    time: number;
    value: VisualPropValue;
    easing?: string;
}
export interface VisualAutomation {
    nodeId: NodeId;
    keys: AutomationKey[];
    lineNumber: number;
}
export type Warn = (message: string, lineNumber: number) => void;
/**
 * Lift `module ... endmodule` fences out of the raw script before any comment
 * stripping: JavaScript is full of ` - ` and `#`. Fenced lines become blank so
 * every other line keeps its number. An unterminated fence runs to the end and
 * warns; a header without an id is left alone for the statement loop to warn on.
 */
export declare function extractModuleBlocks(rawLines: readonly string[], warn: Warn): {
    lines: string[];
    modules: VisualModuleBlock[];
};
export declare function parsePropValue(raw: string): VisualPropValue | null;
export declare function formatPropValue(value: VisualPropValue): string;
export declare function parseOverrideBlock(nodeId: string, block: readonly string[], lineNumber: number, warn: Warn): VisualOverride;
export declare function parseBindingBlock(nodeId: string, block: readonly string[], lineNumber: number, warn: Warn): VisualBinding;
export declare function parseAutomationBlock(nodeId: string, block: readonly string[], lineNumber: number, warn: Warn): VisualAutomation;
export declare function formatModuleBlock(block: Pick<VisualModuleBlock, 'id' | 'meta' | 'source'>): string;
export declare function formatOverrideBlock(o: VisualOverride): string;
export declare function formatBindingBlock(b: VisualBinding): string;
export declare function formatAutomationBlock(a: VisualAutomation): string;
/** Format a single override/binding/automation field line as the parser reads it (no indent). */
export declare const VISUAL_BLOCK_KINDS: readonly ["override", "binding", "automation"];
export type VisualBlockKind = (typeof VISUAL_BLOCK_KINDS)[number];
//# sourceMappingURL=SceneVisual.d.ts.map