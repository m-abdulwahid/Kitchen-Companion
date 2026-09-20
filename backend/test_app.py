"""Credit-free tests for the realtime relay protocol."""
from __future__ import annotations

import asyncio
import base64
import json
import unittest
from unittest.mock import patch

from backend.app import (
    CookingContext,
    RelayState,
    audio_append,
    build_system_prompt,
    client_control_to_upstream,
    configure_upstream,
    persist_voice_memory,
    session_update,
)


class FakeUpstream:
    def __init__(self, incoming: list[dict]) -> None:
        self.incoming = [json.dumps(event) for event in incoming]
        self.sent: list[dict] = []

    async def recv(self) -> str:
        return self.incoming.pop(0)

    async def send(self, message: str) -> None:
        self.sent.append(json.loads(message))


class FakeClient:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def send_json(self, event: dict) -> None:
        self.events.append(event)


class FakeMemory:
    enabled = True

    def __init__(self) -> None:
        self.remembered: list[tuple[str, str]] = []

    async def remember(self, profile_id: str, fact: str) -> bool:
        self.remembered.append((profile_id, fact))
        return True

    async def forget(self, profile_id: str, fact: str) -> bool:
        return False

    async def recall(self, profile_id: str, query: str) -> list[str]:
        return ["allergic to peanuts"]


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
        self.assertEqual(event["session"]["turn_detection"]["threshold"], 0.7)
        self.assertEqual(event["session"]["turn_detection"]["silence_duration_ms"], 800)
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

    def test_camera_observation_is_added_to_the_initial_live_prompt(self) -> None:
        context = CookingContext.from_message({
            "recipe_title": "Cozy Shakshuka",
            "current_step": "Soften onion and pepper.",
            "camera_observation": "Onions are softening in a skillet.",
            "companion": {"name": "Ella", "voice": "Tina", "language": "en"},
        })
        prompt = build_system_prompt(context)
        self.assertIn("Latest verified camera observation", prompt)
        self.assertIn("Onions are softening in a skillet.", prompt)

    def test_vision_control_refreshes_live_prompt_without_a_new_connection(self) -> None:
        events, updated = client_control_to_upstream(
            {"type": "vision", "observation": "Noodles are simmering in a skillet."}, self.context,
        )
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "session.update")
        self.assertEqual(updated.observation, "Noodles are simmering in a skillet.")
        self.assertIn("Noodles are simmering in a skillet.", events[0]["session"]["instructions"])

    def test_interrupt_cancels_reply_and_clears_buffer(self) -> None:
        events, unchanged = client_control_to_upstream({"type": "interrupt"}, self.context)
        self.assertEqual([event["type"] for event in events], ["response.cancel", "input_audio_buffer.clear"])
        self.assertEqual(unchanged, self.context)

    def test_proactive_message_requests_a_spoken_camera_update(self) -> None:
        events, unchanged = client_control_to_upstream(
            {"type": "proactive", "text": "The onions are starting to scorch."}, self.context,
        )
        self.assertEqual([event["type"] for event in events], ["conversation.item.create", "response.create"])
        self.assertIn("Say exactly this", events[0]["item"]["content"][0]["text"])
        self.assertEqual(unchanged, self.context)

    def test_handshake_relay_has_no_network_dependency(self) -> None:
        upstream = FakeUpstream([{"type": "session.created"}, {"type": "session.updated"}])
        events = asyncio.run(configure_upstream(upstream, self.context))
        self.assertEqual([event["type"] for event in events], ["session.created", "session.updated"])
        self.assertEqual(upstream.sent[0]["type"], "session.update")

    def test_explicit_voice_memory_is_saved_and_refreshes_the_live_prompt(self) -> None:
        memory = FakeMemory()
        client = FakeClient()
        upstream = FakeUpstream([])
        state = RelayState(self.context, memory_profile_id="cook_12345678")
        with patch("backend.app.LIVE_MEMORY", memory):
            asyncio.run(persist_voice_memory(
                client, upstream, state, "Please remember that I am allergic to peanuts.",
            ))
        self.assertEqual(memory.remembered, [("cook_12345678", "I am allergic to peanuts")])
        self.assertIn("allergic to peanuts", state.context.memory)
        self.assertEqual(upstream.sent[0]["type"], "session.update")
        self.assertEqual(client.events, [{"type": "relay.memory", "action": "remember", "changed": True}])


if __name__ == "__main__":
    unittest.main()
