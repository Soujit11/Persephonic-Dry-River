export { SatieEngine } from './core/SatieEngine.js';
export { parse, parseWithWarnings, tryParse, pathFor, sanitizeForClipName, SatieSyntaxError } from './core/SatieParser.js';
export { registerFolderContents, clearFolderRegistry, getRegisteredFolder, getRegisteredFolderDsp, parseFolderClip, folderRefsIn } from './core/SatieParser.js';
export { formatModuleBlock, formatOverrideBlock, formatBindingBlock, formatAutomationBlock, parsePropValue, formatPropValue, VISUAL_NODE_ID_RX } from './core/SceneVisual.js';
export { MIC_FORMATS, MIC_ARRAY_FORMATS, MIC_DEFAULT_RADIUS_M, findMic, } from './core/Scene.js';
export { Statement, WanderType } from './core/Statement.js';
export { PROPERTIES, PROPERTY_SPECS, KNOWN_PROPERTIES, STANDALONE_FLAGS, PROPERTY_KEYWORDS, INHERITED_PROPERTIES, propertySpec, SUB_TOKENS, ENTITY_PROPERTIES, ENTITY_PROPERTY_NAMES, PROPERTY_CONCERNS, CONCERN_RANK, formatRank, FORMAT_UNKNOWN_RANK, PROPERTY_CONTROLS, controlFor, PROPERTY_SEEDS, seedFor, OFFERED_GHOSTS, } from './core/Properties.js';
export { advanceRoute, routeProgress, ENTITY_MAX_PER_CLASS, ENTITY_MAX_TOTAL, POPULATION_COUNT_MAX, ROUTE_SEED_INSTANCES, } from './core/Entities.js';
export { KNOWN_SIGNALS, MEASURED_SIGNALS, mapFollow } from './core/Signals.js';
export { RangeOrValue } from './core/RangeOrValue.js';
export { InterpolationData, ModulationType, LoopMode } from './core/InterpolationData.js';
export { distanceRolloff, directPathGain, estimateEnclosure, reverbFromEnclosure, reverbFromRoom, occlusionCutoffHz } from './spatial/WorldAcoustics.js';
export { reverbFromMeasuredRoom, DEFAULT_WORLD_ALPHA } from './spatial/WorldAcoustics.js';
export { groundReflection, surfaceForLabel, surfaceFromAbsorption, exaggerateElevation, MONITOR_ELEVATION_GAIN, DEFAULT_GROUND_SURFACE } from './spatial/ElevationCues.js';
export { buildRoomGraph, roomAt, resolveDiffraction, diffractionOcclusion01, DIFFRACTION_MAX_OCCLUSION } from './spatial/Diffraction.js';
export { SatieDSPClock } from './core/SatieDSPClock.js';
export { SatieScheduler } from './core/SatieScheduler.js';
export { EventLog } from './core/EventLog.js';
export { receivedSplDb, distanceLossDb, sourceGain, windowCull, windowTopStep, volumeTrimDb, dbToGain, gainToDb, CLIP_LUFS, TOP_LUFS, TOP_GAIN, WINDOW_DB, WINDOW_TOP_MIN_DB, DEFAULT_SPL_DB, KNEE_DB, OCCLUSION_FULL_DB, } from './spatial/LevelModel.js';
export { measureLoudness, normalizeBufferLoudness, PEAK_CEILING } from './dsp/Loudness.js';
export { displayNameOf, normalizeOnArrival } from './core/SatieEngine.js';
// What a script buys: every gen take with the buffer key the engine looks up (servers realize scripts ahead of playback with this)
export { genRequestsFor, genOptionsFor, templateRequestsFor, templatePrompts, templateTake, templateRecording, legacyTemplateTake, requestLanded, templateBankPrefix, templateBankSize, takeCount, takeClipPath, recordingReferences, isTemplatePrompt, enrichGenPrompt, GEN_LOOPABLE_DEFAULT_S, GEN_DEFAULTS, TRIGGER_TAKE_BANK, TRIGGER_TAKE_DURATION_S } from './core/GenRequests.js';
export { mulberry32, hashSeed, fnv1a, defaultRng } from './core/Random.js';
// Spatial vocabulary + trajectories (embedders drive these for custom motion)
export { resolvePlacement, defaultRegionFor, isSemanticMotion, SEMANTIC_MOTIONS, SECTORS, DEPTHS, HEIGHTS, EXTENTS, } from './spatial/Placement.js';
export { getTrajectory, isTrajectoryName, isBuiltinTrajectory, registerTrajectoryFromLUT, unregisterTrajectory, listTrajectoryNames, } from './spatial/Trajectories.js';
// Procedural world: the script's `world` block → seeded geometry the voices bind to
export { normalizeWorldSpec, serializeWorldSpec, parseWorldSpecJSON, WORLD_SIZE_MIN_M, WORLD_SIZE_MAX_M, WORLD_SIZE_DEFAULT_M, MAX_SCATTER_INSTANCES, } from './world/worldSpec.js';
export { GEOMETRIC_HOSTS, RESERVED_SIGNALS, MAX_CONTROLS } from './world/worldSpec.js';
export { realizeWorld, heightAt, slopeDegAt, materialAt, featureById, featureAt, distanceToFeature, nearestFeaturePoint, insideFeature, isLiquidAt, overheadAt, overheadCoverAt, attachPoint, objectsOf, } from './world/worldRealize.js';
export { parseWorldBlock, formatWorldBlock, updateWorldBlockState } from './world/WorldBlock.js';
export { buildWorldManifest } from './world/WorldManifest.js';
export { compileWorldScript, emitPointOf } from './world/WorldCompile.js';
export { CATALOG, catalogRow, matchCatalog, applyCatalogPriors, catalogCoverageOf, describeCatalogCoverage } from './world/catalog.js';
export { createRng, createNoise2D, fbm } from './world/worldNoise.js';
// Offline rendering + export formats
export { renderOffline, renderObjectStems, buildRenderManifest, encodeWAV, downloadBlob, computeFOAGains, distanceAttenuation, renderAdmBwf, exportUSDZ, ATMOS_MAX_OBJECTS, exportIamf, buildIamfSequence, toStandaloneIamf, iamfLayout, isIamfRenderMode, IAMF_RENDER_MODES, IAMF_SAMPLE_RATE, positionAt, sampleVoicePositionTimeline, toPlaybackFrame, isStaticVoice, } from './export/index.js';
// Editing: the app's parse/format/snap helpers and the script surgeon (pure text → text), shared with the dev overlay
export * from './edit/propertyControls.js';
export * from './edit/SourceIdentity.js';
export * from './edit/MotionPlan.js';
export { upsertVoiceProperty, upsertVoicePlace, removeVoiceProperty, setVoiceKind, setVoiceTrigger, duplicateVoiceBlock, uniqueSourceId, deleteVoiceBlock, setVoiceSource, appendVoiceBlock, findVoiceLine } from './edit/scriptEdit.js';
export { CharacterMotor } from './integration/CharacterMotor.js';
export { FootContactTracker } from './integration/FootContactTracker.js';
export { HostAudioBridge } from './integration/HostAudioBridge.js';
export { measureTriggerOnset } from './dsp/TriggerOnset.js';
export { shortName, soundsLike, soundAction } from './core/voiceNames.js';
export { parseEntityBehavior } from './core/EntityBehavior.js';
export { ENTITY_RIGS, parseEntityRig, entityRigSize } from './core/EntityRig.js';
export { recordingBank, parseRecordingBanks, MAX_BANK_TAKES, MAX_RECORDING_SURFACES } from './core/RecordingBanks.js';
export { attachSynthAsset, synthAssetFor, synthAssetFromAudio } from './synth/asset.js';
export { createSynthAsset } from './synth/asset.js';
export { freezeSynthAsset } from './synth/freeze.js';
export { SYNTH_INSTRUMENTS, instrumentById } from './synth/instruments.js';
//# sourceMappingURL=index.js.map