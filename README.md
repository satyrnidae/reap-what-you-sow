# Reap What You Sow

Harvest crops with a hoe, no replanting. Hold any hoe and look at a fully grown crop: it gets a thin black outline. Right-click it and the loot drops, the crop goes back to age 0, and the hoe takes one point of durability.

Works with wheat, carrots, potatoes, beetroots and nether wart, survival and creative only. Any hoe counts, modded ones too. Loot is the block's own table mined with the held hoe, so Fortune and Silk Touch apply. Unbreaking is honored, unbreakable hoes take no damage, and a hoe at its last point breaks like it would on a block. Torchflower is never harvested.

Cactus and sugar cane work differently. A stack of two or more gets one outline over the whole stack, and right-clicking any block of it cuts the stack down to its base block. Each cut block drops its own loot, and the hoe takes one point of durability for the whole cut. A single block is left alone.

First harvest grants the "Hoe down!" advancement under the pack's own root.

## Commands

All settings are scores on the `rwysow` objective.

| Command | Default | Effect |
| --- | --- | --- |
| `/scoreboard players set #config.show_outline rwysow 0` | 1 | Turns the outline off. The click still works |
| `/scoreboard players set #config.enable_pitcher_crop rwysow 1` | 0 | Pitcher crops at age 4 can be harvested |

## How it works

A hoe holder's eyes cast a short ray every other tick. A mature crop on the ray gets an `interaction` entity slightly bigger than the block, so the client picks it before the crop. Right-clicking it fires `player_interacted_with_entity`, whose reward does the harvest. Markers expire a few ticks after nobody looks, or when no hoe holder is near.

## Uninstalling

Run `/function rwysow:uninstall` as an operator. It removes the markers and outlines, the objectives and tags, revokes the advancements, then disables the pack. If the pack can't be disabled by name it says so, and the folder or zip can be removed from the world's datapacks folder.

## Conventions

Follows the [datapack conventions](https://mc-datapacks.github.io/en/): the pack advancement sits under `global:satyrnidae/author`.

## Building

Source is `.mcb` under `src/`, built with mc-build 4.2.0 for pack format 121. `data/` is build output and ignored.

```powershell
npm install
npm run build
npm test
```

`npm test` runs the structural unit tests, then the gametests on a headless server: `node gametest/fetch-server.js` downloads the jar once and Java 25 is needed. `npm run check` checks every command against the client jar harness.

## AI Usage Disclosure

This datapack's code was developed with a big ol' plagiarism machine (Claude Code by Anthropic). Commits it helped with carry a Co-Authored-By trailer. No art asset files were generated using the LLM.
