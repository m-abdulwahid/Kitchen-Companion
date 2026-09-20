"""Credit-free tests for the Backboard memory boundary."""
import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import backboard_memory as memory  # noqa: E402


class MemoryCommandTests(unittest.TestCase):
    def test_only_explicit_remember_or_forget_phrases_are_saved(self):
        self.assertEqual(memory.extract_memory_command("remember that I am allergic to peanuts"),
                         memory.MemoryCommand("remember", "I am allergic to peanuts"))
        self.assertEqual(memory.extract_memory_command("Please forget that I hate cilantro."),
                         memory.MemoryCommand("forget", "I hate cilantro"))
        self.assertEqual(memory.extract_memory_command("Ella, remember that I am allergic to peanuts."),
                         memory.MemoryCommand("remember", "I am allergic to peanuts"))
        self.assertIsNone(memory.extract_memory_command("I am allergic to peanuts"))
        self.assertIsNone(memory.extract_memory_command("remember"))

    def test_profile_ids_are_random_id_shapes_not_names(self):
        self.assertEqual(memory.valid_profile_id("a3c1b4d5-1111-2222-3333-123456789abc"),
                         "a3c1b4d5-1111-2222-3333-123456789abc")
        self.assertEqual(memory.valid_profile_id("nora@example.com"), "")
        self.assertEqual(memory.valid_profile_id("display name"), "")

    def test_assistant_rows_accepts_backboards_array_response(self):
        row = {"assistant_id": "assistant_123", "name": "Kitchen Companion Memory · cook_12345678"}
        self.assertEqual(memory.assistant_rows([row]), [row])
        self.assertEqual(memory.assistant_rows({"assistants": [row]}), [row])
        self.assertEqual(memory.assistant_rows({"assistants": "wrong"}), [])

    def test_existing_array_assistant_is_reused_without_a_new_write(self):
        profile_id = "cook_12345678"
        row = {"assistant_id": "assistant_123", "name": memory.assistant_name(profile_id)}

        class Client(memory.BackboardMemory):
            def __init__(self):
                super().__init__(api_key="test-key")
                self.calls: list[tuple[str, str]] = []

            async def _request(self, method, path, **kwargs):
                self.calls.append((method, path))
                return [row]

        client = Client()
        self.assertEqual(asyncio.run(client.ensure_assistant(profile_id)), "assistant_123")
        self.assertEqual(client.calls, [("GET", "/assistants")])

    def test_context_is_short_and_labeled(self):
        context = memory.memory_context(["Avoid peanuts.", "Use less salt.", "Likes spicy food.", "ignored"])
        self.assertIn("Backboard", context)
        self.assertIn("Avoid peanuts.", context)
        self.assertNotIn("ignored", context)

    def test_no_key_means_no_network_configuration(self):
        client = memory.BackboardMemory(api_key="")
        self.assertFalse(client.enabled)


if __name__ == "__main__":
    unittest.main()
