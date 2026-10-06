---
name: youtube-summary
description: Summarize YouTube videos and research topics across many videos using the vidIQ connector (search, channel uploads, transcripts with timecodes). Use for /portnikov (summary of Vitaly Portnikov's latest video), /yt, саммари видео, о чём это видео, транскрипт, расшифровка ютуба, youtube-research, or a pasted YouTube link.
---

# youtube-summary

Uses the vidIQ connector tools. Each vidIQ call costs credits (about 5), so make as few calls as needed and never re-fetch a transcript already in the conversation.

## Mode A: one video (a link, or "summary of X")

1. Get the transcript with `vidiq_video_transcript` (pass the URL or ID; omit language to get default captions).
2. Reply in the user's language, mobile-friendly:
   - **Суть в 2–3 предложениях.**
   - **Главные тезисы** — 5–10 bullets, each with a timecode `[12:34]` taken from the transcript.
   - **Цифры и факты** — anything checkable (names, numbers, dates). Mark claims the author makes as the author's claims, not as facts.
   - **Что важно для меня** — only if the user's context makes something relevant; otherwise skip.
3. If they ask for the full transcript, send it as a file, not in the chat.

## Mode B: /portnikov

1. Find the channel of Vitaly Portnikov (Віталій Портников). The first time, find it with `vidiq_youtube_search` (type channel, query "Портников") and confirm the right channel with the user; afterwards use the channel ID saved in the skill notes below if present.
2. `vidiq_channel_videos` with popular=false, videoFormat long (and live if no recent long video) → take the newest.
3. Run Mode A on it. Say the video's title and date at the top.
4. If the user asks for a regular digest, offer a scheduled task (e.g. every day at 09:00 IST) that runs `/portnikov`.

Notes: channel ID — fill in after first confirmed run.

## Mode C: research a topic across videos

1. `vidiq_youtube_search` type video, order relevance (or date if freshness matters), limit 10–15.
2. Pick the 5–8 most relevant (by title, channel and views); tell the user which ones before spending credits if more than 8.
3. Get transcripts, extract facts relevant to the question.
4. Answer with a synthesis: what most sources agree on, where they disagree, specific facts with `[video title, timecode]` references, and links.
