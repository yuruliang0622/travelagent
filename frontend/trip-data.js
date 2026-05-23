// Trip data — 7 days in Japan. Shared across all three directions.
const TRIP = {
  title: "Seven Days in Japan",
  subtitle: "Tokyo · Hakone · Kyoto · Osaka",
  dates: "Apr 12 — Apr 18, 2026",
  travelers: 2,
  prepared_for: "The Sato Party",
  prepared_by: "Meridian Travel Co.",
  overview: "A balanced first-timer's loop: neon and noise in Tokyo, a slow onsen night in the Hakone hills, then the bullet train west into Kansai for temples, bamboo, and Osaka's street food. Designed to land light on day one and finish strong with one last food crawl before KIX.",
  stats: [
    { k: "Days",     v: "7"     },
    { k: "Cities",   v: "4"     },
    { k: "Trains",   v: "5"     },
    { k: "Walking",  v: "~62km" },
  ],
  // SVG-space coordinates inside a 600x700 Japan map viewBox.
  days: [
    { n: 1, title: "Land in Tokyo",          city: "Tokyo",   coord: { x: 485, y: 298 }, hours: "—",     pace: "easy",
      stops: [
        { t: "12:40", k: "Narita Express to Shinjuku" },
        { t: "15:30", k: "Check-in · Park Hyatt Shinjuku" },
        { t: "18:00", k: "Sunset at Shibuya Crossing" },
        { t: "20:00", k: "Dinner · Omoide Yokocho izakaya" },
      ],
      note: "Stay light today. Jet-lag will catch you around 9pm — lean in."
    },
    { n: 2, title: "Old Tokyo on foot",      city: "Tokyo",   coord: { x: 485, y: 298 }, hours: "9:00 — 22:00", pace: "full",
      stops: [
        { t: "09:00", k: "Senso-ji & Nakamise, Asakusa" },
        { t: "12:30", k: "Lunch · Ouca soba near Ueno" },
        { t: "14:30", k: "teamLab Planets · Toyosu" },
        { t: "19:00", k: "Akihabara at dusk + arcade hour" },
      ],
      note: "JR loop and a lot of walking. Wear the broken-in shoes."
    },
    { n: 3, title: "Into the Hakone hills",  city: "Hakone",  coord: { x: 465, y: 312 }, hours: "8:10 — late",  pace: "slow",
      stops: [
        { t: "08:10", k: "Romancecar · Shinjuku → Hakone-Yumoto" },
        { t: "11:00", k: "Hakone Open-Air Museum" },
        { t: "14:00", k: "Ropeway over Owakudani (Fuji on clear days)" },
        { t: "17:30", k: "Ryokan check-in · onsen + kaiseki" },
      ],
      note: "Soak twice. Once before dinner, once before bed."
    },
    { n: 4, title: "Shinkansen west",        city: "Kyoto",   coord: { x: 372, y: 342 }, hours: "9:30 — 22:00", pace: "medium",
      stops: [
        { t: "09:30", k: "Bullet train Odawara → Kyoto (Hikari)" },
        { t: "13:00", k: "Nishiki Market crawl" },
        { t: "16:30", k: "Kiyomizu-dera at golden hour" },
        { t: "19:30", k: "Walk Gion · spot a maiko at the bridge" },
      ],
      note: "Reserve seats the day before; non-reserved cars fill fast."
    },
    { n: 5, title: "Temples & bamboo",       city: "Kyoto",   coord: { x: 372, y: 342 }, hours: "6:00 — 21:00", pace: "full",
      stops: [
        { t: "06:00", k: "Fushimi Inari — sunrise, before the buses" },
        { t: "10:30", k: "Arashiyama Bamboo Grove + Tenryu-ji" },
        { t: "14:00", k: "Lunch · yudofu near the river" },
        { t: "19:00", k: "Pontocho Alley dinner" },
      ],
      note: "The 6am start is non-negotiable. Trust me."
    },
    { n: 6, title: "Osaka, eaten",            city: "Osaka",   coord: { x: 340, y: 358 }, hours: "10:00 — 23:00", pace: "full",
      stops: [
        { t: "10:00", k: "Tokaido line · Kyoto → Osaka (15 min)" },
        { t: "11:30", k: "Osaka Castle grounds" },
        { t: "17:00", k: "Dotonbori street food crawl" },
        { t: "21:30", k: "Umeda Sky Building observation deck" },
      ],
      note: "Sleep in Kyoto. Last train back is 23:30 sharp."
    },
    { n: 7, title: "Departure · KIX",         city: "Kansai",  coord: { x: 320, y: 372 }, hours: "08:00 — flight", pace: "wrap",
      stops: [
        { t: "08:00", k: "Coffee · % Arabica, Higashiyama" },
        { t: "10:15", k: "Haruka Express · Kyoto → KIX" },
        { t: "13:40", k: "Flight home" },
      ],
      note: "Be at the gate three hours early. KIX security can drag."
    },
  ],
  packing: [
    { cat: "Documents", items: ["Passport (6+ mo validity)", "JR Pass voucher", "Ryokan confirmation", "eSIM activation QR"] },
    { cat: "Wear",      items: ["Walking shoes (broken-in)", "Light layers · April is 12–20°C", "Compact umbrella", "Slip-on shoes for temples"] },
    { cat: "Kit",       items: ["Suica/Pasmo card", "Portable charger", "Travel adapter (Type A)", "Small day pack"] },
    { cat: "Cash",      items: ["¥30,000 in small notes", "Card with no foreign-tx fee", "Coin purse — you'll need it"] },
  ],
};

window.TRIP = TRIP;
