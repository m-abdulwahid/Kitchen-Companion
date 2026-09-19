"""Credit-free tests for the realtime relay protocol."""
from __future__ import annotations

import asyncio
import base64
import json
import unittest

from backend.app import CookingContext, audio_append, client_control_to_upstream, configure_upstream, session_update


class FakeUpstream:
    def __init__(self, incoming: list[dict]) -> None:
        self.incoming = [json.dumps(event) for event in incoming]
        self.sent: list[dict] = []

    async def recv(self) -> str:
        return self.incoming.pop(0)

    async def send(self, message: str) -> None:
        self.sent.append(json.loads(message))


class RealtimeRelayTests(unittest.TestCase):
    def setUp(self) -> None:
        self.context = CookingContext.from_message({
            "recipe_title": "Cozy Shakshuka",
            "current_step": "Soften onion and pepper.",
            "companion": {"name": "Remy", "voice": "Tina", "language": "en"},
        })

    def test_session_update_uses_audio_and_server_vad(self) -> None:
        event = session_update(self.context)
        self.assertEqual(event["type"], "session.update")
        self.assertEqual(event["session"]["modalities"], ["text", "audio"])
        self.assertEqual(event["session"]["turn_detection"]["type"], "server_vad")
        self.assertIn("Cozy Shakshuka", event["session"]["instructions"])

    def test_pcm_is_encoded_as_realtime_append(self) -> None:
        event = audio_append(b"\x01\x02\x03\x04")
        self.assertEqual(event["type"], "input_audio_buffer.append")
        self.assertEqual(base64.b64decode(event["audio"]), b"\x01\x02\x03\x04")

    def test_step_updates_prompt_without_reconnecting(self) -> None:
        events, updated = client_control_to_upstream(
            {"type": "step", "index": 1, "current_step": "Add garlic and cumin."}, self.context,
        )
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "session.update")
        self.assertEqual(updated.current_step, "Add garlic and cumin.")
        self.assertIn("Add garlic and cumin.", events[0]["session"]["instructions"])

    def test_interrupt_cancels_reply_and_clears_buffer(self) -> None:
        events, unchanged = client_control_to_upstream({"type": "interrupt"}, self.context)
        self.assertEqual([event["type"] for event in events], ["response.cancel", "input_audio_buffer.clear"])
        self.assertEqual(unchanged, self.context)

    def test_handshake_relay_has_no_network_dependency(self) -> None:
        upstream = FakeUpstream([{"type": "session.created"}, {"type": "session.updated"}])
        events = asyncio.run(configure_upstream(upstream, self.context))
        self.assertEqual([event["type"] for event in events], ["session.created", "session.updated"])
        self.assertEqual(upstream.sent[0]["type"], "session.update")


if __name__ == "__main__":
    unittest.main()
