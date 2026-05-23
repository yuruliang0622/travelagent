"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  ExternalLink,
  Hotel,
  MessageCircle,
  MapPin,
  Landmark,
  Plane,
  Send,
  Sparkles,
  Train,
  UserRound,
} from "lucide-react";
import { mockItinerary } from "@/data/mock-trip";
import type {
  BookingChecklistItem,
  ItineraryDay,
  MapPlace,
} from "@/types/trip";

const TripMap = dynamic(
  () => import("@/components/TripMap").then((module) => module.TripMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[310px] items-center justify-center border-b border-slate-200 bg-slate-100 text-sm font-medium text-slate-500 md:h-[360px]">
        Loading map
      </div>
    ),
  },
);

const statusCopy: Record<BookingChecklistItem["status"], string> = {
  ready: "Ready",
  "needs-review": "Review",
  optional: "Optional",
  later: "Later",
};

// ─── Planner Panel ─────────────────────────────────────────────────────────────

function PlannerPanel({
  prompt,
  setPrompt,
  onGenerate,
  isGenerating,
}: {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-4xl px-4 py-4 md:px-8">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              Japan destination pack active
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              Global packs planned
            </span>
          </div>
          <div>
            <h1 className="max-w-3xl text-2xl font-semibold text-slate-950 md:text-3xl">
              Trip Agent
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              A global AI travel planner launching first with Japan. Turn messy intent into a
              map-based, booking-ready itinerary.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-1.5">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-18 w-full resize-none rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-950 outline-none ring-blue-600 transition placeholder:text-slate-400 focus:ring-2"
              placeholder="Plan 7 days in Japan for 2 people with food, anime, design shops, one ryokan night, and no early mornings."
            />
            <div className="flex min-h-10 flex-col gap-2 px-1 py-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] font-medium text-slate-500">
                Uses your saved profile when available.
              </p>
              <button
                onClick={onGenerate}
                disabled={isGenerating}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                <Sparkles className="size-4" />
                {isGenerating ? "Building" : "Build trip"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Day Tabs ──────────────────────────────────────────────────────────────────

function DayTabs({
  days,
  activeDayId,
  onSelect,
}: {
  days: ItineraryDay[];
  activeDayId: string;
  onSelect: (dayId: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 md:px-8">
      {days.map((day) => {
        const isActive = activeDayId === day.id;
        return (
          <button
            key={day.id}
            onClick={() => onSelect(day.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {day.dayNumber === 0 ? "Overview" : `D${day.dayNumber} ${day.area}`}
          </button>
        );
      })}
    </div>
  );
}

// ─── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-h-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500">
        <span className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          {icon}
        </span>
        {label}
      </div>
      <p className="whitespace-pre-line text-base font-semibold leading-6 text-slate-950">{value}</p>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function Timeline({ activeDay, placesById }: { activeDay: ItineraryDay; placesById: Map<string, MapPlace> }) {
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{activeDay.date}</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{activeDay.title}</h2>
          <p className="mt-2 text-sm font-medium text-slate-500">Trip details</p>
        </div>
        <span
          className="mt-1 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: activeDay.color }}
        />
      </div>
      <div className="relative space-y-4 pl-6 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-slate-200">
        {activeDay.segments.map((segment) => {
          const segmentKey = `${segment.time}-${segment.title}`;
          const primaryPlace = placesById.get(segment.placeIds[0]);
          const isExpanded = expandedSegment === segmentKey;

          return (
            <article key={segmentKey} className="relative">
              <span
                className="absolute -left-[23px] top-6 size-3 rounded-full ring-4 ring-white"
                style={{ backgroundColor: activeDay.color }}
              />
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-500">{segment.time}</span>
                      {primaryPlace && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase text-white"
                          style={{ backgroundColor: activeDay.color }}
                        >
                          {primaryPlace.category}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-slate-950">{segment.title}</h3>
                    {primaryPlace && (
                      <p className="mt-1 text-sm font-medium text-slate-500">
                        {primaryPlace.neighborhood} · {primaryPlace.duration}
                      </p>
                    )}
                  </div>
                  <span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                    {segment.cost}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600">{segment.description}</p>

                {isExpanded && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                    <p className="font-semibold text-slate-800">Agent note</p>
                    <p className="mt-1">{segment.travelNote}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {segment.placeIds.map((placeId) => {
                        const place = placesById.get(placeId);
                        if (!place) return null;
                        return (
                          <a
                            key={place.id}
                            href={place.googleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:text-blue-700"
                          >
                            <MapPin className="size-3" />
                            {place.name}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  {primaryPlace && (
                    <a
                      href={primaryPlace.googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      <MapPin className="size-4" />
                      Navigate
                    </a>
                  )}
                  <button className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600">
                    <ExternalLink className="size-4" />
                    Booking task
                  </button>
                  <button
                    onClick={() => setExpandedSegment(isExpanded ? null : segmentKey)}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    <MessageCircle className="size-4" />
                    {isExpanded ? "Hide note" : "Ask agent"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ─── Booking List ──────────────────────────────────────────────────────────────

function BookingList({ items }: { items: BookingChecklistItem[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-center gap-2">
        <CheckCircle2 className="size-5 text-emerald-600" />
        <h2 className="text-base font-semibold text-slate-950">Booking checklist</h2>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.handoffUrl}
            target="_blank"
            rel="noreferrer"
            className="grid gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-blue-200 hover:bg-blue-50 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {item.provider} · {item.deadline}
              </p>
            </div>
            <span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {statusCopy[item.status]}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

// ─── Agent Panel ───────────────────────────────────────────────────────────────

function getPlaceHighlight(place: MapPlace) {
  const lowerName = place.name.toLowerCase();

  if (lowerName.includes("namba") || lowerName.includes("dotonbori")) {
    return {
      main: "Osaka's casual food culture is the highlight here.",
      note: "Try takoyaki or okonomiyaki, then notice how Dotonbori is built around bright signs, quick bites, and shared street energy. The phrase kuidaore means eating until you drop, and it captures the local mood.",
      tags: ["Famous dish", "Osaka food", "Night walk"],
    };
  }
  if (lowerName.includes("yanaka")) {
    return {
      main: "A softer old-Tokyo neighborhood rhythm.",
      note: "Look for menchi-katsu, senbei, and small snack shops. Yanaka is tied to shitamachi culture, the older low-city Tokyo feeling of narrow streets, family shops, and everyday neighborhood life.",
      tags: ["Local snacks", "Old Tokyo", "Low-key"],
    };
  }
  if (lowerName.includes("hakone")) {
    return {
      main: "Onsen culture is the main experience.",
      note: "Hakone is a classic hot-spring escape from Tokyo. If you visit Owakudani, kuro-tamago black eggs are the local specialty. At a ryokan, the cultural point is slowing down: bath, dinner, quiet evening.",
      tags: ["Onsen", "Local specialty", "Relax"],
    };
  }
  if (lowerName.includes("fushimi")) {
    return {
      main: "The torii gates are offerings, not just a photo spot.",
      note: "Fushimi Inari is dedicated to Inari, associated with rice, prosperity, and fox messengers. The gates were donated by people and businesses, so the walk is also a visible record of gratitude and wishes.",
      tags: ["Historic shrine", "Torii gates", "Kyoto"],
    };
  }
  if (lowerName.includes("gion")) {
    return {
      main: "Traditional entertainment culture shaped this area.",
      note: "Gion is known for teahouses, narrow lanes, and geiko/maiko culture. The best way to experience it is quietly: admire the streets, avoid blocking doorways, and do not chase performers for photos.",
      tags: ["Historic area", "Kyoto culture", "Evening"],
    };
  }
  if (lowerName.includes("nakano")) {
    return {
      main: "A compact look at Japanese collector culture.",
      note: "Nakano Broadway is known for manga, anime goods, vintage toys, watches, and niche collector shops. Unlike a museum, the culture here is in the browsing: small stores, rare finds, and fandom history.",
      tags: ["Anime", "Shopping", "Collectors"],
    };
  }
  if (lowerName.includes("kichijoji") || lowerName.includes("inokashira")) {
    return {
      main: "Local Tokyo leisure, not a checklist sight.",
      note: "Kichijoji is loved for Inokashira Park, cafes, small shops, and an easy neighborhood feel. It helps tourists see how Tokyo residents spend a slower afternoon away from the major hubs.",
      tags: ["Park", "Cafe area", "Local Tokyo"],
    };
  }
  if (place.category === "restaurant") {
    return {
      main: "Signature dish first, logistics second.",
      note: "For restaurants, the agent should highlight what to order, the local specialty behind it, and one practical tip such as cash, queue style, or reservation expectations.",
      tags: ["Famous dish", "Ordering tip", "Food"],
    };
  }
  return {
    main: place.whyItFits,
    note: "The guide should explain the cultural reason this stop is interesting in one practical paragraph.",
    tags: ["Highlight", place.category, place.neighborhood],
  };
}

function AgentPanel({
  activeDay,
  placesById,
}: {
  activeDay: ItineraryDay;
  placesById: Map<string, MapPlace>;
}) {
  const guidePlaces = activeDay.placeIds
    .map((id) => placesById.get(id))
    .filter((p): p is MapPlace => Boolean(p))
    .filter((p) => !["airport", "hotel", "transit"].includes(p.category));

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(guidePlaces[0]?.id ?? null);
  const selectedPlace = guidePlaces.find((p) => p.id === selectedPlaceId) ?? guidePlaces[0];
  const guideHighlight = selectedPlace ? getPlaceHighlight(selectedPlace) : null;

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Landmark className="size-5 text-blue-600" />
        <h2 className="text-base font-semibold text-slate-950">Today&apos;s guide</h2>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {guidePlaces.map((place) => (
            <button
              key={place.id}
              onClick={() => setSelectedPlaceId(place.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                selectedPlace?.id === place.id
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              {place.name}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-950">
            {selectedPlace?.name ?? "No highlight stop selected"}
          </p>
          {guideHighlight ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm font-semibold leading-6 text-slate-950">{guideHighlight.main}</p>
              <p className="text-sm leading-6 text-slate-600">{guideHighlight.note}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This day is mostly logistics. Highlights appear for food, culture, shopping, wellness, and sightseeing stops.
            </p>
          )}
          {guideHighlight && (
            <div className="mt-3 flex flex-wrap gap-2">
              {guideHighlight.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <input
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-slate-400"
            placeholder="Ask for a quick highlight"
          />
          <button className="flex size-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700">
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Trip Dashboard ────────────────────────────────────────────────────────────

export function TripDashboard() {
  const [itinerary, setItinerary] = useState(mockItinerary);
  const [prompt, setPrompt] = useState(
    "7 days in Tokyo, Hakone, Kyoto, and Osaka with food, anime, one ryokan, no early mornings.",
  );
  const [activeDayId, setActiveDayId] = useState("overview");
  const [generated, setGenerated] = useState(false);
  const [generationMode, setGenerationMode] = useState<"idle" | "gemini" | "mock" | "error">("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");

  const activeDay =
    itinerary.days.find((day) => day.id === activeDayId) ?? itinerary.days[0];

  const placesById = useMemo(
    () => new Map(itinerary.places.map((place) => [place.id, place])),
    [itinerary.places],
  );

  async function handleGenerate() {
    setIsGenerating(true);
    setGenerationError("");

    try {
      const response = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          destinationPackId: itinerary.destinationPackId,
          profile: itinerary.profile,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error?.message ?? "Trip Agent could not build this trip.");
      }

      const nextItinerary = payload.data?.itinerary as typeof mockItinerary | undefined;
      if (!nextItinerary) {
        throw new Error("Trip Agent returned an empty itinerary.");
      }

      setItinerary(nextItinerary);
      setGenerated(true);
      setGenerationMode(payload.data?.mode === "gemini" ? "gemini" : "mock");
      setActiveDayId(nextItinerary.days[0]?.id ?? "overview");
    } catch (error) {
      setGenerationMode("error");
      setGenerationError(error instanceof Error ? error.message : "Trip Agent could not build this trip.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Compass className="size-5" />
            </span>
            <span className="text-sm font-semibold uppercase tracking-normal text-slate-950">
              Trip Agent
            </span>
          </Link>
          <nav className="hidden items-center gap-2 text-sm font-semibold text-slate-600 md:flex">
            <a className="rounded-md px-3 py-2 hover:bg-slate-100" href="#plan">
              Plan
            </a>
            <a className="rounded-md px-3 py-2 hover:bg-slate-100" href="#itinerary">
              Itinerary
            </a>
            <a className="rounded-md px-3 py-2 hover:bg-slate-100" href="#bookings">
              Bookings
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100 sm:inline-flex">
              Clickable MVP
            </span>
            <button className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              <span className="flex size-7 items-center justify-center rounded-full bg-white/15">
                <UserRound className="size-4" />
              </span>
              <span className="hidden sm:inline">Sign in</span>
            </button>
          </div>
        </div>
      </header>

      <main>
        <div id="plan">
          <PlannerPanel
            prompt={prompt}
            setPrompt={setPrompt}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />
        </div>

        <section className="bg-white">
          <TripMap places={itinerary.places} activeDay={activeDay} />
          <DayTabs
            days={itinerary.days}
            activeDayId={activeDay.id}
            onSelect={setActiveDayId}
          />
        </section>

        <section id="itinerary" className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold text-slate-500">{itinerary.dates}</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950 md:text-4xl">
              {itinerary.title}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{itinerary.subtitle}</p>
            {generated && (
              <p className="mx-auto mt-3 max-w-2xl rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
                {generationMode === "gemini"
                  ? "Gemini generated this plan from your prompt and saved profile."
                  : "Fallback mock plan generated from your prompt and saved profile."}
              </p>
            )}
            {generationError && (
              <p className="mx-auto mt-3 max-w-2xl rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-100">
                {generationError}
              </p>
            )}
          </div>

          <div className="mx-auto mb-6 grid max-w-3xl gap-3 md:grid-cols-2">
            <SummaryCard icon={<Hotel className="size-4" />} label="Hotel" value={itinerary.summary.hotel} />
            <SummaryCard icon={<Plane className="size-4" />} label="Flight" value={itinerary.summary.flights} />
            <SummaryCard icon={<Train className="size-4" />} label="Transit" value={itinerary.summary.transit} />
            <SummaryCard icon={<CircleDollarSign className="size-4" />} label="Currency" value={itinerary.summary.budget} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <Timeline activeDay={activeDay} placesById={placesById} />
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Bell className="size-5 text-orange-500" />
                  <h2 className="text-base font-semibold text-slate-950">Packing reminder</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {itinerary.reminders.map((reminder) => (
                    <div key={reminder.title} className="rounded-lg bg-slate-50 p-3">
                      <h3 className="text-sm font-semibold text-slate-950">{reminder.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {reminder.items.map((item) => (
                          <span key={item} className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="space-y-6">
              <AgentPanel activeDay={activeDay} placesById={placesById} />
            </div>
          </div>

          <div id="bookings" className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <BookingList items={itinerary.bookingChecklist} />
            <section className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm md:p-5">
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock className="size-5 text-cyan-300" />
                <h2 className="text-base font-semibold">Next backend milestone</h2>
              </div>
              <div className="space-y-3 text-sm leading-6 text-slate-200">
                <p>FastAPI on Cloud Run will receive the prompt and return validated itinerary JSON.</p>
                <p>Gemini on Vertex AI will generate the plan, while MongoDB Atlas stores user memory, destination packs, saved trips, and chat sessions.</p>
                <p>The MongoDB MCP server will give the agent partner-track tools for trip persistence, retrieval, and vector search.</p>
                <p>Booking remains approval-based until provider access is secured.</p>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
