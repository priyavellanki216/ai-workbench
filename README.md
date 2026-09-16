# AI Workbench

> **Grounded research and action workflows for teams that need to move from evidence to a decision.**

AI Workbench is a customer-facing AI research product built to demonstrate the engineering loop behind a reliable AI application: **build → deploy → observe → learn → improve**. It combines persistent workspace concepts, document workflows, retrieval, structured model outputs, tool calling, feedback capture, and evaluation telemetry in one product surface.

## Live links

- **Live demo:** [Open the AI Workbench preview](https://3000-ioxw2po0s7pt2dtn9svnl-18315dd0.sg2.manus.computer)
- **GitHub:** [priyavellanki216/ai-workbench](https://github.com/priyavellanki216/ai-workbench)
- **Architecture:** [Read the architecture section below](#architecture)
- **Demo video:** [Watch the 14-second walkthrough](https://files.manuscdn.com/user_upload_by_module/session_file/310519663888720781/CecFETfklSdifqfo.mp4)

## Problem

Customer-facing AI systems fail when the answer is detached from the source trail, when actions happen without review, or when teams cannot explain whether the system is improving. Research is usually spread across PDFs, spreadsheets, analytics tools, and interview notes. The job is not simply to generate text; it is to produce a useful, inspectable next move.

## Users

AI Workbench is designed for product, growth, operations, and research teams who need to ask questions across a workspace and leave with a decision-ready artifact. The primary user can search prior work, upload a source, inspect citations, review a run trace, provide feedback, and stage an action without losing control of the underlying evidence.

## Product surface

The current experience includes:

- A persistent research workspace with recent threads and fast search.
- A grounded answer view with confidence, source citations, and an evidence inspector entry point.
- Document upload and indexing states, represented in the UI and ready for the storage pipeline.
- A run trace showing intent classification, retrieval, claim verification, and action suggestion.
- Safe tool-calling affordances that stage an experiment brief for review rather than making an external change automatically.
- Up/down feedback capture and a product signals view for groundedness, citation accuracy, latency, and failure categories.
- Explicit demo labeling for seeded telemetry; the product does not pretend sample numbers are production measurements.

## Architecture

```text
React + TypeScript client
        │
        │ typed tRPC procedures
        ▼
Express / Node server ─────────── Manus OAuth session
        │
        ├── Retrieval + LLM orchestration
        │     ├── structured response schema
        │     ├── citation / groundedness checks
        │     └── tool-call approval boundary
        │
        ├── PostgreSQL-compatible Drizzle schema
        │     ├── workspaces / conversations / messages
        │     ├── documents / indexing status
        │     ├── feedback
        │     └── evaluation runs
        │
        └── S3-compatible document storage
```

The shipped WebDev runtime uses React, TypeScript, Tailwind-compatible CSS, Express, tRPC, Drizzle, Manus OAuth, and managed storage. The domain schema is intentionally explicit about the entities required by a production implementation. The `server/_core/llm.ts` helper keeps model credentials server-side; the UI never receives provider keys.

### Live request paths

- `POST /api/documents/upload` accepts authenticated TXT, CSV, Markdown, and JSON files, stores the original bytes in managed object storage, normalizes the text, chunks it with overlap, creates embeddings through the server-side provider proxy, and persists the vectors in `documentChunks`.
- `POST /api/chat/stream` retrieves the highest-scoring chunks with cosine similarity, injects them into a grounded prompt, and returns `sources`, `delta`, `done`, and `error` Server-Sent Events. The client renders the answer as tokens arrive and updates the evidence trail from the retrieved chunks.
- The first pass intentionally keeps vectors in JSON for transparent local inspection. A production scale-up can move the same contract to a native vector column or pgvector without changing the UI behavior.

## AI workflow

1. **Classify intent.** Decide whether a request is a research question, comparison, summarization, or action request.
2. **Retrieve evidence.** Search indexed document chunks and connected workspace signals, then rerank for relevance.
3. **Generate a structured answer.** Return claims, citations, confidence, and an optional proposed action rather than an unbounded paragraph.
4. **Check groundedness.** Verify that each claim maps to retrieved evidence and block unsupported claims from being promoted to an action.
5. **Stage tools safely.** A tool call such as `experiment.create` is shown as awaiting approval. The system does not silently change an external system.
6. **Observe the run.** Record model, latency, token count, feedback, failure category, and evaluation scores so improvements can be tied to releases.

The project is wired for the built-in server-side LLM helper with structured JSON schema responses. Streaming can be added at the server boundary by proxying SSE and keeping the client rendering path compatible with the existing `Streamdown` renderer.

## Database design

| Table | Purpose |
| --- | --- |
| `users` | Auth identity, role, and last sign-in metadata. |
| `workspaces` | Tenant boundary for a user's research corpus. |
| `conversations` | Persistent saved threads and ownership. |
| `documents` | File metadata, storage key, indexing status, and chunk count. |
| `messages` | User, assistant, and tool messages plus model and latency metadata. |
| `feedback` | Up/down rating, category, and optional human note. |
| `evaluationRuns` | Dataset version, groundedness, citation accuracy, failure category, and latency. |

Binary files belong in managed object storage. The database stores metadata and the storage key, never document bytes.

## Evaluation and reliability

The signals view is deliberately labeled as a seeded demo snapshot. In a deployed environment, the cards are populated from `evaluationRuns` and message events, not hard-coded claims. The measurement plan is:

- **Groundedness:** percentage of generated claims supported by retrieved evidence.
- **Citation accuracy:** human or evaluator agreement that a citation supports the claim it is attached to.
- **Latency:** p50 and p95 from request acceptance to the final streamed token.
- **Feedback rate:** percentage of assistant answers receiving a user rating.
- **Failure categories:** unsupported claim, missing citation, tool timeout, retrieval miss, or provider error.
- **Task completion:** percentage of staged actions approved by a user.

## Recorded walkthrough

The [recorded walkthrough](https://files.manuscdn.com/user_upload_by_module/session_file/310519663888720781/CecFETfklSdifqfo.mp4) uses the live preview states: the grounded research workspace, a saved positive feedback event, and the Product Signals observability view. It is intentionally short so a recruiter can understand the product loop in one pass.

## Iteration narrative

| Version | Focus | Product / engineering proof |
| --- | --- | --- |
| V1 | Working AI product | A useful grounded answer with citations. |
| V2 | Persistent users and conversations | Auth, saved threads, ownership, and database queries. |
| V3 | Document workflows | Upload metadata, storage keys, chunking, and retrieval. |
| V4 | Tool calling and structured outputs | Typed response contracts and approval boundaries. |
| V5 | Evaluation and feedback | Ratings, evaluation runs, and failure taxonomy. |
| V6 | Reliability and safety | Grounding checks, timeouts, fallbacks, and transparent traces. |
| V7 | Performance and UX | Streaming, search, reduced latency, and a polished operator console. |

## Demo

Start on the Workspace view. Select a recent thread or use the search field. Inspect the answer's source trail and run trace. Click **Product signals** in the sidebar to see the observability narrative. Use **Add sources** to preview the document-indexing workflow, or type a prompt and press **⌘ Enter** to see the response state and trace feedback.

The demo intentionally uses seeded UI data so it remains deterministic and safe to share. The server-side contracts and schema show where live persistence, storage, LLM calls, evaluation, and feedback writes belong.

## Local development

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm check
pnpm test
pnpm build
```

## Deployment notes

The managed WebDev runtime provides the development server, auth plumbing, database configuration, and storage integration. Production deployments should keep provider credentials server-side, use background processing for document indexing, apply request timeouts around provider calls, and emit structured logs for retrieval, tool, and evaluation events.

## License

MIT
