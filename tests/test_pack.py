"""Structural checks on the pack and its mc-build output. Run after `npm run build`.

Behavior needs a running game and is covered by the in-game checklists in the plan.
Usage: python -m unittest discover -s tests -v
"""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'rwysow'
FUNCS = DATA / 'function'
CFG = '#config.enable_ancient_farming rwysow'


def read(path):
    return path.read_text(encoding='utf-8')


def func(name):
    return read(FUNCS / (name + '.mcfunction'))


class Scaffold(unittest.TestCase):
    def test_pack_format_121(self):
        pack = json.loads(read(ROOT / 'pack.mcmeta'))['pack']
        self.assertEqual(pack['min_format'], 121)
        self.assertEqual(pack['max_format'], 121)

    def test_mc_build_pinned(self):
        deps = json.loads(read(ROOT / 'package.json'))['dependencies']
        self.assertEqual(deps['mc-build'], '4.2.0')

    def test_load_tagged(self):
        tag = json.loads(read(ROOT / 'data' / 'minecraft' / 'tags' / 'function' / 'load.json'))
        self.assertIn('rwysow:load', tag['values'])

    def test_load_adds_objective(self):
        self.assertIn('scoreboard objectives add rwysow dummy', func('load'))

    def test_load_defaults_config_only_when_unset(self):
        line = next(l for l in func('load').splitlines() if CFG in l and 'set' in l)
        self.assertTrue(line.startswith('execute unless score ' + CFG + ' matches '), line)
        self.assertTrue(line.rstrip().endswith('scoreboard players set ' + CFG + ' 0'), line)

    def test_uninstall_removes_objective(self):
        self.assertIn('scoreboard objectives remove rwysow', func('uninstall'))


AGES = {'wheat': 7, 'carrots': 7, 'potatoes': 7, 'beetroots': 3, 'nether_wart': 3}
# 1 - outline height in blocks: mature carrots and potatoes 9px, beetroots 8px, nether wart 14px, torchflower 10px
SHIFT = {'carrots': '0.4375', 'potatoes': '0.4375', 'beetroots': '0.5', 'nether_wart': '0.125', 'torchflower': '0.375'}
ANCIENT = ('torchflower', 'pitcher_plant')


def lines(name):
    return [l.strip() for l in func(name).splitlines() if l.strip() and not l.startswith('#')]


class Gate(unittest.TestCase):
    def test_crops_tag_lists_seven_blocks(self):
        tag = json.loads(read(DATA / 'tags' / 'block' / 'crops.json'))
        self.assertEqual(set(tag['values']), {'minecraft:' + c for c in (*AGES, *ANCIENT)})

    def test_advancement_trigger_and_reward(self):
        text = read(DATA / 'advancement' / 'use_hoe.json')
        adv = json.loads(text)
        self.assertEqual(adv['rewards']['function'], 'rwysow:on_use')
        self.assertIn('minecraft:any_block_use', text)
        self.assertIn('#rwysow:crops', text)
        self.assertIn('#minecraft:hoes', text)
        self.assertIn('mainhand', text)
        for mode in ('survival', 'creative'):
            self.assertIn(mode, text)
        self.assertNotIn('adventure', text)

    def test_on_use_revokes_before_anything_else(self):
        first = lines('on_use')[0]
        self.assertEqual(first, 'advancement revoke @s only rwysow:use_hoe')

    def test_on_use_starts_the_ray(self):
        self.assertIn('function rwysow:ray/start', lines('on_use'))


class Harvest(unittest.TestCase):
    def test_ray_start(self):
        body = lines('ray/start')
        self.assertIn('scoreboard players set #left rwysow 100', body)
        self.assertIn('execute anchored eyes positioned ^ ^ ^ run function rwysow:ray/step', body)

    def test_ray_step_gates_every_crop_on_max_age(self):
        step = lines('ray/step')
        for crop, age in AGES.items():
            hits = [l for l in step if f'minecraft:{crop}[age={age}]' in l]
            self.assertEqual(len(hits), 1, crop)
            self.assertIn(f'function rwysow:harvest/{crop}', hits[0])
            self.assertNotIn('config', hits[0])
        self.assertFalse([l for l in step if 'harvest/' in l and '[age=' not in l and 'pitcher' not in l
                          and 'torchflower' not in l])

    def test_ray_step_recurses_while_passable(self):
        step = lines('ray/step')
        rec = [l for l in step if '#rwysow:ray_passable' in l]
        self.assertEqual(len(rec), 1)
        self.assertIn('positioned ^ ^ ^0.05 run function rwysow:ray/step', rec[0])
        self.assertIn('#left rwysow matches 1..', rec[0])

    def test_hits_only_count_under_the_crop_outline(self):
        # Sample point shifted up by (1 - outline height) stays in the crop cell only while it is under the outline
        for crop, shift in SHIFT.items():
            hits = [l for l in lines('ray/step') if f'minecraft:{crop}' in l and 'harvest/' in l]
            self.assertEqual(len(hits), 1, crop)
            self.assertLess(hits[0].index(f'positioned ~ ~{shift} ~'), hits[0].index(f'if block ~ ~ ~ minecraft:{crop}'), crop)

    def test_ray_passes_over_short_crops(self):
        # Above the outline the click ray was not aimed at this crop, so it carries on to whatever is behind
        for crop, shift in SHIFT.items():
            want = (f'if block ~ ~ ~ minecraft:{crop} positioned ~ ~{shift} ~ unless block ~ ~ ~ minecraft:{crop} '
                    f'positioned ~ ~-{shift} ~ positioned ^ ^ ^0.05 run function rwysow:ray/step')
            hits = [l for l in lines('ray/step') if want in l]
            self.assertEqual(len(hits), 1, crop)
            self.assertIn('#left rwysow matches 1..', hits[0], crop)

    def test_ray_passable_tag(self):
        tag = json.loads(read(DATA / 'tags' / 'block' / 'ray_passable.json'))
        # Crops are not passable: an immature crop must end the ray, never let it reach a mature one behind it
        self.assertEqual(set(tag['values']), {'#minecraft:air', '#minecraft:replaceable'})

    def test_ray_step_spends_a_step_first(self):
        self.assertEqual(lines('ray/step')[0], 'scoreboard players remove #left rwysow 1')

    def test_ray_step_aligns_to_the_block_before_harvesting(self):
        for l in lines('ray/step'):
            if 'run function rwysow:harvest/' in l:
                self.assertIn(' align xyz ', l)

    def test_each_crop_function_loots_with_the_hoe_and_resets(self):
        for crop in AGES:
            body = lines('harvest/' + crop)
            self.assertTrue(any('loot spawn' in l and ' mine ' in l and l.endswith('mainhand') for l in body), crop)
            self.assertIn(f'setblock ~ ~ ~ minecraft:{crop}[age=0]', body, crop)
            self.assertTrue(any(l.startswith('playsound') for l in body), crop)
            self.assertTrue(any(l.startswith('particle') for l in body), crop)


class AncientFarming(unittest.TestCase):
    def setUp(self):
        self.step = lines('ray/step')

    def gated(self, needle):
        hits = [l for l in self.step if needle in l and 'harvest/' in l]
        self.assertEqual(len(hits), 1, needle)
        self.assertIn('if score ' + CFG + ' matches 1', hits[0])
        return hits[0]

    def test_torchflower_needs_config_and_farmland(self):
        line = self.gated('minecraft:torchflower')
        self.assertIn('if block ~ ~-1 ~ minecraft:farmland', line)
        self.assertIn('function rwysow:harvest/torchflower', line)

    def test_pitcher_lower_half(self):
        line = self.gated('minecraft:pitcher_plant[half=lower]')
        self.assertIn('if block ~ ~-1 ~ minecraft:farmland', line)
        self.assertIn('function rwysow:harvest/pitcher_plant', line)

    def test_pitcher_upper_half_steps_down(self):
        line = self.gated('minecraft:pitcher_plant[half=upper]')
        self.assertIn('if block ~ ~-2 ~ minecraft:farmland', line)
        self.assertIn('positioned ~ ~-1 ~ run function rwysow:harvest/pitcher_plant', line)

    def test_every_harvest_stops_the_ray_first(self):
        for crop in (*AGES, *ANCIENT):
            self.assertEqual(lines('harvest/' + crop)[0], 'scoreboard players set #left rwysow 0', crop)

    def test_torchflower_resets_to_crop(self):
        body = lines('harvest/torchflower')
        self.assertTrue(any('loot spawn' in l and ' mine ' in l for l in body))
        self.assertIn('setblock ~ ~ ~ minecraft:torchflower_crop[age=0]', body)

    def test_pitcher_resets_lower_half_before_clearing_upper(self):
        # Clearing the upper half first makes the lower half pop as a second pitcher plant item
        body = lines('harvest/pitcher_plant')
        loot = next(i for i, l in enumerate(body) if 'loot spawn' in l and ' mine ' in l)
        down = next(i for i, l in enumerate(body) if l.startswith('setblock ~ ~ ~ minecraft:pitcher_crop[age=0]'))
        up = body.index('setblock ~ ~1 ~ minecraft:air replace')
        self.assertLess(loot, down)
        self.assertLess(down, up)


if __name__ == '__main__':
    unittest.main()
