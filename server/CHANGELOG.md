# Changelog

## [3.10.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.10.0...godot-mcp-v3.10.1) (2026-06-09)


### Bug Fixes

* wait for game bridge readiness before injecting input ([#269](https://github.com/satelliteoflove/godot-mcp/issues/269)) ([ab1b998](https://github.com/satelliteoflove/godot-mcp/commit/ab1b998cac0254cf9760b15c01bc8568fe19608f))

## [3.10.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.9.0...godot-mcp-v3.10.0) (2026-06-09)


### Features

* add editor restart action to godot_editor ([#250](https://github.com/satelliteoflove/godot-mcp/issues/250)) ([#266](https://github.com/satelliteoflove/godot-mcp/issues/266)) ([700ba78](https://github.com/satelliteoflove/godot-mcp/commit/700ba78aa75cf4f8231b718a3971dd875416d348))
* add severity and incremental filtering to editor log messages ([#244](https://github.com/satelliteoflove/godot-mcp/issues/244)) ([#267](https://github.com/satelliteoflove/godot-mcp/issues/267)) ([3391bf5](https://github.com/satelliteoflove/godot-mcp/commit/3391bf59ff904b77ef5df2ac38a6b629fb2adf63))


### Bug Fixes

* protect active bridge client instead of replacing it ([#237](https://github.com/satelliteoflove/godot-mcp/issues/237)) ([#264](https://github.com/satelliteoflove/godot-mcp/issues/264)) ([899ba88](https://github.com/satelliteoflove/godot-mcp/commit/899ba88faa01ba52436fb5047cccc615e384ac1b))

## [3.9.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.8.0...godot-mcp-v3.9.0) (2026-06-08)


### Features

* step_until predicate stepping for godot_game_time ([#262](https://github.com/satelliteoflove/godot-mcp/issues/262)) ([ef4e909](https://github.com/satelliteoflove/godot-mcp/commit/ef4e909e38db72a3bf6780e51092a265867b8e6f))

## [3.8.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.7.1...godot-mcp-v3.8.0) (2026-06-08)


### Features

* game time control for high-latency agents ([#256](https://github.com/satelliteoflove/godot-mcp/issues/256)) ([08d5d89](https://github.com/satelliteoflove/godot-mcp/commit/08d5d89f7da101782b282e16e8728cf0aaf31b7d))


### Bug Fixes

* ship .uid sidecars so the addon's resource identity is stable ([#257](https://github.com/satelliteoflove/godot-mcp/issues/257)) ([ecc5396](https://github.com/satelliteoflove/godot-mcp/commit/ecc5396e2adc232db6c5b9fa16af50ac9aebb886))
* use ScriptBacktrace.get_frame_file for error frame capture ([#259](https://github.com/satelliteoflove/godot-mcp/issues/259)) ([3182e2c](https://github.com/satelliteoflove/godot-mcp/commit/3182e2c14bf3d334ed127736505c5a672c0e4611))

## [3.7.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.7.0...godot-mcp-v3.7.1) (2026-06-07)


### Bug Fixes

* **game-bridge:** keep processing while the scene tree is paused ([#253](https://github.com/satelliteoflove/godot-mcp/issues/253)) ([04cff1b](https://github.com/satelliteoflove/godot-mcp/commit/04cff1b31e400aeff9fe9802a11e3f86c6f73c2a)), closes [#238](https://github.com/satelliteoflove/godot-mcp/issues/238)
* **game-bridge:** release held actions before clearing the input-sequence queue ([#231](https://github.com/satelliteoflove/godot-mcp/issues/231)) ([a0aa7ab](https://github.com/satelliteoflove/godot-mcp/commit/a0aa7abe02700b65b6a57cce5dea0826e73c433f))
* release pipeline ignores addon-only commits ([#254](https://github.com/satelliteoflove/godot-mcp/issues/254)) ([fb1753e](https://github.com/satelliteoflove/godot-mcp/commit/fb1753eaf0225e0fe843d6ad410d2a54ee5fee46))

## [3.7.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.6.1...godot-mcp-v3.7.0) (2026-06-01)


### Features

* digest reaches autoload singletons via explicit paths ([#226](https://github.com/satelliteoflove/godot-mcp/issues/226)) ([3f815ed](https://github.com/satelliteoflove/godot-mcp/commit/3f815ed9d98211c35ba86e316dad66dead4b374b))


### Bug Fixes

* correct on-screen detection for 3D, 2D camera transforms, and SubViewports ([#229](https://github.com/satelliteoflove/godot-mcp/issues/229)) ([633ef72](https://github.com/satelliteoflove/godot-mcp/commit/633ef72f98ae3a3c858617099feb65addf5551d4)), closes [#200](https://github.com/satelliteoflove/godot-mcp/issues/200)

## [3.6.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.6.0...godot-mcp-v3.6.1) (2026-05-30)


### Bug Fixes

* reduce default screenshot max_width from 1024 to 900 ([#221](https://github.com/satelliteoflove/godot-mcp/issues/221)) ([2c15902](https://github.com/satelliteoflove/godot-mcp/commit/2c1590267057477f22c813c66a903bd3faf60b8f))

## [3.6.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.5.0...godot-mcp-v3.6.0) (2026-05-30)


### Features

* runtime_state tool (digest + state-over-time + selection tiers) ([#219](https://github.com/satelliteoflove/godot-mcp/issues/219)) ([a703aa8](https://github.com/satelliteoflove/godot-mcp/commit/a703aa8c0492e39fb776c95bea2a75e9f873f35d))

## [3.5.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.4.1...godot-mcp-v3.5.0) (2026-05-29)


### Features

* JPEG screenshots with quality param and 1024px default ([#217](https://github.com/satelliteoflove/godot-mcp/issues/217)) ([ebdf7d9](https://github.com/satelliteoflove/godot-mcp/commit/ebdf7d9f4515d7d26e0210f7426aa6bcbedce9d7))

## [3.4.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.4.0...godot-mcp-v3.4.1) (2026-05-29)


### Bug Fixes

* flatten discriminatedUnion schemas to satisfy MCP inputSchema constraints ([#214](https://github.com/satelliteoflove/godot-mcp/issues/214)) ([333dadf](https://github.com/satelliteoflove/godot-mcp/commit/333dadf815a8e0928e4e7d70fd47b07e352f2fd6))

## [3.4.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.3.1...godot-mcp-v3.4.0) (2026-05-29)


### Features

* emit structuredContent for query actions ([#190](https://github.com/satelliteoflove/godot-mcp/issues/190)) ([#212](https://github.com/satelliteoflove/godot-mcp/issues/212)) ([a4bb209](https://github.com/satelliteoflove/godot-mcp/commit/a4bb2093a3b23c78a77d12ce42296985b00d91cb))

## [3.3.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.3.0...godot-mcp-v3.3.1) (2026-05-29)


### Performance Improvements

* compact JSON in tool query responses ([#189](https://github.com/satelliteoflove/godot-mcp/issues/189)) ([#210](https://github.com/satelliteoflove/godot-mcp/issues/210)) ([7323935](https://github.com/satelliteoflove/godot-mcp/commit/732393541f1f3ff0359f3d0e969260e86386a708))

## [3.3.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.2.0...godot-mcp-v3.3.0) (2026-05-29)


### Features

* model tool inputs as discriminated unions per action ([#208](https://github.com/satelliteoflove/godot-mcp/issues/208)) ([aec7248](https://github.com/satelliteoflove/godot-mcp/commit/aec72485fd7e1c498a943759c8aa6ba54f7d16f8))

## [3.2.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.1.0...godot-mcp-v3.2.0) (2026-05-29)


### Features

* add MCP tool annotations (title + readOnly/destructive/openWorld hints) ([#206](https://github.com/satelliteoflove/godot-mcp/issues/206)) ([e6f1089](https://github.com/satelliteoflove/godot-mcp/commit/e6f10890d8634d03e03fcaaa45fc68b1d22f7daf))

## [3.1.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v3.0.0...godot-mcp-v3.1.0) (2026-05-29)


### Features

* namespace all tools under godot_ prefix ([#203](https://github.com/satelliteoflove/godot-mcp/issues/203)) ([778867e](https://github.com/satelliteoflove/godot-mcp/commit/778867ee864e3af44c31358904e52d04cded2157))

## [3.0.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.18.0...godot-mcp-v3.0.0) (2026-05-29)


### ⚠ BREAKING CHANGES

* **editor:** the editor tool no longer accepts the actions get_debug_output, get_errors, or get_performance.

### Features

* **editor:** remove deprecated debug/errors/performance actions ([#193](https://github.com/satelliteoflove/godot-mcp/issues/193)) ([4a01224](https://github.com/satelliteoflove/godot-mcp/commit/4a01224d31177e13024771e73b83e842c05be2f6))

## [2.18.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.17.0...godot-mcp-v2.18.0) (2026-03-30)


### Features

* upgrade to TypeScript 6.0.2 ([#170](https://github.com/satelliteoflove/godot-mcp/issues/170)) ([8d394a6](https://github.com/satelliteoflove/godot-mcp/commit/8d394a6a5a641533391c75c39b1b5156ee0241e3))

## [2.17.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.16.1...godot-mcp-v2.17.0) (2026-03-27)


### Features

* frame profiler with time-series analysis ([#163](https://github.com/satelliteoflove/godot-mcp/issues/163)) ([ab9bfd3](https://github.com/satelliteoflove/godot-mcp/commit/ab9bfd33ec2eb5abf57120e3be51671f20c06048))

## [2.16.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.16.0...godot-mcp-v2.16.1) (2026-03-13)


### Bug Fixes

* graceful shutdown and connection replacement for zombie server processes ([#161](https://github.com/satelliteoflove/godot-mcp/issues/161)) ([dd1abe1](https://github.com/satelliteoflove/godot-mcp/commit/dd1abe182d194599295ca954fb2722d31ee7adc9)), closes [#157](https://github.com/satelliteoflove/godot-mcp/issues/157)

## [2.16.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.15.0...godot-mcp-v2.16.0) (2026-03-09)


### Features

* detect and clean up stale WebSocket connections ([#158](https://github.com/satelliteoflove/godot-mcp/issues/158)) ([a0e7809](https://github.com/satelliteoflove/godot-mcp/commit/a0e7809c3ffc9fb01e29eec4bbf35fa491d30a92))

## [2.15.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.14.0...godot-mcp-v2.15.0) (2026-02-06)


### Features

* deprecate get_debug_output in favor of minimal-godot-mcp ([#149](https://github.com/satelliteoflove/godot-mcp/issues/149)) ([684ce7b](https://github.com/satelliteoflove/godot-mcp/commit/684ce7be4731c09e437e74dc7fa97f5e11d1669e))

## [2.14.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.13.0...godot-mcp-v2.14.0) (2026-02-02)


### Features

* migrate to Zod v4 ([#147](https://github.com/satelliteoflove/godot-mcp/issues/147)) ([04864ef](https://github.com/satelliteoflove/godot-mcp/commit/04864ef76f7eca1bd953cc9d76933dd00e089edb))

## [2.13.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.12.2...godot-mcp-v2.13.0) (2026-01-29)


### Features

* add local usage logging for tool analytics ([#139](https://github.com/satelliteoflove/godot-mcp/issues/139)) ([ce54957](https://github.com/satelliteoflove/godot-mcp/commit/ce54957598a923d43a4453db392163f650acc5c7))

## [2.12.2](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.12.1...godot-mcp-v2.12.2) (2026-01-28)


### Bug Fixes

* add explicit timeout error formatting and remove last-release-sha ([#136](https://github.com/satelliteoflove/godot-mcp/issues/136)) ([75ba4ec](https://github.com/satelliteoflove/godot-mcp/commit/75ba4ec402724028f77dec6afeadf27f28947336))

## [2.12.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.12.0...godot-mcp-v2.12.1) (2026-01-28)


### Bug Fixes

* use proper semver comparison for addon version checks ([#117](https://github.com/satelliteoflove/godot-mcp/issues/117)) ([d1f1721](https://github.com/satelliteoflove/godot-mcp/commit/d1f1721624af6b39441af60211d89cafd627d3b9)), closes [#116](https://github.com/satelliteoflove/godot-mcp/issues/116)

## [2.12.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.11.1...godot-mcp-v2.12.0) (2026-01-28)


### Features

* Add Windows Subsystem for Linux (WSL) support with smart network binding ([#111](https://github.com/satelliteoflove/godot-mcp/issues/111)) ([129205e](https://github.com/satelliteoflove/godot-mcp/commit/129205eca12365cc61f9ad9acf5becf27f5f0e79))

## [2.11.1](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.11.0...godot-mcp-v2.11.1) (2026-01-28)


### Bug Fixes

* sync npm README from root instead of hardcoded template ([6b4a099](https://github.com/satelliteoflove/godot-mcp/commit/6b4a099bfa295dbc246dd406d1af13167d964904))
* sync npm README from root instead of hardcoded template ([5dd01a2](https://github.com/satelliteoflove/godot-mcp/commit/5dd01a2810809f0b631ec0d04f98136cbea9d67e))

## [2.11.0](https://github.com/satelliteoflove/godot-mcp/compare/godot-mcp-v2.10.1...godot-mcp-v2.11.0) (2026-01-26)


### Features

* add get_log_messages action with filter and limit support ([#108](https://github.com/satelliteoflove/godot-mcp/issues/108)) ([107ad19](https://github.com/satelliteoflove/godot-mcp/commit/107ad1903e3819c9d3dde206125e2fd076221b57))

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
