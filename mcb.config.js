module.exports = {
    generatedDirName: '__generated__',
    formatVersion: 121,
    internalScoreboardName: 'rwysow',
    // eq temporaries and constants, named here so the pack owns them and does not share mcb.eq.* with other packs
    eqVarScoreboardName: 'rwysow.eq.var',
    eqConstScoreboardName: 'rwysow.eq.const',
    header: '# Reap What You Sow by satyrnidae\n# Built using mc-build (https://github.com/mc-build/mc-build)',
    // Pack settings for the sources, read through src/config.js. mc-build ignores this key.
    settings: {
        // Name of the folder or zip in the world, for the uninstall function to disable
        packName: 'reap-what-you-sow-dp',
        version: require('./package.json').version,
        // Ray steps, 13 of 0.25 reach the 3 blocks of entity interaction range
        rayStepCount: 13,
        rayStep: 0.25,
        // Ticks a marker lives after the ray last saw it
        markerTicks: 6
    }
};
