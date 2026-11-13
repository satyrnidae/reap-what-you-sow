Reap What You Sow, `rwysow`. Right-click a fully grown crop with a hoe in the main hand: normal loot drops, the crop resets to age 0. No replanting.

Crops: wheat, carrots, potatoes, beetroots, nether wart. Survival and creative only.

Ancient farming, off by default: torchflower and pitcher plant, on farmland only. Enable with:

```
/scoreboard players set #config.enable_ancient_farming rwysow 1
```

Loot is the block's own table mined with the held hoe, so Fortune and Silk Touch apply. Hoes take no durability damage.

Build and check:

```
npm install
npm run build
npm test
python scripts/check_cmds.py
```

Built with mc-build 4.2.0, pack format 121. `scripts/check_cmds.py` needs the foxcraft-dungeon-loot-2 test harness and Java 25.
