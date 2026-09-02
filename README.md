# Squirrel Board

**Capture ideas with your agent. Decide what deserves to become work.**

Squirrel Board is a shared ideas backlog for humans and AI agents. It preserves promising ideas that emerge during conversation without silently turning them into commitments.

The agent can notice, capture, retrieve, connect, and propose. The human decides what becomes active.

> Capture first. Triage later. Do not turn every squirrel into a project.

## Why WebMCP

Conversational AI is good at noticing and structuring ideas in the moment, but chat history is a poor durable backlog. Copying ideas manually interrupts the conversation, while pursuing every interesting idea immediately destroys focus.

WebMCP lets the agent work with the same live backlog the human is viewing. The agent uses structured site tools instead of guessing its way through visual controls, and every authoritative decision remains inspectable in the normal human interface.

Squirrel Board exposes four tools:

| Tool | Purpose | Changes authoritative state? |
|---|---|---|
| `capture_idea` | Preserve a new idea as Captured | Creates an idea, but does not activate it |
| `list_ideas` | Read the backlog, optionally by status | No |
| `get_idea` | Read one idea and its current fields | No |
| `propose_update` | Suggest a status, next action, or notes change | No; waits for human review |

The proposal workflow is the product's central collaboration boundary. An agent proposal appears in **Pending proposals**. A human may approve or reject it. Only approval changes the idea, and the resolution is written to the visible decision log with its reason.

Humans do not need to wait for an agent proposal to manage their own backlog. Every idea card has a **Triage** action for directly setting status, next action, and notes. The human supplies a short reason, and Squirrel Board writes that decision to the same visible log.

## Human-agent workflow

1. An idea emerges during other work.
2. The agent calls `capture_idea` with a concise title and why it might matter.
3. The idea appears immediately on the shared board with status **Captured**.
4. The agent can inspect existing ideas and propose a bounded update.
5. The human approves or rejects the proposal, or directly triages an idea, in the normal interface.
6. Squirrel Board records the human decision and reason.

Capturing is not committing. That is the entire point.

## Text field limits

Character limits are enforced after leading and trailing whitespace is removed.

| Surface | Field | Required | Allowed length |
|---|---|---:|---:|
| Human quick capture | Idea title | Yes | 3–120 characters |
| Human quick capture | Why it might matter | Yes | 3–500 characters |
| Human triage | Next action | No | 0–500 characters |
| Human triage | Notes | No | 0–5,000 characters |
| Human triage | Decision reason | Yes | 3–500 characters |
| WebMCP `capture_idea` | Title | Yes | 3–120 characters |
| WebMCP `capture_idea` | Why | Yes | 3–500 characters |
| WebMCP `capture_idea` | Notes | No | 0–5,000 characters |
| WebMCP `propose_update` | Proposed next action | Yes | 1–500 characters |
| WebMCP `propose_update` | Proposed notes | Yes | 1–5,000 characters |
| WebMCP `propose_update` | Reason | Yes | 3–500 characters |

Human and agent write paths enforce the same underlying field limits. Live character counts for bounded human inputs remain a possible usability enhancement.

## Run locally

Requirements:

- Node.js 22.13 or newer
- npm

Install and start the development site:

```bash
npm install
npm run dev
```

The local development environment supplies a project-local D1-compatible database. Open the local URL printed by the development server.

To exercise site tools, open Squirrel Board in ChatGPT's in-app browser using a WebMCP-capable model. The human interface remains fully usable in browsers without WebMCP support.

## Build

```bash
npm run build
```

Database schema changes can be generated with:

```bash
npm run db:generate
```

## Architecture

- Vinext / React / TypeScript
- Cloudflare-compatible server output
- D1-compatible SQLite persistence
- JavaScript WebMCP tool registration on the top-level page
- Shared application routes for both human and agent actions

The app does not contain an AI model or chat interface. The visiting agent is already the intelligence. Squirrel Board supplies the durable shared state and the collaboration boundary.

## Data and privacy

The hackathon demonstration board is intentionally public. Do not capture private, sensitive, or confidential information in it.

The application has no user accounts, private workspaces, external connectors, analytics, file uploads, or embedded AI API keys.

### Why there is no public delete control

The demonstration intentionally does not expose idea deletion in the public interface or through WebMCP. Because the board has no authentication or record ownership, a public delete action would allow any visitor or visiting agent to erase shared data. Omitting it preserves the product's central authority boundary: agents may capture and propose, while consequential changes require an identifiable human decision.

This is a deliberate security choice, not an assumption that backlogs never need cleanup. The appropriately narrow answer is an operator-only maintenance path for removing test data and accidental records. A fuller product could add authenticated, human-authorized soft deletion with confirmation and an audit entry; an agent could propose removal, but should not perform it directly.

The repository now includes that narrow operator path. It is deliberately absent from the UI and WebMCP. The deployment must have a secret `SQUIRREL_BOARD_OPERATOR_TOKEN`, and the same token must be supplied locally through that environment variable or an ignored `.env.operator` file.

Preview records whose titles begin with a QA prefix:

```bash
npm run cleanup -- --prefix QA-0901
```

Delete only the records shown by that preview:

```bash
npm run cleanup -- --prefix QA-0901 --execute --confirm DELETE_SELECTED_IDEAS
```

Explicit IDs are also supported with `--ids IDEA-004,IDEA-005`. Every operation is capped at 50 explicit IDs. Deleting an idea also deletes its linked proposals and decision-log entries; the command stops without deleting anything if any requested ID is missing.

## Status vocabulary

- Captured
- Exploring
- Decision needed
- Active
- Parked
- Done
- Dropped

**Parked** means safely preserved for a better time or trigger. It is not failure, and it creates no catch-up debt.

## License

MIT. See [LICENSE](LICENSE).
