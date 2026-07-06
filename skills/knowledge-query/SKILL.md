---
name: knowledge-query
description: Query private knowledge base via MCP tools. Handles query strategy, evidence filtering, citation standards, and evidence insufficiency judgment.
---

# Knowledge Query — Knowledge Base Access

Query the private knowledge base through MCP tools and manage evidence collection. This skill is used by all agents (SA, SE, MDE, DEV, TSE) during their respective phases.

## Integration Contract

- **Entry:** `/scc-dev-sphere:knowledge-query`
- **Inputs:** Query intent from the calling agent
- **Outputs:** Structured search results, evidence snapshots saved to `evidence/knowledge/`
- **Completion criteria:** Query results returned, evidence snapshots saved (if results adopted into artifacts)

## Execution

### Step 1: Understand Query Intent
The calling agent specifies what they need to find, why they need it, and required confidence level.

### Step 2: Execute MCP Query
Use available MCP knowledge base tools to search. Try multiple query formulations if initial results are insufficient.

### Step 3: Evaluate Results
For each result, assess relevance, source reliability and currency, and whether additional queries are needed.

### Step 4: Save Evidence
For results that WILL BE USED in design artifacts:
1. Assign an evidence ID (EV-xxx).
2. Save a snapshot to `evidence/knowledge/EV-xxx-<descriptive-name>.md`.
3. Update `evidence/evidence-registry.json` with the new entry.

### Step 5: Flag Evidence Gaps
If expected information cannot be found, record the gap and report to the calling agent.
