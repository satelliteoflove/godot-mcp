# Changelog

## [3.0.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.0.2...godot-mcp-v3.0.0) (2025-12-30)


### ⚠ BREAKING CHANGES

* Tool API has changed significantly. All tools now use action-based schemas instead of separate tool definitions.
* First stable release

### Features

* add AnimationPlayer support with full read/write capability ([#6](https://github.com/satelliteoflove/godot-mcp/issues/6)) ([b99006b](https://github.com/satelliteoflove/godot-mcp/commit/b99006b6f537c7808de838ec9feb4475b9d2bb50))
* add automatic API documentation generation ([#17](https://github.com/satelliteoflove/godot-mcp/issues/17)) ([ba25315](https://github.com/satelliteoflove/godot-mcp/commit/ba253151513199cfdc2fecc1072602a9b8d0b02a))
* add CI/CD with GitHub Actions and release-please ([060487a](https://github.com/satelliteoflove/godot-mcp/commit/060487a5a8db11d364c567fd4f04b95bfae2e7d9))
* add get_resource_info tool for inspecting Godot resources ([#35](https://github.com/satelliteoflove/godot-mcp/issues/35)) ([a0c94e2](https://github.com/satelliteoflove/godot-mcp/commit/a0c94e23825b65e345bd0249a41a6a4fcfc9fb6a))
* add screenshot capture tools ([221482a](https://github.com/satelliteoflove/godot-mcp/commit/221482a4c65938ae81d2e3d1a04ce64b2e9d4795))
* add TileMapLayer and GridMap editing support ([#8](https://github.com/satelliteoflove/godot-mcp/issues/8)) ([3fa5180](https://github.com/satelliteoflove/godot-mcp/commit/3fa518048c9a17a1f849b7b225148c4defe93733))
* auto-generate README sections from tool definitions ([#37](https://github.com/satelliteoflove/godot-mcp/issues/37)) ([e823e46](https://github.com/satelliteoflove/godot-mcp/commit/e823e46e2c7e892fdda9e2bf8370bb3dd415139e))
* initial implementation of godot-mcp ([6730180](https://github.com/satelliteoflove/godot-mcp/commit/6730180745404cdf3fec2bc879a9012d5a90acec))
* scene building enhancements and input mappings ([#27](https://github.com/satelliteoflove/godot-mcp/issues/27)) ([3ecf4af](https://github.com/satelliteoflove/godot-mcp/commit/3ecf4af2ecc0b65aa94ec13f4c61c3c59572132f))


### Bug Fixes

* bump to 2.0.1 for npm publish ([#46](https://github.com/satelliteoflove/godot-mcp/issues/46)) ([bfd2283](https://github.com/satelliteoflove/godot-mcp/commit/bfd2283da9537073d6f0d4e42e32d585215fa9a1))
* improve edge case error handling ([#10](https://github.com/satelliteoflove/godot-mcp/issues/10)) ([8f4ae6a](https://github.com/satelliteoflove/godot-mcp/commit/8f4ae6abe46b1b294a324d9181b78d39721930bd))
* rename get_script to read_script to avoid Godot builtin conflict ([4b9372f](https://github.com/satelliteoflove/godot-mcp/commit/4b9372f8954ee8e361ea6acf71285f0a2a0aec48))
* sync npm README with documentation generation system ([4f828fd](https://github.com/satelliteoflove/godot-mcp/commit/4f828fd35b888437df60aa4149c8f224a2795372))
* sync npm README with documentation generation system ([a9cbece](https://github.com/satelliteoflove/godot-mcp/commit/a9cbece9789b3f39c63f5565c0c66a082583cca0))
* update vitest to 4.x to resolve security vulnerabilities ([#31](https://github.com/satelliteoflove/godot-mcp/issues/31)) ([ef3ff00](https://github.com/satelliteoflove/godot-mcp/commit/ef3ff000c0061dec7021fe7a2376ba6d54bcb977))


### Miscellaneous Chores

* release v1.0.0 ([#19](https://github.com/satelliteoflove/godot-mcp/issues/19)) ([dac7dcf](https://github.com/satelliteoflove/godot-mcp/commit/dac7dcf8d0852ae2b615d05b84f68306e10b0e69))


### Code Refactoring

* consolidate MCP tools from 34 to 10 for reduced token usage ([#42](https://github.com/satelliteoflove/godot-mcp/issues/42)) ([a6eb815](https://github.com/satelliteoflove/godot-mcp/commit/a6eb815f16b70b13e0d2220019bbeb5e19172b49))

## [2.0.2](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.0.1...godot-mcp-v2.0.2) (2025-12-30)


### Bug Fixes

* sync npm README with documentation generation system


## [2.0.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.0.0...godot-mcp-v2.0.1) (2025-12-30)


### Bug Fixes

* republish to npm (2.0.0 version number was burned due to publish/unpublish)


### Documentation

* improve documentation generation with full enum values, action-specific requirements, and examples


## [2.0.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v1.3.0...godot-mcp-v2.0.0) (2025-12-30)


### ⚠ BREAKING CHANGES

* Tool API has changed significantly. All tools now use action-based schemas instead of separate tool definitions.

### Code Refactoring

* consolidate MCP tools from 34 to 10 for reduced token usage ([#42](https://github.com/satelliteoflove/godot-mcp/issues/42)) ([a6eb815](https://github.com/satelliteoflove/godot-mcp/commit/a6eb815f16b70b13e0d2220019bbeb5e19172b49))

## [1.3.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v1.2.0...godot-mcp-v1.3.0) (2025-12-29)


### Features

* auto-generate README sections from tool definitions ([#37](https://github.com/satelliteoflove/godot-mcp/issues/37)) ([e823e46](https://github.com/satelliteoflove/godot-mcp/commit/e823e46e2c7e892fdda9e2bf8370bb3dd415139e))

## [1.2.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v1.1.1...godot-mcp-v1.2.0) (2025-12-29)


### Features

* add get_resource_info tool for inspecting Godot resources ([#35](https://github.com/satelliteoflove/godot-mcp/issues/35)) ([a0c94e2](https://github.com/satelliteoflove/godot-mcp/commit/a0c94e23825b65e345bd0249a41a6a4fcfc9fb6a))

## [1.1.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v1.1.0...godot-mcp-v1.1.1) (2025-12-22)


### Bug Fixes

* update vitest to 4.x to resolve security vulnerabilities ([#31](https://github.com/satelliteoflove/godot-mcp/issues/31)) ([ef3ff00](https://github.com/satelliteoflove/godot-mcp/commit/ef3ff000c0061dec7021fe7a2376ba6d54bcb977))

## [1.1.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v1.0.0...godot-mcp-v1.1.0) (2025-12-22)


### Features

* scene building enhancements and input mappings ([#27](https://github.com/satelliteoflove/godot-mcp/issues/27)) ([3ecf4af](https://github.com/satelliteoflove/godot-mcp/commit/3ecf4af2ecc0b65aa94ec13f4c61c3c59572132f))

## [0.1.6](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v0.1.5...godot-mcp-v0.1.6) (2025-12-21)


### Features

* add automatic API documentation generation ([#17](https://github.com/satelliteoflove/godot-mcp/issues/17)) ([ba25315](https://github.com/satelliteoflove/godot-mcp/commit/ba253151513199cfdc2fecc1072602a9b8d0b02a))

## [0.1.5](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v0.1.4...godot-mcp-v0.1.5) (2025-12-21)


### Bug Fixes

* improve edge case error handling ([#10](https://github.com/satelliteoflove/godot-mcp/issues/10)) ([8f4ae6a](https://github.com/satelliteoflove/godot-mcp/commit/8f4ae6abe46b1b294a324d9181b78d39721930bd))

## [0.1.4](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v0.1.3...godot-mcp-v0.1.4) (2025-12-21)


### Features

* add TileMapLayer and GridMap editing support ([#8](https://github.com/satelliteoflove/godot-mcp/issues/8)) ([3fa5180](https://github.com/satelliteoflove/godot-mcp/commit/3fa518048c9a17a1f849b7b225148c4defe93733))

## [0.1.3](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v0.1.2...godot-mcp-v0.1.3) (2025-12-21)


### Features

* add AnimationPlayer support with full read/write capability ([#6](https://github.com/satelliteoflove/godot-mcp/issues/6)) ([b99006b](https://github.com/satelliteoflove/godot-mcp/commit/b99006b6f537c7808de838ec9feb4475b9d2bb50))

## [0.1.2](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v0.1.1...godot-mcp-v0.1.2) (2025-12-21)


### Features

* add screenshot capture tools ([9f57fdb](https://github.com/satelliteoflove/godot-mcp/commit/9f57fdb94cb26c1e24b031a4996bb208eea37012))

## [0.1.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v0.1.0...godot-mcp-v0.1.1) (2025-12-21)


### Features

* add CI/CD with GitHub Actions and release-please ([7c22039](https://github.com/satelliteoflove/godot-mcp/commit/7c22039c75080661fe5da26e14e3845342f8d1d4))
* initial implementation of godot-mcp ([75f23a8](https://github.com/satelliteoflove/godot-mcp/commit/75f23a8794858c828f29aaec874f0fd4290aa3da))


### Bug Fixes

* rename get_script to read_script to avoid Godot builtin conflict ([f2af378](https://github.com/satelliteoflove/godot-mcp/commit/f2af3785ac970000ed0c73b4801bdc7fb04b4eec))
