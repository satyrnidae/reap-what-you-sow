const { tr, json } = require('./lib');

const colored = (component, color) => ({ ...component, color });

module.exports = {
  advText: {
    globalRoot: json(tr('global.advancement.root.title', 'Installed Datapacks')),
    authorTitle: json(tr('global.advancement.satyrnidae.title', 'satyrnidae')),
    authorDescription: json(tr('global.advancement.satyrnidae.description', 'Datapacks Created by satyrnidae!')),
    rootTitle: json(colored(tr('rwysow.advancement.root.title', 'Reap What You Sow'), 'green')),
    rootDescription: json(colored(tr('rwysow.advancement.root.description', 'Harvest crops without having to replant them'), 'yellow')),
    hoeDownTitle: json(tr('rwysow.advancement.hoe_down.title', 'Hoe down!')),
    hoeDownDescription: json(tr('rwysow.advancement.hoe_down.description', 'Harvest a crop with a hoe')),
  },
};
