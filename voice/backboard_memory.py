"""Optional, privacy-scoped durable memory backed by Backboard.

The cooking agent continues to work when BACKBOARD_API_KEY is absent or
Backboard is temporarily unavailable. A browser profile receives its own
Backboard assistant, rather than putting every cook's facts in one shared
memory bank. We only write a fact when the cook explicitly says "remember".
"""
from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

API_URL = "https://app.backboard.io/api"
ASSISTANT_PREFIX = "Kitchen Companion Memory"
PROFILE_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MEMORY_CACHE_SECONDS = 180.0
MAX_FACT_CHARS = 240
MAX_CONTEXT_ITEMS = 3


@dataclass(frozen=True)
class MemoryCommand:
    action: str  # remember | forget
    fact: str


def clean_text(value: object, limit: int) -> str:
    return re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or "")).strip()[:limit].strip()


def valid_profile_id(value: object) -> str:
    profile_id = clean_text(value, 64)
    return profile_id if PROFILE_RE.fullmatch(profile_id) else ""


def extract_memory_command(text: object) -> MemoryCommand | None:
    """Persist only an explicit request, never an inferred sensitive fact."""
    spoken = clean_text(text, MAX_FACT_CHARS + 40)
    match = re.match(r"(?i)^(?:please )?(remember|forget)(?: that)?\s+(.+?)[.!?]*$", spoken)
    if not match:
        return None
    fact = clean_text(match.group(2), MAX_FACT_CHARS)
    if len(fact) < 3:
        return None
    return MemoryCommand(action=match.group(1).lower(), fact=fact)


def assistant_name(profile_id: str) -> str:
    return f"{ASSISTANT_PREFIX} · {profile_id}"


def memory_context(memories: list[str]) -> str:
    cleaned = [clean_text(memory, MAX_FACT_CHARS) for memory in memories]
    cleaned = [memory for memory in cleaned if memory]
    if not cleaned:
        return ""
    return "Long-term cook preferences from Backboard (use only when relevant): " + " | ".join(cleaned[:MAX_CONTEXT_ITEMS])


class BackboardMemory:
    """Small HTTP client for Backboard's assistant-scoped memory endpoints."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = (api_key if api_key is not None else os.getenv("BACKBOARD_API_KEY", "")).strip()
        self.assistants: dict[str, str] = {}
        self.searches: dict[tuple[str, str], tuple[float, list[str]]] = {}

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        if not self.enabled:
            return None
        headers = {"X-API-Key": self.api_key, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=8.0, trust_env=False) as client:
            response = await client.request(method, f"{API_URL}{path}", headers=headers, **kwargs)
        response.raise_for_status()
        return response.json() if response.content else {}

    async def ensure_assistant(self, profile_id: str) -> str:
        profile_id = valid_profile_id(profile_id)
        if not self.enabled or not profile_id:
            return ""
        if cached := self.assistants.get(profile_id):
            return cached
        name = assistant_name(profile_id)
        listed = await self._request("GET", "/assistants", params={"name": name, "limit": 1})
        candidates = listed.get("assistants", []) if isinstance(listed, dict) else []
        for candidate in candidates:
            if isinstance(candidate, dict) and candidate.get("name") == name:
                identifier = clean_text(candidate.get("assistant_id") or candidate.get("id"), 128)
                if identifier:
                    self.assistants[profile_id] = identifier
                    return identifier
        created = await self._request("POST", "/assistants", json={
            "name": name,
            "system_prompt": "Store only the cook's explicit, durable cooking preferences. Never infer sensitive facts.",
            "custom_fact_extraction_prompt": "Do not extract facts automatically; Kitchen Companion writes explicit facts manually.",
        })
        identifier = clean_text((created or {}).get("assistant_id") or (created or {}).get("id"), 128)
        if not identifier:
            raise RuntimeError("Backboard created an assistant without an id")
        self.assistants[profile_id] = identifier
        return identifier

    async def recall(self, profile_id: str, query: str) -> list[str]:
        profile_id = valid_profile_id(profile_id)
        query = clean_text(query, 500)
        if not self.enabled or not profile_id or not query:
            return []
        cache_key = (profile_id, query)
        cached = self.searches.get(cache_key)
        if cached and time.monotonic() - cached[0] < MEMORY_CACHE_SECONDS:
            return cached[1]
        assistant_id = await self.ensure_assistant(profile_id)
        result = await self._request("POST", f"/assistants/{assistant_id}/memories/search", json={"query": query, "limit": MAX_CONTEXT_ITEMS})
        rows = result.get("memories", []) if isinstance(result, dict) else []
        memories: list[str] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            metadata = row.get("metadata") or {}
            if isinstance(metadata, dict) and metadata.get("profile_id") not in {None, profile_id}:
                continue
            content = clean_text(row.get("content"), MAX_FACT_CHARS)
            if content:
                memories.append(content)
        self.searches[cache_key] = (time.monotonic(), memories)
        return memories

    async def remember(self, profile_id: str, fact: str) -> bool:
        profile_id = valid_profile_id(profile_id)
        fact = clean_text(fact, MAX_FACT_CHARS)
        if not self.enabled or not profile_id or not fact:
            return False
        assistant_id = await self.ensure_assistant(profile_id)
        await self._request("POST", f"/assistants/{assistant_id}/memories", json={
            "content": fact,
            "metadata": {"profile_id": profile_id, "source": "explicit_cook_request"},
        })
        self.searches = {key: value for key, value in self.searches.items() if key[0] != profile_id}
        return True

    async def forget(self, profile_id: str, fact: str) -> bool:
        """Delete only a close textual match; semantic near-misses are left alone."""
        profile_id = valid_profile_id(profile_id)
        fact = clean_text(fact, MAX_FACT_CHARS)
        if not self.enabled or not profile_id or not fact:
            return False
        assistant_id = await self.ensure_assistant(profile_id)
        result = await self._request("POST", f"/assistants/{assistant_id}/memories/search", json={"query": fact, "limit": 5})
        rows = result.get("memories", []) if isinstance(result, dict) else []
        wanted = re.sub(r"\W+", " ", fact.lower()).strip()
        for row in rows:
            if not isinstance(row, dict):
                continue
            metadata = row.get("metadata") or {}
            content = clean_text(row.get("content"), MAX_FACT_CHARS)
            normalized = re.sub(r"\W+", " ", content.lower()).strip()
            memory_id = clean_text(row.get("id") or row.get("memory_id"), 128)
            if memory_id and wanted and (wanted in normalized or normalized in wanted) and (
                not isinstance(metadata, dict) or metadata.get("profile_id") in {None, profile_id}
            ):
                await self._request("DELETE", f"/assistants/{assistant_id}/memories/{memory_id}")
                self.searches = {key: value for key, value in self.searches.items() if key[0] != profile_id}
                return True
        return False
