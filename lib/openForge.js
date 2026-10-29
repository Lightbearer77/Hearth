// ─── Launch the Forge app ───
// The Forge registers no URL scheme, so there is no deep link to a specific
// task; this opens the app itself. An explicit component (package + class) is
// used instead of expo-intent-launcher's `openApplication`, because that one
// resolves the package through PackageManager, which Android 11+ hides
// without a <queries> declaration. Launching an explicit component needs no
// visibility grant.

import { Alert } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

const FORGE_PACKAGE = 'com.lightbearer.forge';

export const openForge = async () => {
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
      packageName: FORGE_PACKAGE,
      className: `${FORGE_PACKAGE}.MainActivity`,
      category: 'android.intent.category.LAUNCHER',
    });
  } catch (e) {
    console.log('[Hearth] openForge failed:', e?.message);
    Alert.alert('Could not open the Forge', 'Open it from your home screen instead.');
  }
};
