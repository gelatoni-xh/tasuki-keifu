# Governance V2 observability graph

The graph in `src/lib/observability-graph.ts` is a reviewed presentation snapshot of the Agent's V2 workflow. It is not generated from runtime traces. The three top-level stages are normalization, membership governance, and person-fact governance. Dashed boxes inside the stages describe rules, LLM requests, and optional Web Search calls; they are not additional LangGraph nodes. The membership child Graph reflects Agent PR #51: six real stages, with a direct path from conflict collection to finalization when no substantive conflict exists.

Before publishing an Agent workflow change, compare the Agent repository diff for:

- `src/governance-v2/graph.ts`: nodes, edges, conditional routing, and child graphs.
- `src/governance-v2/normalization.ts`, `agents.ts`, `rules.ts`, and `research.ts`: rule gates, verdicts, evidence checks, and network-tool availability.

Proactively ask whether the public graph and hover text should be updated when the Agent workflow or decision rules change. A temporary or undeployed change need not appear on the public page yet. Once the version to publish is settled, update all three translations in `src/lib/observability-graph.ts`, then check the graph and hover details in `/zh/observability`, `/en/observability`, and `/ja/observability`. The graph tab is public. The details tab is public except for findings and evidence, which are queried only for a valid signed-in session on both the page and summary API.
