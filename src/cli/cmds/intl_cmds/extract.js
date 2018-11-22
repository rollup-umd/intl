/* eslint-disable no-undef, no-param-reassign, global-require, no-unused-vars, no-console, no-restricted-syntax, no-await-in-loop */
/**
 * This script will extract the internationalization messages from all components
 and package them in the translation json files in the translations file.
 */

require('shelljs/global');

const fs = require('fs');
const nodeGlob = require('glob');
const { transform } = require('@babel/core');
const get = require('lodash.get');
const { animateProgress, addCheckMark } = require('kopaxgroup-cli-helpers');
const path = require('path');
const acceptDotPath = require('@yeutech-lab/accept-dot-path/lib');
const { spawn } = require('../../utils');

// Glob to match all js files except test files
const FILES_TO_PARSE = 'src/**/!(*.test).js';

const newLine = () => process.stdout.write('\n');

// Progress Logger
let progress;
const task = (message) => {
  progress = animateProgress(message);
  process.stdout.write(message);

  return (error) => {
    if (error) {
      process.stderr.write(error);
    }
    clearTimeout(progress);
    return addCheckMark(() => newLine());
  };
};

// Wrap async functions below into a promise
const glob = (pattern) => new Promise((resolve, reject) => {
  nodeGlob(pattern, (error, value) => (error ? reject(error) : resolve(value)));
});

const readFile = (fileName) => new Promise((resolve, reject) => {
  fs.readFile(fileName, (error, value) => (error ? reject(error) : resolve(value)));
});

const doSpawn = (cmd) => new Promise((resolve, reject) => {
  spawn(cmd, (error, value) => (error ? reject(error) : resolve(value)));
});

// Store existing translations into memory
const oldLocaleMappings = [];
const localeMappings = [];

const setOldLocalMappings = (argv, locales) => {
  // Loop to run once per locale
  locales.forEach((locale) => {
    oldLocaleMappings[locale] = {};
    localeMappings[locale] = {};
    // File to store translation messages into
    const translationFileName = `${argv.target}/${locale}.json`;
    try {
      // Parse the old translation message JSON files
      const messages = JSON.parse(fs.readFileSync(translationFileName));
      const messageKeys = Object.keys(messages);
      messageKeys.forEach((messageKey) => {
        oldLocaleMappings[locale][messageKey] = messages[messageKey];
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        process.stderr.write(`There was an error loading this translation file: ${translationFileName}\n${error}`);
      }
    }
  });
};

const extractFromFile = async (argv, filename, defaultLocale, locales, presets, plugins) => {
  try {
    const code = await readFile(filename);

    const output = await transform(code, { filename, presets, plugins });
    const messages = get(output, 'metadata.react-intl.messages', []);

    for (const message of messages) {
      for (const locale of locales) {
        const oldLocaleMapping = oldLocaleMappings[locale][message.id];
        // Merge old translations into the babel extracted instances where react-intl is used
        const newMsg = locale === defaultLocale ? message.defaultMessage : '';
        localeMappings[locale][message.id] = oldLocaleMapping || newMsg;
      }
    }
  } catch (error) {
    process.stderr.write(`Error transforming file: ${filename}\n${error}`);
  }
};

exports.command = 'extract';
exports.desc = 'Extract intl messages to json files.';
exports.builder = (yargs) => yargs
  .option('path', {
    alias: 'p',
    describe: 'path',
    default: process.cwd(),
  })
  .option('target', {
    alias: 't',
    describe: 'Output target directory',
    default: 'translation',
  })
  .option('babel-config', {
    alias: 'b',
    describe: 'Specify babel.config.js location',
    default: 'babel.config.js',
  })
  .option('babel-rc', {
    alias: 'r',
    describe: 'Specify .babelrc location (will take precedence over --babel-config if used)',
  });
exports.handler = (argv) => {
  argv.path = acceptDotPath(argv.path, process.cwd());
  const pkg = require(path.join(argv.path, 'package.json'));
  const babelConfigPath = path.join(argv.path, argv.babelConfig);
  const babelRcPath = path.join(argv.path, argv.babelRc || '.babelrc');

  let babelConfig = {};
  if (fs.existsSync(babelConfigPath) && !argv.babelRc) {
    babelConfig = require(babelConfigPath);
  } else if (argv.babelRc && fs.existsSync(babelRcPath)) {
    babelConfig = JSON.parse(fs.readFileSync(babelRcPath, 'utf-8'));
  } else {
    console.log(`[Warning] Could not locate your babel configuration in ${argv.babelRc || argv.babelConfig}, maybe you are missing --babel-config or --babel-rc options, it will try to use default presets and plugins (as in create-react-app)`);
  }

  // we use defaults presets and plugins for react if nothing is found
  babelConfig.presets = babelConfig.presets || [
    [
      '@babel/preset-env',
      {
        modules: false,
      },
    ],
    '@babel/preset-react',
  ];
  babelConfig.plugins = babelConfig.plugins || [
    '@babel/plugin-transform-runtime',
    '@babel/plugin-transform-async-to-generator',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-json-strings',
    [
      '@babel/plugin-proposal-decorators',
      {
        legacy: true,
      },
    ],
  ];

  // do not use presets that are not installed
  babelConfig.presets = babelConfig.presets.filter((preset) => {
    const name = typeof preset === 'string' ? preset : preset[0];
    const absPath = fs.existsSync(name);
    const relPath = fs.existsSync(path.join(argv.path, 'node_modules', name));
    return absPath || relPath;
  });

  // do not use plugins that are not installed
  babelConfig.plugins = babelConfig.plugins.filter((plugin) => {
    const name = typeof plugin === 'string' ? plugin : plugin[0];
    const absPath = fs.existsSync(name);
    const relPath = fs.existsSync(path.join(argv.path, 'node_modules', name));
    return absPath || relPath;
  });

  // we add react-intl plugins to the list
  babelConfig.plugins.push(['react-intl']);

  if (!pkg.dependencies['react-intl'] && !pkg.devDependencies['react-intl']) {
    console.log('[Error] - You must use a intl declination to use this command!');
    return;
  }

  if (!pkg.translation) {
    console.log('[Error] - You must run "intl install" at least once before running this command!');
    return;
  }

  (async function main() {
    const memoryTaskDone = task('Storing language files in memory');
    const files = await glob(FILES_TO_PARSE);
    memoryTaskDone();

    const extractTaskDone = task('Run extraction on all files');


    if (babelConfig.presets.indexOf('react') !== -1 && Object.keys(pkg.devDependencies || {}).indexOf('@babel/preset-react') === -1) {
      console.log('\nRequired dependencies will be installed: @babel/cli babel-plugin-react-intl @babel/preset-react\n');
      try {
        await doSpawn(`npm install --prefix ${argv.path} @babel/cli babel-plugin-react-intl @babel/preset-react --save-dev`);
      } catch (e) {
        throw e;
      }
    }

    setOldLocalMappings(argv, pkg.translation.locales);

    // Run extraction on all files that match the glob on line 16
    await Promise.all(files.map((fileName) => extractFromFile(argv, fileName, pkg.translation.locale, pkg.translation.locales, babelConfig.presets, babelConfig.plugins)));

    extractTaskDone();

    // Make the directory if it doesn't exist, especially for first run
    mkdir('-p', argv.target); // eslint-disable-line

    let localeTaskDone;
    let translationFileName;

    for (const locale of pkg.translation.locales) {
      translationFileName = `${argv.target}/${locale}.json`;
      localeTaskDone = task(`Writing translation messages for ${locale} to: ${translationFileName}`);

      // Sort the translation JSON file so that git diffing is easier
      // Otherwise the translation messages will jump around every time we extract
      const messages = {};
      Object.keys(localeMappings[locale]).sort().forEach((key) => {
        messages[key] = localeMappings[locale][key];
      });

      // Write to file the JSON representation of the translation messages
      const prettified = `${JSON.stringify(messages, null, 2)}\n`;

      try {
        await fs.writeFileSync(translationFileName, prettified);
        localeTaskDone();
      } catch (error) {
        localeTaskDone(`There was an error saving this translation file: ${translationFileName}
        \n${error}`);
      }
    }

    process.exit();
  }());
};
