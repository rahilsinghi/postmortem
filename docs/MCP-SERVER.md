# Postmortem MCP server

Run Postmortem's decision-archaeology engine as an MCP server so Claude
Code (or any MCP host) can query your ledgers natively from the editor
or terminal.

## Install

Backend deps are declared in `backend/pyproject.toml`. One-time:

```bash
cd backend && uv sync
```

## Register with Claude Code

```bash
claude mcp add postmortem \
  --command "uv run --project $(pwd)/backend python -m app.mcp_server" \
  --transport stdio

claude mcp list
# → postmortem     connected     stdio     5 tools
```

To remove:

```bash
claude mcp remove postmortem
```

## Environment

The server reads `ANTHROPIC_API_KEY` from `.env.local` at the repo root
(same convention as the FastAPI backend). For read-only tools
(`list_repos`, `list_decisions`, `open_decision`) the key isn't needed.
For live querying (`query`, `impact`) it is.

## Tools

| Name | Cost | What it does |
|---|---|---|
| `postmortem_list_repos` | free | Markdown table of cached ledgers + ingestion spend |
| `postmortem_list_decisions` | free | Summary of decisions in a repo, optional category filter |
| `postmortem_open_decision` | free | Full rationale + alternatives + citations for one PR |
| `postmortem_query` | ~$0.9–$7 | Ask Opus 4.7 a question, get cited answer + self-check verdict |
| `postmortem_impact` | ~$3–$5 | BFS from anchor PR, trace cascading consequences |

## Example transcripts

```
» claude "list postmortem ledgers"
...invokes postmortem_list_repos → returns markdown table...

» claude "why does hono reject node:* modules in core?"
...invokes postmortem_query(repo="honojs/hono", question=...) → returns
   cited answer with self-check verdict...
```

## Offline mode

All four read-only tools work without an API key and without a backend
process running — they read `.cache/ledger.duckdb` directly.

`postmortem_query` and `postmortem_impact` need internet + API key
(they call Anthropic Messages API directly; the MCP server does NOT
round-trip through the FastAPI backend).

## Troubleshooting

- **`No ledger database found`** — run `scripts/ingest.py` against a repo
  first, or ensure `.cache/ledger.duckdb` exists at the repo root.
- **`ANTHROPIC_API_KEY not set`** — add it to `.env.local` at the repo
  root. The MCP server does NOT inherit the key from the invoking shell
  because Claude Code's MCP subprocess launcher scrubs most env vars.
  `.env.local` via `resolve_secret()` is the sanctioned path.
- **Tool registration failing** — run the server in one-shot debug mode
  to see stderr: `uv run --project backend python -m app.mcp_server`
  and send a JSON-RPC init over stdin.

## Rebuild + release

There's nothing to build — it's a Python stdio server. Just `git pull`
and `uv sync` to get updates.
