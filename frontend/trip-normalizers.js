(function () {
// Trip data normalization helpers for DirectionB. Keep UI rendering in direction-b.jsx.

function normalizeStaticTrip(trip, fallback = false) {
  const routeLabel = trip.subtitle?.replaceAll(" · ", " -> ") || "Tokyo -> Osaka";
  return {
    ...trip,
    destinationLabel: fallback ? "Sample itinerary · Japan" : "Japan · Spring '26",
    routeLabel,
    mapMode: "japan",
    sample: fallback,
  };
}

function normalizeBackendTrip(response, profile, request) {
  const itinerary = response.itinerary;
  const placesById = new Map((itinerary.places || []).map((place) => [place.id, place]));
  const days = (itinerary.days || [])
    .filter((day) => day.day_number > 0)
    .map((day) => {
      const segments = day.segments || [];
      const stops = segments.map((segment) => {
        const place = placesById.get(segment.place_ids?.[0]);
        const hasCoords = place?.lat && place?.lng;
        return {
          t: segment.time,
          k: segment.title,
          highlight: simpleStopHighlight(place?.why_it_fits || segment.description),
          description: segment.description,
          note: segment.travel_note,
          cost: segment.cost,
          duration: place?.duration || "",
          category: place?.category || "",
          url: place?.google_maps_url || googleMapsSearch(segment.title, request.destination),
          latlng: hasCoords ? [place.lat, place.lng] : null,
        };
      });
      // Use first stop with real coordinates as the day-level pin
      const firstCoord = stops.find((s) => s.latlng)?.latlng || null;
      return {
        n: day.day_number,
        title: day.title,
        city: day.area || response.destination_pack?.country || request.destination,
        coord: { x: 0, y: 0 },
        latlng: firstCoord,
        hours: segmentHours(segments),
        pace: profile.pace || "balanced",
        stops,
        note: segments[0]?.description || "Check live hours and route timing before the day starts.",
      };
    });
  const uniqueCities = [...new Set(days.map((day) => day.city).filter(Boolean))];
  const stopCount = days.reduce((total, day) => total + day.stops.length, 0);
  const reminders = itinerary.reminders?.length ? itinerary.reminders : [{ title: "Packing", items: ["Walking shoes", "Portable charger", "Weather layer"] }];

  return {
    title: itinerary.title,
    subtitle: itinerary.subtitle,
    dates: itinerary.dates,
    travelers: itinerary.profile?.travelers || profile.travelers || 1,
    prepared_for: profile.name || "Traveler",
    prepared_by: "Trip Agent",
    overview: itinerary.subtitle,
    destinationLabel: response.destination_pack?.country || request.destination || "Global trip",
    routeLabel: uniqueCities.join(" -> ") || request.destination || "Generated route",
    mapMode: "generic",
    sample: false,
    stats: [
      { k: "Days", v: String(days.length) },
      { k: "Cities", v: String(uniqueCities.length || 1) },
    ],
    days,
    packing: reminders.map((group) => ({ cat: group.title, items: group.items || [] })),
    summary: itinerary.summary,
    booking_checklist: itinerary.booking_checklist || [],
    assumptions: itinerary.assumptions || [],
  };
}

function simpleStopHighlight(value) {
  const cleaned = String(value || "")
    .replace(/\s*\u2b50.*$/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const firstThought = cleaned.split(/[.!?。]/)[0].trim();
  if (firstThought.length <= 92) return firstThought;
  return `${firstThought.slice(0, 89).replace(/\s+\S*$/, "")}...`;
}

function segmentHours(segments) {
  const times = (segments || []).map((segment) => segment.time).filter(Boolean);
  if (times.length <= 1) return times[0] || "Flexible";
  return `${times[0]} — ${times[times.length - 1]}`;
}

function sanitizeDestination(dest) {
  return String(dest || "")
    .replace(/\bcurated\s+demo\b/gi, "")
    .replace(/\bpreview\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function googleMapsSearch(query, destination) {
  const cleanDest = sanitizeDestination(destination);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query} ${cleanDest}`)}`;
}

function majorRegionForDay(day) {
  const text = [
    day?.city || "",
    day?.title || "",
    ...(day?.stops || []).flatMap((s) => [s?.k || "", s?.note || "", s?.description || ""]),
  ].join(" ").toLowerCase();
  if (/nara/.test(text)) return "Nara";
  if (/osaka|namba|dotonbori|kansai|kix/.test(text)) return "Osaka";
  if (/kyoto|gion|fushimi|arashiyama|kiyomizu|pontocho|uji/.test(text)) return "Kyoto";
  if (/hakone|owakudani|ryokan|onsen/.test(text)) return "Hakone";
  if (/tokyo|shinjuku|shibuya|asakusa|ginza|ueno|akihabara|haneda|narita/.test(text)) return "Tokyo";
  return day?.city || "Route";
}

function summarizeTripForChat(trip) {
  const days = (trip?.days || []).filter((day) => day?.n);
  const destination = String(trip?.destinationLabel || trip?.title || "Trip")
    .replace(/\s*·.*$/, "")
    .replace(/\s*'\d+$/, "")
    .trim() || "Trip";
  const lines = [`${destination}  ·  ${days.length} days\n`];
  days.slice(0, 10).forEach((day) => {
    lines.push(`D${day.n}  ${majorRegionForDay(day)}`);
  });
  if (days.length > 10) lines.push(`    ...${days.length - 10} more days`);
  return lines.join("\n");
}

function splitSummaryLines(value) {
  return String(value || "")
    .replace(/\s*\(.*?\)/g, "")   // strip inline format hints like (3 short bullets…)
    .split(/\n| · |; /)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((item) => {
      // Truncate any remaining long sentence at 60 chars
      const truncated = item.length > 60 ? item.slice(0, 57).replace(/\s+\S*$/, "") + "…" : item;
      return [truncated, ""];
    });
}

function simplePackingCategory(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("doc")) return "Docs";
  if (text.includes("wear") || text.includes("cloth")) return "Wear";
  if (text.includes("kit") || text.includes("gear")) return "Kit";
  if (text.includes("cash") || text.includes("money") || text.includes("currency")) return "Cash";
  if (text.includes("before")) return "Before";
  if (text.includes("essential") || text.includes("packing")) return "Pack";
  if (text.includes("during") || text.includes("ground")) return "On trip";
  return String(value || "Pack").replace(/\bchecklist\b/ig, "").trim() || "Pack";
}

function simplePackingItem(value) {
  const original = String(value || "").trim();
  const text = original.toLowerCase();
  const rules = [
    [/passport.*valid|passport validity/, "Check passport"],
    [/notify.*bank|bank.*travel|credit card compan/, "Notify bank"],
    [/offline maps|google maps|citymapper/, "Offline maps"],
    [/basic .*phrases|french phrases|local phrases/, "Basic phrases"],
    [/travel insurance/, "Travel insurance"],
    [/walking shoes|comfortable shoes/, "Walking shoes"],
    [/layered|layers|clothing/, "Layers"],
    [/adapter|outlets/, "Power adapter"],
    [/power bank|portable charger|phone charging/, "Power bank"],
    [/umbrella|rain jacket/, "Umbrella"],
    [/water bottle/, "Water bottle"],
    [/metro ticket|métro ticket|validate/, "Metro tickets"],
    [/pickpocket|crowded/, "Watch pickpockets"],
    [/tipping/, "Tipping included"],
    [/don't rush|pace of|meals/, "Slow meals"],
    [/passport.*visa|copy of your passport/, "Passport copy"],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  if (match) return match[1];
  const cleaned = original
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .split(/[.;:]/)[0]
    .trim();
  return cleaned.length > 38 ? `${cleaned.slice(0, 35).trim()}...` : cleaned;
}

window.TripNormalizers = {
  normalizeStaticTrip,
  normalizeBackendTrip,
  simpleStopHighlight,
  segmentHours,
  googleMapsSearch,
  majorRegionForDay,
  summarizeTripForChat,
  splitSummaryLines,
  simplePackingCategory,
  simplePackingItem
};
})();
