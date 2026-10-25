module.exports = ({ config }) => ({
  ...config,
  updates: {
    ...config.updates,
    url: "https://u.expo.dev/16c708eb-375a-46b2-bee5-8af3049e875f",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  extra: {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      projectId: "16c708eb-375a-46b2-bee5-8af3049e875f",
    },
  },
  android: {
    ...config.android,
    package: config.android?.package ?? "com.mechaniko.app",
  },
  ios: {
    ...config.ios,
    bundleIdentifier:
      config.ios?.bundleIdentifier ?? "com.mechaniko.app",
  },
  plugins: [
    ...(config.plugins ?? []),
    "expo-font",
    "expo-status-bar",
    "expo-web-browser",
  ],
});