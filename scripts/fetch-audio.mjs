// Build the shipped sound effects from REAL CC0 / public-domain recordings (GDD 10).
//
//   node scripts/fetch-audio.mjs                 download packs (cached), process every entry, write ogg + manifest + CREDITS
//   node scripts/fetch-audio.mjs --key=door_open,creak_1     only these keys
//   node scripts/fetch-audio.mjs --dry           show what would happen, touch nothing
//   node scripts/fetch-audio.mjs --keep-wav      keep the intermediate wavs next to the cache (for listening/debug)
//   AUDIO_CACHE=/some/dir ...                    where downloaded packs are cached (default: <tmp>/floor15-audio-cache)
//
// Source of truth: scripts/audio-sources.json
//   packs[id]    { name, page, url, file, kind: zip|7z|file, author, license, licensePage, extract?: [unzip patterns] }
//   entries[]    { key, fetched:true, level (target mean loudness dBFS -> manifest volume), volume, items:[{pack, file, start, dur, gain, at, pitch, hp, lp}], hp, lp, echo,
//                  trimDb, fadeInMs, fadeOutMs, sr, peakDb, loop:{seconds, xfade} }
// Per entry the processing is always:
//   each item: decode -> mono 44.1 kHz -> trim(start,dur) -> optional pitch (tape-style, in semitones) -> gain -> delay (at)
//   mix of the items -> high-pass (default 90 Hz, phone speakers) -> optional low-pass / echo -> normalise to peakDb
//   (default -3.6 dBFS) -> trim leading/trailing silence (trimDb) -> short fades -> mono OGG Vorbis q3 at sr (default 22.05 kHz)
//   -> re-measure the encoded file; if its peak is above -3.0 dBFS the gain is lowered and it is encoded again.
// Loops (entry.loop) are cut to `seconds` and the tail is cross-faded (equal power) into the head so the file loops seamlessly.
// Downloaded files are untrusted data: they are only ever decoded by ffmpeg / unzip / 7z (or py7zr), never executed.
//
// Requirements: node >= 20, curl, ffmpeg + ffprobe (libvorbis), unzip; 7z or python3 with py7zr for the .7z packs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'assets', 'audio');
const SRC = join(HERE, 'audio-sources.json'), MANIFEST = join(OUT, 'manifest.json'), CREDITS = join(OUT, 'CREDITS.md');
const args = process.argv.slice(2), dry = args.includes('--dry'), keepWav = args.includes('--keep-wav');
const onlyKeys = (args.find((a) => a.startsWith('--key=')) || '').slice(6).split(',').filter(Boolean);
const CACHE = process.env.AUDIO_CACHE || join(tmpdir(), 'floor15-audio-cache');
const CC0_RE = /^(CC0|CC0 1\.0|Public Domain)\b/i;
const PEAK_DB = -3.6, PEAK_LIMIT_DB = -3.2; // peaks must stay at or below -3 dBFS; -3.2 leaves room for rounding

const run = (cmd, a, o = {}) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...o });
const ff = (a) => run('ffmpeg', ['-y', '-v', 'error', '-nostdin', ...a]);
function ffStats(file, af = '') { // volumedetect on a decoded file -> {max, mean}
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', `${af ? af + ',' : ''}volumedetect`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const mx = /max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr), mn = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr);
  if (!mx) throw new Error(`cannot measure ${file}: ${r.stderr.split('\n').slice(-3).join(' ')}`);
  return { max: parseFloat(mx[1]), mean: parseFloat(mn[1]) };
}
const duration = (f) => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
const num = (v) => String(+v.toFixed(4));

const doc = JSON.parse(readFileSync(SRC, 'utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entries = doc.entries.filter((e) => !onlyKeys.length || onlyKeys.includes(e.key));

// ---------- packs: download once, cache, extract ----------
function sevenZip(archive, dest) {
  for (const c of ['7z', '7zz', '7za', '7zr']) {
    const r = spawnSync(c, ['x', '-y', `-o${dest}`, archive], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return;
  }
  // python fallback: py7zr (pip install py7zr, or point PY7ZR_PATH at a pip --target dir). -I: no cwd / PYTHONPATH imports.
  const py = 'import sys, os\nif os.environ.get("PY7ZR_PATH"): sys.path.insert(0, os.environ["PY7ZR_PATH"])\nimport py7zr\nwith py7zr.SevenZipFile(sys.argv[1]) as z: z.extractall(sys.argv[2])';
  const r = spawnSync('python3', ['-I', '-c', py, archive, dest], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`cannot unpack ${archive}: install p7zip (7z) or "pip install py7zr" (${(r.stderr || '').split('\n').slice(-2).join(' ')})`);
}
const packDirs = new Map();
function ensurePack(id) {
  if (packDirs.has(id)) return packDirs.get(id);
  const p = doc.packs[id];
  if (!p) throw new Error(`unknown pack ${id}`);
  if (!p.verified || !CC0_RE.test(p.license || '')) throw new Error(`pack ${id}: licence "${p.license}" is not CC0 / public domain or not verified`);
  const dir = join(CACHE, id), done = join(dir, '.done');
  if (!existsSync(done)) {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, p.file);
    console.log(`download ${id} <- ${p.url}`);
    run('curl', ['-sSL', '--fail', '--retry', '3', '-o', file, p.url]);
    const head = readFileSync(file).subarray(0, 8);
    const magicOk = p.kind === 'zip' ? head[0] === 0x50 && head[1] === 0x4b : p.kind === '7z' ? head[0] === 0x37 && head[1] === 0x7a : head.length > 4 && !/^<(!|h)/i.test(head.toString('latin1'));
    if (!magicOk) throw new Error(`pack ${id}: downloaded file is not a ${p.kind} archive (HTML error page?)`);
    const x = join(dir, 'x');
    mkdirSync(x, { recursive: true });
    if (p.kind === 'zip') run('unzip', ['-q', '-o', file, ...(p.extract || []), '-d', x]);
    else if (p.kind === '7z') sevenZip(file, x);
    else copyFileSync(file, join(x, p.file));
    writeFileSync(done, new Date().toISOString());
  }
  packDirs.set(id, join(dir, 'x'));
  return packDirs.get(id);
}
function itemPath(it) {
  const base = ensurePack(it.pack), full = resolve(base, it.file);
  if (!full.startsWith(resolve(base) + sep) || !existsSync(full)) throw new Error(`missing ${it.pack}:${it.file}`);
  return full;
}

// ---------- processing ----------
function stage1(e, wav) { // mix of the items, master filters -> float wav at 44.1 kHz
  const items = e.items, inputs = [], fc = [];
  items.forEach((it, i) => {
    inputs.push('-i', itemPath(it));
    const f = [`[${i}:a]aformat=channel_layouts=mono`, 'aresample=44100'];
    if (it.start || it.dur) f.push(`atrim=start=${it.start || 0}${it.dur ? `:duration=${it.dur}` : ''}`, 'asetpts=PTS-STARTPTS');
    if (it.pitch) f.push(`asetrate=${Math.round(44100 * 2 ** (it.pitch / 12))}`, 'aresample=44100');
    f.push('highpass=f=30'); // DC and rumble in some sources
    if (it.hp) f.push(`highpass=f=${it.hp}`);
    if (it.lp) f.push(`lowpass=f=${it.lp}`);
    f.push(`volume=${it.gain || 0}dB`);
    if (it.fadeMs) f.push(`afade=t=in:d=${it.fadeMs / 1000}`);
    if (it.at) f.push(`adelay=${Math.round(it.at * 1000)}:all=1`);
    fc.push(f.join(',') + `[a${i}]`);
  });
  const mixIn = items.map((_, i) => `[a${i}]`).join('');
  const master = [`highpass=f=${e.hp ?? 90}:poles=2`];
  if (e.lp) master.push(`lowpass=f=${e.lp}`);
  if (e.echo) master.push(`aecho=${e.echo}`);
  if (e.eq) master.push(...[].concat(e.eq));
  fc.push(`${mixIn}amix=inputs=${items.length}:normalize=0:duration=longest,${master.join(',')}[m]`);
  ff([...inputs, '-filter_complex', fc.join(';'), '-map', '[m]', '-c:a', 'pcm_f32le', '-ar', '44100', wav]);
}
function stage2(e, wav, wav2) { // normalise + trim silence, or cut the seamless loop
  if (e.loop) {
    const L = e.loop.seconds, X = e.loop.xfade, len = duration(wav), s = e.loop.start || 0;
    if (len < s + L + X + 0.05) throw new Error(`${e.key}: loop needs ${s + L + X}s of material, have ${len.toFixed(2)}s`);
    // three reads of the same file (asplit deadlocks with concat): head fades in while the tail fades out, then the middle.
    const fc = `[0:a]atrim=start=${s}:duration=${X},asetpts=PTS-STARTPTS,afade=t=in:d=${X}:curve=qsin[h];` +
      `[1:a]atrim=start=${s + L}:duration=${X},asetpts=PTS-STARTPTS,afade=t=out:d=${X}:curve=qsin[t];` +
      `[2:a]atrim=start=${s + X}:duration=${L - X},asetpts=PTS-STARTPTS[mid];[h][t]amix=inputs=2:normalize=0:duration=longest[x];[x][mid]concat=n=2:v=0:a=1[o]`;
    ff(['-i', wav, '-i', wav, '-i', wav, '-filter_complex', fc, '-map', '[o]', '-c:a', 'pcm_f32le', wav2]);
  } else {
    const g = PEAK_DB - ffStats(wav).max, th = e.trimDb ?? -42, keep = (e.keepMs ?? 30) / 1000;
    const af = `volume=${num(g)}dB,areverse,silenceremove=start_periods=1:start_threshold=${th}dB:start_silence=${keep}:detection=peak,areverse,` +
      `silenceremove=start_periods=1:start_threshold=${th}dB:start_silence=0.004:detection=peak`;
    ff(['-i', wav, '-af', af, '-c:a', 'pcm_f32le', wav2]);
  }
}
function stage3(e, wav2, ogg, extra) { // fades, final level (peak measured AFTER the fades), encode
  const dur = duration(wav2), sr = e.sr || 22050;
  const fi = (e.fadeInMs ?? 3) / 1000, fo = Math.min((e.fadeOutMs ?? 50) / 1000, dur * 0.5);
  const fades = e.loop ? '' : `afade=t=in:d=${fi},afade=t=out:st=${Math.max(0, dur - fo).toFixed(4)}:d=${fo.toFixed(4)}`;
  const g = (e.peakDb ?? PEAK_DB) - ffStats(wav2, fades).max + extra;
  const af = [fades, `volume=${num(g)}dB`].filter(Boolean).join(',');
  ff(['-i', wav2, '-af', af, '-ac', '1', '-ar', String(sr), '-c:a', 'libvorbis', '-q:a', '3', ogg]);
  return dur;
}

function describe(e) {
  const parts = [];
  parts.push(e.items.length > 1 ? `mix of ${e.items.length} layers` : 'single take');
  const t = e.items.map((it) => (it.start || it.dur) ? `${it.start || 0}s+${it.dur || 'end'}s` : null).filter(Boolean);
  if (t.length) parts.push(`cut ${t.join(', ')}`);
  const pit = e.items.filter((it) => it.pitch).map((it) => `${it.pitch > 0 ? '+' : ''}${it.pitch} st`);
  if (pit.length) parts.push(`pitch ${pit.join('/')}`);
  parts.push(`high-pass ${e.hp ?? 90} Hz`);
  if (e.lp) parts.push(`low-pass ${e.lp} Hz`);
  if (e.echo) parts.push(`short room echo (${e.echo})`);
  if (e.loop) parts.push(`${e.loop.seconds} s seamless loop (${e.loop.xfade} s equal-power crossfade)`);
  else parts.push('silence trimmed');
  parts.push(`peak ${e.peakDb ?? PEAK_DB} dBFS`, e.loop ? 'no fades' : 'short fades', `mono ${(e.sr || 22050) / 1000} kHz OGG Vorbis q3`);
  return parts.join(', ');
}

const tmp = join(CACHE, '_work');
if (!dry) mkdirSync(tmp, { recursive: true });
let done = 0, failed = 0;
for (const e of entries) {
  if (!manifest.sounds[e.key]) { console.log(`skip ${e.key}: not in manifest`); continue; }
  try {
    for (const it of e.items) { const p = doc.packs[it.pack]; if (!p) throw new Error(`unknown pack ${it.pack}`); if (!p.verified || !CC0_RE.test(p.license || '')) throw new Error(`pack ${it.pack} is not verified CC0/PD`); }
    if (dry) { console.log(`would build ${e.key} from ${e.items.map((i) => `${i.pack}:${i.file}`).join(' + ')}`); continue; }
    const w1 = join(tmp, `${e.key}.1.wav`), w2 = join(tmp, `${e.key}.2.wav`), ogg = join(OUT, `${e.key}.ogg`);
    stage1(e, w1);
    let extra = 0, enc;
    for (let tries = 0; tries < 4; tries++) {
      if (!tries) stage2(e, w1, w2);
      const dur = stage3(e, w2, ogg, extra);
      enc = { ...ffStats(ogg), dur };
      if (enc.max <= PEAK_LIMIT_DB) break;
      extra -= enc.max - PEAK_LIMIT_DB + 0.3; // codec overshoot: lower the level and encode again
    }
    if (enc.max > PEAK_LIMIT_DB) throw new Error(`${e.key}: peak ${enc.max} dBFS stays above ${PEAK_LIMIT_DB}`);
    const prev = manifest.sounds[e.key];
    // manifest volume: the file is peak-normalised, so loudness is set per key by `level` (target mean loudness in dBFS RMS as heard in game)
    if (e.level != null) e.volume = Math.min(1, +(10 ** ((e.level - enc.mean) / 20)).toFixed(3));
    manifest.sounds[e.key] = { files: [`${e.key}.ogg`], volume: e.volume ?? prev.volume, loop: prev.loop ?? false, duration: +enc.dur.toFixed(2), event: prev.event, recorded: true, ...(prev.surface ? { surface: prev.surface } : {}) };
    e.fetched = true;
    e.edits = describe(e);
    e.measured = { durationSec: +enc.dur.toFixed(2), peakDb: enc.max, meanDb: enc.mean, bytes: statSync(ogg).size };
    if (!keepWav) { rmSync(w1, { force: true }); rmSync(w2, { force: true }); }
    console.log(`ok ${e.key.padEnd(20)} ${enc.dur.toFixed(2)}s peak ${enc.max} mean ${enc.mean} ${(statSync(ogg).size / 1024).toFixed(1)} KB`);
    done++;
  } catch (err) { failed++; console.error(`FAILED ${e.key}: ${(err.stderr || err.message || err).toString().split('\n').slice(-3).join(' ')}`); }
}

if (!dry) {
  writeFileSync(SRC, JSON.stringify(doc, null, 2) + '\n');
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  // recorded table in CREDITS.md (between the markers); make-audio.mjs owns the rest of the file
  const rows = doc.entries.filter((e) => e.fetched).map((e) => {
    const src = e.items.map((it) => { const p = doc.packs[it.pack]; return `[${p.name}](${p.page}) / ${it.file.split('/').pop()}`; });
    const auth = [...new Set(e.items.map((it) => doc.packs[it.pack].author))].join('; '), lic = [...new Set(e.items.map((it) => doc.packs[it.pack].license))].join('; ');
    return `| ${e.key}.ogg | ${String(manifest.sounds[e.key].event).replace(/\|/g, '/')} | ${[...new Set(src)].join('<br>')} | ${auth} | ${lic} | ${e.edits} |`;
  });
  const packRows = Object.entries(doc.packs).filter(([id]) => doc.entries.some((e) => e.fetched && e.items.some((it) => it.pack === id)))
    .map(([, p]) => `| [${p.name}](${p.page}) | ${p.author} | ${p.license} | ${p.licenseNote || 'licence stated on the page'} | ${p.url} |`);
  const R0 = '<!-- RECORDED:START -->', R1 = '<!-- RECORDED:END -->';
  const block = `${R0}\n| File | What | Source (pack page / file) | Author | License | Edits |\n|---|---|---|---|---|---|\n${rows.length ? rows.join('\n') : '| (none yet) | | | | | |'}\n\n### Source packs\n\n| Pack | Author | License | Licence check | Download |\n|---|---|---|---|---|\n${packRows.join('\n')}\n${R1}`;
  let c = existsSync(CREDITS) ? readFileSync(CREDITS, 'utf8') : '';
  c = c.includes(R0) ? c.slice(0, c.indexOf(R0)) + block + c.slice(c.indexOf(R1) + R1.length) : c + '\n' + block + '\n';
  writeFileSync(CREDITS, c);
  const total = readdirSync(OUT).filter((f) => f.endsWith('.ogg')).reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
  console.log(`total ogg size now ${(total / 1048576).toFixed(2)} MB`);
}
console.log(`fetch-audio: ${done} built, ${failed} failed${dry ? ' (dry run)' : ''}`);
if (failed) process.exit(1);
