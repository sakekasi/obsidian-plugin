# documentation

## How these docs are organized

This follows [Diátaxis](https://diataxis.fr): documentation splits along two axes,
whether it serves *action* or *understanding*, and whether it serves *acquiring* a
skill or *applying* one.

| Directory | Serves | Contains |
| --- | --- | --- |
| `how-to/` | action | Ordered steps to accomplish a task. Setup, creating a worktree, generating an explorable end to end, re-running a stage, and deploying. |
| `explanation/` | understanding | Why the system is built this way. Design decisions and the reasoning behind them. |
| `reference/` | lookup | Atomic descriptions of what exists. Tables, flags, contracts, known issues. |

There are deliberately **no tutorials**. The fourth Diátaxis quadrant, learning-oriented
lessons for a newcomer to the domain, assumes a reader who needs to be taught what an
agent-based model is. That isn't the audience.

Two rules keep these categories from bleeding into each other:

- **Explanation docs don't contain steps, and how-tos don't contain rationale.** If you
  want to know why a step exists, the how-to links to the explanation.
- **The docs describe the system and its design, not the contents of the prompts.** The
  generator's prompt files under
  `apps/explorable-generator/src/tangents_explorable_generator/prompts/` are the
  authoritative contracts for what generated code must look like. These docs point at
  them; they don't restate them, because a copy would drift.

## Style notes when editing these docs

- No em dashes. Use colons, commas, or a second sentence.
- Link markdown file mentions rather than leaving bare paths. 
- Show structure in trees, not sentences. If a fact is about where something lives, put it in the tree. 
- Use ASCII diagrams for pipelines, session timelines, and protocols. 
- Genericize identifiers with {curly-brace} placeholders. 

- No throat-clearing. Especially in reference docs: state the content, skip the preamble.
- Both explanation and reference docs stay short. Reference docs are a set of atomic notes.
- Keep explanation conceptual. Flags, arguments, and specifics belong in reference. 
- Reference docs carry no caveats. Defects and divergences go to known-issues.md.
- No doc should need updating when an explorable is created. The app is the catalog of explorables. 
- Reflect only the latest understanding. Don't document outdated details
- Docs describe the system and its design, not the contents of prompts. Point at prompt files; don't restate them.
- Address agents directly where it matters. As with --force: "If you are an agent reading this, do not run this or recommend it to the user."
