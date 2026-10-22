// Replace the generated placeholder sounds with real CC0 / public-domain recordings (GDD 10).
// NOT run yet (network to sound libraries was blocked). Usage:
//   node scripts/fetch-audio.mjs --dry                 show what would happen, touch nothing
//   node scripts/fetch-audio.mjs                       process every eligible entry in audio-sources.json
//   node scripts/fetch-audio.mjs --key=door_open,creak_1
//   FREESOUND_TOKEN=xxxx node scripts/fetch-audio.mjs  (freesound API token, free) enables freesoundId entries
//
// An entry is eligible when it has:
//   - freesoundId + FREESOUND_TOKEN: the API reports the licence; anything but CC0 is refused. Downloads the HQ OGG preview.
//   - or downloadUrl + verified:true + license matching CC0 / Public Domain (opengameart, wikimedia, packs).
// Per entry: download (curl, so the agent proxy / CA env works) -> trim -> high/low-pass, fades, optional pitch ->
// peak-normalize -> mono OGG Vorbis -> public/assets/audio/<key>.ogg. Then audio-sources.json (fetched:true, author, URL,
// edits), manifest.json (duration; volume/loop/event kept) and the recorded table in CREDITS.md are updated, and
// make-audio.mjs is re-run so the generated table drops the replaced keys (and never regenerates them again).
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'assets', 'audio');
const SRC = join(HERE, 'audio-sources.json'), MANIFEST = join(OUT, 'manifest.json'), CREDITS = join(OUT, 'CREDITS.md');
const args = process.argv.slice(2), dry = args.includes('--dry');
const onlyKeys = (args.find((a) => a.startsWith('--key=')) || '').slice(6).split(',').filter(Boolean);
const token = process.env.FREESOUND_TOKEN || '';
const CC0_RE = /(CC0|creative\s*commons\s*0|publicdomain\/zero|public\s*domain)/i;

const run = (cmd, a, o = {}) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });
const curlGet = (url, dest) => run('curl', ['-sSL', '--fail', '--retry', '2', '-o', dest, url]);
const curlJson = (url) => JSON.parse(run('curl', ['-sSL', '--fail', url]));

const doc = JSON.parse(readFileSync(SRC, 'utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const tmp = dry ? '' : mkdtempSync(join(tmpdir(), 'f15fetch-'));
let done = 0, skipped = 0, failed = 0;

function resolveSource(e) {
  if (e.freesoundId) {
    if (!token) return { skip: 'freesoundId set but FREESOUND_TOKEN is not' };
    const info = curlJson(`https://freesound.org/apiv2/sounds/${e.freesoundId}/?fields=id,name,username,license,url,previews&token=${token}`);
    if (!/publicdomain\/zero/.test(info.license)) return { skip: `licence is ${info.license}, not CC0` };
    return { url: info.previews['preview-hq-ogg'], ext: 'ogg', author: info.username, license: 'CC0 1.0', page: info.url };
  }
  if (e.downloadUrl) {
    if (!e.verified) return { skip: 'downloadUrl set but verified is not true' };
    if (!CC0_RE.test(e.license || '')) return { skip: `licence "${e.license}" is not CC0 / public domain` };
    if (!e.author) return { skip: 'author missing' };
    return { url: e.downloadUrl, ext: (e.downloadUrl.split('?')[0].match(/\.(\w{2,4})$/) || [, 'bin'])[1], author: e.author, license: e.license, page: e.sourceUrl || e.downloadUrl };
  }
  return { skip: 'no freesoundId / downloadUrl yet' };
}

function process1(e) {
  const s = resolveSource(e);
  if (s.skip) { skipped++; if (onlyKeys.length) console.log(`skip ${e.key}: ${s.skip}`); return; }
  console.log(`${dry ? 'would fetch' : 'fetch'} ${e.key} <- ${s.page} (${s.author}, ${s.license})`);
  if (dry) return;
  const raw = join(tmp, `${e.key}.${s.ext}`), outFile = join(OUT, `${e.key}.ogg`);
  try {
    curlGet(s.url, raw);
    const t = e.trim || {}, ed = e.edit || {}, sr = e.sr || 22050, dur = t.duration || 8;
    const fi = (ed.fadeInMs ?? 4) / 1000, fo = (ed.fadeOutMs ?? 40) / 1000;
    const pitch = ed.pitchSemitones ? `asetrate=${Math.round(44100 * 2 ** (ed.pitchSemitones / 12))},aresample=44100,` : '';
    const chain = (g) => `atrim=start=${t.start || 0}:duration=${dur},asetpts=PTS-STARTPTS,${pitch}highpass=f=${ed.highpassHz ?? 40},lowpass=f=${ed.lowpassHz ?? 10000},afade=t=in:d=${fi},afade=t=out:st=${Math.max(0, dur - fo)}:d=${fo}${g === undefined ? '' : `,volume=${g.toFixed(2)}dB`}`;
    const r = ffmpegStderr('ffmpeg', ['-hide_banner', '-i', raw, '-af', `${chain()},volumedetect`, '-f', 'null', '-']);
    const mv = /max_volume:\s*(-?[\d.]+) dB/.exec(r);
    if (!mv) throw new Error('could not measure level (empty or undecodable file?)');
    const target = 20 * Math.log10(e.norm || 0.79), gain = target - parseFloat(mv[1]);
    run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', chain(gain), '-ac', '1', '-ar', String(sr), '-c:a', 'libvorbis', '-q:a', '2', outFile]);
    const d = parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outFile]));
    const prev = manifest.sounds[e.key] || {};
    manifest.sounds[e.key] = { files: [`${e.key}.ogg`], volume: prev.volume ?? 0.5, loop: prev.loop ?? false, duration: +d.toFixed(2), event: prev.event || e.what, recorded: true, ...(prev.surface ? { surface: prev.surface } : {}) };
    e.fetched = true; e.author = s.author; e.license = s.license; e.sourceUrl = s.page; e.status = 'fetched';
    e.edits = `trim ${t.start || 0}s+${dur}s, HP ${ed.highpassHz ?? 40} Hz, LP ${ed.lowpassHz ?? 10000} Hz, fades ${fi * 1000}/${fo * 1000} ms${ed.pitchSemitones ? `, pitch ${ed.pitchSemitones} st` : ''}, ${gain.toFixed(1)} dB to peak ${e.norm || 0.79}, mono ${sr} Hz, OGG Vorbis`;
    e.fetchedOn = new Date().toISOString().slice(0, 10);
    done++;
  } catch (err) { failed++; console.error(`FAILED ${e.key}: ${(err.stderr || err.message || err).toString().split('\n').slice(-3).join(' ')}`); }
}
// ffmpeg prints volumedetect to stderr; capture it
function ffmpegStderr(cmd, a) { const r = spawnSync(cmd, a, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr.split('\n').slice(-4).join(' ')); return r.stderr; }

for (const e of doc.entries) { if (onlyKeys.length && !onlyKeys.includes(e.key)) continue; if (!manifest.sounds[e.key]) { console.log(`skip ${e.key}: not in manifest`); continue; } process1(e); }

if (!dry) {
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(SRC, JSON.stringify(doc, null, 2) + '\n');
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  // recorded table in CREDITS.md (between the markers); make-audio.mjs owns the generated table
  const rows = doc.entries.filter((e) => e.fetched).map((e) => `| ${e.key}.ogg | ${String(e.what).replace(/\|/g, '/')} | ${e.sourceUrl} | ${e.author} | ${e.license} | ${e.edits} |`);
  const R0 = '<!-- RECORDED:START -->', R1 = '<!-- RECORDED:END -->';
  const block = `${R0}\n| File | What | Source URL | Author | License | Edits |\n|---|---|---|---|---|---|\n${rows.length ? rows.join('\n') : '| (none yet) | | | | | |'}\n${R1}`;
  let c = existsSync(CREDITS) ? readFileSync(CREDITS, 'utf8') : '';
  c = c.includes(R0) ? c.slice(0, c.indexOf(R0)) + block + c.slice(c.indexOf(R1) + R1.length) : c + '\n' + block + '\n';
  writeFileSync(CREDITS, c);
  if (done) run('node', [join(HERE, 'make-audio.mjs')]); // refresh generated table, skip fetched keys
}
console.log(`fetch-audio: ${done} fetched, ${skipped} skipped (not eligible), ${failed} failed${dry ? ' (dry run)' : ''}`);
if (failed) process.exit(1);
