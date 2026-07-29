// Babel config for the UnjadedDigital Expo template.
// `babel-preset-expo` wires up Expo Router + React Native. As of Reanimated 4
// (SDK 54) the worklets runtime lives in `react-native-worklets`, and its
// Babel plugin replaces the old `react-native-reanimated/plugin`. It MUST be
// listed last.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
