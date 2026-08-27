import json
import sqlite3
import unittest

from ticket_sync import (
    TYPE_DRAW_RESULT,
    TYPE_TICKET,
    TYPE_TICKET_CANCEL,
    TYPE_TICKET_EDIT,
    build_cancel_event,
    build_draw_result_event,
    build_edit_event,
    build_ticket_event,
    canonical_json,
    format_bot1_ticket_id,
    is_bot1_ticket_id,
    items_for_database,
    items_total_cents,
    parse_bot1_ticket_id,
    parse_event,
    select_ready_outbox_rows,
    signed_json,
    verify_signed_event,
)


SYNC_TEST_KEY = "test-secret-9001"


class TicketSyncContractTests(unittest.TestCase):
    def setUp(self):
        self.ticket = build_ticket_event(
            ticket_id=123,
            admin="BOT1",
            originator_user_id=987654321,
            lottery_type="Tica 5:30 pm",
            date="2026-05-15",
            items=[{"num": "01", "qty": 2}, {"num": "1946", "qty": 1}],
            created_at=1716800000000,
        )

    def test_bot1_id_namespace_is_strict_and_stable(self):
        self.assertEqual(format_bot1_ticket_id(123), "BOT1-00000123")
        self.assertEqual(parse_bot1_ticket_id("BOT1-00000123"), 123)
        self.assertTrue(is_bot1_ticket_id("BOT1-00000123"))
        self.assertFalse(is_bot1_ticket_id("BOT2-00000123"))
        self.assertFalse(is_bot1_ticket_id("BOT1-12x"))
        self.assertFalse(is_bot1_ticket_id("bot1-00000123"))

    def test_ticket_canonical_json_matches_overlay_field_order(self):
        self.assertEqual(
            canonical_json(self.ticket),
            '{"type":"ticket.v1","id":"BOT1-00000123","admin":"BOT1",'
            '"originator_user_id":987654321,"lottery_type":"Tica 5:30 pm",'
            '"date":"2026-05-15","items":[{"num":"01","qty":2},'
            '{"num":"1946","qty":1}],"total":1.5,"created_at":1716800000000}',
        )

    def test_edit_cancel_and_result_canonical_json(self):
        edit = build_edit_event(
            ticket_id="BOT1-00000123",
            items=[{"num": "99", "qty": 2}],
            edited_at=1716800100000,
        )
        cancel = build_cancel_event(
            ticket_id="BOT1-00000123", cancelled_at=1716800200000
        )
        result = build_draw_result_event(
            lottery_type="Nacional 3:00 pm",
            date="2026-05-15",
            w1="1234",
            w2="5678",
            w3="9012",
            set_at=1716800300000,
        )
        self.assertTrue(canonical_json(edit).startswith('{"type":"ticket.edit.v1","id":'))
        self.assertEqual(
            canonical_json(edit),
            '{"type":"ticket.edit.v1","id":"BOT1-00000123",'
            '"items":[{"num":"99","qty":2}],"total":0.5,'
            '"edited_at":1716800100000}',
        )
        self.assertEqual(
            canonical_json(cancel),
            '{"type":"ticket.cancel.v1","id":"BOT1-00000123",'
            '"cancelled_at":1716800200000}',
        )
        self.assertEqual(
            canonical_json(result),
            '{"type":"draw.result.v1","lottery_type":"Nacional 3:00 pm",'
            '"date":"2026-05-15","w1":"1234","w2":"5678",'
            '"w3":"9012","set_at":1716800300000}',
        )
        self.assertEqual(edit["type"], TYPE_TICKET_EDIT)
        self.assertEqual(cancel["type"], TYPE_TICKET_CANCEL)
        self.assertEqual(result["type"], TYPE_DRAW_RESULT)

    def test_signed_ticket_is_byte_stable_and_has_hmac_as_final_key(self):
        expected = (
            '{"type":"ticket.v1","id":"BOT1-00000123","admin":"BOT1",'
            '"originator_user_id":987654321,"lottery_type":"Tica 5:30 pm",'
            '"date":"2026-05-15","items":[{"num":"01","qty":2},'
            '{"num":"1946","qty":1}],"total":1.5,"created_at":1716800000000,'
            '"hmac":"92c21a09861a4b2866e2882d24a20bac86f9af1ab7df17e4eadb0589e63af173"}'
        )
        self.assertEqual(signed_json(self.ticket, SYNC_TEST_KEY), expected)
        self.assertEqual(verify_signed_event(expected, SYNC_TEST_KEY), self.ticket)
        self.assertEqual(list(json.loads(expected).keys())[-1], "hmac")

    def test_verification_rejects_tampering_missing_secret_and_foreign_id(self):
        signed = signed_json(self.ticket, SYNC_TEST_KEY)
        self.assertIsNotNone(signed)
        self.assertIsNone(verify_signed_event(signed.replace("BOT1-00000123", "BOT1-99999999"), SYNC_TEST_KEY))
        self.assertIsNone(verify_signed_event(signed.replace(",\"hmac\":", ",\"ignored\":", 1), SYNC_TEST_KEY))
        self.assertIsNone(verify_signed_event(signed, "wrong-secret"))
        self.assertIsNone(verify_signed_event(signed, ""))

        foreign = json.loads(signed)
        foreign["id"] = "NATIVE-00000123"
        foreign_without_hmac = dict(foreign)
        foreign_without_hmac.pop("hmac")
        foreign["hmac"] = signed_json(self.ticket, SYNC_TEST_KEY).split('"hmac":"', 1)[1][:-2]
        self.assertIsNone(parse_event(json.dumps(foreign_without_hmac)))

    def test_integral_totals_are_serialized_without_decimal_suffix(self):
        event = build_edit_event(
            ticket_id=123,
            items=[{"num": "1946", "qty": 1}],
            edited_at=12,
        )
        self.assertEqual(event["total"], 1.0)
        self.assertIn('"total":1,', canonical_json(event))
        self.assertNotIn('"total":1.0', canonical_json(event))

    def test_overlay_pricing_reconstruction_uses_canonical_unit_prices(self):
        items = [{"num": "01", "qty": 2}, {"num": "1946", "qty": 3}]
        self.assertEqual(items_total_cents(items), 350)
        self.assertEqual(
            items_for_database(items),
            [
                {"num": "01", "qty": 2, "totalLine": 0.5},
                {"num": "1946", "qty": 3, "totalLine": 3.0},
            ],
        )

    def test_item_normalization_pads_one_digit_chances_and_rejects_bad_values(self):
        event = build_edit_event(
            ticket_id=123, items=[{"num": 4, "qty": "2"}], edited_at=12
        )
        self.assertEqual(event["items"], [{"num": "04", "qty": 2}])
        with self.assertRaises(ValueError):
            build_edit_event(ticket_id=123, items=[{"num": "123", "qty": 1}], edited_at=12)
        with self.assertRaises(ValueError):
            build_edit_event(ticket_id=123, items=[{"num": "04", "qty": 0}], edited_at=12)

    def test_outbox_selection_stops_at_first_backed_off_row(self):
        connection = sqlite3.connect(":memory:")
        try:
            connection.execute(
                "CREATE TABLE ticket_sync_outbox ("
                "id INTEGER PRIMARY KEY, event_type TEXT NOT NULL, "
                "payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, "
                "next_attempt_at INTEGER NOT NULL DEFAULT 0)"
            )
            connection.executemany(
                "INSERT INTO ticket_sync_outbox "
                "(id, event_type, payload, attempts, next_attempt_at) "
                "VALUES (?, ?, ?, ?, ?)",
                [
                    (1, TYPE_TICKET, "oldest", 1, 500),
                    (2, TYPE_TICKET, "newer-ready", 0, 0),
                    (3, TYPE_TICKET, "newest-ready", 0, 0),
                ],
            )

            self.assertEqual(select_ready_outbox_rows(connection, 100), [])

            connection.execute(
                "UPDATE ticket_sync_outbox SET next_attempt_at = 0 WHERE id = 1"
            )
            connection.execute(
                "UPDATE ticket_sync_outbox SET next_attempt_at = 500 WHERE id = 2"
            )
            self.assertEqual(
                [row[0] for row in select_ready_outbox_rows(connection, 100)],
                [1],
            )

            connection.execute(
                "UPDATE ticket_sync_outbox SET next_attempt_at = 0 WHERE id = 2"
            )
            self.assertEqual(
                [row[0] for row in select_ready_outbox_rows(connection, 100)],
                [1, 2, 3],
            )
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
