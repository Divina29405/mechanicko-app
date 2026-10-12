const baseConfig = require("./app.json");

module.exports = {
  ...baseConfig.expo,
  android: {
    ...baseConfig.expo.android,
    package: baseConfig.expo.android?.package ?? "com.mechaniko.app",
  },
  ios: {
    ...baseConfig.expo.ios,
    bundleIdentifier:
      baseConfig.expo.ios?.bundleIdentifier ?? "com.mechaniko.app",
  },
};
