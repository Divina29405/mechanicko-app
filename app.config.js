const baseConfig = require("./app.json");

module.exports = {
  ...baseConfig.expo,
  extra: {
    ...baseConfig.expo.extra,
    eas: {
      ...baseConfig.expo.extra?.eas,
      projectId: "acf5263b-9bc0-4f66-8fc9-fa29d59eef6e",
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
