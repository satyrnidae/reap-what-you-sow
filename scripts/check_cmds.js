// Parses every command in the generated functions with the game's own command parser.
//
// Runs the CmdCheck harness from the foxcraft-dungeon-loot-2 tests, which needs Java 25 and the 26.3 client jar and libs it
// caches. CmdCheck only knows foxcraft_dungeon_loot ids, so an error about a rwysow predicate, loot table or item modifier is
// dropped when the file for it exists under data/. Macro lines are not checked.
// Usage: node scripts/check_cmds.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const FUNCS = path.join(ROOT, 'data', 'rwysow', 'function');
const FDL = process.env.FDL_ROOT || 'D:/satyrnidae/minecraft/datapacks/foxcraft-dungeon-loot-2';
const CACHE = path.join(FDL, 'tests', '.cache');
const JAVA = process.env.JAVA25 || path.join(os.homedir(), '.jdks', 'temurin-25.0.4.1', 'bin', 'java.exe');
const REGISTRY_DIR = { predicate: 'predicate', item_modifier: 'item_modifier', loot_table: 'loot_table', advancement: 'advancement' };

function classpath() {
    const libs = fs.readdirSync(path.join(CACHE, 'libs')).filter((f) => f.endsWith('.jar')).sort().map((f) => path.join(CACHE, 'libs', f));
    return [path.join(CACHE, 'classes'), path.join(CACHE, 'mc', '26.3', '26.3.jar'), ...libs].join(path.delimiter);
}

// Output lines of one harness class run on a folder, cwd is the temp dir so nothing is written into the project
function run(main, folder) {
    const r = spawnSync(JAVA, ['-cp', classpath(), main, folder], { cwd: os.tmpdir(), encoding: 'utf8' });
    return { code: r.status, lines: `${r.stdout}${r.stderr}`.split(/\r?\n/).filter(Boolean) };
}

function realProblem(line) {
    const m = line.match(/Can't find element 'rwysow:([^']+)' in registry 'minecraft:(\w+)'/);
    if (!m) return true;
    const folder = REGISTRY_DIR[m[2]];
    return !(folder && fs.existsSync(path.join(ROOT, 'data', 'rwysow', folder, `${m[1]}.json`)));
}

const cmd = run('CmdCheck', FUNCS).lines.filter((l) => !l.includes('WARNING') && !l.includes('INFO'));
const summary = cmd.filter((l) => l.startsWith('files:'));
const bad = cmd.filter((l) => /^\S+:\d+:/.test(l) && realProblem(l));
console.log('functions', summary[0] || '(no summary)');
for (const l of bad) console.log('PROBLEM', l);
console.log(`${bad.length} real problems`);

// PackLoad loads the advancements and tags with the game's own registry codecs, catching bad condition formats and unknown ids
const load = run('PackLoad', ROOT);
const loaded = load.lines.filter((l) => l.startsWith('PackLoad'));
console.log(loaded[0] || '(no PackLoad summary)');
process.exit(bad.length || !summary.length || load.code ? 1 : 0);
