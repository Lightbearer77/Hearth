// ─── Local notification scheduling via expo-notifications ───
// Works in EAS development/preview/production builds.
// Does NOT work in Expo Go (removed in SDK 53) — but that's fine since
// Hearth is now distributed as a standalone APK.
//
// Strategy: schedule notifications for the rolling 90-day window. Re-schedule
// whenever the app opens. Android caps at ~50 scheduled local notifications
// per app — well within our holiday count.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ASATRU_HOLIDAYS } from './holidays';
import { greekToGreg as greekToGregISO } from './constants';

// Configure how notifications appear when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Permissions ───
export const requestNotificationPermissions = async () => {
  if (!Device.isDevice) {
    console.log('[Notifications] Not a real device, skipping permission request');
    return false;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') {
    await ensureAndroidChannel();
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  await ensureAndroidChannel();
  return true;
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('hearth-holidays', {
    name: 'Holidays & Remembrance',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#c9a84c',
    sound: 'default',
  });
};

export const getPermissionStatus = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
};

// ─── Greek-to-Gregorian (single source of truth: lib/constants.js) ───
const greekToGregDate = (monthId, day, year) => {
  const iso = greekToGregISO({ monthId, day, year });
  return iso ? new Date(iso + 'T12:00:00') : null;
};

// ─── Schedule all upcoming notifications in a rolling window ───
export const scheduleAllHolidayNotifications = async () => {
  const status = await getPermissionStatus();
  if (status !== 'granted') return { scheduled: 0, skipped: 'no-permission' };

  // Guarantee the channel exists on every pass (idempotent), so a launch-time
  // refresh works even if Settings was never opened on this install.
  await ensureAndroidChannel();

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const HORIZON_DAYS = 90;
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const triggers = [];
  const years = [now.getFullYear(), now.getFullYear() + 1];

  for (const year of years) {
    for (const h of ASATRU_HOLIDAYS) {
      if (!h.reminders || h.reminders.length === 0) continue;
      const holidayDate = greekToGregDate(h.greekMonth, h.greekDay, year);
      if (!holidayDate) continue;

      for (const daysBefore of h.reminders) {
        const fire = new Date(holidayDate);
        fire.setDate(fire.getDate() - daysBefore);
        fire.setHours(9, 0, 0, 0);

        if (fire < now || fire > horizon) continue;
        triggers.push({ holiday: h, daysBefore, fireAt: fire });
      }
    }
  }

  triggers.sort((a, b) => a.fireAt - b.fireAt);
  const capped = triggers.slice(0, 48);

  let scheduled = 0;
  for (const t of capped) {
    const { holiday, daysBefore, fireAt } = t;
    const isRemembrance = holiday.type === 'remembrance';
    const dayWord = daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: isRemembrance
            ? `Day of Remembrance ${dayWord}`
            : `${holiday.title} ${dayWord}`,
          body: isRemembrance
            ? `${holiday.title} — ${holiday.description.slice(0, 80)}${holiday.description.length > 80 ? '…' : ''}`
            : holiday.description.slice(0, 120),
          data: { holidayId: holiday.id, daysBefore },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          channelId: Platform.OS === 'android' ? 'hearth-holidays' : undefined,
        },
      });
      scheduled++;
    } catch (e) {
      console.warn(`[Notifications] Failed to schedule ${holiday.id}:`, e?.message);
    }
  }

  return { scheduled, total: triggers.length };
};

export const getScheduledNotifications = async () => {
  return await Notifications.getAllScheduledNotificationsAsync();
};

export const cancelAllNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};
