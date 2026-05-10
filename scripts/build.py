#!/usr/bin/env python3
"""
Validate per-event / per-speaker / master JSON files and build the
denormalized aggregates (data/events.json, data/speakers.json) consumed
by the front-end.

Usage:
    python3 scripts/build.py            # validate + write aggregates
    python3 scripts/build.py --check    # validate only; fail if aggregates
                                        # would change (used by CI)

Layered validation:
    1. JSON syntax (json.load)
    2. Schema validation (jsonschema, against schemas/*.schema.json)
    3. Cross-file rules:
        - event_id matches filename
        - en_abbr unique across events
        - topic_id refers to a known topic
        - locations[] refer to known locations
        - speakers[].speaker refers to a known speaker file
        - recap_links[].speaker refers to a known speaker
        - speakers[].timeslot exists in datetimes[]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    sys.stderr.write(
        "Missing dependency 'jsonschema'. Run via uv:\n"
        "    uv run scripts/build.py\n"
        "Or sync the project venv first:\n"
        "    uv sync\n"
    )
    sys.exit(2)


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCHEMAS = ROOT / "schemas"

EVENTS_DIR = DATA / "events"
SPEAKERS_DIR = DATA / "speakers"
TOPICS_FILE = DATA / "topics.json"
LOCATIONS_FILE = DATA / "locations.json"

OUT_EVENTS = DATA / "events.json"
OUT_SPEAKERS = DATA / "speakers.json"


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_schema(name: str) -> Draft202012Validator:
    return Draft202012Validator(load_json(SCHEMAS / name))


class ValidationErrors:
    """Collect errors so we can report them all in one run instead of
    failing on the first one."""

    def __init__(self) -> None:
        self.entries: list[str] = []

    def add(self, where: str, msg: str) -> None:
        self.entries.append(f"  [{where}] {msg}")

    def raise_if_any(self) -> None:
        if not self.entries:
            return
        sys.stderr.write(
            f"\nValidation failed with {len(self.entries)} error(s):\n"
        )
        for e in self.entries:
            sys.stderr.write(e + "\n")
        sys.exit(1)


def validate_with_schema(
    errors: ValidationErrors, where: str, validator: Draft202012Validator, doc
) -> bool:
    found = False
    for err in sorted(validator.iter_errors(doc), key=lambda e: e.path):
        loc = "/".join(str(p) for p in err.path) or "<root>"
        errors.add(where, f"{loc}: {err.message}")
        found = True
    return not found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if aggregates would change instead of writing them.",
    )
    args = parser.parse_args()

    errors = ValidationErrors()

    # Load schemas
    event_v = load_schema("event.schema.json")
    speaker_v = load_schema("speaker.schema.json")
    topic_v = load_schema("topic.schema.json")
    location_v = load_schema("location.schema.json")

    # Load + validate master tables
    topics = load_json(TOPICS_FILE)
    validate_with_schema(errors, "topics.json", topic_v, topics)
    topic_ids = {t["id"] for t in topics if isinstance(t, dict) and "id" in t}

    locations = load_json(LOCATIONS_FILE)
    validate_with_schema(errors, "locations.json", location_v, locations)
    location_ids = {l["id"] for l in locations if isinstance(l, dict) and "id" in l}

    # Load + validate speakers
    speakers: dict[str, dict] = {}
    for path in sorted(SPEAKERS_DIR.glob("*.json")):
        handle = path.stem
        doc = load_json(path)
        if validate_with_schema(errors, f"speakers/{path.name}", speaker_v, doc):
            speakers[handle] = doc

    # Load + validate events
    events: list[dict] = []
    seen_en_abbrs: dict[str, str] = {}
    for path in sorted(
        EVENTS_DIR.glob("*.json"),
        key=lambda p: int(p.stem) if p.stem.isdigit() else 0,
    ):
        if not path.stem.isdigit():
            errors.add(
                f"events/{path.name}",
                "filename must be a positive integer (e.g. 1.json, 47.json)",
            )
            continue
        doc = load_json(path)
        where = f"events/{path.name}"
        if not validate_with_schema(errors, where, event_v, doc):
            continue

        # event_id must equal filename
        if doc["event_id"] != path.stem:
            errors.add(
                where,
                f"event_id '{doc['event_id']}' must equal filename '{path.stem}'",
            )

        # en_abbr unique
        nabbr = doc["en_abbr"]
        if nabbr in seen_en_abbrs:
            errors.add(
                where,
                f"en_abbr '{nabbr}' already used by {seen_en_abbrs[nabbr]}",
            )
        else:
            seen_en_abbrs[nabbr] = path.name

        # topic_id known
        if doc["topic_id"] not in topic_ids:
            errors.add(
                where,
                f"topic_id '{doc['topic_id']}' not found in data/topics.json",
            )

        # locations known
        for loc in doc["locations"]:
            if loc not in location_ids:
                errors.add(
                    where,
                    f"location '{loc}' not found in data/locations.json",
                )

        # speakers known + timeslots match
        valid_timeslots = {ts["timeslot"] for ts in doc["datetimes"]}
        for sp in doc["speakers"]:
            if sp["speaker"] not in speakers:
                errors.add(
                    where,
                    f"speaker '{sp['speaker']}' not found in data/speakers/",
                )
            if sp["timeslot"] not in valid_timeslots:
                errors.add(
                    where,
                    f"speakers[].timeslot {sp['timeslot']} has no matching "
                    f"entry in datetimes[]",
                )

        # recap_links — speaker+timeslot must match if present
        for rl in doc.get("recap_links", []):
            if "speaker" in rl and rl["speaker"] not in speakers:
                errors.add(
                    where,
                    f"recap_links[].speaker '{rl['speaker']}' not found in "
                    f"data/speakers/",
                )
            if "timeslot" in rl and rl["timeslot"] not in valid_timeslots:
                errors.add(
                    where,
                    f"recap_links[].timeslot {rl['timeslot']} has no matching "
                    f"entry in datetimes[]",
                )

        events.append(doc)

    errors.raise_if_any()

    # Build denormalized output
    aggregates = build_aggregates(events, speakers, topics, locations)

    if args.check:
        diffs = []
        for path, expected in aggregates.items():
            actual = load_json(path) if path.exists() else None
            if actual != expected:
                diffs.append(str(path.relative_to(ROOT)))
        if diffs:
            sys.stderr.write(
                "\nAggregates are out of date. Run:\n"
                "    uv run scripts/build.py\n"
                "and commit the result. Out-of-date files:\n"
            )
            for d in diffs:
                sys.stderr.write(f"  - {d}\n")
            return 1
        print("OK: validation passed; aggregates match committed files.")
        return 0

    for path, content in aggregates.items():
        write_json(path, content)
        print(f"wrote {path.relative_to(ROOT)}")
    print(
        f"OK: {len(events)} event(s), {len(speakers)} speaker(s), "
        f"{len(topics)} topic(s), {len(locations)} location(s)."
    )
    return 0


def build_aggregates(events, speakers, topics, locations):
    topics_by_id = {t["id"]: t for t in topics}
    locations_by_id = {l["id"]: l for l in locations}

    enriched_events = []
    for ev in events:
        # Sort speakers and recap_links by timeslot for stable output.
        speaker_entries = [
            {**sp, "info": speakers[sp["speaker"]]}
            for sp in sorted(ev["speakers"], key=lambda s: s["timeslot"])
        ]
        enriched_events.append(
            {
                "event_id": ev["event_id"],
                "en_abbr": ev["en_abbr"],
                "title": ev["title"],
                "datetimes": sorted(ev["datetimes"], key=lambda d: d["timeslot"]),
                "locations": [locations_by_id[i] for i in ev["locations"]],
                "speakers": speaker_entries,
                "register_links": ev.get("register_links", []),
                "recap_links": sorted(
                    ev.get("recap_links", []),
                    key=lambda r: (r.get("timeslot", 0), r.get("type", "")),
                ),
                "topic": topics_by_id[ev["topic_id"]],
                "target_audiences": ev["target_audiences"],
            }
        )
    # Newest first by earliest datetime_start.
    enriched_events.sort(
        key=lambda e: e["datetimes"][0]["datetime_start"], reverse=True
    )

    enriched_speakers = sorted(
        ({"handle": h, **info} for h, info in speakers.items()),
        key=lambda s: s["handle"].lower(),
    )

    return {
        OUT_EVENTS: enriched_events,
        OUT_SPEAKERS: enriched_speakers,
    }


def write_json(path: Path, data) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
