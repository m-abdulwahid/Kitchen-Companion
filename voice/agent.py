"""The cooking agent's brain: what it remembers, what it asks Omni, and which of Omni's decisions it lets through.

Pure logic, no network, so it can be unit tested (voice/tests/test_agent.py). The route that calls Omni is
`/api/agent/turn` in app.py. See docs/agent.md.

One "turn" is an event (the cook spoke, a camera tick arrived, a timer finished) plus the current state
(recipe, step, timers). Omni returns JSON: what it heard, what it saw, whether the step looks done, what to
say, and a list of actions. This module turns that into a decision the app can safely carry out.
"""
from __future__ import annotations

import json
import math
import re
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

ACTION_TYPES = {"next_step", "go_back", "go_to_step", "repeat_step", "set_timer", "cancel_timer", "finish"}
MAX_ACTIONS = 3
TIMER_MIN_SECONDS, TIMER_MAX_SECONDS, MAX_TIMERS = 5, 3 * 3600, 5
DONE_STREAK_TO_ADVANCE = 2  # "the step looks done" must be seen on this many camera checks in a row
MIN_UNPROMPTED_GAP = 20.0  # seconds between things the agent says without being asked
SESSION_TTL = 4 * 3600
HISTORY_TURNS = 8
MAX_SAY_CHARS = 400


@dataclass
class Session:
    history: deque = field(default_factory=lambda: deque(maxlen=HISTORY_TURNS))  # ("Cook" | "You", text)
    said: deque = field(default_factory=lambda: deque(maxlen=5))  # what the agent said lately
    last_seen: str = ""
    done_streak: dict[int, int] = field(default_factory=dict)  # step index -> consecutive "done" camera checks
    last_unprompted: float = 0.0
    updated: float = 0.0
    turns: int = 0


_sessions: dict[str, Session] = {}


def get_session(session_id: str, now: Optional[float] = None) -> Session:
    now = time.monotonic() if now is None else now
    for key in [k for k, s in _sessions.items() if now - s.updated > SESSION_TTL]:
        del _sessions[key]
    session = _sessions.setdefault(session_id, Session())
    session.updated = now
    return session


def clean(value: object, limit: int) -> str:
    """One line of plain text, no control characters, at most `limit` characters."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or "")).strip()[:limit].strip()


def format_clock(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"


# ----------------------------------------------------------------------------------------- prompt

SYSTEM_PROMPT = (
    "You are a hands-on cooking assistant standing next to a cook who is making a recipe right now. "
    "You can see through their kitchen camera and hear them. Everything you say is spoken aloud, so keep it to "
    "at most two short, plain sentences (under 30 words). No markdown, lists, asterisks or emoji. "
    "Always write \"say\" in English.\n\n"
    "You DO things, not just talk. You take actions by listing them in \"actions\" (leave it empty if none):\n"
    "- {\"type\":\"next_step\"}: go to the next step. Use it when the cook says they are done with this step or asks for the next one.\n"
    "- {\"type\":\"go_back\"}: go to the previous step.\n"
    "- {\"type\":\"go_to_step\",\"step\":N}: jump to step N (numbered from 1, as in the list below).\n"
    "- {\"type\":\"repeat_step\"}: read the current step aloud again.\n"
    "- {\"type\":\"set_timer\",\"seconds\":S,\"label\":\"short label\"}: start a countdown timer. Use it when asked, "
    "or when the cook agrees to your offer.\n"
    "- {\"type\":\"cancel_timer\",\"label\":\"...\"}: stop a timer.\n"
    "- {\"type\":\"finish\"}: the whole recipe is finished.\n"
    "Only take an action when the cook asked for it or the situation clearly calls for it. Never act on a guess.\n\n"
    "Ground everything in the recipe below. For quantities and ingredients use only what is listed; if something is "
    "not listed, say you do not know instead of inventing an amount. For substitutions or technique, give brief, "
    "practical advice. If you cannot see or hear well enough, say so honestly.\n\n"
    "Reply with JSON only, in exactly this shape:\n"
    "{\"heard\": \"what the cook said, or empty if they did not speak\", \"seen\": \"what you see, one short sentence, "
    "or empty if there is no photo\", \"step_done\": true, \"say\": \"...\", \"actions\": []}\n"
    "\"step_done\" only applies when you have a photo: true only if you can clearly see the result the current step "
    "names (its color, texture or size); false if it is not there yet; null if a camera cannot show it or you cannot tell."
)

EVENT_PROMPTS = {
    "speech": "The cook just spoke to you (the audio). Put what they said in \"heard\". \"say\" must answer them directly.",
    "text": "The cook said this to you: {text}. Put it in \"heard\". \"say\" must answer them directly.",
    "frame": (
        "This is a routine camera check: the cook did not speak. Judge the current step from the photo. Speak only "
        "when it is useful: when the step is done, when you see a problem (burning, too hot, unsafe), or for one "
        "clear tip. Otherwise set \"say\" to an empty string. Never repeat what you already said."
    ),
}


def build_messages(
    *,
    event: str,
    recipe: dict,
    step_index: int,
    timers: list[dict],
    session: Session,
    name: str = "",
    style: str = "",
    text: str = "",
    audio_b64: str = "",
    audio_format: str = "webm",
    image: str = "",
) -> list[dict]:
    steps = recipe.get("steps", [])
    lines = [f"Recipe: {recipe.get('title', 'unknown')}" + (f" (serves {recipe['servings']})" if recipe.get("servings") else "")]
    lines.append("Ingredients: " + ("; ".join(recipe.get("ingredients", [])) or "not listed"))
    lines.append("Steps:")
    for i, step in enumerate(steps):
        lines.append(f"{i + 1}. {step}" + ("   <-- CURRENT STEP" if i == step_index else ""))
    lines.append("Timers running: " + ("; ".join(f"{t['label']} ({format_clock(t['seconds_left'])} left)" for t in timers) or "none"))
    if session.history:
        lines.append("Conversation so far: " + " | ".join(f"{who}: {say}" for who, say in session.history))
    if session.said:
        lines.append("You already said (do not repeat): " + " / ".join(session.said))
    if session.last_seen:
        lines.append("Last thing you saw: " + session.last_seen)

    system = SYSTEM_PROMPT
    if name:
        system = system.replace("You are a hands-on cooking assistant", f"You are {name}, a hands-on cooking assistant", 1)
    if style:
        system += f"\nYour personality: {style}"
    system += "\n\n" + "\n".join(lines)

    prompt = EVENT_PROMPTS[event].replace("{text}", text)
    content: list[dict] = []
    if event == "speech":
        content.append({"type": "input_audio", "input_audio": {"data": f"data:audio/{audio_format};base64,{audio_b64}", "format": audio_format}})
    if image:
        content.append({"type": "image_url", "image_url": {"url": image}})
        if event != "frame":
            prompt += " A photo from the camera is attached: use it if it helps."
    content.append({"type": "text", "text": prompt})
    return [{"role": "system", "content": system}, {"role": "user", "content": content}]


# ------------------------------------------------------------------------------------ parse + check

def parse_decision(text: str) -> Optional[dict]:
    """Read Omni's JSON reply, or None if it is not in the expected shape. Takes the first {...} block, since
    models often wrap JSON in a code fence or a sentence."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    done = data.get("step_done")
    actions = data.get("actions")
    return {
        "heard": clean(data.get("heard"), 300),
        "seen": clean(data.get("seen"), 300),
        "step_done": done if isinstance(done, bool) else None,
        "say": clean(data.get("say"), MAX_SAY_CHARS),
        "actions": actions if isinstance(actions, list) else [],
    }


def validate_actions(raw: list, step_index: int, n_steps: int, timers: list[dict]) -> list[dict]:
    """Only known actions with sane values get through. Anything else is dropped, never guessed at."""
    out: list[dict] = []
    running = len(timers)
    for item in raw[:MAX_ACTIONS]:
        if not isinstance(item, dict) or item.get("type") not in ACTION_TYPES:
            continue
        kind = item["type"]
        if kind == "next_step":
            out.append({"type": "finish"} if step_index >= n_steps - 1 else {"type": "next_step"})
        elif kind == "go_back":
            if step_index > 0:
                out.append({"type": "go_back"})
        elif kind == "go_to_step":
            target = item.get("step")
            if isinstance(target, int) and not isinstance(target, bool) and 1 <= target <= n_steps and target - 1 != step_index:
                out.append({"type": "go_to_step", "step": target})
        elif kind == "repeat_step":
            out.append({"type": "repeat_step"})
        elif kind == "set_timer":
            seconds = item.get("seconds")
            # json.loads accepts NaN and Infinity, and int() of either raises: check it is a real number first
            if (isinstance(seconds, (int, float)) and not isinstance(seconds, bool)
                    and math.isfinite(seconds) and running < MAX_TIMERS):
                seconds = int(seconds)
                if TIMER_MIN_SECONDS <= seconds <= TIMER_MAX_SECONDS:
                    out.append({"type": "set_timer", "seconds": seconds, "label": clean(item.get("label"), 40) or "timer"})
                    running += 1
        elif kind == "cancel_timer":
            out.append({"type": "cancel_timer", "label": clean(item.get("label"), 40)})
        elif kind == "finish":
            out.append({"type": "finish"})
    # the same action twice in one turn is a mistake, not a request
    unique, seen_keys = [], set()
    for action in out:
        key = json.dumps(action, sort_keys=True)
        if key not in seen_keys:
            seen_keys.add(key)
            unique.append(action)
    return unique


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def decide(
    *,
    event: str,
    raw: dict,
    session: Session,
    step_index: int,
    n_steps: int,
    timers: list[dict],
    auto_advance: bool = True,
    now: Optional[float] = None,
) -> dict:
    """Turn Omni's raw decision into the one the app carries out, applying the safety rules."""
    now = time.monotonic() if now is None else now
    say = raw["say"]
    actions = validate_actions(raw["actions"], step_index, n_steps, timers)
    step_done = raw["step_done"]
    note = ""
    session.turns += 1
    if raw["seen"]:
        session.last_seen = raw["seen"]

    if event == "frame":
        actions = []  # a routine camera check may never move the cook around on the model's say-so alone
        if step_done is True:
            streak = session.done_streak.get(step_index, 0) + 1
            session.done_streak[step_index] = streak
            if auto_advance and streak >= DONE_STREAK_TO_ADVANCE:
                last = step_index >= n_steps - 1
                say = (say + " " if say else "") + ("That was the last step. Nicely done!" if last else f"Moving on to step {step_index + 2}.")
                actions = [{"type": "finish"} if last else {"type": "next_step"}]
                session.done_streak[step_index] = 0
                note = "auto-advanced after repeated done checks"
            elif streak >= DONE_STREAK_TO_ADVANCE:
                say = "This step looks done. Say next when you are ready."  # auto-advance is off: tell, don't move
                session.done_streak[step_index] = 0
                note = "looks done, auto-advance off"
            else:
                say = ""  # first "looks done": hold, and confirm on the next check before announcing anything
                note = f"looks done ({streak}/{DONE_STREAK_TO_ADVANCE}), waiting to confirm"
        elif step_done is False:
            session.done_streak[step_index] = 0
        if say and not actions:
            # unprompted speech is rationed and never repeated
            recent = {_norm(s) for s in session.said}
            if now - session.last_unprompted < MIN_UNPROMPTED_GAP:
                say, note = "", "held back: spoke too recently"
            elif _norm(say) in recent:
                say, note = "", "held back: already said"
        if say:
            session.last_unprompted = now
    else:
        if not say and not actions:
            say = "Sorry, I didn't catch that. Could you say it again?"
        if raw["heard"]:
            session.history.append(("Cook", raw["heard"]))

    if say:
        session.said.append(say)
        if event != "frame" or actions:
            session.history.append(("You", say))
    return {"heard": raw["heard"], "seen": raw["seen"], "step_done": step_done, "say": say, "actions": actions, "note": note}


def timer_done_decision(label: str, session: Session) -> dict:
    """A finished timer needs no model call: a fixed line, translated when spoken."""
    say = f"Your {clean(label, 40) or 'timer'} timer is up."
    session.said.append(say)
    return {"heard": "", "seen": "", "step_done": None, "say": say, "actions": [], "note": "timer finished"}


def session_stats(session: Session) -> dict:
    return {"turns": session.turns, "remembered_turns": len(session.history)}
