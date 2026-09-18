"""Real AI annotations (step 7) -- explains a delta the way
annotations.ts's describeChange() already does on the frontend, so this is
a drop-in upgrade of that text's *source*, not a new interaction. Prompted
to explain the change, not restate the value: the model already has both
numbers, the point is context a template can't supply (why a drop of this
size might matter, whether it's likely lab noise vs. a real trend).

Never raises past this module: a missing key or a failed API call means
"no AI annotation available," and the caller (main.py) falls back to
letting the frontend use its own canned template -- an LLM outage should
never break the app, only make one card slightly less informative.
"""
from __future__ import annotations

import os

DEFAULT_MODEL = "claude-haiku-4-5-20251001"


class AnnotationUnavailable(Exception):
    """No API key configured, or the call failed. Caller degrades gracefully."""


def generate_annotation(
    *, display: str, unit: str | None, prev_value: float, curr_value: float,
    prev_date: str, curr_date: str, flag: str, prev_flag: str,
) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise AnnotationUnavailable("ANTHROPIC_API_KEY not set")

    try:
        import anthropic
    except ImportError as exc:
        raise AnnotationUnavailable("anthropic package not installed") from exc

    unit_str = f" {unit}" if unit else ""
    prompt = (
        f"A lab result for {display} changed from {prev_value}{unit_str} on {prev_date} "
        f"to {curr_value}{unit_str} on {curr_date}. It was flagged '{prev_flag}' and is now "
        f"flagged '{flag}'. In one short sentence (under 30 words), explain what this change "
        "might mean in plain language, without restating the raw numbers already shown "
        "elsewhere. Do not give medical advice or diagnose -- describe the pattern, not a "
        "recommendation."
    )

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL),
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        if not text:
            raise AnnotationUnavailable("empty response from model")
        return text
    except AnnotationUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001 -- any API/network failure degrades, never crashes the request
        raise AnnotationUnavailable(f"{type(exc).__name__}: {exc}") from exc
