"""
Static packing rules with per-destination overrides for currency and power plug.
Docs are universal. Cash and Kit use a default template with destination-specific values.
Wear and activity-specific Kit come from Gemini.
"""

from app.models import ReminderGroup

# Only the bits that actually vary by destination.
_DESTINATION_OVERRIDES: dict[str, dict[str, str]] = {
    "japan": {
        "currency": "JPY",
        "currency_tip": "IC card (Suica/Pasmo) for transit and konbini",
        "power_plug": "",  # Type A — same as US, no adapter needed
    },
    "thailand": {
        "currency": "THB",
        "currency_tip": "Grab app for taxis, cash for markets",
        "power_plug": "",  # Type A/B/C compatible
    },
    "italy": {
        "currency": "EUR",
        "currency_tip": "Card widely accepted, carry small cash for cafes",
        "power_plug": "Type C/F/L power adapter",
    },
}

_DEFAULT_OVERRIDE: dict[str, str] = {
    "currency": "local currency",
    "currency_tip": "Carry small cash for vendors, card for larger purchases",
    "power_plug": "Check power plug type for your destination",
}


def _build_docs() -> ReminderGroup:
    return ReminderGroup(
        title="Docs",
        items=[
            "Passport valid 6+ months",
            "Travel insurance",
            "Passport copy stored separately",
        ],
    )


def _build_cash(override: dict[str, str]) -> ReminderGroup:
    currency = override["currency"]
    tip = override["currency_tip"]
    return ReminderGroup(
        title="Cash",
        items=[
            f"{currency} cash for small vendors",
            tip,
            "Credit card for hotels and larger purchases",
            "Notify bank of travel dates",
        ],
    )


def _build_kit(override: dict[str, str]) -> ReminderGroup:
    plug = override["power_plug"]
    items = [
        "eSIM or local SIM",
        "Portable charger",
    ]
    if plug:
        items.append(plug)
    return ReminderGroup(title="Kit", items=items)


def _override_for(destination_pack_id: str | None) -> dict[str, str]:
    return _DESTINATION_OVERRIDES.get(destination_pack_id or "", _DEFAULT_OVERRIDE)


def static_reminders(destination_pack_id: str | None) -> list[ReminderGroup]:
    override = _override_for(destination_pack_id)
    return [_build_docs(), _build_cash(override), _build_kit(override)]


def merge_reminders(
    generated: list[ReminderGroup],
    destination_pack_id: str | None,
) -> list[ReminderGroup]:
    static = static_reminders(destination_pack_id)

    gemini_wear: list[str] = []
    gemini_kit_extras: list[str] = []

    for group in generated:
        title = group.title.strip()
        items = [item.strip() for item in group.items if item.strip()]
        lower = title.lower()
        if any(kw in lower for kw in ("wear", "clothing", "clothes", "dress", "what to wear")):
            gemini_wear = items
        elif any(kw in lower for kw in ("kit", "gear", "equipment")):
            gemini_kit_extras = [item for item in items if item not in static[2].items]

    result = [static[0]]  # Docs

    if gemini_wear:
        result.append(ReminderGroup(title="Wear", items=gemini_wear))
    else:
        result.append(ReminderGroup(title="Wear", items=["Walking shoes", "Weather-appropriate layers"]))

    combined_kit = list(dict.fromkeys(static[2].items + gemini_kit_extras))
    result.append(ReminderGroup(title="Kit", items=combined_kit))

    result.append(static[1])  # Cash

    return result
