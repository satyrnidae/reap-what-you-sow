// Test manifest. Read by gametest/generate.js for the structures, environments and instances, and imported by mc/src/rwysow_test.mcb
// for the scenario and poll functions of each test.
// Every test is one test instance with its own environment, but the runner starts them all at once, and the scenarios share one arena,
// tags and scores. So each test gets a window on a global tick clock, start below, and its poll does nothing before it. Windows do not
// overlap, and a test that fails or times out can't hold up the next one. The clock only runs once the arena chunk is loaded, see gt_tick
// in generate.js. The structure holds a start test block, a command block the start block powers, an accept test block and a fail test
// block. The command block repeats a poll function, which counts ticks and runs the steps below. A step is [age, function under
// rwysow_test], age 1 is the first tick. Before each step the score #ok rwysow_test is 1, a step fails the test by setting it to 0. The
// last step passing accepts the test.
// All scenarios build their stage at the origin marker at 100 64 100, see lib/begin in rwysow_test.mcb. The structure is only the scaffold.

// The single block crops, mature state, and the base block each needs. Pitcher crop is two blocks tall and has its own tests.
const crops = [
	{ name: "wheat", mature: "minecraft:wheat[age=7]", immature: "minecraft:wheat[age=6]", reset: "minecraft:wheat[age=0]", base: "minecraft:farmland[moisture=7]" },
	{ name: "carrots", mature: "minecraft:carrots[age=7]", immature: "minecraft:carrots[age=6]", reset: "minecraft:carrots[age=0]", base: "minecraft:farmland[moisture=7]" },
	{ name: "potatoes", mature: "minecraft:potatoes[age=7]", immature: "minecraft:potatoes[age=6]", reset: "minecraft:potatoes[age=0]", base: "minecraft:farmland[moisture=7]" },
	{ name: "beetroots", mature: "minecraft:beetroots[age=3]", immature: "minecraft:beetroots[age=2]", reset: "minecraft:beetroots[age=0]", base: "minecraft:farmland[moisture=7]" },
	{ name: "nether_wart", mature: "minecraft:nether_wart[age=3]", immature: "minecraft:nether_wart[age=2]", reset: "minecraft:nether_wart[age=0]", base: "minecraft:soul_sand" },
];

const gametest = {
	size: [8, 2, 1],
	// Ticks added to the last step for max_ticks. Room for the arena chunk to load before a test's clock starts
	margin: 600,
	tests: [
		{ id: "t0_load", steps: [[1, "load/check"]] },
		...crops.map((c) => ({ id: `crop_${c.name}`, steps: [[1, `crop/${c.name}/run`]] })),
		...crops.map((c) => ({ id: `immature_${c.name}`, steps: [[1, `immature/${c.name}`]] })),
		...["cactus", "sugar_cane"].flatMap((n) => ["", "_up", "_single"].map((k) => ({ id: `stack_${n}${k}`, steps: [[1, `stack/${n}/${k ? k.slice(1) : "run"}`]] }))),
		{ id: "stack_cactus_flower", steps: [[1, "stack/cactus_flower/run"]] },
		{ id: "stack_cactus_flower_single", steps: [[1, "stack/cactus_flower/single"]] },
		// The pack tick removes a marker no hoe holder is near, so a check a tick after it was placed sees none
		{ id: "marker_expires", steps: [[1, "expiry/start"], [2, "expiry/check"]] },
		{ id: "pitcher_off", steps: [[1, "pitcher/off"]] },
		{ id: "pitcher_lower", steps: [[1, "pitcher/lower"]] },
		{ id: "pitcher_upper", steps: [[1, "pitcher/upper"]] },
		{ id: "outline_off", steps: [[1, "outline_off/run"]] },
	],
};

// A test's window starts when the one before it has run its last step, plus slack for its cleanup
let start = 0;
for (const t of gametest.tests) {
	t.last = Math.max(...t.steps.map(([age]) => age));
	t.start = start;
	start += t.last + 10;
}
// Each test stages its arena in the same column at its own height, 12 blocks apart from the one below, so a test that starts late never
// meets another one's leftovers and only one chunk has to be loaded. The first is at y -40, the last stays far under the build limit
gametest.tests.forEach((t, i) => { t.x = 100; t.y = -40 + 12 * i; });

module.exports = { gametest, crops };
