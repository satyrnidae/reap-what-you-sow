// Build config of the test namespace, a second mc-build project so rwysow_test never lands in the data folder of the pack. Run by
// gametest/run.js with this folder as the working directory, the output goes to ./data and is copied into the generated gametest pack.
module.exports = {
	formatVersion: 121,
	generatedDirName: "__generated__",
	internalScoreboardName: "rwysow_test.internal",
	header: "# Reap What You Sow gametests, never part of a release",
};
