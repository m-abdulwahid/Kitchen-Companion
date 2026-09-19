"""Unit tests for the cooking agent's rules (no network). Run from the voice folder:
    .venv\\Scripts\\python -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent  # noqa: E402

RECIPE = {"title": "Cozy Shakshuka", "servings": 2,
          "ingredients": ["olive oil", "onion", "eggs"],
          "steps": ["Soften onion.", "Add spices.", "Simmer tomatoes.", "Crack in eggs.", "Serve."]}


def raw(**kw):
    base = {"heard": "", "seen": "", "step_done": None, "say": "", "actions": []}
    base.update(kw)
    return base


def frame(session, step_index=0, now=100.0, auto=True, **kw):
    return agent.decide(event="frame", raw=raw(**kw), session=session, step_index=step_index,
                        n_steps=5, timers=[], auto_advance=auto, now=now)


class ParseTests(unittest.TestCase):
    def test_reads_json_inside_a_code_fence(self):
        text = 'Sure!\n```json\n{"heard":"next","say":"OK","step_done":null,"actions":[{"type":"next_step"}]}\n```'
        d = agent.parse_decision(text)
        self.assertEqual(d["say"], "OK")
        self.assertEqual(d["actions"], [{"type": "next_step"}])

    def test_garbage_is_rejected(self):
        for text in ["", "no json here", "{broken", "[1,2,3]", "{"]:
            self.assertIsNone(agent.parse_decision(text), text)

    def test_wrong_types_become_safe_defaults(self):
        d = agent.parse_decision('{"step_done":"yes","say":5,"actions":"next_step"}')
        self.assertIsNone(d["step_done"])
        self.assertEqual(d["say"], "5")
        self.assertEqual(d["actions"], [])

    def test_control_characters_and_length_are_cleaned(self):
        d = agent.parse_decision('{"say":"a\\n\\nb' + "x" * 1000 + '"}')
        self.assertNotIn("\n", d["say"])
        self.assertLessEqual(len(d["say"]), agent.MAX_SAY_CHARS)


class ActionTests(unittest.TestCase):
    def v(self, raw_actions, step=1, timers=None):
        return agent.validate_actions(raw_actions, step, 5, timers or [])

    def test_unknown_and_malformed_actions_are_dropped(self):
        self.assertEqual(self.v([{"type": "delete_recipe"}, "next_step", 7, {"nope": 1}, {"type": None}]), [])

    def test_next_step_on_the_last_step_becomes_finish(self):
        self.assertEqual(self.v([{"type": "next_step"}], step=4), [{"type": "finish"}])

    def test_go_back_on_the_first_step_is_dropped(self):
        self.assertEqual(self.v([{"type": "go_back"}], step=0), [])

    def test_go_to_step_needs_a_real_different_step(self):
        self.assertEqual(self.v([{"type": "go_to_step", "step": 3}]), [{"type": "go_to_step", "step": 3}])
        for bad in (0, 6, -1, 2, "3", 3.5, True, None):  # 2 is the step we are already on (index 1)
            self.assertEqual(self.v([{"type": "go_to_step", "step": bad}]), [], repr(bad))

    def test_timer_limits(self):
        ok = self.v([{"type": "set_timer", "seconds": 600, "label": "simmer"}])
        self.assertEqual(ok, [{"type": "set_timer", "seconds": 600, "label": "simmer"}])
        for bad in (4, 0, -5, 10801, "600", None, True, float("nan")):
            try:
                self.assertEqual(self.v([{"type": "set_timer", "seconds": bad}]), [], repr(bad))
            except ValueError:  # int(nan) raises; that must not escape as a crash
                self.fail(f"set_timer with {bad!r} crashed")

    def test_timer_gets_a_default_label_and_a_short_one(self):
        self.assertEqual(self.v([{"type": "set_timer", "seconds": 60}])[0]["label"], "timer")
        self.assertLessEqual(len(self.v([{"type": "set_timer", "seconds": 60, "label": "x" * 200}])[0]["label"]), 40)

    def test_no_more_than_five_timers(self):
        running = [{"label": f"t{i}", "seconds_left": 10} for i in range(5)]
        self.assertEqual(self.v([{"type": "set_timer", "seconds": 60}], timers=running), [])

    def test_at_most_three_actions_and_no_duplicates(self):
        many = [{"type": "repeat_step"}] * 2 + [{"type": "go_back"}, {"type": "finish"}, {"type": "repeat_step"}]
        out = self.v(many)
        self.assertLessEqual(len(out), agent.MAX_ACTIONS)
        self.assertEqual(len(out), len({str(a) for a in out}))


class SpeechTurnTests(unittest.TestCase):
    def test_the_actions_from_a_spoken_request_go_through(self):
        s = agent.Session()
        d = agent.decide(event="speech", raw=raw(heard="next please", say="On to step 2.", actions=[{"type": "next_step"}]),
                         session=s, step_index=0, n_steps=5, timers=[])
        self.assertEqual(d["actions"], [{"type": "next_step"}])
        self.assertEqual(list(s.history), [("Cook", "next please"), ("You", "On to step 2.")])

    def test_it_never_answers_with_silence_when_spoken_to(self):
        d = agent.decide(event="speech", raw=raw(), session=agent.Session(), step_index=0, n_steps=5, timers=[])
        self.assertIn("didn't catch", d["say"])

    def test_history_is_capped(self):
        s = agent.Session()
        for i in range(30):
            agent.decide(event="speech", raw=raw(heard=f"q{i}", say=f"a{i}"), session=s, step_index=0, n_steps=5, timers=[])
        self.assertEqual(len(s.history), agent.HISTORY_TURNS)
        self.assertEqual(s.history[-1], ("You", "a29"))


class CameraTurnTests(unittest.TestCase):
    def test_one_done_look_is_not_enough_to_move_on(self):
        s = agent.Session()
        d = frame(s, step_done=True, say="Onions look soft.")
        self.assertEqual((d["say"], d["actions"]), ("", []))
        self.assertIn("1/2", d["note"])

    def test_two_done_looks_in_a_row_move_on_and_announce_it(self):
        s = agent.Session()
        frame(s, step_done=True, say="Onions look soft.", now=100)
        d = frame(s, step_done=True, say="Onions look soft.", now=130)
        self.assertEqual(d["actions"], [{"type": "next_step"}])
        self.assertIn("Moving on to step 2", d["say"])

    def test_a_not_done_look_resets_the_count(self):
        s = agent.Session()
        frame(s, step_done=True, now=100)
        frame(s, step_done=False, say="", now=130)
        d = frame(s, step_done=True, say="Soft now.", now=160)
        self.assertEqual(d["actions"], [])  # counting started over

    def test_cannot_tell_does_not_reset_or_count(self):
        s = agent.Session()
        frame(s, step_done=True, now=100)
        frame(s, step_done=None, now=130)
        d = frame(s, step_done=True, now=160)
        self.assertEqual([a["type"] for a in d["actions"]], ["next_step"])

    def test_done_on_the_last_step_finishes(self):
        s = agent.Session()
        frame(s, step_index=4, step_done=True, say="Plated well.", now=100)
        d = frame(s, step_index=4, step_done=True, say="Plated well.", now=130)
        self.assertEqual(d["actions"], [{"type": "finish"}])
        self.assertIn("last step", d["say"])

    def test_the_model_cannot_move_the_cook_from_a_camera_tick(self):
        d = frame(agent.Session(), step_done=False, say="Careful.", actions=[{"type": "go_to_step", "step": 5}, {"type": "finish"}])
        self.assertEqual(d["actions"], [])

    def test_auto_advance_off_tells_but_does_not_move(self):
        s = agent.Session()
        frame(s, auto=False, step_done=True, now=100)
        d = frame(s, auto=False, step_done=True, now=130)
        self.assertEqual(d["actions"], [])
        self.assertIn("Say next", d["say"])

    def test_it_does_not_interrupt_more_than_once_every_20_seconds(self):
        s = agent.Session()
        first = frame(s, step_done=False, say="Lower the heat, it is browning.", now=100)
        second = frame(s, step_done=False, say="Stir it now.", now=110)
        third = frame(s, step_done=False, say="Stir it now please.", now=125)
        self.assertEqual(first["say"], "Lower the heat, it is browning.")
        self.assertEqual(second["say"], "")
        self.assertIn("recently", second["note"])
        self.assertEqual(third["say"], "Stir it now please.")

    def test_it_does_not_repeat_itself(self):
        s = agent.Session()
        frame(s, step_done=False, say="Lower the heat.", now=100)
        d = frame(s, step_done=False, say="lower the heat!", now=200)
        self.assertEqual(d["say"], "")
        self.assertIn("already said", d["note"])

    def test_silence_stays_silence(self):
        d = frame(agent.Session(), step_done=False, say="")
        self.assertEqual((d["say"], d["actions"]), ("", []))

    def test_what_it_saw_is_remembered(self):
        s = agent.Session()
        frame(s, seen="A pan of pale onions.")
        self.assertEqual(s.last_seen, "A pan of pale onions.")


class MessageTests(unittest.TestCase):
    def build(self, **kw):
        args = dict(event="frame", recipe=RECIPE, step_index=2, timers=[], session=agent.Session())
        args.update(kw)
        return agent.build_messages(**args)

    def test_current_step_is_marked_at_the_right_place(self):
        system = self.build()[0]["content"]
        self.assertIn("3. Simmer tomatoes.   <-- CURRENT STEP", system)
        self.assertEqual(system.count("<-- CURRENT STEP"), 1)
        self.assertNotIn("1. Soften onion.   <--", system)

    def test_recipe_facts_and_timers_are_in_the_prompt(self):
        system = self.build(timers=[{"label": "simmer", "seconds_left": 605}])[0]["content"]
        self.assertIn("Cozy Shakshuka (serves 2)", system)
        self.assertIn("olive oil; onion; eggs", system)
        self.assertIn("simmer (10:05 left)", system)

    def test_speech_turn_carries_the_audio(self):
        content = self.build(event="speech", audio_b64="QUJD", audio_format="webm")[1]["content"]
        self.assertEqual(content[0]["type"], "input_audio")
        self.assertEqual(content[0]["input_audio"]["format"], "webm")

    def test_frame_turn_carries_the_photo_and_no_audio(self):
        content = self.build(image="data:image/jpeg;base64,AAAA")[1]["content"]
        self.assertEqual([c["type"] for c in content], ["image_url", "text"])

    def test_name_style_and_memory_are_used(self):
        s = agent.Session()
        s.history.append(("Cook", "how long?"))
        s.said.append("About ten minutes.")
        system = self.build(name="Remy", style="Warm and precise.", session=s)[0]["content"]
        self.assertIn("You are Remy, a hands-on cooking assistant", system)
        self.assertIn("Warm and precise.", system)
        self.assertIn("Cook: how long?", system)
        self.assertIn("do not repeat): About ten minutes.", system)


class MiscTests(unittest.TestCase):
    def test_timer_done_needs_no_model(self):
        d = agent.timer_done_decision("simmer", agent.Session())
        self.assertEqual(d["say"], "Your simmer timer is up.")

    def test_old_sessions_are_forgotten(self):
        agent._sessions.clear()
        agent.get_session("old", now=0.0)
        agent.get_session("new", now=agent.SESSION_TTL + 10)
        self.assertNotIn("old", agent._sessions)
        self.assertIn("new", agent._sessions)


if __name__ == "__main__":
    unittest.main()
