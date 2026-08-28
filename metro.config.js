const { getDefaultConfig } = require('expo/metro-config');

// ponytail: bare default. A resolver blockList of /node_modules\/.*\/node_modules\/.*/
// used to live here and broke @react-native/virtualized-lists, which npm nests under
// react-native. Nested deps are legal — don't re-add a blockList without a real duplicate.
module.exports = getDefaultConfig(__dirname);
