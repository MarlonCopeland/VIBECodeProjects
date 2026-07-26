// Babel config for the UnjadedDigital Expo template.
// `babel-preset-expo` wires up Expo Router + React Native. The Reanimated
// plugin MUST be listed last.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
