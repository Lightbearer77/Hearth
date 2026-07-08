// ─── Local notification scheduling via expo-notifications ───
// Works in EAS development/preview/production builds (not Expo Go).
//
// Two sources feed one rolling 90-day window, re-scheduled on every app
// launch and after any event save/delete:
//   · Holidays & Days of Remembrance — 14/7/1 days before, 9:00
//   · User events — at the event's start time (9:00 for all-day events)
// Triggers are merged nearest-first and capped at 48 scheduled alarms.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ASATRU_HOLIDAYS } from './holidays';
import { greekToGreg as greekToGregISO } from './constants';
import { getAllEvents } from './storage';

const CHANNELS = {
  holidays: 'hearth-holidays',
  events:   'hearth-events',
};
const MAX_SCHEDULED = 48;
const HORIZON_DAYS = 90;

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

// ─── Permissions & channels ───
export const requestNotificationPermissions = async () => {
  if (!Device.isDevice) {
    console.log('[Notifications] Not a real device, skipping permission request');
    return false;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') {
    await ensureAndroidChannels();
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  await ensureAndroidChannels();
  return true;
};

const ensureAndroidChannels = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNELS.holidays, {
    name: 'Holidays & Remembrance',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#c9a84c',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.events, {
    name: 'Event Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#5b8a72',
    sound: 'default',
  });
};

export const getPermissionStatus = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  return status; // 'granted' | 'denied' | 'undetermined'
};

// ─── Greek-to-Gregorian (single source of truth: lib/constants.js) ───
const greekToGregDate = (monthId, day, year) => {
  const iso = greekToGregISO({ monthId, day, year });
  return iso ? new Date(iso + 'T12:00:00') : null;
};

// ─── Trigger builders ───
const buildHolidayTriggers = (now, horizon) => {
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

        const isRemembrance = h.type === 'remembrance';
        const dayWord = daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`;
        triggers.push({
          id: `${h.id}-${daysBefore}-${fire.getFullYear()}`,
          fireAt: fire,
          channelId: CHANNELS.holidays,
          title: isRemembrance
            ? `Day of Remembrance ${dayWord}`
            : `${h.title} ${dayWord}`,
          body: isRemembrance
            ? `${h.title} — ${h.description.slice(0, 80)}${h.description.length > 80 ? '…' : ''}`
            : h.description.slice(0, 120),
          data: { kind: 'holiday', holidayId: h.id, daysBefore },
        });
      }
    }
  }
  return triggers;
};

const parseTimeOr9 = (timeStr) => {
  const m = /^(\d{2}):(\d{2})$/.exec(timeStr || '');
  if (!m) return { h: 9, min: 0 };
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return { h, min };
};

const buildEventTriggers = (events, now, horizon) => {
  const triggers = [];
  for (const evt of events) {
    if (!evt?.date) continue;
    const { h, min } = evt.allDay ? { h: 9, min: 0 } : parseTimeOr9(evt.startTime);
    const fire = new Date(evt.date + 'T12:00:00');
    fire.setHours(h, min, 0, 0);
    if (fire < now || fire > horizon) continue;

    const timeLabel = evt.allDay ? 'All day' : (evt.startTime || '');
    const body = [timeLabel, evt.location].filter(Boolean).join(' · ')
      || (evt.description || '').slice(0, 100)
      || 'Tap to open in The Hearth.';
    triggers.push({
      id: `evt-${evt.id}`,
      fireAt: fire,
      channelId: CHANNELS.events,
      title: evt.title || 'Untitled event',
      body,
      data: { kind: 'event', eventId: evt.id },
    });
  }
  return triggers;
};

// ─── Refresh the full rolling window (holidays + events) ───
export const refreshAllNotifications = async () => {
  const status = await getPermissionStatus();
  if (status !== 'granted') {
    return { scheduled: 0, total: 0, holidays: 0, events: 0, skipped: 'no-permission' };
  }

  // Guarantee channels exist on every pass (idempotent), so a launch-time
  // refresh works even if Settings was never opened on this install.
  await ensureAndroidChannels();

  // Cancel-all + reschedule keeps state simple and duplicate-free.
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  let events = [];
  try {
    events = await getAllEvents();
  } catch (e) {
    console.warn('[Notifications] Could not load events:', e?.message);
  }

  const triggers = [
    ...buildHolidayTriggers(now, horizon),
    ...buildEventTriggers(events, now, horizon),
  ];
  triggers.sort((a, b) => a.fireAt - b.fireAt);
  const capped = triggers.slice(0, MAX_SCHEDULED);

  let scheduled = 0, holidayCount = 0, eventCount = 0;
  for (const t of capped) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: t.id,
        content: {
          title: t.title,
          body: t.body,
          data: t.data,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: t.fireAt,
          channelId: Platform.OS === 'android' ? t.channelId : undefined,
        },
      });
      scheduled++;
      if (t.data.kind === 'holiday') holidayCount++;
      else eventCount++;
    } catch (e) {
      console.warn(`[Notifications] Failed to schedule ${t.id}:`, e?.message);
    }
  }

  return { scheduled, total: triggers.length, holidays: holidayCount, events: eventCount };
};

// ─── Inspect scheduled notifications (for settings/debug) ───
export const getScheduledNotifications = async () => {
  return await Notifications.getAllScheduledNotificationsAsync();
};

export const cancelAllNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};
