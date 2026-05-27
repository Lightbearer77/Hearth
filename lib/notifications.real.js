// ─── Real notifications via notifee ───
// Uses Android AlarmManager for reliable background scheduling.
// Fires at 9am local time, 14/7/1 days before each holiday.
//
// Strategy: schedule notifications for the rolling 90-day window. Re-schedule
// whenever the app opens. Android caps at ~500 alarms per app — well above
// our needs.

import notifee, {
  AndroidImportance, AndroidVisibility,
  TriggerType, AuthorizationStatus,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import { ASATRU_HOLIDAYS } from './holidays';
import { GREEK_MONTHS } from './constants';

const CHANNEL_ID = 'hearth-holidays';

// ─── Permissions ───
export const requestNotificationPermissions = async () => {
  const settings = await notifee.requestPermission();
  if (settings.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
    return false;
  }

  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Holidays & Remembrance',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
      lights: true,
      lightColor: '#c9a84c',
    });
  }
  return true;
};

export const getPermissionStatus = async () => {
  const settings = await notifee.getNotificationSettings();
  if (settings.authorizationStatus === AuthorizationStatus.AUTHORIZED) return 'granted';
  if (settings.authorizationStatus === AuthorizationStatus.DENIED) return 'denied';
  return 'undetermined';
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

// ─── Schedule notifications in a rolling 90-day window ───
export const scheduleAllHolidayNotifications = async () => {
  const status = await getPermissionStatus();
  if (status !== 'granted') return { scheduled: 0, skipped: 'no-permission' };

  // Cancel everything first to avoid duplicates
  await notifee.cancelAllNotifications();

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
        fire.setHours(9, 0, 0, 0);

        if (fire < now || fire > horizon) continue;
        triggers.push({ holiday: h, daysBefore, fireAt: fire });
      }
    }
  }

  triggers.sort((a, b) => a.fireAt - b.fireAt);

  let scheduled = 0;
  for (const t of triggers) {
    const { holiday, daysBefore, fireAt } = t;
    const isRemembrance = holiday.type === 'remembrance';
    const dayWord = daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`;

    try {
      await notifee.createTriggerNotification(
        {
          id: `${holiday.id}-${daysBefore}-${fireAt.getFullYear()}`,
          title: isRemembrance
            ? `Day of Remembrance ${dayWord}`
            : `${holiday.title} ${dayWord}`,
          body: isRemembrance
            ? `${holiday.title} — ${holiday.description.slice(0, 80)}${holiday.description.length > 80 ? '…' : ''}`
            : holiday.description.slice(0, 120),
          data: { holidayId: holiday.id, daysBefore: String(daysBefore) },
          android: {
            channelId: CHANNEL_ID,
            smallIcon: 'ic_launcher',
            color: isRemembrance ? '#8a7a62' : '#c9a84c',
            pressAction: { id: 'default' },
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: fireAt.getTime(),
          alarmManager: { allowWhileIdle: true },
        }
      );
      scheduled++;
    } catch (e) {
      console.warn(`Failed to schedule ${holiday.id}:`, e?.message);
    }
  }

  return { scheduled, total: triggers.length };
};

// ─── Inspect & cancel ───
export const getScheduledNotifications = async () => {
  return await notifee.getTriggerNotifications();
};

export const cancelAllNotifications = async () => {
  await notifee.cancelAllNotifications();
};
