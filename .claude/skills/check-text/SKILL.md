---
name: check-text
description: Proofread a text for grammar, spelling, typos, punctuation and logic in Russian, Ukrainian or English. Use when the user says check-text, /check-text, проверь текст, перевір текст, вычитай, proofread, or pastes a draft and asks if it is OK before sending or publishing.
---

# check-text

Proofread the text the user gives (or the last draft in the conversation). Work in the text's own language. If the text mixes languages, check each part in its language.

## What to check, in this order

1. **Spelling and typos.** Wrong letters, missing or doubled letters, wrong keyboard layout (e.g. "руддщ" for "hello"), Russian letters inside Ukrainian words and the reverse (ы/и, э/е, ъ/ʼ, і/и, ї, є, ґ).
2. **Grammar.** Agreement (gender, number, case), verb forms, prepositions, articles in English, тся/ться in Russian, кличний відмінок in Ukrainian where it is needed.
3. **Punctuation.** Commas before conjunctions and in participial phrases, dashes, quotes («» in RU/UK, "" in EN), spaces around punctuation.
4. **Logic and facts inside the text.** Contradictions, numbers that do not add up, dates and weekdays that do not match, a promise in one sentence broken in the next, unclear "it/this" references, a missing step.
5. **Clarity (light touch).** Only flag a sentence that a reader would misread. Do not rewrite style.

## Output format

- First line: a verdict. `✅ Чисто` / `⚠️ N правок` (use the user's language for the verdict).
- Then a short list of fixes, each as `было → стало` with a few words of why if it is not obvious. Group by type only if there are more than 8 fixes.
- Logic problems go in a separate short list at the end, because they need the author's decision, not a mechanical fix.
- Then the full corrected text in one code block so it can be copied in one tap on iPad.

## Rules

- Do not change the author's voice, slang, emoji, or deliberate style choices. Fix errors, not taste.
- Do not invent facts. If something looks wrong but you cannot be sure, ask instead of fixing.
- If the text is clean, say so in one line and do not pad the answer.
