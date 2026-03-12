# XBrain

A local-first multi-agent chat TUI for running a human, Codex, Claude Code, and Gemini in the same room.

## Features

- Local-first session storage
- Explicit mentions route turns: `@codex`, `@claudecode`, `@gemini`
- Unmentioned turns use orchestrated lead selection
- Automatic agent availability tracking
- Ink-based terminal UI

## Architecture

- `src/core`: orchestration, routing, transcript, and session logic
- `src/adapters`: CLI discovery and adapter contracts
- `src/storage`: local session and event persistence
- `src/app.ts`: Ink app shell

## Development

Requirements:

- Node.js 22+
- Yarn
- Installed local CLI tools for any agents you want to use

Install:

- `npm install -g xbrain`
- `xbrain`

Commands:

- `yarn dev`
- `yarn test`
- `yarn smoke`

The runtime path uses Node.js native type stripping, so the app can run TypeScript sources directly on Node 22.

## Release

- Update `package.json` to the release version on `main`
- Push the commit to `main`
- Create and push a tag like `v0.1.1`
- The `publish.yml` GitHub Actions workflow will validate the tag and publish to npm
