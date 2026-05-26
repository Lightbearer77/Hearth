// ─── Local notification scheduling ───
// Uses expo-notifications. Background notifications work via Android AlarmManager
// when running in Expo Go (limited) and via notifee in a custom dev build (future).
//
// Strategy: schedule notifications for the rolling 90-day window. Re-schedule
// whenever the app opens. This avoids storing notification IDs and keeps state
// simple — Android caps at ~50 scheduled local notifications per app anyway.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ASATRU_HOLIDAYS } from './holidays';
import { GREEK_MONTHS } from './constants';

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
  if (!Device.isDevice) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  // Android channel for higher importance
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('hearth-holidays', {
      name: 'Holidays & Remembrance',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#c9a84c',
      sound: 'default',
    });
  }

  return true;
};

export const getPermissionStatus = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  return status; // 'granted' | 'denied' | 'undetermined'
};

// ─── Greek-to-Gregorian helper (year-aware) ───
const greekToGreg = (monthId, day, year) => {
  if (monthId === 'PLANNING') {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const dec = isLeap ? 30 : 31;
    return new Date(year, 11, dec);
  }
  const idx = GREEK_MONTHS.findIndex(m => m.id === monthId);
  if (idx < 0) return null;
  const doy = idx * 28 + day;
  return new Date(year, 0, doy);
};

// ─── Schedule all upcoming notifications in a rolling window ───
export const scheduleAllHolidayNotifications = async () => {
  const status = await getPermissionStatus();
  if (status !== 'granted') return { scheduled: 0, skipped: 'no-permission' };

  // Cancel everything first to avoid duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const HORIZON_DAYS = 90;
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const triggers = [];
  const years = [now.getFullYear(), now.getFullYear() + 1];

  for (const year of years) {
    for (const h of ASATRU_HOLIDAYS) {
      if (!h.reminders || h.reminders.length === 0) continue;
      const holidayDate = greekToGreg(h.greekMonth, h.greekDay, year);
      if (!holidayDate) continue;

      for (const daysBefore of h.reminders) {
        const fire = new Date(holidayDate);
        fire.setDate(fire.getDate() - daysBefore);
        // Fire at 9am local time
        fire.setHours(9, 0, 0, 0);

        if (fire < now || fire > horizon) continue;
        triggers.push({ holiday: h, daysBefore, fireAt: fire });
      }
    }
  }

  // Sort and cap at 48 (Android's reliable ceiling)
  triggers.sort((a, b) => a.fireAt - b.fireAt);
  const capped = triggers.slice(0, 48);

  for (const t of capped) {
    const { holiday, daysBefore, fireAt } = t;
    const isRemembrance = holiday.type === 'remembrance';
    const dayWord = daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`;

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
  }

  return { scheduled: capped.length, total: triggers.length };
};

// ─── Inspect scheduled notifications (for settings/debug) ───
export const getScheduledNotifications = async () => {
  return await Notifications.getAllScheduledNotificationsAsync();
};

export const cancelAllNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};
