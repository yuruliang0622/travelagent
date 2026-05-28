// Trip data — 7 days in Japan. Shared across all three directions.
const TRIP = {
  title: "Seven Days in Japan",
  subtitle: "Tokyo · Hakone · Kyoto · Osaka",
  dates: "Apr 12 — Apr 18, 2026",
  travelers: 2,
  prepared_for: "The Sato Party",
  prepared_by: "Meridian Travel Co.",
  overview: "A balanced first-timer's loop: neon and noise in Tokyo, a slow onsen night in the Hakone hills, then the bullet train west into Kansai for temples, bamboo, and Osaka's street food. Designed to land light on day one, enjoy Kansai without rushing, then return to Tokyo by Shinkansen for a simpler same-airport international departure.",
  stats: [
    { k: "Days",     v: "7"     },
    { k: "Cities",   v: "4"     },
    { k: "Trains",   v: "5"     },
    { k: "Walking",  v: "~62km" },
  ],
  // Real lat/lng coords are used for the Leaflet (CartoDB Positron) map.
  // SVG-space coords (x/y) are retained for any legacy SVG renderer.
  days: [
    { n: 1, title: "Land in Tokyo",          city: "Tokyo",   coord: { x: 485, y: 298 }, latlng: [35.6896, 139.6917], zoom: 12, hours: "—",     pace: "easy",
      stops: [
        { t: "12:40", k: "Narita Express to Shinjuku",          latlng: [35.6896, 139.7006] },
        { t: "15:30", k: "Check-in · Park Hyatt Shinjuku",      latlng: [35.6857, 139.6906] },
        { t: "18:00", k: "Sunset at Shibuya Crossing",          latlng: [35.6595, 139.7005] },
        { t: "20:00", k: "Dinner · Omoide Yokocho izakaya",     latlng: [35.6927, 139.6997] },
      ],
      note: "Stay light today. Jet-lag will catch you around 9pm — lean in."
    },
    { n: 2, title: "Old Tokyo on foot",      city: "Tokyo",   coord: { x: 485, y: 298 }, latlng: [35.7050, 139.7800], zoom: 12, hours: "9:00 — 22:00", pace: "full",
      stops: [
        { t: "09:00", k: "Senso-ji & Nakamise, Asakusa",        latlng: [35.7148, 139.7967] },
        { t: "12:30", k: "Lunch · Ouca soba near Ueno",         latlng: [35.7138, 139.7768] },
        { t: "14:30", k: "teamLab Planets · Toyosu",            latlng: [35.6469, 139.7906] },
        { t: "19:00", k: "Akihabara at dusk + arcade hour",     latlng: [35.7022, 139.7745] },
      ],
      note: "JR loop and a lot of walking. Wear the broken-in shoes."
    },
    { n: 3, title: "Into the Hakone hills",  city: "Hakone",  coord: { x: 465, y: 312 }, latlng: [35.2390, 139.0530], zoom: 13, hours: "8:10 — late",  pace: "slow",
      stops: [
        { t: "08:10", k: "Romancecar · Shinjuku → Hakone-Yumoto", latlng: [35.2331, 139.1075] },
        { t: "11:00", k: "Hakone Open-Air Museum",                latlng: [35.2447, 139.0531] },
        { t: "14:00", k: "Ropeway over Owakudani",                latlng: [35.2456, 139.0211] },
        { t: "17:30", k: "Ryokan check-in · onsen + kaiseki",     latlng: [35.2331, 139.0470] },
      ],
      note: "Soak twice. Once before dinner, once before bed."
    },
    { n: 4, title: "Shinkansen west",        city: "Kyoto",   coord: { x: 372, y: 342 }, latlng: [34.9985, 135.7700], zoom: 13, hours: "9:30 — 22:00", pace: "medium",
      stops: [
        { t: "09:30", k: "Bullet train Odawara → Kyoto (Hikari)", latlng: [34.9858, 135.7589] },
        { t: "13:00", k: "Nishiki Market crawl",                  latlng: [35.0050, 135.7647] },
        { t: "16:30", k: "Kiyomizu-dera at golden hour",          latlng: [34.9949, 135.7850] },
        { t: "19:30", k: "Walk Gion · spot a maiko at the bridge", latlng: [35.0036, 135.7780] },
      ],
      note: "Reserve seats the day before; non-reserved cars fill fast."
    },
    { n: 5, title: "Temples & bamboo",       city: "Kyoto",   coord: { x: 372, y: 342 }, latlng: [34.9900, 135.7200], zoom: 12, hours: "6:00 — 21:00", pace: "full",
      stops: [
        { t: "06:00", k: "Fushimi Inari — sunrise, before the buses", latlng: [34.9671, 135.7727] },
        { t: "10:30", k: "Arashiyama Bamboo + Tenryu-ji",             latlng: [35.0094, 135.6669] },
        { t: "14:00", k: "Lunch · yudofu near the river",             latlng: [35.0151, 135.6800] },
        { t: "19:00", k: "Pontocho Alley dinner",                     latlng: [35.0070, 135.7708] },
      ],
      note: "The 6am start is non-negotiable. Trust me."
    },
    { n: 6, title: "Osaka morning → Tokyo night", city: "Osaka",   coord: { x: 340, y: 358 }, latlng: [34.6900, 135.5000], zoom: 12, hours: "10:00 — 21:00", pace: "medium",
      stops: [
        { t: "10:00", k: "Tokaido line · Kyoto → Osaka",        latlng: [34.7025, 135.4959] },
        { t: "11:30", k: "Osaka Castle grounds",                latlng: [34.6873, 135.5259] },
        { t: "15:30", k: "Dotonbori early food stop",             latlng: [34.6687, 135.5031] },
        { t: "17:30", k: "Shinkansen · Shin-Osaka → Tokyo",    latlng: [35.6812, 139.7671] },
      ],
      note: "Return to Tokyo this evening so the international flight day stays calm."
    },
    { n: 7, title: "Departure · Tokyo",       city: "Tokyo",   coord: { x: 485, y: 298 }, latlng: [35.6896, 139.6917], zoom: 11, hours: "08:00 — flight", pace: "wrap",
      stops: [
        { t: "08:00", k: "Light breakfast near hotel",             latlng: [35.6812, 139.7671] },
        { t: "10:30", k: "Airport train · Tokyo → HND/NRT",    latlng: [35.5494, 139.7798] },
        { t: "13:40", k: "Flight home from Tokyo",              latlng: [35.5494, 139.7798] },
      ],
      note: "Same-gateway round trip keeps the international flight simpler."
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
