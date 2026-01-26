# Changelog

## [2.10.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.10.0...godot-mcp-v2.10.1) (2026-01-26)


### Bug Fixes

* document clear parameter support for get_errors action ([#105](https://github.com/satelliteoflove/godot-mcp/issues/105)) ([2303f05](https://github.com/satelliteoflove/godot-mcp/commit/2303f05d380c3548bb7ff3df8f19629159315a74))

## [2.10.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.9.0...godot-mcp-v2.10.0) (2026-01-25)


### Features

* add input injection tool for testing running games ([#102](https://github.com/satelliteoflove/godot-mcp/issues/102)) ([7444f23](https://github.com/satelliteoflove/godot-mcp/commit/7444f23c39dffd505f63495494dc566c91457007))

## [2.9.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.8.0...godot-mcp-v2.9.0) (2026-01-24)


### Features

* add get_errors and get_stack_trace actions to editor tool ([#99](https://github.com/satelliteoflove/godot-mcp/issues/99)) ([9b24dbe](https://github.com/satelliteoflove/godot-mcp/commit/9b24dbe0e076d421ca274696bc494830f8c449b9)), closes [#98](https://github.com/satelliteoflove/godot-mcp/issues/98)

## [2.8.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.7.0...godot-mcp-v2.8.0) (2026-01-24)


### Features

* add signal connection support to node tool ([#96](https://github.com/satelliteoflove/godot-mcp/issues/96)) ([5ff874d](https://github.com/satelliteoflove/godot-mcp/commit/5ff874d73c04978b63c5bf2c0fe83ba5fa91e9c2)), closes [#89](https://github.com/satelliteoflove/godot-mcp/issues/89)

## [2.7.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.6.3...godot-mcp-v2.7.0) (2026-01-24)


### Features

* add source parameter to get_debug_output for editor vs game output ([#94](https://github.com/satelliteoflove/godot-mcp/issues/94)) ([e3c67b4](https://github.com/satelliteoflove/godot-mcp/commit/e3c67b4314c7c68da96e6c11fa41bf44a065e5e7)), closes [#91](https://github.com/satelliteoflove/godot-mcp/issues/91)

## [2.6.3](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.6.2...godot-mcp-v2.6.3) (2026-01-24)


### Bug Fixes

* return generated UID from scene create action ([#92](https://github.com/satelliteoflove/godot-mcp/issues/92)) ([49940cd](https://github.com/satelliteoflove/godot-mcp/commit/49940cd165212eda7637cd34d1ceeb54f2c4bbbe)), closes [#90](https://github.com/satelliteoflove/godot-mcp/issues/90)

## [2.6.2](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.6.1...godot-mcp-v2.6.2) (2026-01-17)


### Bug Fixes

* use dynamic import for MCP server to fix npx stdin issue ([#87](https://github.com/satelliteoflove/godot-mcp/issues/87)) ([5bbaeda](https://github.com/satelliteoflove/godot-mcp/commit/5bbaedaca819af25a925dd8be57f9899e13c0e0f))

## [2.6.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.6.0...godot-mcp-v2.6.1) (2026-01-17)


### Bug Fixes

* prevent CLI commands from spawning unwanted WebSocket connections ([#85](https://github.com/satelliteoflove/godot-mcp/issues/85)) ([404b09d](https://github.com/satelliteoflove/godot-mcp/commit/404b09d91e4e801800e8a4fdace2fa50f9d5b89b))

## [2.6.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.5.3...godot-mcp-v2.6.0) (2026-01-17)


### Features

* replace ad-hoc logging with proper MCP protocol and centralized addon logging ([#83](https://github.com/satelliteoflove/godot-mcp/issues/83)) ([cf1b7e4](https://github.com/satelliteoflove/godot-mcp/commit/cf1b7e4823b64fe3548d4d5e04d2a2ef9002cafb))

## [2.5.3](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.5.2...godot-mcp-v2.5.3) (2026-01-17)


### Bug Fixes

* remove dead code and improve error handling ([#79](https://github.com/satelliteoflove/godot-mcp/issues/79)) ([c283118](https://github.com/satelliteoflove/godot-mcp/commit/c28311838399bd409a75e87c15eea98fd22b1556))

## [2.5.2](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.5.1...godot-mcp-v2.5.2) (2026-01-17)


### Bug Fixes

* reject concurrent connections and provide diagnostic error context ([#76](https://github.com/satelliteoflove/godot-mcp/issues/76)) ([76ebfe5](https://github.com/satelliteoflove/godot-mcp/commit/76ebfe5f4cf3afca5d4a3beacdce0b87fa482332))

## [2.5.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.5.0...godot-mcp-v2.5.1) (2026-01-05)


### Bug Fixes

* use scene-relative paths instead of full editor paths ([#72](https://github.com/satelliteoflove/godot-mcp/issues/72)) ([da3d18a](https://github.com/satelliteoflove/godot-mcp/commit/da3d18a2850d6f03fda770dbfadf16abdc283b5b))

## [2.5.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.4.2...godot-mcp-v2.5.0) (2026-01-05)


### Features

* add godot_docs tool for fetching Godot documentation ([#70](https://github.com/satelliteoflove/godot-mcp/issues/70)) ([14b418d](https://github.com/satelliteoflove/godot-mcp/commit/14b418d4d23d426f9a47c46e85acf3b453eb0e58))

## [2.4.2](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.4.1...godot-mcp-v2.4.2) (2026-01-05)


### Bug Fixes

* update README and add missing scene3d to docs ([#68](https://github.com/satelliteoflove/godot-mcp/issues/68)) ([c56cec4](https://github.com/satelliteoflove/godot-mcp/commit/c56cec4c66d6699d8b3b0d5a4915549fd36847d1))

## [2.4.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.4.0...godot-mcp-v2.4.1) (2026-01-04)


### Bug Fixes

* improve find_nodes reliability and DRY cleanup ([#66](https://github.com/satelliteoflove/godot-mcp/issues/66)) ([adcef21](https://github.com/satelliteoflove/godot-mcp/commit/adcef219629bb4ba9e887d1a5e9d865dbcab1b27))

## [2.4.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.3.0...godot-mcp-v2.4.0) (2026-01-04)


### Features

* add CLI addon installer and version handshake ([#64](https://github.com/satelliteoflove/godot-mcp/issues/64)) ([43c1779](https://github.com/satelliteoflove/godot-mcp/commit/43c1779bcb0e719689df02fe3c5a6d5b8a8139bf))

## [2.3.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.2.0...godot-mcp-v2.3.0) (2026-01-04)


### Features

* add viewport/camera info and 2D viewport control ([#61](https://github.com/satelliteoflove/godot-mcp/issues/61)) ([09d20c9](https://github.com/satelliteoflove/godot-mcp/commit/09d20c9a85e9f84cf27b75a6f0747b0c6d9ce444))

## [2.2.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.1.0...godot-mcp-v2.2.0) (2026-01-04)


### Features

* add scene3d tool for 3D spatial queries ([#59](https://github.com/satelliteoflove/godot-mcp/issues/59)) ([23294f8](https://github.com/satelliteoflove/godot-mcp/commit/23294f8e524b7420adf7c85228b4f018112d4d78))

## [2.1.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.0.3...godot-mcp-v2.1.0) (2026-01-01)


### Features

* enhance editor.get_state with open_scenes and main_screen ([#56](https://github.com/satelliteoflove/godot-mcp/issues/56)) ([3124b28](https://github.com/satelliteoflove/godot-mcp/commit/3124b28d48c91161e0ad3576b5299888df390a2b))

## [2.0.3](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.0.2...godot-mcp-v2.0.3) (2025-12-31)


### Bug Fixes

* version sync, addon releases, and installation instructions ([6089337](https://github.com/satelliteoflove/godot-mcp/commit/6089337976b9ef9703a5249e3803049a46e6b9a7))

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
