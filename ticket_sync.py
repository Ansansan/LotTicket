"""The Bot 1 <-> Overlay ticket-sync wire contract.

This module intentionally has no Telegram, Pillow, or application imports.  It
is the small, deterministic boundary used by the bot and by the standard
library tests to produce the same canonical JSON that Overlay signs and
verifies with ``org.json.JSONObject``.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any


SYNC_CHAT_ID = -1003595738966
SYNC_TOPIC_ID = 17925

BOT1_ADMIN = "BOT1"
BOT1_ID_PREFIX = "BOT1-"
BOT1_ID_RE = re.compile(r"^BOT1-[0-9]+$")
BOT1_ID_WIDTH = 8

TYPE_TICKET = "ticket.v1"
TYPE_TICKET_EDIT = "ticket.edit.v1"
TYPE_TICKET_CANCEL = "ticket.cancel.v1"
TYPE_DRAW_RESULT = "draw.result.v1"
TYPE_TICKET_LAYOUT = "ticket.layout.v1"

CHANCE_PRICE_CENTS = 25
FOUR_DIGIT_PRICE_CENTS = 100

_ID_EVENT_TYPES = {TYPE_TICKET, TYPE_TICKET_EDIT, TYPE_TICKET_CANCEL, TYPE_TICKET_LAYOUT}


def format_bot1_ticket_id(ticket_id: int) -> str:
    """Return the stable, namespaced ID used by QR codes and Overlay Room."""

    if isinstance(ticket_id, bool) or not isinstance(ticket_id, int):
        raise ValueError("ticket_id must be a non-negative integer")
    if ticket_id < 0:
        raise ValueError("ticket_id must be a non-negative integer")
    return f"{BOT1_ID_PREFIX}{ticket_id:0{BOT1_ID_WIDTH}d}"


def parse_bot1_ticket_id(value: Any) -> int | None:
    """Parse a strict ``BOT1-<digits>`` ID, returning its numeric suffix."""

    if not isinstance(value, str) or not BOT1_ID_RE.fullmatch(value):
        return None
    return int(value[len(BOT1_ID_PREFIX):])


def is_bot1_ticket_id(value: Any) -> bool:
    return parse_bot1_ticket_id(value) is not None


def _text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value


def _integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be an integer")
    return value


def _positive_quantity(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("qty must be a positive integer")
    if isinstance(value, int):
        quantity = value
    elif isinstance(value, str) and re.fullmatch(r"[0-9]+", value.strip()):
        quantity = int(value.strip())
    else:
        raise ValueError("qty must be a positive integer")
    if quantity < 1:
        raise ValueError("qty must be a positive integer")
    return quantity


def _normalize_num(value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError("num must contain digits")
    number = str(value).strip()
    if not re.fullmatch(r"[0-9]+", number):
        raise ValueError("num must contain digits")
    if len(number) == 1:
        return f"0{number}"
    if len(number) in (2, 4):
        return number
    raise ValueError("num must contain 1, 2, or 4 digits")


def normalize_items(items: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Normalize Bot 1/Web-App or Overlay items to ``{num, qty}`` objects."""

    if isinstance(items, (str, bytes)) or not isinstance(items, Sequence):
        raise ValueError("items must be a sequence")
    normalized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, Mapping):
            raise ValueError("each item must be an object")
        normalized.append(
            {
                "num": _normalize_num(item.get("num")),
                "qty": _positive_quantity(item.get("qty")),
            }
        )
    return normalized


def item_total_cents(num: str, qty: int) -> int:
    if len(num) == 2:
        return CHANCE_PRICE_CENTS * qty
    if len(num) == 4:
        return FOUR_DIGIT_PRICE_CENTS * qty
    raise ValueError("num must contain 2 or 4 digits")


def items_total_cents(items: Sequence[Mapping[str, Any]]) -> int:
    return sum(item_total_cents(item["num"], item["qty"]) for item in normalize_items(items))


def items_total(items: Sequence[Mapping[str, Any]]) -> float:
    return items_total_cents(items) / 100.0


def items_for_database(items: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Return the legacy Bot 1 shape needed by its renderer and reports."""

    normalized = normalize_items(items)
    return [
        {
            "num": item["num"],
            "qty": item["qty"],
            "totalLine": item_total_cents(item["num"], item["qty"]) / 100.0,
        }
        for item in normalized
    ]


def build_ticket_event(
    *,
    ticket_id: int,
    lottery_type: str,
    date: str,
    items: Sequence[Mapping[str, Any]],
    created_at: int,
    originator_user_id: int = 0,
    admin: str = BOT1_ADMIN,
) -> dict[str, Any]:
    normalized = normalize_items(items)
    return {
        "type": TYPE_TICKET,
        "id": format_bot1_ticket_id(ticket_id),
        "admin": _text(admin, "admin"),
        "originator_user_id": _integer(originator_user_id, "originator_user_id"),
        "lottery_type": _text(lottery_type, "lottery_type"),
        "date": _text(date, "date"),
        "items": normalized,
        "total": items_total(normalized),
        "created_at": _integer(created_at, "created_at"),
    }


def build_edit_event(
    *,
    ticket_id: str | int,
    items: Sequence[Mapping[str, Any]],
    edited_at: int,
) -> dict[str, Any]:
    normalized = normalize_items(items)
    return {
        "type": TYPE_TICKET_EDIT,
        "id": _builder_ticket_id(ticket_id),
        "items": normalized,
        "total": items_total(normalized),
        "edited_at": _integer(edited_at, "edited_at"),
    }


def build_cancel_event(*, ticket_id: str | int, cancelled_at: int) -> dict[str, Any]:
    return {
        "type": TYPE_TICKET_CANCEL,
        "id": _builder_ticket_id(ticket_id),
        "cancelled_at": _integer(cancelled_at, "cancelled_at"),
    }


def build_draw_result_event(
    *,
    lottery_type: str,
    date: str,
    w1: str,
    w2: str,
    w3: str,
    set_at: int,
) -> dict[str, Any]:
    return {
        "type": TYPE_DRAW_RESULT,
        "lottery_type": _text(lottery_type, "lottery_type"),
        "date": _text(date, "date"),
        "w1": _text(str(w1), "w1"),
        "w2": _text(str(w2), "w2"),
        "w3": _text(str(w3), "w3"),
        "set_at": _integer(set_at, "set_at"),
    }


def _builder_ticket_id(ticket_id: str | int) -> str:
    if isinstance(ticket_id, int) and not isinstance(ticket_id, bool):
        return format_bot1_ticket_id(ticket_id)
    if isinstance(ticket_id, str) and is_bot1_ticket_id(ticket_id):
        return ticket_id
    raise ValueError("ticket_id must be a BOT1 ticket ID")


def _wire_total(value: Any) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("total must be numeric")
    if not math.isfinite(float(value)) or float(value) < 0:
        raise ValueError("total must be a finite non-negative number")
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def _canonical_event(event: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(event, Mapping):
        raise ValueError("event must be an object")
    event_type = event.get("type")
    if event_type == TYPE_TICKET:
        ticket_id = _builder_ticket_id(event.get("id"))
        items = normalize_items(event.get("items"))
        return {
            "type": TYPE_TICKET,
            "id": ticket_id,
            "admin": _text(event.get("admin"), "admin"),
            "originator_user_id": _integer(event.get("originator_user_id"), "originator_user_id"),
            "lottery_type": _text(event.get("lottery_type"), "lottery_type"),
            "date": _text(event.get("date"), "date"),
            "items": items,
            "total": _wire_total(event.get("total")),
            "created_at": _integer(event.get("created_at"), "created_at"),
        }
    if event_type == TYPE_TICKET_EDIT:
        items = normalize_items(event.get("items"))
        return {
            "type": TYPE_TICKET_EDIT,
            "id": _builder_ticket_id(event.get("id")),
            "items": items,
            "total": _wire_total(event.get("total")),
            "edited_at": _integer(event.get("edited_at"), "edited_at"),
        }
    if event_type == TYPE_TICKET_CANCEL:
        return {
            "type": TYPE_TICKET_CANCEL,
            "id": _builder_ticket_id(event.get("id")),
            "cancelled_at": _integer(event.get("cancelled_at"), "cancelled_at"),
        }
    if event_type == TYPE_DRAW_RESULT:
        return {
            "type": TYPE_DRAW_RESULT,
            "lottery_type": _text(event.get("lottery_type"), "lottery_type"),
            "date": _text(event.get("date"), "date"),
            "w1": _text(event.get("w1"), "w1"),
            "w2": _text(event.get("w2"), "w2"),
            "w3": _text(event.get("w3"), "w3"),
            "set_at": _integer(event.get("set_at"), "set_at"),
        }
    if event_type == TYPE_TICKET_LAYOUT:
        # Bot 1 does not create separator layouts, but recognizing the locked
        # type makes foreign Overlay layout messages safely ignorable.
        positions = event.get("separator_positions")
        if isinstance(positions, (str, bytes)) or not isinstance(positions, Sequence):
            raise ValueError("separator_positions must be a sequence")
        normalized_positions = [_integer(position, "separator_positions") for position in positions]
        return {
            "type": TYPE_TICKET_LAYOUT,
            "id": _builder_ticket_id(event.get("id")),
            "separator_positions": normalized_positions,
            "content_updated_at": _integer(event.get("content_updated_at"), "content_updated_at"),
            "content_hash": _text(event.get("content_hash"), "content_hash"),
        }
    raise ValueError("unknown sync event type")


def canonical_json(event: Mapping[str, Any]) -> str:
    """Serialize the event without ``hmac`` in Overlay's locked key order."""

    canonical = _canonical_event(event)
    return json.dumps(
        canonical,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    )


def sign_event(event: Mapping[str, Any], secret: str) -> str | None:
    if not isinstance(secret, str) or not secret.strip():
        return None
    payload = canonical_json(event).encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def signed_json(event: Mapping[str, Any], secret: str) -> str | None:
    signature = sign_event(event, secret)
    if signature is None:
        return None
    canonical = _canonical_event(event)
    canonical["hmac"] = signature
    return json.dumps(canonical, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def parse_event(json_text: str) -> dict[str, Any] | None:
    """Parse and normalize a Bot 1-relevant event, excluding ``hmac``."""

    try:
        raw = json.loads(json_text)
        if not isinstance(raw, Mapping):
            return None
        event = _canonical_event(raw)
        if event["type"] in _ID_EVENT_TYPES and not is_bot1_ticket_id(event["id"]):
            return None
        return event
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def verify_signed_event(json_text: str, secret: str) -> dict[str, Any] | None:
    """Verify an HMAC and return a normalized event, or ``None`` on failure."""

    if not isinstance(secret, str) or not secret.strip():
        return None
    try:
        raw = json.loads(json_text)
        if not isinstance(raw, Mapping):
            return None
        supplied = raw.get("hmac")
        if not isinstance(supplied, str) or not supplied:
            return None
        event = parse_event(json_text)
        if event is None:
            return None
        expected = sign_event(event, secret)
        if expected is None or not hmac.compare_digest(expected, supplied.lower()):
            return None
        return event
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def select_ready_outbox_rows(
    connection: Any,
    now_ms: int,
    max_events: int = 20,
) -> list[tuple[Any, ...]]:
    """Return a contiguous oldest-first prefix of ready outbox rows.

    A row whose retry time has not arrived blocks every newer row.  Keeping
    this selection rule in a small SQLite-only helper makes the ordering
    invariant deterministic and testable without importing the Telegram bot.
    """

    if isinstance(max_events, bool) or not isinstance(max_events, int) or max_events <= 0:
        return []
    rows = connection.execute(
        "SELECT id, event_type, payload, attempts, next_attempt_at "
        "FROM ticket_sync_outbox ORDER BY id ASC LIMIT ?",
        (max_events,),
    ).fetchall()
    ready = []
    for row in rows:
        if int(row[4]) > now_ms:
            break
        ready.append(tuple(row))
    return ready


# Names used by the bot are intentionally explicit; these aliases keep the
# contract convenient for small scripts and future integrations.
build_ticket_create_event = build_ticket_event
build_ticket_edit_event = build_edit_event
build_ticket_cancel_event = build_cancel_event
build_draw_event = build_draw_result_event
serialize_canonical = canonical_json
serialize_signed = signed_json
verify_event = verify_signed_event
