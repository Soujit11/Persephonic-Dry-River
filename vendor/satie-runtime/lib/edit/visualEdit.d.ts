/**
 * Text surgery for the visual blocks (visual sonic designer, phase 2): find,
 * upsert, remove and replace `module`, `override`, `binding` and `automation`
 * blocks without reformatting anything else. Every function is pure
 * (script in, script out) and touches only the lines of the block it names, so
 * the three-way transaction can merge disjoint edits byte for byte.
 */
import { type VisualBlockKind, type VisualModuleBlock } from '../core/SceneVisual.js';
/** 0-based line of the `<kind> <nodeId>` header, or -1. Module fences are excluded from the search. */
export declare function findVisualBlockLine(script: string, kind: VisualBlockKind, nodeId: string): number;
/** [start, end) 0-based line range of a block: header plus its indented lines (trailing blanks excluded). */
export declare function visualBlockRange(script: string, kind: VisualBlockKind, nodeId: string): [number, number] | null;
/**
 * Set one field line in a block (`position 1 2 3`, `prop material.color #fff`),
 * creating the block when it is missing. For `prop` and `key` lines the match
 * key is `prop <path>` / `key <path> <time>`, so other props stay. `null`
 * removes the matching line and drops the block when nothing is left.
 */
export declare function upsertVisualBlockField(script: string, kind: VisualBlockKind, nodeId: string, matchKey: string, line: string | null, at?: number): string;
/** Remove a whole block (and one blank line that separated it). */
export declare function removeVisualBlock(script: string, kind: VisualBlockKind, nodeId: string): string;
/** Replace a block's body entirely with the given formatted block text. */
export declare function replaceVisualBlock(script: string, kind: VisualBlockKind, nodeId: string, formatted: string, at?: number): string;
/** 0-based [start, end] inclusive lines of a module fence, or null. */
export declare function moduleBlockRange(script: string, id: string): [number, number] | null;
/** Replace (or append) a module fence; the header's unknown meta keys ride along untouched when `meta` keeps them. */
export declare function replaceModuleBlock(script: string, block: Pick<VisualModuleBlock, 'id' | 'meta' | 'source'>, at?: number): string;
export declare function removeModuleBlock(script: string, id: string): string;
//# sourceMappingURL=visualEdit.d.ts.map