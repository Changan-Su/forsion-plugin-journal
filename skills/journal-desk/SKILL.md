---
name: journal-desk
description: Use when the user wants a periodic journal entry in their vault — "把今天的日记建出来", "写一下今天的日记", "这个月的月记开一篇", "我 8 月 12 号写了什么" — i.e. the daily / weekly / monthly / quarterly / yearly notes managed by the 周期笔记台 (Journal Desk) plugin. NOT a work status report (that is worklog-report's `Reports/YYYY-Www.md`) and NOT fleeting notes (that is memo-digest).
version: 1.0.0
author: Forsion
category: Forsion
---

# Journal Desk (周期笔记台)

Periodic notes are **ordinary markdown files in the user's vault** — no database, no plugin format.
So you can create and read them yourself. The only hard part is landing them on the *same* path the
plugin uses, because a journal in the wrong place is worse than none: the plugin's calendar, status
bar and 上一篇/下一篇 will never see it, and the user ends up with two journal lines that do not
know about each other.

## 1. Look before you write — this is the load-bearing rule

The five path formats are **user-editable settings** living in the desktop app, and this plugin
deliberately mirrors nothing into the vault, so **you cannot read what the user actually configured.**
Never assume the factory defaults are in force. Instead:

1. List what is already there — local vault: `list_files` / `glob_files` under the vault root;
   cloud vault: `amadeus_list_notes`. Look for existing periodic notes anywhere, not just `Journal/`.
2. **Found the pattern → follow it**, whatever it is. If their days live at `日记/2026/08-25.md`,
   the next one goes beside it. Existing notes outrank every default in this file.
3. Patterns contradict each other, or you find none → ask one short question before writing.
4. **Unattended** (`agent_run`, a Muse watch, anything with no one to answer): fall back to the
   defaults in §2, and **say in your output exactly which path you wrote to**. Do not invent a third
   convention — the vault already has other note conventions competing for this space.

⚠️ **Weekly notes deserve extra care.** They are the rarest of the five, so "look before you write"
most often comes up empty precisely there — and a Chinese folder name like `Journal/周/` is exactly
what an English-UI user is most likely to have changed. If you are about to create the user's *first*
week note and you have not seen one before, either ask, or write it and state the path plainly.

## 2. Factory defaults (fallback only)

| Period | Default path format |
|---|---|
| day | `Journal/{{date:YYYY-MM-DD}}` |
| week | `Journal/周/{{date:YYYY}}-W{{week}}` |
| month | `Journal/月/{{date:YYYY-MM}}` |
| quarter | `Journal/季/{{date:YYYY}}-Q{{quarter}}` |
| year | `Journal/年/{{date:YYYY}}` |

The Chinese folder segments are pinned constants — they do **not** follow the UI language, because
changing them would orphan every note an existing user already has. A path that does not end in
`.md` gets `.md` appended.

## 3. Dates, and the one that bites

- `run_bash date +%G-W%V` gives ISO year and ISO week together (`2026-W35`).
- **A week note's `{{date:YYYY}}` is the ISO year, not the calendar year.** They disagree at the turn
  of the year, in both directions: 2025-12-29 is `2026-W01`, and 2027-01-03 is `2026-W53`. Using the
  calendar year puts the note in the wrong file. This is the only place the two differ — month /
  quarter / year paths all use the plain calendar year.
- Anchors: a week anchors to its Monday, month/quarter/year to the first day of the period.
  Quarter = ⌈month ÷ 3⌉.
- Ask the host for the date (`get_datetime`, or `date` on the machine you are running on). In a
  cloud session the clock is not the user's local date and can be a day off — which flips week
  boundaries. Say so rather than silently picking a week.

## 4. Writing discipline

**If the target file already exists, do not overwrite it.** Read it, and at most append. A user who
has written all day and gets their entry replaced by an empty template has lost real work — this
exact bug shipped once in this plugin and was fixed in 1.0.1; do not reintroduce it from the outside.

Distinguishing "not written yet" from "I could not read it" matters, and the tools make it easy to
get wrong: a failed read reports as *file not found* even when the real cause was a permission error
or a dropped network drive. So use the directory listing as the authority:

- The path showed up in your listing but will not read → **read failure. Stop, say so, write nothing.**
- The path is absent from the listing too → genuinely not there; you may create it.

A brand-new entry with no template configured is exactly one line: `# <file name>` followed by a
newline. If the user has a template, you cannot see it — which is another reason to look at an
existing entry from the same period and mirror its shape.

For which file tools to use in a local vs cloud vault, follow `amadeus-note-format` — that skill is
the single source for it, and it is not repeated here.

## 5. What you cannot do from here

- **Open the note in the app.** That is a renderer-side action. Write it, then report the path.
- **上一篇 / 下一篇.** They are defined relative to *the note currently open on the user's screen*,
  which the engine cannot see. Send them to the command palette.
- **Trigger the plugin's automation events.** `create` and `open` are emitted by the plugin's own
  go-to-a-period flow — `open` fires even when nothing is written, `create` only after a successful
  write — and a file you create from here goes through neither. If the user has an automation rule
  listening for them, tell them it will not fire.
- The calendar view and the status-bar 「今天写了没」 indicator are likewise view-side; the palette
  command 「周期笔记台:今天」 is the way in.

## 6. Boundaries

This skill covers **the five factory defaults, plus whatever pattern you can read off the user's
existing notes, plus asking when neither settles it**. It does **not** describe how the plugin parses
an arbitrary custom path format back into a date — that reverse-engineering logic lives in the
plugin and any prose copy of it would drift. A user with a custom format is served by looking at
their existing notes, not by you reimplementing the parser.

## Self-check before delivering

- [ ] I listed the vault and followed the user's existing pattern, rather than assuming defaults.
- [ ] If I fell back to defaults, I said which path I wrote to.
- [ ] Week notes: I used the ISO year, from `date +%G-W%V`.
- [ ] I did not overwrite an existing entry, and I did not treat an unreadable file as an empty one.
- [ ] I reported the path, and I did not claim to have opened it in the app.
