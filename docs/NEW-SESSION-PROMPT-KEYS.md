# Helper session prompt — keys + Managed Agents verification

> Paste the block below into a **fresh** Claude Code session opened in the repo root
> (`/Users/rahilsinghi/Desktop/postmortem/postmortem`). That session will walk you
> through creating and setting `ANTHROPIC_API_KEY` + `GITHUB_TOKEN`, verifying
> Managed Agents beta access, running both smoke scripts, and producing a success
> report to paste back into the original build session.

---

## The prompt

```
You are a setup assistant for the Postmortem hackathon project. The main build session has scaffolded
the repo and is waiting on three things from me before Day 2:

1. ANTHROPIC_API_KEY set locally so `scripts/verify-opus-4-7.py` runs green
2. GITHUB_TOKEN set locally (public-repo read scope is enough for now; Day 2 needs it for GraphQL)
3. Confirmation that my Anthropic account is enrolled in the Managed Agents beta
   (header: managed-agents-2026-04-01) so `scripts/smoke-managed-agents.py` runs green

Read CLAUDE.md and docs/SPEC.md §1 for context (30 sec skim — do NOT re-execute Day 1).

Then walk me through these steps, one at a time, pausing for my confirmation between each:

### Step 1 — Anthropic API key
- Open https://console.anthropic.com/settings/keys in my browser (use the Chrome MCP if available).
- Tell me exactly which button to click to create a new key named "postmortem-hackathon".
- Once I paste the key back to you, write it to `.env.local` at the repo root in the form:
    ANTHROPIC_API_KEY=sk-ant-...
- Also add an export line to `~/.zshrc` (append, don't overwrite) so future terminals pick it up:
    export ANTHROPIC_API_KEY="sk-ant-..."
- Remind me to run `source ~/.zshrc` in any open terminals.
- Verify by running: `uv run --project backend python scripts/verify-opus-4-7.py`
  Expected: a short "Hello Postmortem" completion from claude-opus-4-7.

### Step 2 — GitHub token
- Open https://github.com/settings/tokens?type=beta (fine-grained PAT page).
- Create a token named "postmortem-hackathon", expiry 30 days, resource owner = me, scope =
  "Public repositories (read-only)". Permissions needed: Contents (Read), Issues (Read),
  Pull requests (Read), Metadata (Read).
- Once I paste the token back, write it to `.env.local`:
    GITHUB_TOKEN=github_pat_...
- Also append an export line to `~/.zshrc`.
- Verify by curl'ing the GitHub API:
    curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/rate_limit | head
  Expected: a JSON response with core limit of 5000 (not 60 — 60 means the token wasn't picked up).

### Step 3 — Managed Agents beta check
- I am not sure whether my account has the `managed-agents-2026-04-01` beta enabled.
- Run `scripts/smoke-managed-agents.py`. It has a pre-flight check that will print a clear
  "enrolled" or "NOT enrolled — request access at <url>" message.
- If NOT enrolled:
    - Open https://console.anthropic.com/settings/limits or the "Beta features" page.
    - If there's a self-serve toggle, tell me which one and I'll flip it.
    - If it requires a form or email, draft the email for me to send to the Anthropic
      hackathon contact (subject: "Managed Agents beta access — Built with Opus 4.7 hackathon").
- Once enrolled, re-run the smoke script. Expected output ends with:
    hello from the sandbox

### Step 4 — Success report
When all three are green, produce this exact report block (copy-pastable to the build session):

    ---
    ## Keys + beta — success report
    - ANTHROPIC_API_KEY: set in .env.local and ~/.zshrc, verified via verify-opus-4-7.py
    - GITHUB_TOKEN: set in .env.local and ~/.zshrc, rate_limit shows 5000 core
    - Managed Agents beta: enrolled, smoke-managed-agents.py prints "hello from the sandbox"
    - .env.local is in .gitignore (verified no risk of committing keys)
    - Ready for Day 2.
    ---

If any step fails, STOP and give me a precise diagnosis (exact error, suspected cause,
smallest next action). Do not continue past a red step.

Never echo the full key value back to me in plain text after I've pasted it (partial masking
like sk-ant-****1234 is fine for confirmation).

Do not commit `.env.local` or modify .gitignore. If you see `.env.local` in `git status`
untracked list, that's correct — it's already gitignored.

Go.
```

---

## Notes for the main build session

- Expected wall time for the fresh session: 10–20 min (mostly waiting on browser clicks).
- If Managed Agents beta requires a form, the unblocking step is Day 2-blocker #1 — flag immediately.
- After the success report comes back, paste it into the build session and we move to Day 2 planning.
