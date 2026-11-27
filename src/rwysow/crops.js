// Marker box: the block outline plus margin on every side. Width is 1 + 2 * margin, height is the mature outline height plus
// 2 * margin, and the box starts margin below the block floor. The pitcher crop is two blocks tall at age 4.
const margin = 0.03125;
const outline = {
    wheat: 1,
    carrots: 0.5625,
    potatoes: 0.5625,
    beetroots: 0.5,
    nether_wart: 0.875,
    pitcher_crop: 2
};
const markerHeight = {};
for (const name of Object.keys(outline)) markerHeight[name] = outline[name] + 2 * margin;

// Wireframe of the marker box for each crop: 12 thin block displays, one per edge, summoned at the marker's origin, which is
// the bottom center of the box. Edges sit inside the box. Thickness is 1/64.
const thick = 0.015625;
const edge = (t, s) => 'summon minecraft:block_display ~ ~ ~ {block_state:"minecraft:black_concrete",brightness:{sky:15,block:15},'
    + `transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[${t.join('f,')}f],scale:[${s.join('f,')}f]},`
    + 'Tags:["rwysow.outline"]}';
const outlineCmds = {};
for (const name of Object.keys(outline)) {
    const w = 1 + 2 * margin;
    const h = markerHeight[name];
    const lo = -w / 2;
    const hi = w / 2 - thick;
    const cmds = [];
    for (const y of [0, h - thick]) for (const z of [lo, hi]) cmds.push(edge([lo, y, z], [w, thick, thick]));
    for (const x of [lo, hi]) for (const z of [lo, hi]) cmds.push(edge([x, 0, z], [thick, h, thick]));
    for (const x of [lo, hi]) for (const y of [0, h - thick]) cmds.push(edge([x, y, lo], [thick, thick, w]));
    outlineCmds[name] = cmds;
}

// Crops with a single block and an age to reset to 0. age is the mature one, sound is the break sound. The pitcher crop is two
// blocks tall and has its own functions.
const simpleCrops = [
    { name: 'wheat', age: 7, sound: 'minecraft:block.crop.break' },
    { name: 'carrots', age: 7, sound: 'minecraft:block.crop.break' },
    { name: 'potatoes', age: 7, sound: 'minecraft:block.crop.break' },
    { name: 'beetroots', age: 3, sound: 'minecraft:block.crop.break' },
    { name: 'nether_wart', age: 3, sound: 'minecraft:block.nether_wart.break' }
];

// Cactus and sugar cane grow in stacks, and a hoe cuts a stack of 2 or more down to its base block. The marker covers the whole
// stack, so a click on any block of it harvests, and its height is only known when it is found. The marker and the wireframe
// are macro functions, $(h) is the box height as a float with its f, $(t) the height of the top edges. 16 is the tallest stack
// the marker covers, the cut itself has no limit. top is a block that can sit on the last block of the stack, a cactus flower. It
// is part of the box and of the cut, and a lone block with one on it is still not a stack.
const stackCrops = [
    { name: 'cactus', sound: 'minecraft:block.wool.break', top: 'minecraft:cactus_flower' },
    { name: 'sugar_cane', sound: 'minecraft:block.grass.break' }
];
const stackMax = 16;
const sf = (v) => (typeof v === 'number' ? `${v}f` : v);
// A macro line has to hold a variable, the edges without one are plain commands.
const stackEdge = (t, s) => {
    const cmd = 'summon minecraft:block_display ~ ~ ~ {block_state:"minecraft:black_concrete",brightness:{sky:15,block:15},'
        + `transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[${t.map(sf).join(',')}],scale:[${s.map(sf).join(',')}]},`
        + 'Tags:["rwysow.outline"]}';
    return cmd.includes('$(') ? '$' + cmd : cmd;
};
const stackOutlineCmds = [];
{
    const w = 1 + 2 * margin;
    const lo = -w / 2;
    const hi = w / 2 - thick;
    for (const y of [0, '$(t)']) for (const z of [lo, hi]) stackOutlineCmds.push(stackEdge([lo, y, z], [w, thick, thick]));
    for (const x of [lo, hi]) for (const z of [lo, hi]) stackOutlineCmds.push(stackEdge([x, 0, z], [thick, '$(h)', thick]));
    for (const x of [lo, hi]) for (const y of [0, '$(t)']) stackOutlineCmds.push(stackEdge([x, y, lo], [thick, thick, w]));
}

module.exports = {
    stackCrops,
    stackMax,
    stackOutlineCmds,
    simpleCrops,
    outlineCmds,
    cropNames: Object.keys(outline),
    markerHeight,
    markerWidth: 1 + 2 * margin,
    markerMargin: margin
};
