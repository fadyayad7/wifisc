const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Without watchman, restrict file watching to project source only
config.watchFolders = [__dirname];
config.resolver.blockList = [
  /node_modules\/.*\/node_modules\/.*/,
];

module.exports = config;
