/**
 * The single source of truth for what a Satie property IS.
 *
 * Before this table, a property's identity was spread across nine hand-synced
 * places (two known-name sets, two standalone-flag sets, the reserved-word list,
 * the `parseSingle` switch, the `flushGroup` switch, the editor's tokenizer +
 * hover docs, and the in-app docs panel). Nothing checked them against each
 * other, so a property added to six of the nine silently half-worked: `place`
 * was dropped by ` and ` splitting, `field` and `occlusion` were dropped by
 * groups, and `speed`/`noise`/`size`/`prompt` sat in the known-name set with no
 * handler at all — which suppressed the typo warning without doing anything.
 *
 * Every derived list below is computed from `PROPERTIES`, and the conformance
 * test (`__tests__/Properties.conformance.test.ts`) asserts the behavioral
 * switches agree with what each entry declares. Drift is now a red test rather
 * than a silent no-op.
 *
 * To add a property: add ONE entry here with its `parse` kind. A declarative
 * kind (`flag` / `range` / `modulated` / `bound` / `scalar`) needs nothing else:
 * `parseSingle` looks the key up and applies it, and `flushGroup` inherits it
 * by the `group` rule using the kind's own "unset" test. A `custom` kind
 * registers its handler in `CUSTOM_PROPERTY_PARSERS` (SatieParser.ts); the
 * conformance test fails until it does.
 */
import type { Statement } from './Statement.js';
import type { RangeOrValue } from './RangeOrValue.js';
import type { InterpolationData } from './InterpolationData.js';
import type { FollowBinding } from './Signals.js';
/** The `Statement` fields whose type is assignable to `T` — what a declarative handler may write. */
type FieldsOfType<T> = {
    [K in keyof Statement]-?: Statement[K] extends T ? K : never;
}[keyof Statement];
export type RangeField = FieldsOfType<RangeOrValue>;
export type InterpolationField = FieldsOfType<InterpolationData | null>;
export type FollowField = FieldsOfType<FollowBinding | null>;
export type FlagField = FieldsOfType<boolean>;
export type ScalarField = FieldsOfType<number | null>;
/**
 * How the parser fills a statement from a property's value, declared with the
 * property so the parser is a lookup rather than a switch. The declarative
 * kinds name the `Statement` field(s) they write (typed against the class);
 * `custom` names a handler the parser registers under the property's
 * canonical name (`CUSTOM_PROPERTY_PARSERS` in SatieParser.ts), because the
 * registry cannot import the parser. The same declaration tells a group what
 * "the child said nothing" means for inheritance.
 */
export type ParseKind = 
/** The key alone sets a boolean. Groups OR it into every child. */
{
    kind: 'flag';
    field: FlagField;
}
/**
 * `RangeOrValue.parse`. `unset` is how a group tells the child said nothing:
 * `null` (the field's default is `RangeOrValue.Null`) or `zero-singleton`
 * (`start` defaults to the `RangeOrValue.Zero` SINGLETON, never Null, so
 * only identity distinguishes the untouched default from an explicit `start 0`).
 */
 | {
    kind: 'range';
    field: RangeField;
    unset?: 'null' | 'zero-singleton';
}
/** A range, or a `fade`/`jump` modulation into `interpolation` (a played size). */
 | {
    kind: 'modulated';
    field: RangeField;
    interpolation: InterpolationField;
}
/** A range, a modulation, or a `follow` signal binding (volume, pitch). */
 | {
    kind: 'bound';
    field: RangeField;
    interpolation: InterpolationField;
    follow: FollowField;
}
/** One number, clamped to `clamp`; a range warns. `hint` is the warning for a non-number. */
 | {
    kind: 'scalar';
    field: ScalarField;
    hint: string;
}
/** A bespoke sub-grammar; the parser registers the handler by name. */
 | {
    kind: 'custom';
};
/**
 * How a property is EDITED — the widget the mixer's property editor renders.
 *
 * This is representation, not semantics: the bounds describe what the LANGUAGE
 * accepts (a volume is 0–1, a pitch 0.1–4), never what any scene should
 * contain. Values that exceed a control's vocabulary — a `follow` binding, a
 * `fade` interpolation, a named color — fall back to the raw text row, so the
 * widget is a floor under typing, never a ceiling over the grammar.
 */
export type ControlKind = 
/** One number on a track. */
'slider'
/** A small integer: − / value / + stepper (a count, not a continuum). */
 | 'stepper'
/** A RangeOrValue: one track, two handles (`0.2to0.8`), collapsible to one. */
 | 'range'
/** An enumerated vocabulary. `options` here, or supplied at runtime (move / attach / follow). */
 | 'select'
/** Three drag-scrub number fields (`place x y z`). */
 | 'vec3'
/** A bare flag — present or absent. */
 | 'toggle'
/** A compound `key value` grammar: optional leading enum + named numeric parts. */
 | 'compound'
/** A color value; hex renders a picker, other spellings fall back to text. */
 | 'color'
/** Free text is the value's nature (a prompt, an open-vocabulary name). */
 | 'text';
export interface CompoundPart {
    key: string;
    min: number;
    max: number;
    step?: number;
    /** Slider maps position→value exponentially (Hz cutoffs). */
    log?: boolean;
}
export interface ControlSpec {
    kind: ControlKind;
    min?: number;
    max?: number;
    step?: number;
    /** Legal values for a `select` whose vocabulary the registry owns. */
    options?: string[];
    /** A compound grammar's leading enum choices (`filter lowpass …`). */
    head?: string[];
    /** A compound grammar's named numeric parts, in canonical order. */
    parts?: CompoundPart[];
}
/** How a property's value is written. */
export type ValueGrammar = 
/** Standalone flag — the key appears alone, with no value. */
'flag'
/** `RangeOrValue`: `0.5` or `0.2to0.8`. The engine samples a range per fire. */
 | 'range'
/** A single number. Writing a range here is a warning, not a silent truncation. */
 | 'scalar'
/** Its own sub-grammar (`move`, `place`, `color`, the DSP effects, …). */
 | 'custom';
/** What a group does with this property for its children. */
export type GroupRule = 
/** Never inherited. */
'none'
/** Applied to a child that has not set it itself. */
 | 'default'
/** Multiplied into the child's own value (volume, pitch). */
 | 'multiply'
/** Bespoke merge handled explicitly in `flushGroup` (color). */
 | 'special';
/**
 * The concern a property belongs to (scene-graph spec §9). The one field
 * five consumers used to re-derive by hand — the formatter's ordering, the
 * docs' sections, the editor's token colors, the AI prompt's property-order
 * block — now declared once and read everywhere.
 */
export type PropertyConcern = 'transform' | 'motion' | 'extent' | 'mix' | 'time' | 'trigger' | 'acoustics' | 'dsp' | 'gen' | 'look' | 'meta';
export interface PropertySpec {
    /** Canonical DSL name. */
    name: string;
    /** Accepted alternate spellings, dispatched to the same handler. */
    aliases?: string[];
    grammar: ValueGrammar;
    /** How the value is parsed and, for a group, when a child counts as unset. */
    parse: ParseKind;
    group: GroupRule;
    /** The value can follow a signal (`<name> follow <signal> <in> <out>`); conformance-tested against the parser. */
    follows?: true;
    /** Filled from PROPERTY_CONCERNS below (one table, conformance-tested). */
    concern?: PropertyConcern;
    /** Canonical format position, overriding the concern's band (rare). */
    ordinal?: number;
    /** Inclusive clamp applied to `scalar` values. */
    clamp?: [number, number];
    /**
     * Whether ` and <name>` splits a line here. False only for properties whose
     * value is free text that may legitimately contain the word (none today).
     */
    splitOnAnd?: boolean;
    /** Data-only value on its own line: no comment, variable or and expansion. */
    literalValue?: boolean;
    /** Short right-hand hint shown in editor completions. */
    detail: string;
    /** Hover/reference documentation. Markdown-ish; `\n` renders as a line break. */
    documentation: string;
    /** Overrides the completion insert text when it should not be `name + ' '`. */
    insertText?: string;
    /** Filled from PROPERTY_CONTROLS below (one table, conformance-tested). */
    control?: ControlSpec;
}
export declare const PROPERTIES: PropertySpec[];
/** Canonical name → spec, plus every alias → the same spec. */
/**
 * concern per property — one table, applied onto the specs below. The
 * conformance suite asserts every property appears here: a new property
 * without a concern is a red test, not a silent 'meta'.
 */
export declare const PROPERTY_CONCERNS: Record<string, PropertyConcern>;
/**
 * Canonical format band per concern (scriptFormat's ordering — what the
 * source IS, WHERE it is, how LOUD, WHEN, what the space does, how it looks).
 */
export declare const CONCERN_RANK: Record<PropertyConcern, number>;
/**
 * control per property — one table, applied onto the specs below, so the
 * mixer's editor is generated rather than hand-grown. Only properties whose
 * grammar defaults don't say enough appear here: a `flag` is a toggle and a
 * clamped `scalar` a slider on their own (see `controlFor`). Bounds are the
 * LANGUAGE's — what a value may be, not what a scene should choose.
 *
 * `text` entries are the deliberate escapes: values that ARE free text (a
 * prompt-like id, an open-vocabulary signal or zone name, a sub-grammar too
 * positional to widget). The conformance test pins this set — a new property
 * that lands in `text` accidentally is a red test, not a silent typing field.
 */
export declare const PROPERTY_CONTROLS: Record<string, ControlSpec>;
/**
 * The widget for a property, defaults resolved: an explicit entry wins, a
 * `flag` is a toggle, a clamped `scalar` is a slider over its clamp, an
 * unclamped `scalar` or `range` a bare-bounds track, and anything left is
 * text. Never returns undefined — the editor always knows what to draw.
 */
export declare function controlFor(name: string): ControlSpec;
/**
 * Canonical seed VALUE per property — the DSL spelling a ghost row starts
 * from, so an unset property is a widget already holding a number, never an
 * empty input asking for grammar. Seeds describe the LANGUAGE's sensible
 * origin (a volume of 0.8, a scale of 1, an occlusion of 0 — clear), never a
 * scene's content; the ten open-vocabulary escapes (`zone`, `when`, `emit`…)
 * deliberately have none, because any seed would put words in the scene.
 * The conformance test pins the rule: every non-text control has a seed.
 */
export declare const PROPERTY_SEEDS: Record<string, string>;
/**
 * The seed value a ghost row for this property starts from. A flag seeds
 * empty (the key alone IS the value); a text escape returns null — there is
 * nothing honest to pre-fill an open vocabulary with, so its ghost is a
 * click-to-type affordance instead of a widget.
 */
export declare function seedFor(name: string): string | null;
/**
 * Unset properties every voice OFFERS as a ghost row without asking — the
 * ones a hand reaches for on most voices. Everything else the registry knows
 * sits one "more…" away as the same kind of ghost. Applicability by voice
 * shape (a `variants` ghost only on a generated voice, an `every` ghost not
 * on a loop) is the editor's call — it is a fact of the statement, and this
 * set stays plain data.
 */
export declare const OFFERED_GHOSTS: readonly string[];
/** Unknown keys sort after DSP, before visuals — never last, never first. */
export declare const FORMAT_UNKNOWN_RANK = 6.5;
/**
 * The canonical format position of a property key (aliases resolve). This IS
 * the formatter's ordering — the hand-maintained RANK table in
 * lib/scriptFormat.ts was the sixth surface restating the grammar, and it
 * was missing sixteen properties.
 */
export declare function formatRank(key: string): number;
export declare const PROPERTY_SPECS: ReadonlyMap<string, PropertySpec>;
/** Every legal property name, canonical and aliased. Used for typo detection. */
export declare const KNOWN_PROPERTIES: ReadonlySet<string>;
/** Names that take no value — the key stands alone on its line. */
export declare const STANDALONE_FLAGS: ReadonlySet<string>;
/** Names that ` and ` splits a property line on. */
export declare const PROPERTY_KEYWORDS: ReadonlySet<string>;
/** Properties a group passes down to its children, by rule. */
export declare const INHERITED_PROPERTIES: ReadonlySet<string>;
/** Look up a spec by canonical name or alias. */
export declare function propertySpec(name: string): PropertySpec | undefined;
/**
 * Properties of an `entity` block's OWN lines (between `entity <id>` and its
 * first member). These are entity-only — they mean nothing on a voice and are
 * deliberately NOT in `KNOWN_PROPERTIES` (`speed` is also a `move` sub-token
 * there). The rest reuse a voice property's spec: `at` names the body's host,
 * `every` the spawn interval, `pace` the interval multiplier, `active` /
 * `quiet` gate spawning, `variants` / `visual` / `spl` are inherited by
 * members, and `move fly|walk` is how a population relocates.
 *
 * The behavioural ones (`dwell` … `window`) are the agent layer
 * (world/EntityAgents.ts) — a population individual as a world-anchored
 * body that relocates perch to perch, flees, takes turns and drops out of
 * the voice budget when far. All numbers: the script (or the model) says
 * how a thing behaves; the engine never knows what it is.
 */
export declare const ENTITY_PROPERTIES: PropertySpec[];
/** Every name legal on an entity block's own lines. */
export declare const ENTITY_PROPERTY_NAMES: ReadonlySet<string>;
/**
 * Sub-tokens that live INSIDE another property's value (`move ... speed 2`,
 * `visual sphere size 2`). They are deliberately NOT properties: writing one at
 * property level is a mistake, and keeping them out of `KNOWN_PROPERTIES` is
 * what lets the typo warning fire on it. Listed here only so the editor can
 * still offer and document them.
 */
export declare const SUB_TOKENS: {
    label: string;
    parent: string;
    detail: string;
    documentation: string;
}[];
export {};
//# sourceMappingURL=Properties.d.ts.map