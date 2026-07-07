// ─── Asatru Holidays & AFA Days of Remembrance ───

import { greekToGreg } from './constants';

const DEFAULT_REMINDERS = [14, 7, 1];

export const ASATRU_HOLIDAYS = [
  // ─── Wheel of the Year ───
  { id: "thorrablot",    title: "Þorrablót",                 greekMonth: "M01", greekDay: 19, symbol: "❄", type: "blot",
    description: "Mid-winter feast honoring Þorri, the frost giant. A celebration of endurance through the deepest cold.",
    reminders: DEFAULT_REMINDERS },
  { id: "disting",       title: "Disting · Disablót",        greekMonth: "M02", greekDay: 4,  symbol: "🌾", type: "blot",
    description: "Blessing of the Dísir — the female ancestral spirits. Marks the first stirring of the land.",
    reminders: DEFAULT_REMINDERS },
  { id: "ostara",        title: "Ostara · Spring Equinox",   greekMonth: "M03", greekDay: 23, symbol: "☀", type: "solar",
    description: "Spring equinox. The signal that winter is ending. Honor renewal, fertility, and the returning sun.",
    reminders: DEFAULT_REMINDERS },
  { id: "sigrblot",      title: "Sigrblót",                  greekMonth: "M04", greekDay: 15, symbol: "⚔", type: "blot",
    description: "Victory blót. Sacrifice for the season's success — blessing of ships, weapons, and ventures.",
    reminders: DEFAULT_REMINDERS },
  { id: "walpurgis",     title: "Walpurgis · May Eve",       greekMonth: "M05", greekDay: 9,  symbol: "🔥", type: "festival",
    description: "Great fire festival. End of winter officially declared. Light bonfires, welcome the active half.",
    reminders: DEFAULT_REMINDERS },
  { id: "midsummer",     title: "Midsummer · Summer Solstice", greekMonth: "M07", greekDay: 4, symbol: "☀", type: "solar",
    description: "Summer solstice. The sun at its peak. Honor light, abundance, and the height of life's power.",
    reminders: DEFAULT_REMINDERS },
  { id: "freyfaxi",      title: "Freyfaxi · Lammas",         greekMonth: "M08", greekDay: 17, symbol: "🌾", type: "blot",
    description: "First harvest. Frey honored for the grain. The first fruits are cut and offered.",
    reminders: DEFAULT_REMINDERS },
  { id: "haustblot",     title: "Haustblót · Fall Equinox",  greekMonth: "M10", greekDay: 14, symbol: "🍂", type: "solar",
    description: "Autumn sacrifice. Gratitude for the harvest. Balance between light and dark.",
    reminders: DEFAULT_REMINDERS },
  { id: "winternights",  title: "Winter Nights · Vetrnætr",  greekMonth: "M11", greekDay: 24, symbol: "⚱", type: "blot",
    description: "Threshold of the dark half. Honor the ancestors, the dead, and the spirits of place.",
    reminders: DEFAULT_REMINDERS },
  { id: "einherjar",     title: "Einherjar",                 greekMonth: "M12", greekDay: 7,  symbol: "🗡", type: "blot",
    description: "Day to honor the war-dead — those who fell in battle, the Einherjar of Valhöll.",
    reminders: DEFAULT_REMINDERS },
  { id: "yule",          title: "Yule · Winter Solstice",    greekMonth: "M13", greekDay: 19, symbol: "✦", type: "solar",
    description: "Winter solstice. The longest night. The sacred dark.",
    reminders: DEFAULT_REMINDERS },
  { id: "planning_day",  title: "Planning Day",              greekMonth: "PLANNING", greekDay: 1, symbol: "✦", type: "festival",
    description: "Threshold day outside any month. Annual review, reckoning, and forward planning.",
    reminders: [7, 1] },

  // ─── AFA Days of Remembrance ───
  { id: "rem_raudr",       title: "Goði Rauðr the Strong",         greekMonth: "M01", greekDay: 9,  symbol: "ᛏ", type: "remembrance",
    description: "Norwegian goði who resisted forced conversion under Olaf Tryggvason. Tortured and killed for refusing to abandon his gods.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_blot_sveinn", title: "King Blót-Sveinn of Sweden",    greekMonth: "M01", greekDay: 18, symbol: "ᛏ", type: "remembrance",
    description: "11th-century king of Sweden who restored the old worship at the Temple of Uppsala.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_eanfrith",    title: "King Eanfrith of Bernicia",     greekMonth: "M02", greekDay: 4,  symbol: "ᛏ", type: "remembrance",
    description: "7th-century Anglo-Saxon king who returned to the worship of his ancestors.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_eyvind",      title: "Eyvind Kinnrifa",               greekMonth: "M02", greekDay: 12, symbol: "ᛏ", type: "remembrance",
    description: "Norwegian heathen tortured to death under Olaf Tryggvason's forced conversion. Refused baptism to the end.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_olvir",       title: "Goði Ölvir of Egg",             greekMonth: "M03", greekDay: 12, symbol: "ᛏ", type: "remembrance",
    description: "Norwegian goði who held the public blóts during the Christianization era.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_winguric",    title: "Winguric",                      greekMonth: "M04", greekDay: 1,  symbol: "ᛏ", type: "remembrance",
    description: "Gothic chieftain who led the defense of ancestral Gothic religion against Christian persecution.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_hakon",       title: "Jarl Hákon Sigurðarson",        greekMonth: "M04", greekDay: 15, symbol: "ᛏ", type: "remembrance",
    description: "Last great pagan ruler of Norway. Restored heathen worship. Killed in 995.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_stubba",      title: "John 'Stubba' Yeowell",         greekMonth: "M04", greekDay: 16, symbol: "ᛏ", type: "remembrance",
    description: "British Odinist, founder of the Odinic Rite in 1972.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_atharid",     title: "Atharid",                       greekMonth: "M04", greekDay: 18, symbol: "ᛏ", type: "remembrance",
    description: "Gothic leader in the resistance against forced conversion of Gothic pagans.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_jarnskeggja", title: "Járnskeggja",                   greekMonth: "M05", greekDay: 17, symbol: "ᛏ", type: "remembrance",
    description: "Norwegian chieftain who led resistance at the Thing against Olaf Tryggvason's forced Christianization.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_hoskuld",     title: "John 'Hoskuld' Gibbs-Bailey",   greekMonth: "M06", greekDay: 2,  symbol: "ᛏ", type: "remembrance",
    description: "Co-founder of the Odinic Rite alongside Stubba. British Odinist pioneer.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_athanaric",   title: "King Athanaric of the Visigoths", greekMonth: "M06", greekDay: 20, symbol: "ᛏ", type: "remembrance",
    description: "4th-century Gothic king who defended Gothic pagan religion.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_klasson",     title: "Erik Klasson",                  greekMonth: "M06", greekDay: 24, symbol: "ᛏ", type: "remembrance",
    description: "Modern AFA folk member honored for service to the gods and the kindred.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_sveinbjorn",  title: "Sveinbjörn Beinteinsson",       greekMonth: "M07", greekDay: 17, symbol: "ᛏ", type: "remembrance",
    description: "Icelandic Allsherjargoði and co-founder of Ásatrúarfélagið in 1972.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_rud_mills",   title: "Alexander Rud Mills",           greekMonth: "M07", greekDay: 28, symbol: "ᛏ", type: "remembrance",
    description: "Australian author of 'The Odinist Religion' (1930). Early 20th-century pioneer of organized Odinism.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_osric",       title: "King Osric of Deira",           greekMonth: "M08", greekDay: 17, symbol: "ᛏ", type: "remembrance",
    description: "7th-century Anglo-Saxon king who returned to the old gods. Killed in battle.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_radbod",      title: "King Radbod of Frisia",         greekMonth: "M08", greekDay: 25, symbol: "ᛏ", type: "remembrance",
    description: "Frisian king who chose his ancestors over a Christian heaven without them.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_hermann",     title: "Prince Hermann of the Cherusci", greekMonth: "M09", greekDay: 28, symbol: "ᛏ", type: "remembrance",
    description: "Arminius. Defeated three Roman legions at Teutoburg Forest in 9 AD.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_else",        title: "Else Christensen",              greekMonth: "M10", greekDay: 3,  symbol: "ᛏ", type: "remembrance",
    description: "Danish-American founder of the Odinist Fellowship and publisher of 'The Odinist' magazine.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_thorsteinn",  title: "Goði Þorsteinn Guðjónsson",     greekMonth: "M10", greekDay: 25, symbol: "ᛏ", type: "remembrance",
    description: "Icelandic goði and notable figure in Ásatrúarfélagið's development.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_von_list",    title: "Meister Guido von List",        greekMonth: "M10", greekDay: 26, symbol: "ᛏ", type: "remembrance",
    description: "Austrian author, mystic, and runologist whose work shaped modern Germanic spirituality.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_loyal_saxons", title: "The Loyal Saxons",             greekMonth: "M11", greekDay: 2,  symbol: "ᛏ", type: "remembrance",
    description: "The 4,500 Saxon nobles executed at the Massacre of Verden in 782 for refusing Christian conversion.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_mcnallen",    title: "Birthday of Stephen McNallen",  greekMonth: "M11", greekDay: 8,  symbol: "ᛏ", type: "remembrance",
    description: "Founder of the Asatru Folk Assembly. Central figure of the modern American Asatru revival.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_aoric",       title: "King Aoric",                    greekMonth: "M11", greekDay: 16, symbol: "ᛏ", type: "remembrance",
    description: "Gothic king who defended traditional Gothic religion during Christianization pressure.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_ragnvald",    title: "Ragnvald Odinskarl",            greekMonth: "M11", greekDay: 20, symbol: "ᛏ", type: "remembrance",
    description: "'Odin's man.' Norse heathen who refused conversion.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_sigridr",     title: "Queen Sigríðr of Sweden",       greekMonth: "M12", greekDay: 5,  symbol: "ᛏ", type: "remembrance",
    description: "Sigríðr the Haughty. Refused Olaf Tryggvason's demand to convert as a condition of marriage.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_sexraed",     title: "King Sexræd",                   greekMonth: "M12", greekDay: 14, symbol: "ᛏ", type: "remembrance",
    description: "Anglo-Saxon king of the East Saxons who returned to the old worship. Killed in battle.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_egill",       title: "Egill Skallagrímsson",          greekMonth: "M13", greekDay: 7,  symbol: "ᛏ", type: "remembrance",
    description: "Icelandic skald, warrior, and farmer. Exemplar of the Norse warrior-poet ideal.",
    reminders: DEFAULT_REMINDERS },
  { id: "rem_saeward",     title: "King Sæward",                   greekMonth: "M13", greekDay: 16, symbol: "ᛏ", type: "remembrance",
    description: "Anglo-Saxon king who returned to the old gods with his brother Sexræd.",
    reminders: DEFAULT_REMINDERS },
];

export const holidaysForGreekDate = (greekMonth, greekDay) => {
  return ASATRU_HOLIDAYS.filter(h => h.greekMonth === greekMonth && h.greekDay === greekDay);
};

const subtractDays = (isoDate, days) => {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

export const remindersForDate = (isoDate, _ignoredYear) => {
  // Year is derived from the date itself (the second parameter is kept for
  // call-site compatibility but ignored). We check holidays in BOTH the
  // date's year and the following year, because reminders for early-January
  // holidays (e.g. Alpha 9) land in late December of the prior year.
  const yearOfDate = parseInt(isoDate.slice(0, 4), 10);
  if (!Number.isFinite(yearOfDate)) return [];
  const reminders = [];
  for (const year of [yearOfDate, yearOfDate + 1]) {
    for (const h of ASATRU_HOLIDAYS) {
      if (!h.reminders || h.reminders.length === 0) continue;
      const holidayISO = greekToGreg({ monthId: h.greekMonth, day: h.greekDay, year });
      if (!holidayISO) continue;
      for (const daysBefore of h.reminders) {
        const reminderISO = subtractDays(holidayISO, daysBefore);
        if (reminderISO === isoDate) {
          reminders.push({ holiday: h, daysAway: daysBefore, holidayDate: holidayISO });
        }
      }
    }
  }
  return reminders;
};
