#!/usr/bin/env node
/** Refresh a local scene contract after editing. No server, generation or credits. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { identifySources } from './lib/edit/SourceIdentity.js';
import { parseWithWarnings, pathFor } from './lib/core/SatieParser.js';
import { generationPlanFor, templatePrompts, requestLanded } from './lib/core/GenRequests.js';

const hash = text => createHash('sha256').update(text).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}` : JSON.stringify(value);

export function rebindContract(script, contract, samples) {
  if (contract.version !== 'satie.scene/v1' || !contract.scene) throw new Error('Expected a satie.scene/v1 contract.');
  const { statements, world, warnings } = parseWithWarnings(script);
  if (!statements.length || warnings.length) throw new Error(`Fix script warnings before rebinding: ${warnings.map(w => w.message ?? String(w)).join('; ')}`);
  const surfaces = (contract.scene.events ?? []).flatMap(e => e.surfaces ?? []);
  const plan = generationPlanFor(statements, world, surfaces, () => 0.5);
  if (templatePrompts(statements).length && !plan.surfaces.length) throw new Error('Declare event surfaces in scene.contract.json before rebinding template banks.');
  // a take saved under its earlier key (per-text banks before 2026-09-30) is still the take
  const missing = [...new Set([...plan.requests.filter(r => !requestLanded(samples, r)).map(r => r.clipPath),
    ...statements.filter(s => !s.isGenerated && s.clip).map(s => pathFor(s.clip)).filter(k => !samples[k]?.url)])];
  if (missing.length) throw new Error(`Missing assets: ${missing.join(', ')}. Supply or realize them before rebinding.`);
  // Host changes are intentional local authoring too. The manifest remains the
  // author's responsibility, while hashes and listening evidence never carry over.
  const { revision: _revision, scriptHash: _scriptHash, ...base } = contract;
  return { ...base, revision: hash(canonical({ contract: base, script })), scriptHash: hash(script) };
}

export async function rebindDirectory(directory) {
  const dir = resolve(directory);
  const file = join(dir, 'scene.contract.json');
  const [script, contract, samples] = await Promise.all([
    readFile(join(dir, 'scene.satie'), 'utf8'), readFile(file, 'utf8').then(JSON.parse), readFile(join(dir, 'samples.json'), 'utf8').then(JSON.parse),
  ]);
  const identified = identifySources(script);
  const next = rebindContract(identified, contract, samples);
  if (identified !== script) {
    const scriptFile = join(dir, 'scene.satie');
    await writeFile(`${scriptFile}.${process.pid}.tmp`, identified);
    await rename(`${scriptFile}.${process.pid}.tmp`, scriptFile);
  }
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(next, null, 2) + '\n');
  await rename(temp, file);
  return next;
}

/** Run as a command, also through a symlink (npm's node_modules/.bin, pnpm's store, a linked package). */
const runAsCommand = () => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (runAsCommand()) {
  if (process.argv[2] !== 'rebind' || process.argv.length > 4) {
    console.error('Usage: satie-runtime rebind [public/satie]'); process.exitCode = 1;
  } else {
    try { const result = await rebindDirectory(process.argv[3] ?? 'public/satie'); console.log(`Updated local contract: ${result.revision}. Review the edited scene again before shipping.`); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
