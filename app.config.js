const baseConfig = require("./app.json");

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

module.exports = {
  ...baseConfig.expo,
  android: {
    ...baseConfig.expo.android,
    package: baseConfig.expo.android?.package ?? "com.mechaniko.app",
    config: {
      ...baseConfig.expo.android?.config,
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
  ios: {
    ...baseConfig.expo.ios,
    bundleIdentifier:
      baseConfig.expo.ios?.bundleIdentifier ?? "com.mechaniko.app",
    config: {
      ...baseConfig.expo.ios?.config,
      googleMapsApiKey,
    },
  },
  plugins: [
    ...baseConfig.expo.plugins,
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
        iosGoogleMapsApiKey: googleMapsApiKey,
      },
    ],
  ],
};
