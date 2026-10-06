---
name: explain
description: Explain any topic as a clear visual page in simple language, with a diagram. Modes - explain (full page with diagram), explain_diagram (only an SVG diagram), explain_draw (diagram that looks hand-drawn with coloured pencils). Use when the user says explain, /explain, explain_diagram, explain_draw, объясни, поясни, растолкуй, or asks to understand how something works.
---

# explain

Turn a topic into an explanation a smart 12-year-old could follow, with a picture that shows the real mechanism.

## Pick the mode

- `explain` (default) — a published HTML page: plain-language text + one or more diagrams.
- `explain_diagram` — only the diagram, shown inline in the chat. No page.
- `explain_draw` — same as explain_diagram, but drawn in a hand-made coloured-pencil style.

If the user names a mode, use it. Otherwise use `explain` for big topics and `explain_diagram` for a single mechanism.

## Language

- Write in the language the user asked in. If they ask for English, use Simplified Technical English style (ASD-STE100 spirit): short sentences (max ~20 words), one idea per sentence, active voice, common words, one name per concept.
- Same rules in Russian or Ukrainian: short sentences, everyday words, no канцелярит.

## Structure of the page (`explain`)

1. **One-sentence answer** at the top: what it is.
2. **Why it matters** — 2–3 sentences, tied to the user's situation if known.
3. **How it works** — build it up step by step. For anything with 3+ moving parts, draw a short series of diagrams, each adding one part, instead of one crowded diagram.
4. **Example** — one concrete, real-world example.
5. **Common mistakes / myths** — 2–4 bullets.
6. **Go deeper** — 2–3 links (search the web for good, current sources) or one recommended video (search YouTube).

Build the page following the artifact-design guidance and publish it as an artifact. Must look good on an iPad, in light and dark mode.

## Diagram rules

- Show the mechanism (what causes what), not decoration.
- Few words on the diagram; labels of 1–3 words.
- Arrows mean one thing each (flow, or cause, or time) — say which in a tiny legend if needed.
- For `explain_draw`: SVG with slightly wobbly strokes (use an SVG turbulence/displacement filter or hand-jittered paths), cross-hatched fills, a paper-coloured background, colours like real pencils (blue, red, green, orange), a handwriting-like font (e.g. "Caveat" or "Patrick Hand" from Google Fonts in an artifact, or a system cursive inline).

## Finish

End with one line offering to go deeper on one specific part.
