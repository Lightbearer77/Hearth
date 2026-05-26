// ─── Notifications stub for Expo Go ───
// expo-notifications removed Android push support from Expo Go in SDK 53.
// Real implementation goes here in session 4 when we switch to an EAS
// custom dev build with notifee for true AlarmManager-backed scheduling.
//
// All functions are no-ops that return safe defaults so the rest of the
// app works normally in Expo Go without any changes to callers.

export const requestNotificationPermissions = async () => {
  console.log('[Notifications] Stub: requestNotificationPermissions — needs EAS build');
  return false;
};

export const getPermissionStatus = async () => {
  return 'unavailable';
};

export const scheduleAllHolidayNotifications = async () => {
  console.log('[Notifications] Stub: scheduleAllHolidayNotifications — needs EAS build');
  return { scheduled: 0, total: 0 };
};

export const getScheduledNotifications = async () => {
  return [];
};

export const cancelAllNotifications = async () => {
  // no-op
};
