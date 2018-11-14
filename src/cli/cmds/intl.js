exports.command = ['* <command>', 'intl'];
exports.desc = 'Manage intl configuration (only available in intl declination)';
exports.builder = (yargs) => yargs.commandDir('intl_cmds');
