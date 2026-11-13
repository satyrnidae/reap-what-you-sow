# Reap What You Sow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click a mature vanilla crop with a hoe, get its normal loot, crop resets to age 0.

**Architecture:** An `any_block_use` advancement fires when a player right-clicks a crop block with a hoe in the main hand. Its reward function raycasts from the player's eyes to find the clicked block, then a per-crop function drops loot with `loot spawn ... mine` and resets the age with `setblock`. No entities, no tick function.

**Tech Stack:** mc-build 4.2.0, vanilla data pack, pack format 121.

**Spec:** `docs/superpowers/specs/2026-11-12-reap-what-you-sow-design.md`

## Global Constraints

- Build with mc-build 4.2.0, pack format 121 (`min_format` and `max_format` both 121), layout like `D:\...\sandbox\wolves-beyond-dp` (`mcb.config.js`, `src/`, generated output gitignored).
- Namespace `rwysow`, name Reap What You Sow.
- Advancement-driven, no tick scanning. No entities, no resource pack.
- Crops v1: wheat, carrots, potatoes at max age 7; beetroots, nether_wart at max age 3. Nothing else, except ancient farming below.
- Ancient farming: torchflower and pitcher plant, only when score `#config.enable_ancient_farming` on objective `rwysow` is 1. Default 0, `load` must not overwrite a set value. Mature form is the finished block `minecraft:torchflower` or `minecraft:pitcher_plant`, harvest sets `torchflower_crop[age=0]` or `pitcher_crop[age=0]`, and only with farmland directly below.
- Loot identical to breaking the crop with the held hoe. Crop returns to age 0, same block.
- Never harvest immature crops. Never fire without a hoe in the main hand.
- Commits are always signed, never `--no-gpg-sign`. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Free text follows the user's style: American English, ASCII only, `-` not em dashes, terse fragments, no parenthetical asides, no emoji.

## Review Focus

- Immature crop right-clicked with a hoe: nothing drops, age unchanged.
- Hoe in off hand only, or any non-hoe in main hand: nothing happens.
- Two mature crops side by side, click one: only that one resets.
- Wall or other solid block between eyes and a mature crop: ray stops at the solid, nothing harvested.
- Adventure mode: no harvest. Survival and creative: harvest. Fortune on the hoe raises drops, silk touch does not change them.
- Config unset or 0: torchflower and pitcher plant ignored. Torchflower on grass or in a pot, pitcher plant on dirt: ignored even with config 1.
- `/reload` with the config at 1: stays 1.

All paths below are relative to `C:\Users\maskr\sandbox\reap-what-you-sow-dp`.

## File Structure

| Path | Responsibility |
|------|----------------|
| `package.json`, `mcb.config.js`, `pack.mcmeta`, `.gitignore` | Build and pack metadata |
| `src/rwysow.mcb` | `load`, `uninstall`, scoreboard setup |
| `src/rwysow/use.mcb` | `on_use`, the advancement reward entry |
| `src/rwysow/ray.mcb` | Eye-height raycast that finds the clicked crop |
| `src/rwysow/harvest.mcb` | One function per crop, loot plus reset |
| `data/rwysow/advancement/use_hoe.json` | The `any_block_use` trigger |
| `data/rwysow/tags/block/crops.json` | The five crop blocks plus `torchflower` and `pitcher_plant` |
| `data/rwysow/tags/block/ray_passable.json` | Blocks the raycast passes through |
| `scripts/check_cmds.py` | Command parse check, adapted from the sibling pack |

## Testing note

No unit test framework fits a data pack. Verification is two things: `scripts/check_cmds.py` parses every generated command with the game's own parser, and an in-game checklist per task. Each task names its checklist and the exact expected result. A test world is a flat creative world with the pack in `datapacks/`, with `/reload` after each build.

---

### Task 1: Scaffold and load

**Files:**
- Create: `package.json`, `mcb.config.js`, `pack.mcmeta`, `.gitignore`, `src/rwysow.mcb`

**Interfaces:**
- Produces: scoreboard objective `rwysow`, function `rwysow:load` tagged `minecraft:load`, function `rwysow:uninstall`.

- [ ] **Step 1: Write the config files, copying shape from `wolves-beyond-dp`.** `package.json` name `reap-what-you-sow-dp`, scripts `build: mcb build` and `watch: mcb watch`, dependency `mc-build` pinned `4.2.0`. `mcb.config.js` with `generatedDirName: '__generated__'`, `formatVersion: 121`, `internalScoreboardName: 'rwysow'`, and a header line crediting mc-build. `pack.mcmeta` with `min_format` and `max_format` 121 and description `Reap What You Sow`. `.gitignore` with `node_modules`, `.build`, `.mcb`, `data/rwysow/function`, `data/minecraft/tags/function/load.json`.
- [ ] **Step 2: Write `src/rwysow.mcb`.** `function load minecraft:load` adds objective `rwysow`, then sets `#config.enable_ancient_farming rwysow` to 0 only if it has no value yet (`execute unless score #config.enable_ancient_farming rwysow matches -2147483648..2147483647 run scoreboard players set ...`); `function uninstall` removes the objective.
- [ ] **Step 3: Install and build.**

Run: `npm install && npm run build`
Expected: exits 0, `data/rwysow/function/load.mcfunction` exists.

- [ ] **Step 4: Commit.**

```bash
git add package.json package-lock.json mcb.config.js pack.mcmeta .gitignore src docs
git commit -m "chore: scaffold mc-build pack"
```

### Task 2: Spike, the advancement gate

Gate task. If the trigger does not fire, stop, record it in the spec's Known Risk, and report back; the fallback is approach A.

**Files:**
- Create: `data/rwysow/tags/block/crops.json`, `data/rwysow/advancement/use_hoe.json`, `src/rwysow/use.mcb`

**Interfaces:**
- Consumes: scoreboard setup from Task 1.
- Produces: function `rwysow:on_use`, runs as the player, advancement already revoked.

- [ ] **Step 1: Write `tags/block/crops.json`** listing `minecraft:wheat`, `minecraft:carrots`, `minecraft:potatoes`, `minecraft:beetroots`, `minecraft:nether_wart`, `minecraft:torchflower`, `minecraft:pitcher_plant`. The last two stay in the tag even with the config off; the config gates the harvest, not the trigger, and a disabled flower still ends the ray.
- [ ] **Step 2: Write `advancement/use_hoe.json`.** Criterion trigger `minecraft:any_block_use`, conditions: `player` predicate with `equipment.mainhand` matching items `#minecraft:hoes` and `gamemode` in survival or creative, `location` block tag `#rwysow:crops`. Reward function `rwysow:on_use`.
- [ ] **Step 3: Write `function on_use` in `src/rwysow/use.mcb`.** First line `advancement revoke @s only rwysow:use_hoe`. Then a temporary `tellraw @s "rwysow: fired"`.
- [ ] **Step 4: Build, `/reload`, test in world.**

Checklist and expected results:
  - Iron hoe in main hand, right-click wheat at age 7: chat shows `rwysow: fired`, and it fires again on a second click.
  - Same click with a stick: no message.
  - Same click with the hoe in the off hand only: no message.
  - Same click on wheat at age 3: message shows, since age is not gated by the advancement.

- [ ] **Step 5: Record the result** in the spec's Known Risk section, one line, then commit.

```bash
git add data src docs
git commit -m "feat: any_block_use gate for hoe on crops"
```

### Task 3: Raycast and harvest

**Files:**
- Create: `src/rwysow/ray.mcb`, `src/rwysow/harvest.mcb`, `data/rwysow/tags/block/ray_passable.json`
- Modify: `src/rwysow/use.mcb` (replace the debug `tellraw`)

**Interfaces:**
- Consumes: `rwysow:on_use` from Task 2.
- Produces: `rwysow:ray/start` (runs as the player), `rwysow:ray/step` (recursive, runs as the player at the ray position), and `rwysow:harvest/<crop>` for `wheat`, `carrots`, `potatoes`, `beetroots`, `nether_wart`, each run as the player, positioned at the block.

- [ ] **Step 1: Write `ray_passable.json`** with `#minecraft:air` and `#minecraft:replaceable` only. Crops are not passable, except above their outline: the sample point shifted up by 1 minus the mature outline height (carrots, potatoes 0.4375, beetroots 0.5, nether wart 0.125, torchflower 0.375) leaving the cell means the ray is over the crop and carries on. Hits use the same shift. Pitcher plant sets the lower half to `pitcher_crop[age=0]` before clearing the upper, or the lower half pops a second item.
- [ ] **Step 2: Write `function start` in `ray.mcb`.** Sets `#left rwysow` to 100, then `execute anchored eyes positioned ^ ^ ^ run function rwysow:ray/step`.
- [ ] **Step 3: Write `function step` in `ray.mcb`.** At the current position: for each crop, `execute if block ~ ~ ~ <crop>[age=<max>] run function rwysow:harvest/<crop>`, and on a match set `#left rwysow` to 0. If `#left` is above 0 and the block is in `#rwysow:ray_passable`, subtract 1 and recurse at `^ ^ ^0.05`. Step size 0.05 and 100 steps give 5 blocks of range, the builder may tune.
- [ ] **Step 4: Write `harvest.mcb` for wheat first.** `function wheat`: `align xyz positioned ~0.5 ~0.1 ~0.5 run loot spawn ~ ~ ~ mine ~ ~ ~ mainhand` using the block's coordinates, not the ray's, then `setblock` the same block at `age=0`, then block-breaking sound and particles. The block position must be the aligned block, not the fractional ray point.
- [ ] **Step 5: Point `on_use` at `rwysow:ray/start`.** Remove the debug line.
- [ ] **Step 6: Build and test wheat.**

Checklist and expected results:
  - Mature wheat, iron hoe: wheat and seeds drop, wheat returns at age 0.
  - Wheat at age 6: nothing drops, age unchanged.
  - Two mature wheat blocks side by side, click one: only that one resets.
  - Click wheat behind a stone block, aiming through a gap at the edge: the clicked crop resets, never one behind the stone.

- [ ] **Step 7: Repeat step 4 for carrots, potatoes (max age 7), beetroots, nether_wart (max age 3).** Same pattern, only the block id, max age and loot differ. Test each once in world: loot matches breaking it by hand with the same hoe.
- [ ] **Step 8: Commit.**

```bash
git add data src
git commit -m "feat: raycast harvest for five crops"
```

### Task 3b: Ancient farming, config gated

**Files:**
- Modify: `src/rwysow/ray.mcb` (two gated lines in `step`), `src/rwysow/harvest.mcb`

**Interfaces:**
- Consumes: `rwysow:ray/step` and the harvest pattern from Task 3, score `#config.enable_ancient_farming rwysow` from Task 1.
- Produces: `rwysow:harvest/torchflower` and `rwysow:harvest/pitcher_plant`, run as the player, positioned at the lower block of the plant.

- [ ] **Step 1: Add to `step`, before the passable check.** Each line carries `if score #config.enable_ancient_farming rwysow matches 1`. Torchflower: `if block ~ ~ ~ minecraft:torchflower if block ~ ~-1 ~ minecraft:farmland` runs `harvest/torchflower`. Pitcher plant lower half: `if block ~ ~ ~ minecraft:pitcher_plant[half=lower] if block ~ ~-1 ~ minecraft:farmland` runs `harvest/pitcher_plant`. Pitcher plant upper half: `if block ~ ~ ~ minecraft:pitcher_plant[half=upper] if block ~ ~-2 ~ minecraft:farmland` runs `positioned ~ ~-1 ~ run function rwysow:harvest/pitcher_plant`. Each match sets `#left rwysow` to 0 like the other crops.
- [ ] **Step 2: Write `function torchflower` in `harvest.mcb`.** Same shape as `wheat`: loot with `mine` at the aligned block, then `setblock ~ ~ ~ minecraft:torchflower_crop[age=0]`, sound, particles.
- [ ] **Step 3: Write `function pitcher_plant` in `harvest.mcb`.** Loot with `mine` from the lower block, `setblock ~ ~1 ~ minecraft:air replace` first, then `setblock ~ ~ ~ minecraft:pitcher_crop[age=0]`, sound, particles. Builder checks in game which `half` state `pitcher_crop[age=0]` needs and that no upper half is left behind.
- [ ] **Step 4: Build and test.**

Checklist and expected results:
  - Config 0 or unset: hoe click on a planted torchflower and on a pitcher plant, both on farmland: nothing happens.
  - `/scoreboard players set #config.enable_ancient_farming rwysow 1`: torchflower on farmland drops a torchflower and becomes a `torchflower_crop` at age 0.
  - Pitcher plant on farmland, click the lower half: drops its loot, becomes a single age 0 `pitcher_crop`, no upper half remains.
  - Same, click the upper half: identical result.
  - Config 1, torchflower on grass, torchflower in a pot, pitcher plant on dirt: nothing happens.
  - `/reload` with config 1: config is still 1.

- [ ] **Step 5: Commit.**

```bash
git add data src
git commit -m "feat: config gated torchflower and pitcher plant harvest"
```

### Task 4: Hoe wear, optional

Gate task. Attempt for one hour of effort. If it needs per-material fraction tables or breaks on unbreaking, skip it, note the skip in the spec's Design section, and move on.

**Files:**
- Modify: `src/rwysow/ray.mcb` or `src/rwysow/harvest.mcb`, whichever hosts the shared finish step
- Create if needed: `data/rwysow/item_modifier/hoe_wear.json`

**Interfaces:**
- Consumes: the per-crop harvest functions from Task 3.
- Produces: 1 durability removed from the main-hand hoe per successful harvest, hoe breaks at zero.

- [ ] **Step 1: Try `item modify entity @s weapon.mainhand rwysow:hoe_wear`.** Check what format 121 offers first; if a direct damage item function exists, use it, else fall through to the skip.
- [ ] **Step 2: Test in world.**

Checklist and expected results:
  - Iron hoe, 10 harvests: durability bar drops by 10.
  - Hoe at 1 durability left: the harvest breaks it, with the break sound.
  - Unbreaking III: wear still plausible, or the skip is recorded.

- [ ] **Step 3: Commit or record the skip.**

```bash
git add data src docs
git commit -m "feat: hoe wear on harvest"
```

### Task 5: Verification pass

**Files:**
- Create: `scripts/check_cmds.py`

**Interfaces:**
- Consumes: all generated functions under `data/rwysow/function`.

- [ ] **Step 1: Adapt the sibling `scripts/check_cmds.py`.** Point `ROOT`-relative `FUNCS` at `data/rwysow/function`, drop wolves-specific `SAMPLE` entries, keep the harness paths from environment variables as in the sibling.
- [ ] **Step 2: Run it.**

Run: `python scripts/check_cmds.py`
Expected: exits 0, no parse errors.

- [ ] **Step 3: Run the Review Focus checklist in world.** Every line under Review Focus, plus: adventure mode, Fortune III hoe, silk touch hoe, two players harvesting in the same tick.

Expected: each behaves as its Review Focus line states.

- [ ] **Step 4: Write a short `README.md`** with what it does, the five crops, the config score and how to enable ancient farming, and a build line. Commit.

```bash
git add scripts README.md
git commit -m "chore: command check script and readme"
```

---

## Self-review

- Spec coverage: gate (Task 2), raycast (Task 3), five crops and ages (Task 3), loot and reset (Task 3), sound and particles (Task 3 step 4), ancient farming and its config (Tasks 1, 3b), hoe wear (Task 4), known-risk spike (Task 2), mc-build layout and namespace (Task 1).
- Review Focus tests live in Tasks 2, 3, 5.
- Names consistent: `rwysow:on_use`, `rwysow:ray/start`, `rwysow:ray/step`, `rwysow:harvest/<crop>`, tag `#rwysow:crops`, `#rwysow:ray_passable`, score `#left rwysow`.
