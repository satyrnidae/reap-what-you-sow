const { text, json } = require('./lib');
const { config } = require('../config.js');

module.exports = {
  coreText: {
    uninstalling: json(text(`Uninstalling Reap What You Sow v${config.version}...`)),
    packFolder: json([text('Pack folder name has changed. ', 'red'), text('Finish with /datapack disable "file/<pack folder>"', 'aqua')]),
    uninstalled: json(text('Reap What You Sow uninstalled.', 'green')),
  },
};
