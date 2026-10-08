# <Project> — notes for Claude

Baseline rules: skill `project-rules` (read it if it is installed). Everything below is specific to this repo and wins over the baseline.

## What this is
<2-3 sentences: who it is for, what it does, what stage.>

## Commands
- Test: `<command>`
- Build: `<command>`
- Local preview: `<command>`

## Environments and release
- Branch `<dev|test>` = test site; `main` = production, reached only by pull request.
- <Who merges: owner, or Claude after the checks. Database: test first, production after OK.>

## Decisions already made (do not reopen without the owner)
- <one line each; the long list lives in DECISIONS.md>

## Working rules
- Talk to the owner in Russian, informal «ты». He only has an iPad.
- Never ask for or store secrets.
- Comments: short technical English, no chat quotes.
- PR from the template, about 400 lines, retellable in two sentences.
- Call the `tester` subagent after any code change; show which commands ran and how many checks passed.
- New ideas go to BACKLOG → Inbox; one package at a time.
- Reports: conclusion first.
