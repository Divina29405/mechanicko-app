const baseConfig = require("./app.json");

module.exports = {
  ...baseConfig.expo,
  updates: {
    url: "https://u.expo.dev/16c708eb-375a-46b2-bee5-8af3049e875f"
  },
  runtimeVersion: {
    policy: "appVersion"
  },
  extra: {
    ...baseConfig.expo.extra,
    eas: {
      ...baseConfig.expo.extra?.eas,
      projectId: "16c708eb-375a-46b2-bee5-8af3049e875f",
    },
  },
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