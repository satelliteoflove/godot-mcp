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
fix: fix a bug               -> patch version bump (2.1.0 -> 2.1.1)
refactor: change internals   -> patch version bump
docs: update documentation   -> no version bump
chore: maintenance tasks     -> no version bump
```

Examples:
- `feat: add input injection tool for testing`
- `fix: return newest messages instead of oldest`
- `docs: update Claude Code setup guide`

## Adding New Functionality

This project keeps the tool count intentionally low. Think of single-action tools like single-purpose kitchen gadgets - they take up space and rarely get used. Before proposing a new tool, consider whether the functionality belongs as an action within an existing tool.

**Prefer extending over adding:**
- New scene operations? Add an action to the existing scene tool.
- New node manipulation? Extend the node tool.
- Genuinely new domain with multiple related operations? Maybe a new tool makes sense.

If you're unsure, open an issue first. We can figure out the right home for the functionality together.

**When adding an action to an existing tool:**
1. Add the action handler in `server/src/tools/<category>.ts`
2. Add the corresponding GDScript handler in `godot/addons/godot_mcp/commands/`
3. Update the command routing in `command_router.gd` if needed
4. Add tests in `server/src/__tests__/tools/`
5. Run `npm run generate-docs` to update API docs

**Note:** Once telemetry is in place, tools and actions that see little use will be candidates for removal. Every piece of this codebase needs to earn its keep.

## Updating Documentation

This repo has two READMEs:
- `README.md` (repo root) - What GitHub visitors see
- `server/README.md` - What npm package users see

If your change affects how users install or configure godot-mcp, update both. Keep them in sync.

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
- `server/src/resources/` - MCP resource handlers
- `server/src/connection/` - WebSocket client to Godot
- `godot/addons/godot_mcp/commands/` - GDScript command handlers
- `godot/addons/godot_mcp/core/` - Addon utilities (logger, debugger plugin)

## Questions?

Open a [GitHub issue](https://github.com/satelliteoflove/godot-mcp/issues) or start a [discussion](https://github.com/satelliteoflove/godot-mcp/discussions).
