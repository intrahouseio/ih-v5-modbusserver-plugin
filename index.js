const util = require("util");

const plugin = require("ih-plugin-api")();
const modbus = require("./app");

(async () => {
  plugin.log("Modbus Master plugin has started.");
  try {
    plugin.params = await plugin.params.get();
    plugin.log('Received params '+ util.inspect(plugin.params));
     // Получить каналы для публикации
     plugin.extraChannels = await plugin.extra.get();
     plugin.log('Received extra channels...');
    if (plugin.extraChannels.length > 0) {
      plugin.log(`Received ${plugin.extraChannels.length} extra channels...`);
    } else {
      plugin.log('Empty extra channels list!');
      process.exit(2);
    }

    modbus(plugin);
  } catch (err) {
    plugin.exit(8, `Error! Message: ${util.inspect(err)}`);
  }
})();
