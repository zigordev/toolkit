const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

function allowLocalHttp(config) {
  if (process.env.EXPO_ALLOW_LOCAL_HTTP !== '1') {
    return config;
  }
  return withAndroidManifest(config, (current) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(current.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';
    return current;
  });
}

module.exports = allowLocalHttp;
