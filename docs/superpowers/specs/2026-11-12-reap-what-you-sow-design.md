# Reap What You Sow, design

Crouch requirement dropped 2026-11-13. It only existed to cap marker spawns in approach A; B has no markers. Renamed to Reap What You Sow, id `rwysow`.

## Intent
Replicate harvest mods/plugins as a vanilla data pack: right-click a fully grown crop with a hoe, get its normal loot, crop resets to age 0. No replanting.

## Goals
- One right-click harvests one mature crop, loot identical to breaking it with that hoe.
- Crop returns to age 0 in place, same block, same state otherwise.
- Pure data pack, no resource pack, no entities.

## Non-goals
- Area harvest, auto-replant of seeds from inventory, markers or any visible feedback layer.
- Modded crops. Vanilla only.

## Anti-goals
- Any harvest of immature crops.
- Leaving entities or scoreboard clutter behind.
- Firing without a hoe in the main hand.

## Constraints
- Build with mc-build 4.2.0, pack format 121, same layout as `wolves-beyond-dp` (`mcb.config.js`, `src/`, generated output gitignored).
- Name Reap What You Sow, namespace `rwysow`.
- Advancement-driven, no tick scanning.

## Approaches considered
- A. Crouch-summoned `interaction` markers plus scan and cleanup. Largest build, shorter click reach, swallows left-clicks.
- B. `any_block_use` advancement, no markers. Chosen.
- C. A with a small scan box. Same lifecycle burden as A.

Chosen: B. Markers are invisible, so they add click targeting and nothing else. If thin crop outlines annoy in play, markers can come later.

## Design
- Advancement `any_block_use`, conditions: main hand in `#minecraft:hoes`, clicked block is one of the crops. One advancement per crop, or one with a block list, builder's call. Reward runs `harvest` and the advancement is revoked on use so it can refire.
- Crops v1, my call: wheat, carrots, potatoes, beetroots, nether_wart. Skipped: sweet berries, since vanilla already right-click harvests them; cocoa, for later.
- Max age gate: 7 for wheat, carrots, potatoes; 3 for beetroots, nether_wart.
- Ancient farming, added 2026-11-13: pitcher crop only, gated by score `#config.enable_pitcher_crop` on objective `rwysow`. A pitcher crop is final at age 4 and never becomes the `pitcher_plant` block, its age 4 loot is the pitcher plant item, so `minecraft:pitcher_crop[age=4]` is the harvest and it resets to `pitcher_crop[age=0,half=lower]`. Torchflower is not harvested: its crop tops out at age 1 and grows into the adult `torchflower` block, a finished plant. Checked against the 26.3 classes and loot tables.
- Pitcher plant is two blocks tall. A click on either half harvests; the upper half is removed and the lower half becomes the age 0 crop.
- Config default 0, off, my call. `load` sets it only when unset so `/reload` keeps a chosen value. Enable with `/scoreboard players set #config.enable_pitcher_crop rwysow 1`.
- Harvest: find the clicked block, `loot spawn` with `mine` using the held hoe, `setblock` same crop with `age=0`, play crop break sound plus block particles.
- Hoe wear: 1 durability per harvest if it can be done cleanly in format 121, else skipped. Skipped in v1: `set_damage` only takes a fraction of max durability, so exact wear needs a modifier per hoe material plus break handling, and it could not be tested in game here.

## Known risk
The advancement reward runs at the player, not the clicked block. The block position has to come from a short eye-height raycast that stops on the first mature crop or solid block. Edge-of-block clicks could resolve to a neighbor. First spike: confirm `any_block_use` fires for a hoe on a crop, then confirm raycast accuracy.

## Left to the builder
- Raycast step size and range, hoe wear method, one advancement vs one per crop, test world setup.
