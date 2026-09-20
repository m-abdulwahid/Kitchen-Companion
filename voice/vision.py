"""Camera photos in, coaching out: what the camera sees, and (with a recipe step) whether the step is done.

Pure helpers (no network), so they can be tested alone. The route that calls Omni is in app.py.
"""

from __future__ import annotations

import json
import re
from typing import Optional

# A browser canvas JPEG at 640x480 is around 50 KB; anything past this is not a camera frame.
MAX_IMAGE_BYTES = 6_000_000
MAX_STEP_CHARS = 600
MAX_RECENT = 3
IMAGE_URI = re.compile(r"^data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")

SYSTEM_PROMPT = (
    "You are a cooking coach watching a cook through a kitchen camera. You get one photo at a time. "
    "Judge only from what you can actually see, and be honest rather than flattering. "
    "If you cannot see any food, cookware or hands, or the photo is dark, blurry or blocked, say so "
    "and tell the cook what to fix, for example to point the camera at the pan. "
    "Your feedback will be spoken aloud: at most two short, plain sentences, under 30 words in total, "
    "in English. No markdown, lists, asterisks or emoji. "
)
STEP_PROMPT = (
    "The cook is on a recipe step (given below). In \"passed\", say whether that step is done. Answer true "
    "only if you can clearly see the result the step names, such as its color, texture or size. If it is "
    "only partly there, or you are unsure, answer false and say what is still missing. "
    "If the step is something a camera cannot show (for example preheating an oven), say so in one short "
    "sentence and answer true only if nothing in the photo looks wrong. "
    'Reply with JSON only, in this exact shape: {"seen": "what is in the photo, one short sentence", '
    '"passed": true, "feedback": "..."}'
)
FREE_PROMPT = (
    "There is no recipe: the cook is simply cooking. In \"seen\", say what is in the photo and what the "
    "cook is doing. In \"feedback\", give a brief reaction or one useful tip about that. Always set "
    "\"passed\" to null. "
    'Reply with JSON only, in this exact shape: {"seen": "what is in the photo and what the cook is '
    'doing, one short sentence", "passed": null, "feedback": "..."}'
)


def image_problem(image: str) -> Optional[str]:
    """Why this is not a usable photo, or None if it is fine."""
    if len(image) > MAX_IMAGE_BYTES * 4 // 3:
        return "image is too large"
    if not IMAGE_URI.match(image):
        return "image must be a base64 data URI (jpeg, png or webp)"
    return None


def build_messages(
    image: str,
    step: str = "",
    name: str = "",
    style: str = "",
    previous_image: str = "",
    recent: Optional[list[str]] = None,
) -> list[dict]:
    """Chat messages for Omni. `step` empty means free mode. `previous_image` (an earlier frame) lets the
    model tell what the cook just did; `recent` is what it said last time, so it does not repeat itself."""
    system = SYSTEM_PROMPT + (STEP_PROMPT if step else FREE_PROMPT)
    if name:
        system = system.replace("You are a cooking coach", f"You are {name}, a cooking coach", 1)
    if style:
        system += f" Your personality: {style}"

    content: list[dict] = []
    text = f"Current step: {step}" if step else "Look at the photo."
    if previous_image:
        content.append({"type": "image_url", "image_url": {"url": previous_image}})
        text += " The first photo is an earlier moment; the second is now. Judge the second and use the first to see what changed."
    content.append({"type": "image_url", "image_url": {"url": image}})
    if recent:
        text += " You already said (do not repeat yourself): " + " / ".join(recent[-MAX_RECENT:])
    content.append({"type": "text", "text": text})
    return [{"role": "system", "content": system}, {"role": "user", "content": content}]


def parse_verdict(text: str, need_verdict: bool) -> Optional[dict]:
    """Read {"seen", "passed", "feedback"} out of the model's reply, or None if it is not in that shape.

    `need_verdict` is True when a recipe step was given: then "passed" must be true or false.
    Models often wrap JSON in a code fence or add a sentence around it, so take the first {...} block.
    """
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    passed, feedback, seen = data.get("passed"), data.get("feedback"), data.get("seen")
    if not isinstance(feedback, str) or not feedback.strip():
        return None
    if need_verdict and not isinstance(passed, bool):
        return None
    return {
        "seen": " ".join(seen.split())[:300] if isinstance(seen, str) else "",
        "passed": passed if isinstance(passed, bool) else None,
        "feedback": " ".join(feedback.split())[:400],
    }
