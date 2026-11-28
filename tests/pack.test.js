// Structural checks on the pack sources and mc-build output. Run after `npm run build`, npm run test:unit does both.
// Behavior needs a running game, see the gametests in gametest/.
// Usage: node --test tests/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'rwysow');
const FUNCS = path.join(DATA, 'function');
const CFG = '#config.enable_pitcher_crop rwysow';
const MARKER = 'type=minecraft:interaction,tag=rwysow.marker';
// name: [mature state, reset state, marker height]. The marker is 0.03125 bigger than the outline on every side, so the
// height is the outline height plus 0.0625 and the box starts 0.03125 below the block floor. Width is 1.0 + 0.0625.
const MARGIN = '0.03125';
const WIDTH = '1.0625';
const CROPS = {
    wheat: ['minecraft:wheat[age=7]', 'minecraft:wheat[age=0]', '1.0625'],
    carrots: ['minecraft:carrots[age=7]', 'minecraft:carrots[age=0]', '0.625'],
    potatoes: ['minecraft:potatoes[age=7]', 'minecraft:potatoes[age=0]', '0.625'],
    beetroots: ['minecraft:beetroots[age=3]', 'minecraft:beetroots[age=0]', '0.5625'],
    nether_wart: ['minecraft:nether_wart[age=3]', 'minecraft:nether_wart[age=0]', '0.9375'],
};
const PITCHER_LOWER = 'minecraft:pitcher_crop[age=4,half=lower]';
const PITCHER_UPPER = 'minecraft:pitcher_crop[age=4,half=upper]';
const PITCHER_RESET = 'minecraft:pitcher_crop[age=0,half=lower]';
const ALL = [...Object.keys(CROPS), 'pitcher_crop'];

// The settings of mcb.config.js, the same numbers the sources are built with
const settings = () => require(path.join(ROOT, 'mcb.config.js')).settings;
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
const func = (name) => read(path.join(FUNCS, `${name}.mcfunction`));
const lines = (name) => func(name).split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim());
const tag = (p) => readJson(path.join(ROOT, 'data', p)).values;
const has = (list, item, msg) => assert.ok(list.includes(item), msg || `missing: ${item}`);
const walk = (dir, ext) => fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));

describe('Scaffold', () => {
    it('pack format 121', () => {
        const pack = readJson(path.join(ROOT, 'pack.mcmeta')).pack;
        assert.equal(pack.min_format, 121);
        assert.equal(pack.max_format, 121);
    });

    it('mc-build pinned', () => {
        assert.equal(readJson(path.join(ROOT, 'package.json')).dependencies['mc-build'], '4.2.0');
    });

    it('settings and module', () => {
        const cfg = settings();
        assert.ok(Number.isInteger(cfg.rayStepCount) && cfg.rayStepCount > 0);
        assert.ok(Number.isInteger(cfg.markerTicks) && cfg.markerTicks > 0);
        assert.ok(read(path.join(ROOT, 'src', 'config.js')).includes('mcb.config.js'));
    });

    it('load tagged', () => {
        has(tag('minecraft/tags/function/load.json'), 'rwysow:load');
    });

    it('load adds the objective', () => {
        has(lines('load'), 'scoreboard objectives add rwysow dummy "Reap What You Sow"');
    });

    it('load defaults config only when unset', () => {
        const line = lines('load').find((l) => l.includes(CFG));
        assert.ok(line.startsWith(`execute unless score ${CFG} matches `), line);
        assert.ok(line.endsWith(`scoreboard players set ${CFG} 0`), line);
    });

    it('uninstall cleans up everything', () => {
        const body = lines('uninstall');
        has(body, `kill @e[${MARKER}]`);
        has(body, 'advancement revoke @a only rwysow:use/on_interact');
        has(body, 'scoreboard objectives remove rwysow');
    });
});

describe('Tick', () => {
    it('tick tagged', () => {
        has(tag('minecraft/tags/function/tick.json'), 'rwysow:tick');
    });

    it('tracking runs every other tick for hoe holders only', () => {
        const body = lines('tick');
        has(body, 'execute store result score #g rwysow run time query gametime');
        // eq folds the constant 2 into the eq const objective
        has(body, 'scoreboard players operation #g rwysow %= 2 rwysow.eq.const');
        has(body, 'execute if score #g rwysow matches 0 as @a[predicate=rwysow:marker/ready] at @s run function rwysow:ray/track');
    });

    it('markers age only while some exist', () => {
        has(lines('tick'), `execute if entity @e[${MARKER}] run function rwysow:marker/age`);
    });

    it('markers expire', () => {
        const body = lines('marker/age');
        assert.equal(body[0], `scoreboard players remove @e[${MARKER}] rwysow 1`);
        has(body, `execute as @e[${MARKER},scores={rwysow=..0}] at @s run function rwysow:marker/remove`);
        has(body, `execute as @e[${MARKER}] at @s unless entity @a[tag=rwysow.ready,distance=..6] run function rwysow:marker/remove`);
    });
});

describe('Click', () => {
    it('ready predicate', () => {
        const text = read(path.join(DATA, 'predicate', 'marker', 'ready.json'));
        for (const s of ['#minecraft:hoes', 'mainhand', 'survival', 'creative']) assert.ok(text.includes(s), s);
        assert.ok(!text.includes('adventure'));
    });

    it('advancement fires on the marker click', () => {
        const adv = readJson(path.join(DATA, 'advancement', 'use', 'on_interact.json'));
        const crit = Object.values(adv.criteria)[0];
        assert.equal(crit.trigger, 'minecraft:player_interacted_with_entity');
        assert.equal(crit.conditions.player, 'rwysow:marker/ready');
        assert.ok(JSON.stringify(crit.conditions.entity).includes('minecraft:interaction'));
        assert.equal(adv.rewards.function, 'rwysow:use/on_use');
    });

    it('on_use revokes then harvests what the player is looking at', () => {
        assert.deepEqual(lines('use/on_use'), ['advancement revoke @s only rwysow:use/on_interact', 'function rwysow:ray/harvest']);
    });

    it('no leftovers from the advancement gate', () => {
        for (const old of ['advancement/use_hoe.json', 'tags/block/ray_passable.json', 'tags/block/crops.json']) {
            assert.ok(!fs.existsSync(path.join(DATA, old)), old);
        }
    });
});

describe('Ray', () => {
    it('track and harvest modes', () => {
        assert.deepEqual(lines('ray/track'), ['scoreboard players set #mode rwysow 0', 'function rwysow:ray/start']);
        assert.deepEqual(lines('ray/harvest'), ['scoreboard players set #mode rwysow 1', 'function rwysow:ray/start']);
    });

    it('start', () => {
        const body = lines('ray/start');
        has(body, `scoreboard players set #left rwysow ${settings().rayStepCount}`);
        has(body, 'execute anchored eyes positioned ^ ^ ^ run function rwysow:ray/step');
    });

    it('step spends a step first', () => {
        assert.equal(lines('ray/step')[0], 'scoreboard players remove #left rwysow 1');
    });

    it('step finds each mature crop once', () => {
        const step = lines('ray/step');
        for (const [name, [state]] of Object.entries(CROPS)) {
            const hits = step.filter((l) => l.includes(`if block ~ ~ ~ ${state} `));
            assert.equal(hits.length, 1, name);
            assert.ok(hits[0].includes(`align xyz run function rwysow:found/${name}`));
            assert.ok(!hits[0].includes('config'));
        }
    });

    it('step walks on through passable blocks only', () => {
        const rec = lines('ray/step').filter((l) => l.includes('#rwysow:ray/ray_pass'));
        assert.equal(rec.length, 1);
        assert.ok(rec[0].includes('if score #left rwysow matches 1..'));
        assert.ok(rec[0].includes(`positioned ^ ^ ^${settings().rayStep} run function rwysow:ray/step`));
    });

    it('ray_pass tag', () => {
        const values = tag('rwysow/tags/block/ray/ray_pass.json');
        for (const v of ['#minecraft:replaceable', '#minecraft:crops', 'minecraft:nether_wart']) has(values, v);
    });

    it('no outline height shifts remain', () => {
        // The marker box covers the cell, so the ray only has to pick the cell
        assert.ok(!func('ray/step').includes('positioned ~ ~0.'));
    });
});

describe('Found', () => {
    const check = (name, height) => {
        const body = lines(`found/${name}`);
        assert.equal(body[0], 'scoreboard players set #left rwysow 0', name);
        assert.equal(body[1], `execute if score #mode rwysow matches 1 run return run function rwysow:harvest/${name}`, name);
        const summon = body.filter((l) => l.includes('summon minecraft:interaction'));
        assert.equal(summon.length, 1, name);
        assert.ok(summon[0].includes(`unless entity @e[${MARKER},distance=..0.3]`));
        assert.ok(summon[0].includes(`positioned ~0.5 ~-${MARGIN} ~0.5`));
        assert.ok(summon[0].includes(`width:${WIDTH}f,height:${height}f,response:true,Tags:["rwysow.marker"]`));
        const refresh = body.filter((l) => l.includes('scoreboard players set @e'));
        assert.equal(refresh.length, 1, name);
        assert.ok(refresh[0].endsWith(` rwysow ${settings().markerTicks}`), refresh[0]);
    };

    it('each crop gets a marker sized to it', () => {
        for (const [name, [, , height]] of Object.entries(CROPS)) check(name, height);
    });

    it('pitcher marker covers both halves', () => check('pitcher_crop', '2.0625'));
});

describe('Harvest', () => {
    const check = (name, reset) => {
        const body = lines(`harvest/${name}`);
        assert.ok(body.some((l) => l.includes('loot spawn') && l.includes(' mine ') && l.endsWith('mainhand')), name);
        has(body, `setblock ~ ~ ~ ${reset}`, name);
        assert.ok(body.some((l) => l.startsWith('playsound')), name);
        assert.ok(body.some((l) => l.startsWith('particle')), name);
        has(body, `execute positioned ~0.5 ~ ~0.5 as @e[${MARKER},distance=..0.3] at @s run function rwysow:marker/remove`, name);
        has(body, 'advancement grant @s only rwysow:harvest/hoe_down', name);
    };

    it('each crop loots with the hoe, resets and drops its marker', () => {
        for (const [name, [, reset]] of Object.entries(CROPS)) check(name, reset);
    });

    it('pitcher crop', () => check('pitcher_crop', PITCHER_RESET));

    it('pitcher resets the lower half before clearing the upper', () => {
        // Clearing the upper half first makes the lower half pop as a second drop
        const body = lines('harvest/pitcher_crop');
        const loot = body.findIndex((l) => l.includes('loot spawn') && l.includes(' mine '));
        const down = body.indexOf(`setblock ~ ~ ~ ${PITCHER_RESET}`);
        const up = body.indexOf('setblock ~ ~1 ~ minecraft:air replace');
        assert.ok(loot < down && down < up);
    });
});

describe('Wear', () => {
    it('every harvest damages the hoe once, after the loot', () => {
        for (const name of ALL) {
            const body = lines(`harvest/${name}`);
            const loot = body.findIndex((l) => l.includes('loot spawn'));
            assert.equal(body.filter((l) => l === 'function rwysow:hoe/wear').length, 1, name);
            assert.ok(body.indexOf('function rwysow:hoe/wear') > loot, name);
        }
    });

    it('no item modifier or per-hoe table', () => {
        // A set_damage modifier works on a fraction of the max, so it cannot cost exactly 1 for every hoe
        assert.ok(!fs.existsSync(path.join(DATA, 'item_modifier')));
    });

    it('survival only and any hoe', () => {
        const body = lines('hoe/wear');
        assert.equal(body[0], 'execute unless predicate rwysow:hoe/survival run return 0');
        const rest = body.slice(1).join('').replace('hoe/break', '').replace('hoe/last_point', '').replace('hoe/roll', '');
        assert.ok(!rest.includes('hoe'));
    });

    it('last point breaks the hoe before any damage is written', () => {
        const body = lines('hoe/wear');
        const brk = body.indexOf('execute if predicate rwysow:hoe/last_point run return run function rwysow:hoe/break');
        const write = body.indexOf('scoreboard players add #damage rwysow 1');
        const skip = body.findIndex((l) => l.includes('unless score #roll rwysow matches 0 run return'));
        // An Unbreaking save comes first, so a spared hoe at its last point does not break
        assert.ok(brk >= 0 && skip < brk && brk < write);
        has(lines('hoe/break'), 'kill @e[type=minecraft:item,tag=rwysow.tmp,distance=..1]');
        has(lines('hoe/break'), 'item replace entity @s weapon.mainhand with minecraft:air');
        assert.ok(lines('hoe/break').some((l) => l.startsWith('playsound minecraft:entity.item.break')));
        const pred = readJson(path.join(DATA, 'predicate', 'hoe', 'last_point.json'));
        assert.deepEqual(pred.predicate['minecraft:equipment'].mainhand.predicates['minecraft:damage'].durability, { max: 1 });
    });

    it('copy uses slot commands and never writes the placeholder back', () => {
        const body = lines('hoe/wear');
        assert.ok(!body.some((l) => l.includes('equipment.mainhand')));
        const copy = body.findIndex((l) => l.includes('item replace entity @n[') && l.includes('contents from entity @s weapon.mainhand'));
        assert.ok(body[copy].includes('store success score #copied rwysow'));
        assert.equal(body[copy + 1], 'execute unless score #copied rwysow matches 1 run return run kill @e[type=minecraft:item,tag=rwysow.tmp,distance=..1]');
        const back = body.findIndex((l) => l.startsWith('item replace entity @s weapon.mainhand from entity'));
        assert.ok(copy + 1 < back);
    });

    it('unbreakable hoes never wear', () => {
        has(lines('hoe/wear'), 'execute if items entity @s weapon.mainhand *[minecraft:unbreakable] run return 0');
    });

    it('unbreaking spares the hoe with chance level in level plus one', () => {
        const body = lines('hoe/wear');
        const zero = body.indexOf('scoreboard players set #unb rwysow 0');
        const readAt = body.findIndex((l) => l.includes('store result score #unb') && l.includes('"minecraft:unbreaking"'));
        assert.ok(zero >= 0 && zero < readAt);
        has(body, 'execute if score #unb rwysow matches 1.. run function rwysow:hoe/roll');
        // Only a rolled hoe can be spared, #roll is stale otherwise
        assert.ok(body.some((l) => l.startsWith('execute if score #unb rwysow matches 2.. unless score #roll rwysow matches 0')));
        const roll = lines('hoe/roll');
        assert.equal(roll[0], 'scoreboard players add #unb rwysow 1');
        has(roll, 'scoreboard players operation #roll rwysow %= #unb rwysow');
        assert.ok(roll.some((l) => l.includes('random value 0..')));
    });

    it('damage goes up by exactly one', () => {
        const body = lines('hoe/wear');
        const reset = body.indexOf('scoreboard players set #damage rwysow 0');
        const readAt = body.findIndex((l) => l.includes('store result score #damage'));
        const add = body.indexOf('scoreboard players add #damage rwysow 1');
        // The reset has to come before the read, a failed data get leaves the score as it was
        assert.ok(reset >= 0 && reset < readAt && readAt < add);
        assert.ok(body.at(-2).startsWith('item replace entity @s weapon.mainhand from entity'));
        assert.ok(body.at(-1).startsWith('kill @e[type=minecraft:item,tag=rwysow.tmp'));
    });
});

describe('Outline', () => {
    it('each crop draws twelve edges', () => {
        for (const name of ALL) {
            const edges = lines(`outline/${name}`).filter((l) => l.includes('summon minecraft:block_display'));
            assert.equal(edges.length, 12, name);
            assert.ok(edges.every((l) => l.includes('Tags:["rwysow.outline"]')), name);
            // 26.3 rejects block_state:{Name:...} for a display, the game logged "No key id" and spawned nothing
            assert.ok(edges.every((l) => l.includes('block_state:"minecraft:black_concrete"')), name);
            assert.ok(!edges.some((l) => l.includes('Name:')), name);
        }
    });

    it('found draws it once and only when enabled', () => {
        for (const name of ALL) {
            const hits = lines(`found/${name}`).filter((l) => l.includes(`function rwysow:outline/${name}`));
            assert.equal(hits.length, 1, name);
            assert.ok(hits[0].includes('if score #config.show_outline rwysow matches 1'));
            assert.ok(hits[0].includes('unless entity @e[type=minecraft:block_display,tag=rwysow.outline,distance=..0.01]'));
        }
    });

    it('outline goes with its marker and nothing scans for strays', () => {
        // The tick would otherwise scan every block display once per tick
        assert.ok(!func('tick').includes('block_display'));
        assert.deepEqual(lines('marker/remove'), ['kill @e[type=minecraft:block_display,tag=rwysow.outline,distance=..0.01]', 'kill @s']);
        has(lines('uninstall'), 'kill @e[type=minecraft:block_display,tag=rwysow.outline]');
    });

    it('config defaults on only when unset', () => {
        const line = lines('load').find((l) => l.includes('#config.show_outline rwysow'));
        assert.ok(line.startsWith('execute unless score #config.show_outline rwysow matches '), line);
        assert.ok(line.endsWith('scoreboard players set #config.show_outline rwysow 1'), line);
    });
});

describe('Pitcher', () => {
    it('pitcher crop is gated by the config', () => {
        const step = lines('ray/step');
        const lower = step.filter((l) => l.includes(PITCHER_LOWER));
        const upper = step.filter((l) => l.includes(PITCHER_UPPER));
        assert.deepEqual([lower.length, upper.length], [1, 1]);
        for (const l of [...lower, ...upper]) assert.ok(l.includes(`if score ${CFG} matches 1`));
        assert.ok(lower[0].includes('align xyz run function rwysow:found/pitcher_crop'));
        assert.ok(upper[0].includes('align xyz positioned ~ ~-1 ~ run function rwysow:found/pitcher_crop'));
    });

    it('nothing targets the finished flowers', () => {
        for (const f of walk(FUNCS, '.mcfunction')) {
            const body = read(f);
            assert.ok(!body.includes('pitcher_plant'), f);
            assert.ok(!body.includes('torchflower'), f);
        }
    });
});

describe('Stacks', () => {
    const NAMES = ['cactus', 'sugar_cane'];

    it('ray matches each stack block at any height', () => {
        const step = lines('ray/step');
        for (const n of NAMES) has(step, `execute if block ~ ~ ~ minecraft:${n} align xyz run function rwysow:stack/${n}/found`);
    });

    it('found walks to the base and ignores a lone block', () => {
        for (const n of NAMES) {
            const body = lines(`stack/${n}/found`);
            assert.equal(body[0], `execute if block ~ ~-1 ~ minecraft:${n} positioned ~ ~-1 ~ run return run function rwysow:stack/${n}/found`);
            assert.equal(body[1], `execute unless block ~ ~1 ~ minecraft:${n} run return 0`);
            has(body, `execute if score #mode rwysow matches 1 run return run function rwysow:harvest/${n}`);
        }
    });

    it('marker is sized by a macro to the counted stack', () => {
        assert.ok(lines('stack/spawn').join('').includes('height:$(h)'));
        const outline = lines('stack/outline');
        assert.equal(outline.length, 12);
        assert.ok(outline.every((l) => l.startsWith('$') || !l.includes('$(')));
    });

    it('cut goes top first and leaves the base', () => {
        for (const n of NAMES) {
            const cut = lines(`harvest/${n}/cut`);
            assert.ok(cut.indexOf(`execute if block ~ ~1 ~ minecraft:${n} positioned ~ ~1 ~ run function rwysow:harvest/${n}/cut`) < cut.indexOf('setblock ~ ~ ~ minecraft:air'));
            const body = lines(`harvest/${n}`);
            has(body, `execute positioned ~ ~1 ~ run function rwysow:harvest/${n}/cut`);
            assert.equal(body.filter((l) => l === 'function rwysow:hoe/wear').length, 1);
            has(body, 'advancement grant @s only rwysow:harvest/hoe_down');
        }
    });

    it('a cactus flower is counted and cut with the stack', () => {
        has(lines('ray/step'), 'execute if block ~ ~ ~ minecraft:cactus_flower align xyz run function rwysow:stack/cactus/found');
        assert.ok(lines('stack/cactus/count').some((l) => l.includes('minecraft:cactus_flower') && l.includes('scoreboard players add #h rwysow 1')));
        const cut = lines('harvest/cactus/cut');
        assert.ok(cut.some((l) => l.includes('minecraft:cactus_flower') && l.includes('loot spawn')));
        assert.ok(cut.some((l) => l.includes('minecraft:cactus_flower') && l.includes('setblock ~ ~1 ~ minecraft:air')));
    });
});

describe('Advancements', () => {
    const adv = (p) => readJson(path.join(ROOT, 'data', p));

    it('global chain matches the other packs', () => {
        assert.equal(adv('global/advancement/root.json').criteria.trigger.trigger, 'minecraft:tick');
        assert.equal(adv('global/advancement/satyrnidae/author.json').parent, 'global:root');
    });

    it('root is a challenge with a diamond hoe under the author node', () => {
        const root = adv('rwysow/advancement/root.json');
        assert.equal(root.parent, 'global:satyrnidae/author');
        assert.equal(root.display.frame, 'challenge');
        assert.equal(root.display.icon.id, 'minecraft:diamond_hoe');
        assert.ok(JSON.stringify(root.display.title).includes('Reap What You Sow'));
        assert.ok(JSON.stringify(root.display.description).includes('Harvest crops without having to replant them'));
        assert.equal(root.criteria.adv_criteria.trigger, 'minecraft:tick');
        // No chat toast on every join, the convention only wants the entry in the tab
        assert.equal(root.display.show_toast, false);
    });

    it('hoe down hangs off the root and is only granted by a harvest', () => {
        const a = adv('rwysow/advancement/harvest/hoe_down.json');
        assert.equal(a.parent, 'rwysow:root');
        assert.ok(JSON.stringify(a.display.title).includes('Hoe down!'));
        assert.ok(JSON.stringify(a.display.description).includes('Harvest a crop with a hoe'));
        assert.equal(Object.values(a.criteria)[0].trigger, 'minecraft:impossible');
    });

    it('uninstall removes the pack and says so', () => {
        const body = lines('uninstall');
        has(body, 'scoreboard objectives remove rwysow.eq.var');
        has(body, 'scoreboard objectives remove rwysow.eq.const');
        assert.ok(body.some((l) => l.startsWith('execute store success score #uninstall rwysow run datapack disable "file/reap-what-you-sow-dp"')));
        assert.equal(body.at(-1), 'scoreboard objectives remove rwysow');
    });
});

describe('Layout', () => {
    it('every file under data is built from source', () => {
        // data/ is ignored by git and rebuilt by mcb, so a hand-written file there would never ship
        const tracked = execFileSync('git', ['ls-files', 'data'], { cwd: ROOT, encoding: 'utf8' });
        assert.equal(tracked.trim(), '');
        has(read(path.join(ROOT, '.gitignore')).split(/\r?\n/), '/data/');
    });

    it('no hand-written mcfunction or json sources', () => {
        assert.deepEqual(walk(path.join(ROOT, 'src'), '.mcfunction'), []);
        assert.deepEqual(walk(path.join(ROOT, 'src'), '.json'), []);
    });
});
