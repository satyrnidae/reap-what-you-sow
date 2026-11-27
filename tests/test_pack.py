"""Structural checks on the pack sources and mc-build output. Run after `npm run build`.

Behavior needs a running game and is covered by the in-game checklist in the plan.
Usage: python -m unittest discover -s tests -v
"""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'rwysow'
FUNCS = DATA / 'function'
CFG = '#config.enable_pitcher_crop rwysow'
MARKER = 'type=minecraft:interaction,tag=rwysow.marker'
# name: (mature state, reset state, marker height). The marker is 0.03125 bigger than the outline on every side, so the
# height is the outline height plus 0.0625 and the box starts 0.03125 below the block floor. Width is 1.0 + 0.0625.
MARGIN = '0.03125'
WIDTH = '1.0625'
CROPS = {
    'wheat': ('minecraft:wheat[age=7]', 'minecraft:wheat[age=0]', '1.0625'),
    'carrots': ('minecraft:carrots[age=7]', 'minecraft:carrots[age=0]', '0.625'),
    'potatoes': ('minecraft:potatoes[age=7]', 'minecraft:potatoes[age=0]', '0.625'),
    'beetroots': ('minecraft:beetroots[age=3]', 'minecraft:beetroots[age=0]', '0.5625'),
    'nether_wart': ('minecraft:nether_wart[age=3]', 'minecraft:nether_wart[age=0]', '0.9375'),
}
HOES = {'wooden': 59, 'stone': 131, 'copper': 190, 'iron': 250, 'diamond': 1561, 'golden': 32, 'netherite': 2031}
PITCHER_LOWER = 'minecraft:pitcher_crop[age=4,half=lower]'
PITCHER_UPPER = 'minecraft:pitcher_crop[age=4,half=upper]'
PITCHER_RESET = 'minecraft:pitcher_crop[age=0,half=lower]'
ALL = (*CROPS, 'pitcher_crop')


def settings():
    # The settings of mcb.config.js, the same numbers the sources are built with
    out = __import__('subprocess').run(['node', '-p', "JSON.stringify(require('./mcb.config.js').settings)"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def read(path):
    return path.read_text(encoding='utf-8')


def func(name):
    return read(FUNCS / (name + '.mcfunction'))


def lines(name):
    return [l.strip() for l in func(name).splitlines() if l.strip() and not l.startswith('#')]


def tag(path):
    return json.loads(read(ROOT / 'data' / path))['values']


class Scaffold(unittest.TestCase):
    def test_pack_format_121(self):
        pack = json.loads(read(ROOT / 'pack.mcmeta'))['pack']
        self.assertEqual(pack['min_format'], 121)
        self.assertEqual(pack['max_format'], 121)

    def test_mc_build_pinned(self):
        deps = json.loads(read(ROOT / 'package.json'))['dependencies']
        self.assertEqual(deps['mc-build'], '4.2.0')

    def test_settings_and_module(self):
        cfg = settings()
        self.assertIsInstance(cfg['rayStepCount'], int)
        self.assertIsInstance(cfg['markerTicks'], int)
        self.assertGreater(cfg['rayStepCount'], 0)
        self.assertGreater(cfg['markerTicks'], 0)
        self.assertIn('mcb.config.js', read(ROOT / 'src' / 'config.js'))

    def test_load_tagged(self):
        self.assertIn('rwysow:load', tag('minecraft/tags/function/load.json'))

    def test_load_adds_objective_and_constant(self):
        body = lines('load')
        self.assertIn('scoreboard objectives add rwysow dummy "Reap What You Sow"', body)

    def test_load_defaults_config_only_when_unset(self):
        line = next(l for l in lines('load') if CFG in l)
        self.assertTrue(line.startswith('execute unless score ' + CFG + ' matches '), line)
        self.assertTrue(line.endswith('scoreboard players set ' + CFG + ' 0'), line)

    def test_uninstall_cleans_up_everything(self):
        body = lines('uninstall')
        self.assertIn(f'kill @e[{MARKER}]', body)
        self.assertIn('advancement revoke @a only rwysow:use/on_interact', body)
        self.assertIn('scoreboard objectives remove rwysow', body)


class Tick(unittest.TestCase):
    def test_tick_tagged(self):
        self.assertIn('rwysow:tick', tag('minecraft/tags/function/tick.json'))

    def test_tracking_runs_every_other_tick_for_hoe_holders_only(self):
        body = lines('tick')
        self.assertIn('execute store result score #g rwysow run time query gametime', body)
        # eq folds the constant 2 into the eq const objective
        self.assertIn('scoreboard players operation #g rwysow %= 2 rwysow.eq.const', body)
        self.assertIn('execute if score #g rwysow matches 0 as @a[predicate=rwysow:marker/ready] at @s run function rwysow:ray/track', body)

    def test_markers_age_only_while_some_exist(self):
        self.assertIn(f'execute if entity @e[{MARKER}] run function rwysow:marker/age', lines('tick'))

    def test_markers_expire(self):
        body = lines('marker/age')
        self.assertEqual(body[0], f'scoreboard players remove @e[{MARKER}] rwysow 1')
        self.assertIn(f'execute as @e[{MARKER},scores={{rwysow=..0}}] at @s run function rwysow:marker/remove', body)
        self.assertIn(f'execute as @e[{MARKER}] at @s unless entity @a[tag=rwysow.ready,distance=..6] run function rwysow:marker/remove', body)


class Click(unittest.TestCase):
    def test_ready_predicate(self):
        text = read(DATA / 'predicate' / 'marker' / 'ready.json')
        self.assertIn('#minecraft:hoes', text)
        self.assertIn('mainhand', text)
        self.assertIn('survival', text)
        self.assertIn('creative', text)
        self.assertNotIn('adventure', text)

    def test_advancement_fires_on_the_marker_click(self):
        adv = json.loads(read(DATA / 'advancement' / 'use' / 'on_interact.json'))
        crit = next(iter(adv['criteria'].values()))
        self.assertEqual(crit['trigger'], 'minecraft:player_interacted_with_entity')
        self.assertEqual(crit['conditions']['player'], 'rwysow:marker/ready')
        self.assertIn('minecraft:interaction', json.dumps(crit['conditions']['entity']))
        self.assertEqual(adv['rewards']['function'], 'rwysow:use/on_use')

    def test_on_use_revokes_then_harvests_what_the_player_is_looking_at(self):
        self.assertEqual(lines('use/on_use'), ['advancement revoke @s only rwysow:use/on_interact', 'function rwysow:ray/harvest'])

    def test_no_leftovers_from_the_advancement_gate(self):
        for old in ('advancement/use_hoe.json', 'tags/block/ray_passable.json', 'tags/block/crops.json'):
            self.assertFalse((DATA / old).exists(), old)


class Ray(unittest.TestCase):
    def test_track_and_harvest_modes(self):
        self.assertEqual(lines('ray/track'), ['scoreboard players set #mode rwysow 0', 'function rwysow:ray/start'])
        self.assertEqual(lines('ray/harvest'), ['scoreboard players set #mode rwysow 1', 'function rwysow:ray/start'])

    def test_start(self):
        cfg = settings()
        body = lines('ray/start')
        self.assertIn(f'scoreboard players set #left rwysow {cfg["rayStepCount"]}', body)
        self.assertIn('execute anchored eyes positioned ^ ^ ^ run function rwysow:ray/step', body)

    def test_step_spends_a_step_first(self):
        self.assertEqual(lines('ray/step')[0], 'scoreboard players remove #left rwysow 1')

    def test_step_finds_each_mature_crop_once(self):
        step = lines('ray/step')
        for name, (state, _, _) in CROPS.items():
            hits = [l for l in step if f'if block ~ ~ ~ {state} ' in l]
            self.assertEqual(len(hits), 1, name)
            self.assertIn(f'align xyz run function rwysow:found/{name}', hits[0])
            self.assertNotIn('config', hits[0])

    def test_step_walks_on_through_passable_blocks_only(self):
        cfg = settings()
        rec = [l for l in lines('ray/step') if '#rwysow:ray/ray_pass' in l]
        self.assertEqual(len(rec), 1)
        self.assertIn('if score #left rwysow matches 1..', rec[0])
        self.assertIn(f'positioned ^ ^ ^{cfg["rayStep"]} run function rwysow:ray/step', rec[0])

    def test_ray_pass_tag(self):
        values = tag('rwysow/tags/block/ray/ray_pass.json')
        self.assertIn('#minecraft:replaceable', values)
        self.assertIn('#minecraft:crops', values)
        self.assertIn('minecraft:nether_wart', values)

    def test_no_outline_height_shifts_remain(self):
        # The marker box covers the cell, so the ray only has to pick the cell
        self.assertNotIn('positioned ~ ~0.', func('ray/step'))


class Found(unittest.TestCase):
    def check(self, name, height):
        body = lines('found/' + name)
        self.assertEqual(body[0], 'scoreboard players set #left rwysow 0', name)
        self.assertEqual(body[1], f'execute if score #mode rwysow matches 1 run return run function rwysow:harvest/{name}', name)
        summon = [l for l in body if 'summon minecraft:interaction' in l]
        self.assertEqual(len(summon), 1, name)
        self.assertIn(f'unless entity @e[{MARKER},distance=..0.3]', summon[0])
        self.assertIn(f'positioned ~0.5 ~-{MARGIN} ~0.5', summon[0])
        self.assertIn(f'width:{WIDTH}f,height:{height}f,response:true,Tags:["rwysow.marker"]', summon[0])
        cfg = settings()
        refresh = [l for l in body if 'scoreboard players set @e' in l]
        self.assertEqual(len(refresh), 1, name)
        self.assertTrue(refresh[0].endswith(f' rwysow {cfg["markerTicks"]}'), refresh[0])

    def test_each_crop_gets_a_marker_sized_to_it(self):
        for name, (_, _, height) in CROPS.items():
            self.check(name, height)

    def test_pitcher_marker_covers_both_halves(self):
        self.check('pitcher_crop', '2.0625')


class Harvest(unittest.TestCase):
    def check(self, name, reset):
        body = lines('harvest/' + name)
        self.assertTrue(any('loot spawn' in l and ' mine ' in l and l.endswith('mainhand') for l in body), name)
        self.assertIn(f'setblock ~ ~ ~ {reset}', body, name)
        self.assertTrue(any(l.startswith('playsound') for l in body), name)
        self.assertTrue(any(l.startswith('particle') for l in body), name)
        self.assertIn(f'execute positioned ~0.5 ~ ~0.5 as @e[{MARKER},distance=..0.3] at @s run function rwysow:marker/remove', body, name)
        self.assertIn('advancement grant @s only rwysow:harvest/hoe_down', body, name)

    def test_each_crop_loots_with_the_hoe_resets_and_drops_its_marker(self):
        for name, (_, reset, _) in CROPS.items():
            self.check(name, reset)

    def test_pitcher_crop(self):
        self.check('pitcher_crop', PITCHER_RESET)

    def test_pitcher_resets_lower_half_before_clearing_upper(self):
        # Clearing the upper half first makes the lower half pop as a second drop
        body = lines('harvest/pitcher_crop')
        loot = next(i for i, l in enumerate(body) if 'loot spawn' in l and ' mine ' in l)
        down = body.index(f'setblock ~ ~ ~ {PITCHER_RESET}')
        up = body.index('setblock ~ ~1 ~ minecraft:air replace')
        self.assertLess(loot, down)
        self.assertLess(down, up)


class Wear(unittest.TestCase):
    def test_every_harvest_damages_the_hoe_after_the_loot(self):
        for name in ALL:
            body = lines('harvest/' + name)
            loot = next(i for i, l in enumerate(body) if 'loot spawn' in l)
            self.assertEqual(body.count('function rwysow:hoe/wear'), 1, name)
            self.assertGreater(body.index('function rwysow:hoe/wear'), loot, name)

    def test_no_item_modifier_or_per_hoe_table(self):
        # A set_damage modifier works on a fraction of the max, so it cannot cost exactly 1 for every hoe
        self.assertFalse((DATA / 'item_modifier').exists())

    def test_survival_only_and_any_hoe(self):
        body = lines('hoe/wear')
        self.assertEqual(body[0], 'execute unless predicate rwysow:hoe/survival run return 0')
        self.assertNotIn('hoe', ''.join(body[1:]).replace('hoe/break', '').replace('hoe/last_point', '').replace('hoe/roll', ''))

    def test_last_point_breaks_the_hoe_before_any_damage_is_written(self):
        body = lines('hoe/wear')
        brk = body.index('execute if predicate rwysow:hoe/last_point run return run function rwysow:hoe/break')
        write = body.index('scoreboard players add #damage rwysow 1')
        skip = next(i for i, l in enumerate(body) if 'unless score #roll rwysow matches 0 run return' in l)
        # An Unbreaking save comes first, so a spared hoe at its last point does not break
        self.assertLess(skip, brk)
        self.assertLess(brk, write)
        self.assertIn('kill @e[type=minecraft:item,tag=rwysow.tmp,distance=..1]', lines('hoe/break'))
        self.assertIn('item replace entity @s weapon.mainhand with minecraft:air', lines('hoe/break'))
        self.assertTrue(any(l.startswith('playsound minecraft:entity.item.break') for l in lines('hoe/break')))
        pred = json.loads(read(DATA / 'predicate' / 'hoe' / 'last_point.json'))
        dur = pred['predicate']['minecraft:equipment']['mainhand']['predicates']['minecraft:damage']['durability']
        self.assertEqual(dur, {'max': 1})

    def test_copy_uses_slot_commands_and_never_writes_the_placeholder_back(self):
        body = lines('hoe/wear')
        self.assertFalse(any('equipment.mainhand' in l for l in body))
        copy = next(i for i, l in enumerate(body) if 'item replace entity @n[' in l and 'contents from entity @s weapon.mainhand' in l)
        self.assertIn('store success score #copied rwysow', body[copy])
        self.assertEqual(body[copy + 1],
                         'execute unless score #copied rwysow matches 1 run return run kill @e[type=minecraft:item,tag=rwysow.tmp,distance=..1]')
        back = next(i for i, l in enumerate(body) if l.startswith('item replace entity @s weapon.mainhand from entity'))
        self.assertLess(copy + 1, back)

    def test_unbreakable_hoes_never_wear(self):
        self.assertIn('execute if items entity @s weapon.mainhand *[minecraft:unbreakable] run return 0', lines('hoe/wear'))

    def test_unbreaking_spares_the_hoe_with_chance_level_in_level_plus_one(self):
        body = lines('hoe/wear')
        self.assertIn('scoreboard players set #unb rwysow 0', body)
        read_i = next(i for i, l in enumerate(body) if 'store result score #unb' in l and '"minecraft:unbreaking"' in l)
        self.assertLess(body.index('scoreboard players set #unb rwysow 0'), read_i)
        self.assertIn('execute if score #unb rwysow matches 1.. run function rwysow:hoe/roll', body)
        # Only a rolled hoe can be spared, #roll is stale otherwise
        self.assertTrue(any(l.startswith('execute if score #unb rwysow matches 2.. unless score #roll rwysow matches 0') for l in body))
        roll = lines('hoe/roll')
        self.assertEqual(roll[0], 'scoreboard players add #unb rwysow 1')
        self.assertIn('scoreboard players operation #roll rwysow %= #unb rwysow', roll)
        self.assertTrue(any('random value 0..' in l for l in roll))

    def test_damage_goes_up_by_exactly_one(self):
        body = lines('hoe/wear')
        self.assertIn('scoreboard players set #damage rwysow 0', body)
        self.assertIn('scoreboard players add #damage rwysow 1', body)
        # The reset has to come before the read, a failed data get leaves the score as it was
        reset = body.index('scoreboard players set #damage rwysow 0')
        read_i = next(i for i, l in enumerate(body) if 'store result score #damage' in l)
        self.assertLess(reset, read_i)
        self.assertLess(read_i, body.index('scoreboard players add #damage rwysow 1'))
        self.assertTrue(body[-2].startswith('item replace entity @s weapon.mainhand from entity'))
        self.assertTrue(body[-1].startswith('kill @e[type=minecraft:item,tag=rwysow.tmp'))


class Outline(unittest.TestCase):
    def test_each_crop_draws_twelve_edges(self):
        for name in ALL:
            edges = [l for l in lines('outline/' + name) if 'summon minecraft:block_display' in l]
            self.assertEqual(len(edges), 12, name)
            self.assertTrue(all('Tags:["rwysow.outline"]' in l for l in edges), name)
            # 26.3 rejects block_state:{Name:...} for a display, the game logged "No key id" and spawned nothing
            self.assertTrue(all('block_state:"minecraft:black_concrete"' in l for l in edges), name)
            self.assertFalse(any('Name:' in l for l in edges), name)

    def test_found_draws_it_once_and_only_when_enabled(self):
        for name in ALL:
            hits = [l for l in lines('found/' + name) if f'function rwysow:outline/{name}' in l]
            self.assertEqual(len(hits), 1, name)
            self.assertIn('if score #config.show_outline rwysow matches 1', hits[0])
            self.assertIn('unless entity @e[type=minecraft:block_display,tag=rwysow.outline,distance=..0.01]', hits[0])

    def test_outline_goes_with_its_marker_and_nothing_scans_for_strays(self):
        # The tick would otherwise scan every block display once per tick
        self.assertNotIn('block_display', func('tick'))
        self.assertEqual(lines('marker/remove'), [
            'kill @e[type=minecraft:block_display,tag=rwysow.outline,distance=..0.01]', 'kill @s'])
        self.assertIn('kill @e[type=minecraft:block_display,tag=rwysow.outline]', lines('uninstall'))

    def test_config_defaults_on_only_when_unset(self):
        line = next(l for l in lines('load') if '#config.show_outline rwysow' in l)
        self.assertTrue(line.startswith('execute unless score #config.show_outline rwysow matches '), line)
        self.assertTrue(line.endswith('scoreboard players set #config.show_outline rwysow 1'), line)


class Pitcher(unittest.TestCase):
    def test_pitcher_crop_is_gated_by_the_config(self):
        step = lines('ray/step')
        lower = [l for l in step if PITCHER_LOWER in l]
        upper = [l for l in step if PITCHER_UPPER in l]
        self.assertEqual((len(lower), len(upper)), (1, 1))
        for line in (*lower, *upper):
            self.assertIn('if score ' + CFG + ' matches 1', line)
        self.assertIn('align xyz run function rwysow:found/pitcher_crop', lower[0])
        self.assertIn('align xyz positioned ~ ~-1 ~ run function rwysow:found/pitcher_crop', upper[0])

    def test_nothing_targets_the_finished_flowers(self):
        for path in FUNCS.rglob('*.mcfunction'):
            body = read(path)
            self.assertNotIn('pitcher_plant', body, path.name)
            self.assertNotIn('torchflower', body, path.name)


class Stacks(unittest.TestCase):
    NAMES = ('cactus', 'sugar_cane')

    def test_ray_matches_each_stack_block_at_any_height(self):
        step = lines('ray/step')
        for n in self.NAMES:
            self.assertIn(f'execute if block ~ ~ ~ minecraft:{n} align xyz run function rwysow:stack/{n}/found', step)

    def test_found_walks_to_the_base_and_ignores_a_lone_block(self):
        for n in self.NAMES:
            body = lines(f'stack/{n}/found')
            self.assertEqual(body[0], f'execute if block ~ ~-1 ~ minecraft:{n} positioned ~ ~-1 ~ run return run function rwysow:stack/{n}/found')
            self.assertEqual(body[1], f'execute unless block ~ ~1 ~ minecraft:{n} run return 0')
            self.assertIn(f'execute if score #mode rwysow matches 1 run return run function rwysow:harvest/{n}', body)

    def test_marker_is_sized_by_a_macro_to_the_counted_stack(self):
        self.assertIn('height:$(h)', ''.join(lines('stack/spawn')))
        self.assertEqual(len(lines('stack/outline')), 12)
        self.assertTrue(all(l.startswith('$') or '$(' not in l for l in lines('stack/outline')))

    def test_cut_goes_top_first_and_leaves_the_base(self):
        for n in self.NAMES:
            cut = lines(f'harvest/{n}/cut')
            self.assertLess(cut.index(f'execute if block ~ ~1 ~ minecraft:{n} positioned ~ ~1 ~ run function rwysow:harvest/{n}/cut'),
                            cut.index('setblock ~ ~ ~ minecraft:air'))
            body = lines(f'harvest/{n}')
            self.assertIn(f'execute positioned ~ ~1 ~ run function rwysow:harvest/{n}/cut', body)
            self.assertEqual(body.count('function rwysow:hoe/wear'), 1)
            self.assertIn('advancement grant @s only rwysow:harvest/hoe_down', body)


class Advancements(unittest.TestCase):
    def adv(self, path):
        return json.loads(read(ROOT / 'data' / path))

    def test_global_chain_matches_the_other_packs(self):
        root = self.adv('global/advancement/root.json')
        self.assertEqual(root['criteria']['trigger']['trigger'], 'minecraft:tick')
        author = self.adv('global/advancement/satyrnidae/author.json')
        self.assertEqual(author['parent'], 'global:root')

    def test_root_is_a_challenge_with_a_diamond_hoe_under_the_author_node(self):
        root = self.adv('rwysow/advancement/root.json')
        self.assertEqual(root['parent'], 'global:satyrnidae/author')
        self.assertEqual(root['display']['frame'], 'challenge')
        self.assertEqual(root['display']['icon']['id'], 'minecraft:diamond_hoe')
        self.assertIn('Reap What You Sow', json.dumps(root['display']['title']))
        self.assertIn('Harvest crops without having to replant them', json.dumps(root['display']['description']))
        self.assertEqual(root['criteria']['adv_criteria']['trigger'], 'minecraft:tick')
        # No chat toast on every join, the convention only wants the entry in the tab
        self.assertFalse(root['display']['show_toast'])

    def test_hoe_down_hangs_off_the_root_and_is_only_granted_by_a_harvest(self):
        adv = self.adv('rwysow/advancement/harvest/hoe_down.json')
        self.assertEqual(adv['parent'], 'rwysow:root')
        self.assertIn('Hoe down!', json.dumps(adv['display']['title']))
        self.assertIn('Harvest a crop with a hoe', json.dumps(adv['display']['description']))
        self.assertEqual(next(iter(adv['criteria'].values()))['trigger'], 'minecraft:impossible')

    def test_uninstall_removes_the_pack_and_says_so(self):
        body = lines('uninstall')
        self.assertIn('scoreboard objectives remove rwysow.eq.var', body)
        self.assertIn('scoreboard objectives remove rwysow.eq.const', body)
        self.assertTrue(any(l.startswith('execute store success score #uninstall rwysow run datapack disable "file/reap-what-you-sow-dp"') for l in body))
        self.assertEqual(body[-1], 'scoreboard objectives remove rwysow')


class Layout(unittest.TestCase):
    def test_every_file_under_data_is_built_from_source(self):
        # data/ is ignored by git and rebuilt by mcb, so a hand-written file there would never ship
        tracked = __import__('subprocess').run(['git', 'ls-files', 'data'], cwd=ROOT, capture_output=True, text=True).stdout
        self.assertEqual(tracked.strip(), '')
        self.assertIn('/data/', read(ROOT / '.gitignore').splitlines())

    def test_no_function_has_a_hand_written_mcfunction_source(self):
        self.assertEqual(list((ROOT / 'src').rglob('*.mcfunction')), [])
        self.assertEqual(list((ROOT / 'src').rglob('*.json')), [])


if __name__ == '__main__':
    unittest.main()
