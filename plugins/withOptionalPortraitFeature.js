const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Marks `android.hardware.screen.portrait` as optional (`android:required="false"`).
 * Prevents Google Play Console's "Required hardware feature declarations are restricting
 * your app's availability" advisory while keeping portrait orientation on phones.
 */
function withOptionalPortraitFeature(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!Array.isArray(manifest['uses-feature'])) {
      manifest['uses-feature'] = [];
    }
    const existing = manifest['uses-feature'].find(
      (f) => f?.$?.['android:name'] === 'android.hardware.screen.portrait'
    );
    if (existing) {
      existing.$['android:required'] = 'false';
    } else {
      manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.screen.portrait',
          'android:required': 'false',
        },
      });
    }
    return cfg;
  });
}

module.exports = withOptionalPortraitFeature;
