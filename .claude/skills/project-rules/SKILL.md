---
name: project-rules
description: Baseline rules for any of my project repos. Use when starting or setting up a repo, writing a CLAUDE.md, PR, ticket, design doc or incident note, or when a repo lacks these rules.
---

# Project rules

My baseline for every repo. Why it exists: agents make text, code and tickets faster than a human can read them, so people stop understanding their own system. These rules keep a human able to read, explain and own everything that ships.

Repo-specific `CLAUDE.md` wins over this file. If a repo has no equivalent of a rule below, add it (see Bootstrap).

## The one rule

A person owns every result. "The agent wrote it" is never a reason. Anything its author cannot retell in two sentences is not accepted: a PR, a ticket, a design doc, an incident write-up.

## Rules

**Talking to me**
- Russian, informal «ты». I only have an iPad: no "run in terminal"; describe my steps as taps in GitHub, Vercel, Supabase, Telegram.
- Report: the conclusion first (done / what I need from you), details below. No retelling of steps.
- SQL or commands I must copy: always inline in a code block as well as in a file.
- Secrets (tokens, service keys, client secrets, personal tokens) are never asked for, stored or pasted. They live in the host's env vars and I enter them myself. Public keys and database URLs may stay in code.

**Work intake**
- New ideas and fixes go to `BACKLOG.md` → Inbox, not straight into work.
- One package at a time: propose "version X: this list", I approve, then work. Urgent (breakage, security) goes out of queue as its own small release.
- A ticket or task is half a page: problem, expected result, done criteria. It is read before it is fed to an agent.

**Incidents and bugs**
- One owner per investigation. Write down one main hypothesis before anyone fixes anything; others test it, they don't open parallel fixes.
- Duplicate tickets are closed in favour of one. Use the `diagnosing-bugs` skill for hard ones.

**Language and terms**
- A glossary lives in `DECISIONS.md`. One name per thing. A new term is explained where it first appears. Private jargon from an agent chat does not enter meetings or docs.

**Code and PRs**
- PR body from `.github/PULL_REQUEST_TEMPLATE.md`: what changed, why, how to check, in own words, not a diff retelling.
- Size guideline about 400 changed lines, not counting generated files, lockfiles, data and lesson content. Bigger: split, or one line in the PR saying why not.
- Comments: short, technical, English. No quotes from me or from chats, no names, no dates of discussions, no "owner decided". History and reasons go to CHANGELOG / DECISIONS / BACKLOG. Do not comment the obvious.
- Generated files are never edited by hand; rebuild them.

**Docs**
- A new doc: first paragraph is the point in at most 4 sentences; the rest only supports it. Over two pages needs a reason at the top.
- Invariants ("what must not break") are written once, in `DECISIONS.md` or `CLAUDE.md`, not spread over docs. A doc that says the opposite of its first page is wrong: fix it.

**Release and checks**
- Work branch (`dev` or `test`); `main` is production, reached only by pull request. Never release on red CI. I decide when to release unless the repo's `CLAUDE.md` says Claude may merge itself.
- After any code change, before push: call the `tester` subagent (independent, did not see the code being written). Fix and repeat until clean. Show me which commands ran and how many checks passed.
- CI runs the same checks on every push and pull request.
- Database: additive and repeatable changes only; no rename or delete in one step. Apply to the test database first, check with a query, production only with my OK (unless the repo says Claude applies it). Show the SQL inline.

**Upkeep**
- Weekly order check in the background: dead code, duplicates, temporary workarounds, magic numbers, docs that disagree. Small things fixed in the next release, big ones proposed to me.
- Keep `CHANGELOG.md` for humans, `DECISIONS.md` for non-negotiables, `BACKLOG.md` for ideas.
- Visual creatives: collect real references first, then generate, then check against the references.
- Models: main session does plans, architecture, hard bugs, money and database; `scout` and Sonnet agents do reading and routine work. Never delegate anything irreversible.

## Bootstrap a new repo

Do these when a repo is new or lacks them. Ask me only about choices that are really mine (branch names, who merges).

1. `CLAUDE.md` from [templates/CLAUDE.starter.md](templates/CLAUDE.starter.md); fill the commands and the repo-specific rules.
2. `README.md` (how it works), `DECISIONS.md` (non-negotiables + glossary), `BACKLOG.md` (Inbox), `CHANGELOG.md`.
3. `.github/PULL_REQUEST_TEMPLATE.md` from [templates/PULL_REQUEST_TEMPLATE.md](templates/PULL_REQUEST_TEMPLATE.md).
4. `.github/workflows/tests.yml`: run the test command on push to the work branch and `main`, and on pull requests into `main`.
5. `.claude/agents/tester.md` from [templates/tester.md](templates/tester.md), with the repo's real commands.
6. A comments check in the tests when the repo has code (fails on non-English comments and chat quotes).
7. Branches: work branch plus `main`; protect `main` with required checks if the GitHub plan allows (private repos on a free plan cannot).
8. Copy `.claude/skills` and `.claude/agents` I use from `claude-setup`, so the next session has them.
9. Tell me in one line what was added.
