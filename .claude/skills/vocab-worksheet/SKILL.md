---
name: vocab-worksheet
description: Make a printable English vocabulary worksheet (words, IPA, stress, translation, example, picture, small exercises) from a list of words, a text, a reel transcript or a lesson topic. Use when the user says vocab-worksheet, /vocab, лист слов, словарик, worksheet, карточки со словами, or wants to print words for a student or child.
---

# vocab-worksheet

## Input

Any of: a list of words; a pasted text or transcript (pick the 8–15 most useful words for the learner's level); a topic ("at the airport"). Ask only if the learner's level is unknown and matters: A1–A2 / B1 / B2+. Translation language: Russian by default, Ukrainian if the user asks.

## For each word

- word (with part of speech)
- IPA (British by default; American if asked) and stress marked: `/ˈtʃɪkɪn/`
- translation (1–2 words)
- one short example sentence at the learner's level, word in **bold**
- a picture: a simple, clean drawn icon (inline SVG made by you), or an emoji if a drawing would not help. No copyrighted characters or brand images.

## Exercises (page 2)

Pick 2–3 that fit the level: match word ↔ picture, fill the gap, word scramble, translate the sentence. Answer key at the very bottom, upside-down or in small print.

## Output

1. Build an A4 PDF (portrait, 10–12 words per page, large readable font, black-and-white friendly — colour optional). Use the pdf skill.
2. Send the PDF to the user. The fastest way to print from an iPad is AirPrint: open the PDF → Share → Print.
3. If the user wants it to go straight to the printer: an HP printer with ePrint has its own email address (like `xxxx@hpeprint.com`). Email the PDF there from the user's Gmail if the Gmail connector can send attachments; otherwise create a draft with the PDF attached and tell the user to press Send. Ask for the printer's ePrint address the first time and do not guess it.
