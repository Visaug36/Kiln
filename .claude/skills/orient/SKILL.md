---
name: orient
description: Use at the start of a session on Recast, or when catching up on it — "where are we", "what's the state of the project", "what have we done so far", "what's left", "what's outstanding", "catch me up", "continue from the last session", "what did we decide about X", "why is it built this way", "why don't we just…", "why isn't X supported", "is there a reason we didn't…". Also use when handed a summary of a previous session, or when a plan is about to re-propose something the project may already have ruled out.
---

# Where Recast writes things down

**Read one file, not four.** Each question below has exactly one home. Going to
the right one first is the whole point of this skill — the history is long, and
loading all of it to answer one question is the thing it exists to prevent.

| The question                                                   | Read                                            |
| -------------------------------------------------------------- | ----------------------------------------------- |
| What is this, what are the rules, what must never break        | `CLAUDE.md` — already loaded                    |
| **Why** is it built this way? What did we reject, and why?     | `docs/DECISIONS.md`                             |
| How did we get here? What shipped when, and what did it teach? | `docs/STAGES.md`                                |
| What is still outstanding, and whose is it?                    | `docs/OPEN.md`                                  |
| What has gone wrong before, and what shape did it take?        | `.claude/skills/probe/references/known-bugs.md` |
| What does Recast convert, and how is a pair reached?           | `README.md` → Support matrix                    |
| How do I add a format or a pair?                               | the `add-converter` skill                       |
| Is this conversion actually correct?                           | the `probe` skill                               |
| What should this button, warning or error say?                 | the `interface-copy` skill                      |
| How do I re-measure the memory multipliers?                    | the `measure-memory` skill                      |
| Is this stage finished?                                        | the `release-check` skill                       |

## Three rules that save a wasted turn

**Check `DECISIONS.md` before proposing anything structural.** It records what
was rejected and why, which is exactly what a fresh session cannot know and will
otherwise re-propose in good faith. "Why don't we just convert on a server" has
an answer, and it is not a small one.

**Check `OPEN.md` before calling something a bug.** Several known limits are
deliberate and already have an owner — right-to-left, Korean, merged-cell layout,
the inline-run gap. They are open because of a decision, not an oversight, and
each entry names what would have to change.

**Read the shapes in `known-bugs.md`, not the details.** Recast's bugs recur in
form and not in substance: a reader that mispairs two sequences, a regex that
stops at the first closing tag, an encoding assumption that holds for ASCII, a
pattern that silently drops what it does not match. Every one of them produced
output that looked entirely plausible, and most shipped under a green suite.

## If you are about to finish a stage

`docs/` is part of the definition of done, not a nice-to-have. `release-check`
has the sequence; `CLAUDE.md` has the one-line rule.
