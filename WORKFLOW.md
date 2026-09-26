# Working with git

Four people, one repository. This is the whole process — there is no more of it
than what is on this page.

---

## The one rule

**Never commit to `main`.** Every change goes through a branch and a pull
request, including one-line fixes, including the owner's.

Not bureaucracy: `main` is what the other three people pull every morning. A
broken `main` stops all four of you, and the person who broke it usually cannot
tell, because it works on their machine.

---

## The daily loop

These six commands cover about 95% of what you will do.

**Start something new** — always from a fresh `main`:

```bash
git checkout main && git pull
```

```bash
git checkout -b rahul/enquiry-list
```

**While you work**, commit often. Small commits are easier to undo:

```bash
git add -A && git commit -m "Add enquiry table with empty state"
```

**When it is ready:**

```bash
git push -u origin rahul/enquiry-list
```

Then open a pull request on GitHub and ask for a review.

**Branch names:** `yourname/what-it-does`. Your name first so `git branch -r`
groups by person and everyone can see who is working on what.

---

## Keeping your branch fresh

If your branch lives longer than a day, pull `main` into it:

```bash
git checkout main && git pull && git checkout - && git merge main
```

Do this **daily**, not when you finish. Merging one day of other people's work
is a two-minute job; merging three weeks of it is a bad afternoon and is how
branches get abandoned.

> **Use `merge`, not `rebase`.** Rebase rewrites history, so a branch you have
> already pushed then needs a force-push — and a force-push is the one command
> that can destroy work that is not recoverable. Merge is uglier in the log and
> much harder to lose work with. We are optimising for not losing work.

---

## The two conflicts you will definitely hit

### `package-lock.json`

Happens whenever two people add a dependency. **Never edit this file by hand** —
it is machine-generated and hand-merging it produces a broken dependency tree
that fails in ways that make no sense.

Take `main`'s version and regenerate:

```bash
git checkout --theirs frontend/package-lock.json && cd frontend && npm install
```

```bash
git add frontend/package-lock.json && git commit
```

`npm install` rewrites the lockfile correctly from both `package.json` files.

### `products/dms/routes.tsx`

The one file all three of you touch. Keep each module's entry to a single line
in a predictable place, and a conflict becomes "keep both lines" rather than
anything to think about.

If it starts conflicting often, that is a signal — tell the owner, and the file
gets restructured rather than everyone continuing to fight it.

---

## Pull requests

**Keep them small.** Under ~400 lines changed. A large PR does not get reviewed,
it gets approved — nobody reads 1,200 lines carefully, and everyone pretends
they did. Two small PRs get two real reviews.

**Say what and why.** The diff shows what changed; it cannot show why:

```
Add enquiry list screen

Table, filter chips and all four states. Uses MSW mock data —
the real endpoint does not exist yet.

Left the date filter out: needs the range picker from packages/ui,
which is not built. Tracked separately.
```

**Before you open it,** run what CI would run:

```bash
cd frontend && npm run lint && npm run typecheck && npm test
```

A PR that fails lint wastes a reviewer's time on something a command would have
told you in ten seconds.

**After it merges,** delete the branch — GitHub offers a button. Stale branches
pile up fast and nobody remembers which are alive.

---

## Things that will hurt

| Don't | Why |
|---|---|
| `git push --force` on a shared branch | Deletes other people's commits, usually unrecoverably. If you think you need it, ask first. |
| Branches alive for weeks | Every day apart makes the merge worse. Split the work and merge in pieces. |
| `git commit -am` without looking | `git status` first, every time. This is how the wrong file gets committed. |
| Committing a `.env` file | Already gitignored. If you ever see one in `git status`, stop and tell the owner — a secret in git history is not removed by deleting it in the next commit. |
| Committing `node_modules` | Also gitignored. Seeing it in `git status` means something is wrong with your setup. |

---

## When you get stuck

Git is recoverable far more often than it feels. Before trying anything drastic:

```bash
git status && git log --oneline -5
```

Paste both to the owner. Almost nothing is actually lost — commits survive for
weeks even after a bad reset, and `git reflog` finds them.

**The one genuinely dangerous command is `git push --force`.** Everything else
can be walked back.

---

## Owner setup (one-time, on GitHub)

Turn the top rule into something the machine enforces, rather than something
people remember. **Settings → Branches → Add branch ruleset** for `main`:

- Require a pull request before merging
- Require approvals: 1
- Block force pushes

Without this, "never commit to `main`" is a convention that gets broken at 6pm
on a Friday by someone in a hurry. Takes two minutes and removes the whole class
of problem.
