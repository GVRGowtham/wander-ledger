const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MARKER = '# WanderLedger R8 Full Mode keep rules';
const KEEP_RULES = `
${MARKER}
# AndroidX Room + WorkManager (required under R8 Full Mode: room-runtime 2.6.1
# only keeps the class name, which causes R8 to strip WorkDatabase_Impl.<init>()
# and crash WorkManagerInitializer during cold launch).
-keep class * extends androidx.room.RoomDatabase { *; }
-keep class androidx.work.impl.WorkDatabase { *; }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class androidx.work.WorkerParameters { *; }
-keep class * extends androidx.work.ListenableWorker { public <init>(android.content.Context, androidx.work.WorkerParameters); }
-keep class * extends androidx.work.InputMerger { public <init>(); }

# Expo Background Task, Task Manager, Network, and PackageList
-keep class expo.modules.backgroundtask.** { *; }
-keep class expo.modules.taskmanager.** { *; }
-keep class expo.modules.network.** { *; }
-keep class expo.modules.ExpoModulesPackageList { *; }

# Google Sign-In TurboModule & Fabric ViewManager
-keep class com.reactnativegooglesignin.** { *; }
`;

module.exports = function withR8KeepRules(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const proguardPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );
      if (fs.existsSync(proguardPath)) {
        const current = fs.readFileSync(proguardPath, 'utf8');
        if (!current.includes(MARKER)) {
          fs.writeFileSync(proguardPath, `${current.trimEnd()}\n${KEEP_RULES}`, 'utf8');
        }
      }
      return modConfig;
    },
  ]);
};
