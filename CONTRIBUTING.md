# Contributing to godot-mcp

## Before You Start

Usually, the best tools are built to solve real problems encountered when working and playing. godot-mcp was born from the desire to accelerate Godot game development when being aided by an AI agent. This MCP is focused on saving time and reducing development costs, and that has driven the development of each tool in the kit. This same focus will likely lead to some removals, in time. There is no room for tools that gather dust.

This project is looking for solutions to real-world problems that wasted your time, cost you (in tokens and real-world money), or frustrated you to no end. If you're not sure whether something's worth building, open an issue describing the problem first. We can figure out together if it's a good fit before you put in the work.

## Dev Setup

```bash
cd server
npm install
npm run build
npm test
```

## Making Changes

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run tests: `npm test`
4. Build: `npm run build`
5. If you changed tool definitions, regenerate docs: `npm run generate-docs`
6. Commit with a conventional commit message (see below)
7. Push and open a PR

**Important:** The `main` branch is protected. All changes go through PRs.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning via release-please.

```
feat: add new feature        -> minor version bump (2.1.0 -> 2.2.0)
feat!: breaking change       -> major version bump (2.1.0 -> 3.0.0)
fix: fix a bug               -> patch version bump (2.1.0 -> 2.1.1)
refactor: change internals   -> no release on its own
docs: update documentation   -> no version bump
chore: maintenance tasks     -> no version bump
```

Examples:
- `feat: add input injection tool for testing`
- `fix: return newest messages instead of oldest`
- `docs: update Claude Code setup guide`

## Adding New Functionality

Three rules shape the tool surface. They replaced the old "always consolidate" convention in v4, after cross-client permission models made the read/write boundary load-bearing.

**1. Don't build what a file edit already does.** Agents read and write `.tscn`/`.gd`/`.tres` text natively. A tool earns its place only when it covers what files can't: editor state (open/save/selection), verification of what the editor actually loaded, data that's binary-encoded inside the text format (TileMap/GridMap cells), operations where the editor's bookkeeping prevents real mistakes (reparenting), or anything involving the running game. "It would be convenient" is not enough — `scene create`, `node create/delete`, and `connect_signal` were all removed for this reason.

**2. Never mix reads and writes in one tool.** Clients grant permissions per tool name, so a read-only action sharing a tool with a destructive one can never be safely auto-allowed. Read operations go in a `godot_<domain>_read` tool (`readOnlyHint: true`), mutations in `godot_<domain>_edit`. Single-class tools keep plain names. Within a class, consolidate related operations as actions — single-action tools are still single-purpose kitchen gadgets.

**3. Annotations must be truthful.** `readOnlyHint: true` only on tools that change nothing; `destructiveHint: true` only where data is actually destroyed (deletes, clears), not on reversible writes; `idempotentHint: true` where repeating a call converges. The annotations test enforces the conventions wholesale.

**When adding an action to an existing tool:**
1. Add the action branch in `server/src/tools/<category>.ts` — give the action literal a `.describe()` (it becomes the model-visible summary line) and every parameter a `.describe()`
2. Add the corresponding GDScript handler in `godot/addons/godot_mcp/commands/`
3. Update the command routing in `command_router.gd` if needed
4. Add tests in `server/src/__tests__/tools/`
5. Run `npx vitest run -u` — the published-schema snapshot (`src/__tests__/core/__toolsnaps__/`) will change; review that diff as carefully as the code, it is exactly what models see
6. Run `npm run generate-docs` to update API docs
7. For changes that affect how agents choose or sequence tools, consider an eval task in `server/evals/tasks.json` — see [server/evals/README.md](server/evals/README.md)

**Note:** Usage telemetry is on by default (`~/.godot-mcp/usage.log`). Tools and actions that see little use are candidates for removal. Every piece of this codebase needs to earn its keep.

## Updating Documentation

This repo has two READMEs:
- `README.md` (repo root) - what GitHub visitors see. This is the one you edit.
- `server/README.md` - what npm package users see. Generated from the root README by `npm run generate-docs`, which rewrites relative links to absolute GitHub URLs so they work on npmjs.com. Never edit it by hand.

If your change touches the root README, run `npm run generate-docs` to refresh the npm copy.

## Releases

**Do not manually bump version numbers.** Release-please handles all versioning automatically.

When your PR is merged:
1. release-please creates a release PR with version bumps
2. When that PR is merged, it publishes to npm and creates a GitHub release
3. The addon zip is attached to the release

The MCP server and Godot addon share version numbers and are released together.

## Architecture

```
[Claude] <--stdio--> [MCP Server (TypeScript)] <--WebSocket:6550--> [Godot Addon (GDScript)]
```

- `server/src/tools/` - MCP tool definitions
- `server/src/core/` - registry, schema flattening, validation-error formatting
- `server/src/connection/` - WebSocket client to Godot
- `server/evals/` - agentic eval harness (manual; never starts Godot)
- `godot/addons/godot_mcp/commands/` - GDScript command handlers
- `godot/addons/godot_mcp/core/` - Addon utilities (logger, debugger plugin)

For the full picture — connection lifecycle, the game bridge, release mechanics — see the [Architecture Guide](docs/architecture.md).

## Questions?

Open a [GitHub issue](https://github.com/satelliteoflove/godot-mcp/issues) or start a [discussion](https://github.com/satelliteoflove/godot-mcp/discussions).
