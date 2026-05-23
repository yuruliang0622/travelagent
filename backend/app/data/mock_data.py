from copy import deepcopy

from app.models import DestinationPack, Itinerary, ProviderLimit, UserProfile


JAPAN_PACK = DestinationPack(
    id="japan",
    country="Japan",
    launch_status="active",
    regions=["Tokyo", "Hakone", "Kyoto", "Osaka"],
    cultural_notes=[
        "Carry some cash for older shops and small restaurants.",
        "Cluster days by neighborhood to avoid cross-city backtracking.",
        "Reserve ryokan dinners, museums, and themed cafes early.",
    ],
    transport_notes=[
        "Use IC cards for local transit.",
        "Reserve Shinkansen seats for long-distance transfers.",
    ],
    seasonal_notes=[
        "October is good for walking, with light rain still possible.",
        "Popular weekends can increase hotel prices.",
    ],
)

DESTINATION_PACKS = [JAPAN_PACK]

PROVIDER_LIMITS = [
    ProviderLimit(
        provider="Google Maps Platform",
        domain="maps",
        launch_role="Canonical map/place enrichment and handoff URLs.",
        realistic_limit="Use SKU-level quotas and field masks; avoid caching restricted Places content.",
        integration_note="Store internal place records and provider IDs separately. Refresh live details on demand.",
    ),
    ProviderLimit(
        provider="Amadeus Self-Service",
        domain="flights",
        launch_role="Flight search prototype and price-check hints.",
        realistic_limit="10 TPS test, 40 TPS production for most APIs.",
        integration_note="Keep v1 as search/handoff unless real ticketing access is approved.",
    ),
    ProviderLimit(
        provider="Expedia Rapid / Booking.com Demand",
        domain="hotels",
        launch_role="Future hotel shopping adapters.",
        realistic_limit="Partner-specific capacity; Booking.com sandbox is commonly low-throughput.",
        integration_note="Represent hotels as booking checklist tasks until partner credentials exist.",
    ),
    ProviderLimit(
        provider="Google Places + curated Japan restaurant data",
        domain="restaurants",
        launch_role="Restaurant discovery for launch.",
        realistic_limit="Yelp-style public APIs are too limited for primary global coverage.",
        integration_note="Do not scrape Tabelog. Use approved partner APIs or handoff links.",
    ),
]


DEFAULT_PROFILE = UserProfile(
    id="primary",
    name="Yuru",
    email="",
    home_airport="SFO",
    passport_country="United States",
    travelers=2,
    budget="Moderate",
    pace="balanced",
    food_preferences=["ramen", "street snacks", "romantic dinner"],
    interests=["food", "design shops", "temples", "anime", "ryokan"],
    constraints=["no early mornings", "avoid overpacked transit days"],
    hotel_preferences=["near transit", "private bathroom", "quiet area"],
    accessibility_needs=["limit early starts"],
    memory_consent=True,
)


MOCK_ITINERARY = Itinerary(
    id="japan-first-demo",
    title="Japan First-Timer Food + Culture Route",
    subtitle="A global Trip Agent demo launching with the Japan destination pack",
    dates="Oct 12 - Oct 18, 2026",
    destination_pack_id="japan",
    summary={
        "hotel": "Nihonbashi hotel base, Hakone ryokan, Kyoto station hotel",
        "flights": "Arrive HND 15:10 · Depart KIX 18:40",
        "transit": "Suica IC card · Reserved Shinkansen",
        "budget": "JPY ¥155 ≈ USD $1\nLocal cash + card mix",
    },
    profile=DEFAULT_PROFILE,
    places=[
        {
            "id": "yanaka",
            "name": "Yanaka Ginza",
            "category": "culture",
            "neighborhood": "Yanaka",
            "lat": 35.7277,
            "lng": 139.7666,
            "cost": "$",
            "duration": "2 hr",
            "source": "destination-pack",
            "why_it_fits": "A softer old-Tokyo neighborhood rhythm.",
            "google_maps_url": "https://www.google.com/maps/search/?api=1&query=Yanaka+Ginza",
        },
        {
            "id": "nakano",
            "name": "Nakano Broadway",
            "category": "shopping",
            "neighborhood": "Nakano",
            "lat": 35.7091,
            "lng": 139.6659,
            "cost": "$$",
            "duration": "2.5 hr",
            "source": "destination-pack",
            "why_it_fits": "A compact look at Japanese collector culture.",
            "google_maps_url": "https://www.google.com/maps/search/?api=1&query=Nakano+Broadway",
        },
        {
            "id": "hakone",
            "name": "Hakone Ryokan",
            "category": "wellness",
            "neighborhood": "Hakone",
            "lat": 35.2324,
            "lng": 139.1069,
            "cost": "$$$",
            "duration": "1 night",
            "source": "destination-pack",
            "why_it_fits": "Onsen culture is the main experience.",
            "google_maps_url": "https://www.google.com/maps/search/?api=1&query=Hakone+ryokan",
        },
        {
            "id": "fushimi",
            "name": "Fushimi Inari",
            "category": "attraction",
            "neighborhood": "Kyoto",
            "lat": 34.9671,
            "lng": 135.7727,
            "cost": "Free",
            "duration": "2 hr",
            "source": "destination-pack",
            "why_it_fits": "The torii gates are offerings, not just a photo spot.",
            "google_maps_url": "https://www.google.com/maps/search/?api=1&query=Fushimi+Inari",
        },
        {
            "id": "namba",
            "name": "Dotonbori + Namba",
            "category": "restaurant",
            "neighborhood": "Osaka",
            "lat": 34.6687,
            "lng": 135.5016,
            "cost": "$$",
            "duration": "3 hr",
            "source": "destination-pack",
            "why_it_fits": "Osaka casual food culture is the highlight.",
            "google_maps_url": "https://www.google.com/maps/search/?api=1&query=Dotonbori+Namba",
        },
    ],
    days=[
        {
            "id": "overview",
            "day_number": 0,
            "date": "Overview",
            "title": "Tokyo -> Hakone -> Kyoto -> Osaka",
            "area": "Route",
            "color": "#2563eb",
            "place_ids": ["yanaka", "hakone", "fushimi", "namba"],
            "segments": [
                {
                    "time": "Route",
                    "title": "Start in Tokyo, slow down in Hakone, finish through Kansai",
                    "description": "Avoid backtracking by ending near Kansai airport.",
                    "place_ids": ["yanaka", "hakone", "fushimi", "namba"],
                    "travel_note": "No same-day airport backtrack.",
                    "cost": "Balanced",
                }
            ],
        },
        {
            "id": "day-2",
            "day_number": 2,
            "date": "Oct 13",
            "title": "Old Tokyo Food + Anime Finds",
            "area": "Yanaka / Nakano",
            "color": "#22c55e",
            "place_ids": ["yanaka", "nakano"],
            "segments": [
                {
                    "time": "10:45",
                    "title": "Yanaka Ginza snack walk",
                    "description": "Old Tokyo snacks and small shops.",
                    "place_ids": ["yanaka"],
                    "travel_note": "Clustered walking route.",
                    "cost": "$",
                },
                {
                    "time": "15:00",
                    "title": "Nakano Broadway collectibles",
                    "description": "Anime, manga, and vintage shopping.",
                    "place_ids": ["nakano"],
                    "travel_note": "35-45 min from Yanaka.",
                    "cost": "$$",
                },
            ],
        },
        {
            "id": "day-5",
            "day_number": 5,
            "date": "Oct 16",
            "title": "Kyoto Icons Without the Dawn Wakeup",
            "area": "Kyoto",
            "color": "#ef4444",
            "place_ids": ["fushimi"],
            "segments": [
                {
                    "time": "10:30",
                    "title": "Fushimi Inari late-morning loop",
                    "description": "Torii gates, shrine culture, and a partial mountain walk.",
                    "place_ids": ["fushimi"],
                    "travel_note": "Free entry; no booking needed.",
                    "cost": "Free",
                }
            ],
        },
    ],
    reminders=[
        {"title": "Daily carry", "items": ["Passport copy", "Small yen cash", "Portable charger"]},
        {"title": "Comfort", "items": ["Walking shoes", "Light rain jacket", "Coin pouch"]},
        {"title": "Japan basics", "items": ["IC card ready", "eSIM", "Trash bag"]},
    ],
    booking_checklist=[
        {
            "id": "flight-handoff",
            "type": "flight",
            "title": "Track open-jaw flight: HND arrival, KIX departure",
            "provider": "Flight search handoff",
            "status": "needs-review",
            "deadline": "Before price alert expires",
            "action_label": "Prepare search",
            "handoff_url": "https://www.google.com/travel/flights",
        },
        {
            "id": "hakone-ryokan",
            "type": "hotel",
            "title": "Confirm Hakone ryokan with dinner included",
            "provider": "Ryokan handoff",
            "status": "needs-review",
            "deadline": "As early as possible",
            "action_label": "Compare ryokan",
            "handoff_url": "https://www.google.com/maps/search/Hakone+ryokan+dinner",
        },
    ],
    assumptions=[
        "No real booking is performed in v1.",
        "Japan is the first active destination pack.",
        "Prices are estimates until live provider integrations are approved.",
    ],
)


def itinerary_for_profile(profile: UserProfile | None) -> Itinerary:
    itinerary = deepcopy(MOCK_ITINERARY)
    if profile is not None:
        itinerary.profile = profile
    return itinerary
