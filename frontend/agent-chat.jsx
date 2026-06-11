(function () {
// AgentChat — Reiko talks to the local FastAPI/Gemini agent backend,
// grounded in the current trip data.

const { AGENT_API_BASE, backendOfflineMessage, backendRequestMessage, checkBackendHealth, saveProfile, planTrip, chatAgent, searchFlights, searchHotels } = window.TripAgentApi;
const { normalizeTravelers, planProfilePayload } = window.TripProfile;
const { normalizeBackendTrip, summarizeTripForChat } = window.TripNormalizers;

const {
  AGENT_GROUNDING_RULES,
  PROFILE_STEPS,
  HOTEL_BOOKING_STEPS,
  PLAN_CONFIRM_OPTIONS,
  BOOKING_NEXT_OPTIONS,
  nextSessionStep,
  profileGreeting,
  profileContext,
  looksLikePlanRequest,
  destinationFromText,
  isLivePlanMode,
  returnedDifferentDestination,
  backendFallbackMessage,
  missingPlanStep,
  daysFromText,
  parseTravelDateRange,
  tripCityBreakdown,
} = window.TripAgentFlow;

function stableAnswersFromProfile(profile) {
  const answers = {};
  if (profile?.homeAirport) answers.homeAirport = profile.homeAirport;
  if (profile?.travelers) answers.travelers = `${profile.travelers} people`;
  const foodPrefs = Array.isArray(profile?.foodPreferences) ? profile.foodPreferences : [];
  if (foodPrefs.length) answers.foodPreferences = foodPrefs.join(", ");
  return answers;
}

function normalizeDemoDestination(value) {
  const text = String(value || "").trim();
  if (/japan/i.test(text)) return "Japan";
  if (/paris/i.test(text)) return "Paris, France";
  if (/rome/i.test(text)) return "Rome, Italy";
  if (/barcelona/i.test(text)) return "Barcelona, Spain";
  if (/london/i.test(text)) return "London, United Kingdom";
  return text;
}

function followUpChoicesForReply(reply) {
  const text = String(reply || "");
  const asksCitySplit = /how many days|spend in each city|split.*between/i.test(text);
  const asksTransport = /bullet train|flight|travel between|how do you plan to travel/i.test(text);
  if (asksCitySplit && asksTransport) {
    return [
      "Balanced split: 3 days Tokyo + 3 days Osaka",
      "More Tokyo: 4 days Tokyo + 2 days Osaka",
      "More Osaka/Kansai: 2 days Tokyo + 4 days Osaka",
      "Agent decides the best city split",
    ];
  }
  if (asksCitySplit) {
    return ["3 days Tokyo + 3 days Osaka", "4 days Tokyo + 2 days Osaka", "2 days Tokyo + 4 days Osaka", "Agent decides"];
  }
  if (asksTransport) {
    return ["Agent decides the fastest option", "Agent decides the most comfortable option", "Agent decides the best value option"];
  }
  return [];
}

function AgentChat({ trip, userProfile, onProfileUpdate, onPlanGenerated }) {
  const [messages, setMessages] = React.useState(() => [profileGreeting()]);
  const [input, setInput] = React.useState("");
  const [dateRange, setDateRange] = React.useState({ start: "", end: "" });
  const [multiChoices, setMultiChoices] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [pendingAfterFlightStep, setPendingAfterFlightStep] = React.useState(null);
  // sessionAnswers tracks which PROFILE_STEPS have been answered in this browser session.
  // We intentionally ignore localStorage-persisted preference fields here so the interview
  // always asks all questions in sequence — localStorage values only carry over for API calls.
  const [sessionAnswers, setSessionAnswers] = React.useState(() => stableAnswersFromProfile(userProfile));
  const [interviewStep, setInterviewStep] = React.useState(() => nextSessionStep(stableAnswersFromProfile(userProfile)) || PROFILE_STEPS[0]);
  // Post-plan flow: first confirm the plan, then hand off to booking specialists
  const [awaitingPlanConfirmation, setAwaitingPlanConfirmation] = React.useState(false);
  const [showBookingChoice, setShowBookingChoice] = React.useState(false);
  const [bookingQueue, setBookingQueue] = React.useState([]); // steps for the active booking agent
  const [bookingQueueIndex, setBookingQueueIndex] = React.useState(0);
  const [bookingAnswers, setBookingAnswers] = React.useState({});
  const [bookingIntent, setBookingIntent] = React.useState({ hasFlight: false, hasHotel: false });
  const [connection, setConnection] = React.useState({
    state: "checking",
    label: "Checking backend",
    detail: `Looking for FastAPI on ${AGENT_API_BASE}`,
  });
  const threadRef = React.useRef(null);
  const lastPlanDataRef = React.useRef(null);

  // Keep latest message in view.
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function checkBackend({ quiet = false } = {}) {
    if (!quiet) {
      setConnection({
        state: "checking",
        label: "Checking backend",
        detail: `Looking for FastAPI on ${AGENT_API_BASE}`,
      });
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);

    try {
      const data = await checkBackendHealth(controller.signal);
      const services = [];
      if (data.live_gemini_enabled) services.push("Gemini live");
      else services.push("Gemini mock");
      if (data.mongodb_available) {
        services.push(data.mongodb?.vector_search_available ? "Atlas Vector Search" : "Atlas");
      }
      if (data.live_maps_enabled) services.push("Maps");
      setConnection({
        state: "connected",
        label: "Backend connected",
        detail: services.join(" · "),
      });
      return true;
    } catch {
      setConnection({
        state: "offline",
        label: "Backend offline",
        detail: `Cannot reach ${AGENT_API_BASE} from ${window.location.origin}`,
      });
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  }

  React.useEffect(() => {
    checkBackend();
  }, []);

  React.useEffect(() => {
    if (!userProfile?.profileSetupComplete) return;
    setSessionAnswers((prev) => {
      const merged = { ...stableAnswersFromProfile(userProfile), ...prev };
      setInterviewStep(nextSessionStep(merged));
      return merged;
    });
  }, [userProfile?.profileSetupComplete]);

  React.useEffect(() => {
    setInput("");
    setDateRange({ start: "", end: "" });
    setMultiChoices([]);
  }, [interviewStep?.key, bookingQueueIndex]);

  // Compact trip context for the model.
  const tripContext = React.useMemo(() => {
    if (!trip) return `${profileContext(userProfile)}\nNo itinerary yet — user needs to plan one.`;
    const days = trip.days
      .map((d) => `D${d.n} ${d.city}: ${d.title} (${d.hours}). Stops: ${d.stops.map((s) => `${s.t} ${s.k}`).join(" | ")}. Note: ${d.note}`)
      .join("\n");
    const uniqueCities = [...new Set(trip.days.map((d) => d.city).filter(Boolean))];
    const cityLine = uniqueCities.length ? `CITIES IN THIS ITINERARY: ${uniqueCities.join(", ")}` : "";
    return `${cityLine}\n${AGENT_GROUNDING_RULES}\nTrip: ${trip.title}. ${trip.subtitle}. ${trip.dates}. ${trip.travelers} travelers (${trip.prepared_for}).\n${profileContext(userProfile)}\n${days}`;
  }, [trip, userProfile]);

  function handleProfileAnswer(answer) {
    const step = interviewStep || nextSessionStep(sessionAnswers);
    if (!step) return false;

    const dateInfo = step.key === "travelDates" ? parseTravelDateRange(answer) : {};
    const newAnswers = {
      ...sessionAnswers,
      [step.key]: answer,
      ...(dateInfo.departureDate ? { departureDate: dateInfo.departureDate } : {}),
      ...(dateInfo.returnDate ? { returnDate: dateInfo.returnDate } : {}),
      ...(dateInfo.days ? { tripDays: dateInfo.days, tripLength: `${dateInfo.days} days` } : {}),
    };
    setSessionAnswers(newAnswers);

    const tripDays = dateInfo.days || parseTravelDateRange(newAnswers.travelDates || "").days || newAnswers.tripDays || userProfile?.tripRequest?.days;
    const destination = step.key === "destination" ? normalizeDemoDestination(answer) : userProfile?.tripRequest?.destination;
    const selectedInterests = step.key === "interestMix" ? splitAnswerList(answer) : [];
    const focus = step.key === "interestMix" ? answer : userProfile?.attractionStyle;
    const existingInterests = Array.isArray(userProfile?.interestList) ? userProfile.interestList : [];
    const nextProfile = {
      ...(userProfile || {}),
      [step.key]: answer,
      pace: userProfile?.pace || "balanced",
      travelStyle: userProfile?.travelStyle,
      interestList: selectedInterests.length
        ? Array.from(new Set([...existingInterests, ...selectedInterests]))
        : (focus ? Array.from(new Set([...existingInterests, focus])) : userProfile?.interestList),
      travelers: step.key === "travelers" ? normalizeTravelers(answer, 1) : (userProfile?.travelers || 1),
      homeAirport: step.key === "homeAirport" ? answer : userProfile?.homeAirport,
      departureDate: dateInfo.departureDate || userProfile?.departureDate,
      returnDate: dateInfo.returnDate || userProfile?.returnDate,
      stayType: step.key === "stayType" ? answer : userProfile?.stayType,
      neighborhoodStyle: step.key === "neighborhoodStyle" ? answer : userProfile?.neighborhoodStyle,
      cuisineStyle: step.key === "cuisineStyle" ? answer : userProfile?.cuisineStyle,
      tripRequest: {
        ...(userProfile?.tripRequest || {}),
        ...(destination ? { destination } : {}),
        ...(tripDays ? { days: tripDays } : {}),
        ...(dateInfo.departureDate ? { startDate: dateInfo.departureDate } : {}),
        ...(dateInfo.returnDate ? { endDate: dateInfo.returnDate } : {}),
        ...(dateInfo.month ? { month: dateInfo.month } : {}),
      },
      updatedAt: new Date().toISOString(),
    };
    const followingStep = nextSessionStep(newAnswers);
    nextProfile.completed = !followingStep;
    onProfileUpdate(nextProfile);
    setInterviewStep(followingStep);

    if (step.agentLabel === "Flight Agent" && followingStep?.agentLabel === "Plan Agent") {
      setBusy(true);
      const flightDestination = nextProfile.tripRequest?.destination || normalizeDemoDestination(newAnswers.destination) || "Japan";
      setPendingAfterFlightStep(followingStep);
      setInterviewStep(null);
      window.setTimeout(async () => {
        try {
          const flightData = await searchFlights({
            origin: newAnswers.homeAirport || nextProfile.homeAirport || "SFO",
            destination: flightDestination,
            departure_date: newAnswers.departureDate || "",
            return_date: newAnswers.returnDate || "",
            travel_month: nextProfile.tripRequest?.month || "",
            travelers: normalizeTravelers(newAnswers.travelers || nextProfile.travelers, 1),
            cabin: "Economy",
          });
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `${flightData.summary}\n\nPick one and I'll plan the route around it.`,
              agentLabel: "Flight Agent",
              agentEmoji: "✈️",
              bookingOptions: { flights: flightData },
              tool_trace: ["search_flights"],
            },
          ]);
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: backendRequestMessage(err), agentLabel: "Flight Agent", agentEmoji: "✈️" },
            { role: "assistant", content: followingStep.question, agentLabel: followingStep.agentLabel, agentEmoji: followingStep.agentEmoji },
          ]);
        } finally {
          setBusy(false);
        }
      }, 150);
      return true;
    }

    if (nextProfile.completed) {
      saveProfile(planProfilePayload(nextProfile, {})).catch(() => {});

      // Auto-generate the plan now that the interview is complete.
      const dest = normalizeDemoDestination(newAnswers.destination) || "";
      const numDays = tripDays || 5;
      const planProfile = planProfilePayload(nextProfile, trip);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Got it. I’m going to turn this into a route now — flights first, then cities, then the daily plan.` },
      ]);
      window.setTimeout(async () => {
        setBusy(true);
        try {
          const data = await planTrip({
            prompt: `Plan a ${numDays}-day trip to ${dest}`,
            destination: dest,
            days: numDays,
            start_date: newAnswers.departureDate || nextProfile.departureDate || "",
            end_date: newAnswers.returnDate || nextProfile.returnDate || "",
            profile: planProfile,
          });
          if ((!isLivePlanMode(data.mode) && !data?.itinerary) || returnedDifferentDestination(data, dest)) {
            setMessages((prev) => [...prev, { role: "assistant", content: backendFallbackMessage(dest) }]);
            return;
          }
          const request = {
            prompt: `Plan a ${numDays}-day trip to ${dest}`,
            destination: dest,
            days: numDays,
            startDate: newAnswers.departureDate || nextProfile.departureDate || "",
            endDate: newAnswers.returnDate || nextProfile.returnDate || "",
          };
          const visibleTrip = normalizeBackendTrip(data, nextProfile, request);
          if (onPlanGenerated) onPlanGenerated(data, request);
          lastPlanDataRef.current = { data, destination: dest, profile: nextProfile };
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `${summarizeTripForChat(visibleTrip)}\n\nDoes this look good? I can adjust anything — days, activities, restaurants, or pace.`,
            tool_trace: Array.isArray(data.tool_trace) && data.tool_trace.length ? data.tool_trace : null,
          }]);
          setAwaitingPlanConfirmation(true);
        } catch (err) {
          setMessages((prev) => [...prev, { role: "assistant", content: backendRequestMessage(err) }]);
        } finally {
          setBusy(false);
        }
      }, 200);
      return true;
    }

    const agentChanged = followingStep.agentLabel && followingStep.agentLabel !== (step.agentLabel || null);
    if (agentChanged) {
      // Show acknowledgement from current agent, then hand off to next specialist
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Got it — passing you to our next specialist.", agentLabel: step.agentLabel, agentEmoji: step.agentEmoji },
        { role: "assistant", content: followingStep.question, agentLabel: followingStep.agentLabel, agentEmoji: followingStep.agentEmoji },
      ]);
    } else {
      setMessages((prev) => [...prev, { role: "assistant", content: `Got it.\n\n${followingStep.question}`, agentLabel: followingStep.agentLabel, agentEmoji: followingStep.agentEmoji }]);
    }
    return true;
  }

  function handlePlanConfirmation(choice) {
    setAwaitingPlanConfirmation(false);
    setMessages((prev) => [...prev, { role: "user", content: choice }]);
    if (/adjust|change|tweak|update|modify|different/i.test(choice)) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "Of course! What would you like to change? You can ask me to swap activities, adjust the pace, add specific experiences, or update the restaurants.",
      }]);
    } else {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "The trip is locked in! Your flight is already selected, so I can help with hotels next. Your trip is automatically saved — you can find it anytime under 'Saved trips' in the header.",
      }]);
      setShowBookingChoice(true);
    }
  }

  async function handleBookingChoice(choice) {
    setShowBookingChoice(false);
    setMessages((prev) => [...prev, { role: "user", content: choice }]);
    if (/myself|set|thanks|no/i.test(choice)) {
      setMessages((prev) => [...prev, { role: "assistant", content: "No problem — everything is in the booking checklist on the left whenever you're ready. Let me know if you need anything else!" }]);
      return;
    }
    const wantsHotel = /hotel/i.test(choice);
    if (!wantsHotel) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "For this demo, flights are handled before the route. After the plan is approved, I can help find hotels for the cities in your itinerary.",
        agentLabel: "Hotel Agent",
        agentEmoji: "🏨",
      }]);
      setShowBookingChoice(true);
      return;
    }
    const intent = { hasFlight: false, hasHotel: true };
    setBookingIntent(intent);
    const defaults = bookingDefaultsFromState();
    const steps = HOTEL_BOOKING_STEPS.filter((step) => !hasBookingAnswer(step, defaults));
    setBookingAnswers(defaults);

    if (!steps.length) {
      const agentLabel = "Hotel Agent";
      const agentEmoji = "🏨";
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "I have enough to search from the current route, so I’ll use the cities and nights from this plan.",
        agentLabel,
        agentEmoji,
      }]);
      await triggerBookingSearch(defaults, { agentLabel, agentEmoji }, intent);
      return;
    }

    setBookingQueue(steps);
    setBookingQueueIndex(0);
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: bookingIntroForMissingSteps(false, true, steps),
      agentLabel: steps[0].agentLabel,
      agentEmoji: steps[0].agentEmoji,
    }]);
  }

  function bookingDefaultsFromState() {
    const departureDate = sessionAnswers.departureDate || userProfile?.departureDate || userProfile?.tripRequest?.startDate || "";
    const returnDate = sessionAnswers.returnDate || userProfile?.returnDate || userProfile?.tripRequest?.endDate || "";
    const travelDates = sessionAnswers.travelDates || (departureDate && returnDate ? `${departureDate} to ${returnDate}` : "");
    return {
      ...(sessionAnswers.homeAirport || userProfile?.homeAirport ? { homeAirport: sessionAnswers.homeAirport || userProfile?.homeAirport } : {}),
      ...(travelDates ? { travelDates } : {}),
      ...(departureDate ? { departureDate } : {}),
      ...(returnDate ? { returnDate } : {}),
      ...(sessionAnswers.travelers || userProfile?.travelers ? { travelers: sessionAnswers.travelers || `${userProfile?.travelers} people` } : {}),
      ...(userProfile?.budget ? { budget: userProfile.budget } : {}),
      ...(userProfile?.stayType ? { stayType: userProfile.stayType } : {}),
    };
  }

  function hasBookingAnswer(step, answers) {
    if (!step) return true;
    if (step.key === "travelDates") return Boolean(answers.departureDate && answers.returnDate);
    return Boolean(answers[step.key]);
  }

  function bookingIntroForMissingSteps(wantsFlight, wantsHotel, steps) {
    const firstQuestion = steps[0]?.question || "What should I search?";
    if (wantsFlight && steps.some((step) => step.agentLabel === "Flight Agent")) {
      return `I’ll reuse anything you already gave me. I only need this missing flight detail:\n\n${firstQuestion}`;
    }
    if (wantsHotel && steps.some((step) => step.agentLabel === "Hotel Agent")) {
      return `I have the route now, so I’ll only ask hotel preferences that can change this trip.\n\n${firstQuestion}`;
    }
    return firstQuestion;
  }

  async function handleBookingStepAnswer(answer) {
    const step = bookingQueue[bookingQueueIndex];
    if (!step) return;
    const dateInfo = step.key === "travelDates" ? parseTravelDateRange(answer) : {};
    const newAnswers = {
      ...bookingAnswers,
      [step.key]: answer,
      ...(dateInfo.departureDate ? { departureDate: dateInfo.departureDate } : {}),
      ...(dateInfo.returnDate ? { returnDate: dateInfo.returnDate } : {}),
    };
    setBookingAnswers(newAnswers);
    onProfileUpdate({ ...(userProfile || {}), [step.key]: answer, updatedAt: new Date().toISOString() });

    const nextIdx = bookingQueueIndex + 1;
    if (nextIdx < bookingQueue.length) {
      const nextStep = bookingQueue[nextIdx];
      setBookingQueueIndex(nextIdx);
      const agentChanged = nextStep.agentLabel !== step.agentLabel;
      setMessages((prev) => [
        ...prev,
        ...(agentChanged ? [{ role: "assistant", content: "Got it — handing off to the next specialist.", agentLabel: step.agentLabel, agentEmoji: step.agentEmoji }] : []),
        { role: "assistant", content: `Got it.\n\n${nextStep.question}`, agentLabel: nextStep.agentLabel, agentEmoji: nextStep.agentEmoji },
      ]);
    } else {
      // All booking questions answered — trigger the booking search
      setBookingQueue([]);
      setBookingQueueIndex(0);
      await triggerBookingSearch(newAnswers, step, bookingIntent);
    }
  }

  async function triggerBookingSearch(answers, lastStep, intent = bookingIntent) {
    setBusy(true);
    const hasFlight = Boolean(intent?.hasFlight);
    const hasHotel = Boolean(intent?.hasHotel);

    try {
      const searches = await runStructuredBookingSearches(answers, { hasFlight, hasHotel });
      const reply = bookingSearchSummary(searches);
      setMessages((prev) => [...prev, {
        role: "assistant", content: reply,
        agentLabel: lastStep?.agentLabel, agentEmoji: lastStep?.agentEmoji,
        bookingOptions: searches,
        tool_trace: [
          ...(searches.flights ? ["search_flights"] : []),
          ...(searches.hotels?.cityGroups?.length > 1
            ? searches.hotels.cityGroups.map((g) => `search_hotels · ${g.city}`)
            : (searches.hotels ? ["search_hotels"] : [])),
        ],
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: backendRequestMessage(err) }]);
    } finally {
      setBusy(false);
    }
  }

  async function runStructuredBookingSearches(answers, { hasFlight, hasHotel }) {
    const destination = lastPlanDataRef.current?.destination
      || lastPlanDataRef.current?.data?.destination_pack?.country
      || userProfile?.tripRequest?.destination
      || trip?.title
      || "";
    const travelers = normalizeTravelers(userProfile?.travelers || answers.travelers || trip?.travelers, 1);
    const results = {};

    if (hasFlight) {
      results.flights = await searchFlights({
        origin: answers.homeAirport || userProfile?.homeAirport || "",
        destination,
        departure_date: answers.departureDate || "",
        return_date: answers.returnDate || "",
        travel_month: userProfile?.travelMonth || userProfile?.tripRequest?.month || "",
        travelers,
        cabin: "Economy",
      });
    }

    if (hasHotel) {
      const totalDays = userProfile?.tripRequest?.days || trip?.days?.length || 5;
      const hotelBase = {
        travelers,
        budget: answers.budget || userProfile?.budget || "Moderate",
        stay_type: answers.stayType || userProfile?.stayType || "Hotel",
        preferences: [userProfile?.hotelPreferences, userProfile?.stayType].filter(Boolean),
      };

      // Multi-city fan-out: if the saved plan spans 2+ known cities, search hotels
      // once per city in parallel. Otherwise fall back to a single search.
      const itinerary = lastPlanDataRef.current?.data?.itinerary;
      const breakdown = (itinerary ? tripCityBreakdown(itinerary, destination) : [{ city: destination, nights: totalDays }])
        .filter((entry) => entry && entry.city);

      if (breakdown.length > 1) {
        const groupResponses = await Promise.all(
          breakdown.map((entry) =>
            searchHotels({
              ...hotelBase,
              destination: entry.city,
              neighborhood: recommendedHotelArea(entry.city, answers.stayType || userProfile?.stayType),
              nights: Math.max(1, entry.nights),
            }).then((response) => ({ city: entry.city, nights: entry.nights, response }))
             .catch(() => ({ city: entry.city, nights: entry.nights, response: null }))
          )
        );
        const cityGroups = groupResponses
          .filter((g) => g.response && Array.isArray(g.response.options) && g.response.options.length)
          .map((g) => ({
            city: g.city,
            nights: g.nights,
            options: (g.response.options || []).slice(0, 2).map((option) => ({ ...option, city: g.city, nights: g.nights })),
            summary: g.response.summary,
          }));
        const totalOptions = cityGroups.reduce((sum, g) => sum + g.options.length, 0);
        results.hotels = {
          mode: groupResponses.find((g) => g.response?.mode === "provider") ? "provider" : "mock",
          provider: "multi-city-google-maps",
          summary: cityGroups.length
            ? `Found ${totalOptions} hotel options across ${cityGroups.length} cities — ${cityGroups.map((g) => `${g.nights} night${g.nights === 1 ? "" : "s"} in ${g.city}`).join(", ")}.`
            : `Couldn't find hotels for those cities — try a different budget or stay style.`,
          options: cityGroups.flatMap((g) => g.options), // flat list as fallback for any code still expecting it
          cityGroups,
          next_step: "Pick one hotel per city. Each card links to Google Hotels for final availability and booking.",
        };
      } else {
        results.hotels = await searchHotels({
          ...hotelBase,
          destination: breakdown[0]?.city || destination,
          neighborhood: recommendedHotelArea(breakdown[0]?.city || destination, answers.stayType || userProfile?.stayType),
          nights: breakdown[0]?.nights || totalDays,
        });
      }
    }

    return results;
  }

  function bookingSearchSummary(searches) {
    const lines = [];
    if (searches.flights) lines.push(searches.flights.summary);
    if (searches.hotels) lines.push(searches.hotels.summary);
    lines.push("Pick a card. I’ll save it, then you can review live price and cancellation terms on the provider site.");
    return lines.join("\n\n");
  }

  function handleBookingOptionSelect(kind, option) {
    const label = kind === "flight" ? `${option.airline} · $${option.price_usd}` : `${option.name} · $${option.price_per_night_usd}/night`;
    if (kind === "flight") {
      const nextProfile = {
        ...(userProfile || {}),
        selectedFlight: option,
        updatedAt: new Date().toISOString(),
      };
      onProfileUpdate(nextProfile);
      if (pendingAfterFlightStep) {
        setInterviewStep(pendingAfterFlightStep);
        setPendingAfterFlightStep(null);
      }
    }
    if (kind === "hotel") {
      const selectedHotels = [
        ...((userProfile || {}).selectedHotels || []).filter((item) => (item.city || item.area) !== (option.city || option.area)),
        { ...option, selectedAt: new Date().toISOString() },
      ];
      onProfileUpdate({
        ...(userProfile || {}),
        selectedHotels,
        updatedAt: new Date().toISOString(),
      });
    }
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `Select ${label}` },
      {
        role: "assistant",
        content: kind === "flight"
          ? `Nice, I’ll use ${option.airline} as the anchor. Since you land around ${shortFlightTime(option.arrive_time)}, I’ll keep the first day light.\n\n${pendingAfterFlightStep?.question || "What kind of route feels right?"}`
          : `Nice, I’ll save ${option.name} for ${option.city || option.area}. We’ll still verify the live rate and cancellation terms before booking.`,
        agentLabel: kind === "flight" ? "Flight Agent" : "Hotel Agent",
        agentEmoji: kind === "flight" ? "✈️" : "🏨",
      },
    ]);
  }

  function recommendedHotelArea(city, stayType = "") {
    const text = String(city || "").toLowerCase();
    const style = String(stayType || "").toLowerCase();
    if (/ryokan|local/.test(style)) {
      if (/kyoto/.test(text)) return "Gion or Higashiyama";
      if (/hakone/.test(text)) return "Hakone Yumoto or Gora";
    }
    if (/tokyo/.test(text)) return "Shinjuku or Ginza near transit";
    if (/kyoto/.test(text)) return "Kyoto Station or Gion";
    if (/osaka/.test(text)) return "Namba or Umeda";
    if (/nara/.test(text)) return "Nara Station or Naramachi";
    if (/hakone/.test(text)) return "Hakone Yumoto or Gora";
    return "central area near transit";
  }

  function shortFlightTime(value) {
    const match = String(value || "").match(/\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/);
    if (match) return match[0];
    return value || "your arrival time";
  }

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;

    if (showBookingChoice && /hotel|handle it myself|myself|flight|book both/i.test(q)) {
      setInput("");
      await handleBookingChoice(q);
      return;
    }

    // Booking specialist interview — don't add user message, it's already added via button click
    if (bookingQueue.length > 0 && bookingQueueIndex < bookingQueue.length) {
      setMessages((prev) => [...prev, { role: "user", content: q }]);
      await handleBookingStepAnswer(q);
      return;
    }

    setInput("");
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);

    if (awaitingPlanConfirmation) {
      // User typed instead of clicking a button — treat as a tweak request
      setAwaitingPlanConfirmation(false);
      // Fall through to regular chat so their message is handled
    }

    if (interviewStep) {
      handleProfileAnswer(q);
      return;
    }

    if (looksLikePlanRequest(q)) {
      const missingStep = missingPlanStep(q, userProfile, sessionAnswers);
      if (missingStep) {
        setInterviewStep(missingStep);
        setMessages((prev) => [...prev, { role: "assistant", content: missingStep.question }]);
        return;
      }
    }

    // After all interview questions answered, extract destination from session for plan request
    const resolvedDestination = destinationFromText(q) || sessionAnswers.destination || userProfile?.destination || userProfile?.tripRequest?.destination;

    setBusy(true);
    try {
      setConnection((prev) => ({
        ...prev,
        state: prev.state === "connected" ? "connected" : "checking",
        label: prev.state === "connected" ? prev.label : "Contacting backend",
      }));

      if (looksLikePlanRequest(q) && onPlanGenerated) {
        const request = userProfile?.tripRequest || {};
        const destination = normalizeDemoDestination(resolvedDestination) || resolvedDestination;
        const storedDateDays = parseTravelDateRange(sessionAnswers.travelDates || "").days || sessionAnswers.tripDays;
        const days = daysFromText(q, storedDateDays || (sessionAnswers.tripLength ? daysFromText(sessionAnswers.tripLength) : (request.days || trip?.days?.length || 5)));
        const data = await planTrip({
          prompt: `${AGENT_GROUNDING_RULES}\nUser request: ${q}`,
          destination,
          days,
          start_date: request.startDate || sessionAnswers.departureDate || userProfile?.departureDate || "",
          end_date: request.endDate || sessionAnswers.returnDate || userProfile?.returnDate || "",
          profile: planProfilePayload(userProfile, trip),
        });
        if ((!isLivePlanMode(data.mode) && !data?.itinerary) || returnedDifferentDestination(data, destination)) {
          // mode === "mock" is acceptable for the Japan curated demo, but not for unrelated destinations.
          setConnection((prev) => ({
            state: "connected",
            label: "Backend connected",
            detail: prev.detail?.includes("Gemini") ? prev.detail : "FastAPI on localhost:8000",
          }));
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: backendFallbackMessage(destination || "that destination") },
          ]);
          return;
        }
        const planRequest = {
          prompt: q,
          destination,
          days,
          startDate: request.startDate || sessionAnswers.departureDate || userProfile?.departureDate || "",
          endDate: request.endDate || sessionAnswers.returnDate || userProfile?.returnDate || "",
        };
        const visibleTrip = normalizeBackendTrip(data, userProfile || {}, planRequest);
        onPlanGenerated(data, planRequest);
        lastPlanDataRef.current = { data, destination, profile: userProfile };
        setConnection((prev) => ({
          state: "connected",
          label: "Backend connected",
          detail: prev.detail?.includes("Gemini") ? prev.detail : "FastAPI on localhost:8000",
        }));
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `${summarizeTripForChat(visibleTrip)}\n\nDoes this look good? I can adjust anything — days, activities, restaurants, or pace.`,
          tool_trace: Array.isArray(data.tool_trace) && data.tool_trace.length ? data.tool_trace : null,
        }]);
        setAwaitingPlanConfirmation(true);
        return;
      }

      const data = await chatAgent({
        question: q,
        trip_context: tripContext,
        messages: next.slice(-8),
      });
      setConnection((prev) => ({
        state: "connected",
        label: "Backend connected",
        detail: prev.detail?.includes("Gemini") ? prev.detail : "FastAPI on localhost:8000",
      }));

      // If the agent regenerated the plan, update the left panel
      if (data.itinerary && onPlanGenerated) {
        const prevData = lastPlanDataRef.current;
        const planRequest = {
          prompt: q,
          destination: prevData?.destination || "",
          days: data.itinerary.days?.length || prevData?.data?.itinerary?.days?.length || 5,
          startDate: prevData?.data?.start_date || "",
          endDate: prevData?.data?.end_date || "",
        };
        const visibleTrip = normalizeBackendTrip(data, userProfile || {}, planRequest);
        lastPlanDataRef.current = { data, destination: planRequest.destination, profile: userProfile };
        onPlanGenerated(data, planRequest);
        setShowBookingChoice(false);
        setBookingQueue([]);
        setBookingQueueIndex(0);
        setBookingAnswers({});
        setBookingIntent({ hasFlight: false, hasHotel: false });
        setAwaitingPlanConfirmation(true);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `${data.answer || "Done!"}\n\n${summarizeTripForChat(visibleTrip)}\n\nDoes this look good? I can adjust anything or help with hotels and flights.`,
          tool_trace: Array.isArray(data.tool_trace) && data.tool_trace.length ? data.tool_trace : null,
        }]);
        return;
      }

      const reply = data.answer || "I can help with that, but I need a little more detail.";
      const choices = followUpChoicesForReply(reply);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: String(reply).trim(),
          tool_trace: Array.isArray(data.tool_trace) && data.tool_trace.length ? data.tool_trace : null,
          choices,
        },
      ]);
    } catch (err) {
      setConnection({
        state: "offline",
        label: "Backend offline",
        detail: `Cannot reach ${AGENT_API_BASE} from ${window.location.origin}`,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: backendRequestMessage(err) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function chooseProfileOption(value) {
    send(value);
  }

  function submitDateRange() {
    if (!dateRange.start || !dateRange.end || busy) return;
    send(`${dateRange.start} to ${dateRange.end}`);
  }

  function splitAnswerList(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function toggleMultiChoice(option) {
    setMultiChoices((prev) => prev.includes(option)
      ? prev.filter((item) => item !== option)
      : [...prev, option]);
  }

  function submitMultiChoices(values) {
    if (!values.length || busy) return;
    send(values.join(", "));
  }

  const showMultiSelectInput = interviewStep?.inputType === "multiSelect";
  const showProfileOptions = interviewStep?.options?.length && !showMultiSelectInput;
  const activeBookingStep = bookingQueue.length > 0 && bookingQueueIndex < bookingQueue.length ? bookingQueue[bookingQueueIndex] : null;
  const showDateRangeInput = interviewStep?.inputType === "dateRange" || activeBookingStep?.inputType === "dateRange";
  const canSubmitDateRange = showDateRangeInput && dateRange.start && dateRange.end && !busy;
  const canSubmitText = input.trim() && !busy && !showProfileOptions && !showDateRangeInput && !showMultiSelectInput;

  return (
    <div style={{
      background: "var(--paper)",
      color: "var(--ink)",
      borderRadius: "var(--r-lg)",
      boxShadow: "var(--shadow-md)",
      padding: 0,
      overflow: "hidden",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        borderBottom: "1px solid var(--rule-soft)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #FDB94E, #C0492A)",
            display: "grid", placeItems: "center",
            fontSize: 12, fontWeight: 700, color: "#2A1F00",
            flex: "0 0 32px",
          }}>R</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}>Reiko — Meridian</div>
            <window.ConnectionStatus connection={connection} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => checkBackend()}
          disabled={connection.state === "checking"}
          aria-label="Retry backend connection"
          title="Retry backend connection"
          style={{
          width: 28, height: 28, borderRadius: 999, border: "none",
          background: "var(--tag)", color: "var(--ink)",
          cursor: connection.state === "checking" ? "default" : "pointer",
          display: "grid", placeItems: "center",
          opacity: connection.state === "checking" ? 0.6 : 1,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>

      {/* Conversation thread */}
      <div
        ref={threadRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 16px 4px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((m, i) => {
          const isLatest = i === messages.length - 1;
          return (
            <React.Fragment key={i}>
              <window.ChatBubble
                role={m.role}
                text={m.content}
                toolTrace={m.tool_trace}
                agentLabel={m.agentLabel}
                agentEmoji={m.agentEmoji}
                bookingOptions={m.bookingOptions}
                onSelectBookingOption={handleBookingOptionSelect}
              />
              {!busy && isLatest && m.role === "assistant" && Array.isArray(m.choices) && m.choices.length > 0 && (
                <window.QuickChoices options={m.choices} onChoose={send} />
              )}
            </React.Fragment>
          );
        })}
        {!busy && interviewStep?.options?.length && (
          showMultiSelectInput ? (
            <window.MultiChoices
              options={interviewStep.options}
              selected={multiChoices}
              onToggle={toggleMultiChoice}
              onSubmit={submitMultiChoices}
            />
          ) : (
            <window.QuickChoices options={interviewStep.options} onChoose={chooseProfileOption} />
          )
        )}
        {!busy && awaitingPlanConfirmation && (
          <window.QuickChoices options={PLAN_CONFIRM_OPTIONS} onChoose={handlePlanConfirmation} />
        )}
        {!busy && showBookingChoice && (
          <window.QuickChoices options={BOOKING_NEXT_OPTIONS} onChoose={handleBookingChoice} />
        )}
        {!busy && bookingQueue.length > 0 && bookingQueueIndex < bookingQueue.length && bookingQueue[bookingQueueIndex]?.options && (
          <window.QuickChoices options={bookingQueue[bookingQueueIndex].options} onChoose={(v) => handleBookingStepAnswer(v)} />
        )}
        {busy && <window.ChatBubble role="assistant" typing />}
      </div>

      {/* Composer */}
      <div style={{
        margin: "10px 12px 12px",
        padding: 4,
        background: "var(--bg)",
        borderRadius: 14,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        {showMultiSelectInput ? (
          <div style={{ flex: 1, padding: "8px 10px", color: "var(--muted)", fontSize: 13 }}>
            Select one or more above…
          </div>
        ) : showProfileOptions ? (
          <select
            value=""
            onChange={(e) => chooseProfileOption(e.target.value)}
            disabled={busy}
            aria-label="Choose profile answer"
            style={{
              flex: 1, padding: "8px 10px",
              background: "transparent", border: "none", outline: "none",
              color: "var(--ink)", fontSize: 13, fontFamily: "inherit",
              minWidth: 0,
            }}
          >
            <option value="" disabled>Choose an answer…</option>
            {interviewStep.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : showDateRangeInput ? (
          <div style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            minWidth: 0,
          }}>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              disabled={busy}
              aria-label="Departure date"
              style={{
                minWidth: 0, padding: "8px 10px",
                background: "transparent", border: "none", outline: "none",
                color: "var(--ink)", fontSize: 12, fontFamily: "inherit",
              }}
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              disabled={busy}
              aria-label="Return date"
              style={{
                minWidth: 0, padding: "8px 10px",
                background: "transparent", border: "none", outline: "none",
                color: "var(--ink)", fontSize: 12, fontFamily: "inherit",
              }}
            />
          </div>
        ) : (
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder={interviewStep?.placeholder || "Ask Reiko anything…"}
            disabled={busy}
            style={{
              flex: 1, padding: "8px 12px",
              background: "transparent", border: "none", outline: "none",
              color: "var(--ink)", fontSize: 13, fontFamily: "inherit",
              minWidth: 0,
            }}
          />
        )}
        <button
          onClick={() => showDateRangeInput ? submitDateRange() : send()}
          disabled={busy || showProfileOptions || (!canSubmitText && !canSubmitDateRange)}
          style={{
            width: 30, height: 30, borderRadius: 999, border: "none",
            background: (canSubmitText || canSubmitDateRange) ? "var(--ink)" : "var(--rule)",
            color: (canSubmitText || canSubmitDateRange) ? "var(--bg)" : "var(--muted)",
            cursor: (canSubmitText || canSubmitDateRange) ? "pointer" : "default",
            display: "grid", placeItems: "center",
            transition: "background 150ms ease",
          }}
          aria-label="Send"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}


window.AgentChat = AgentChat;
})();
