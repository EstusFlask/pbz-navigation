# 0.8.8-fork.1 — single-route rollback, fewer data files and equivalent rendering optimizations

- Roll back the multi-route experiment to delivered 0.8.7-fork.1 routing and map behavior, including checked prefixes, X markers and unfinished dashed tails. Remove candidate collection, background alternative searches and the experimental runtime module.
- Merge atlas string shards from 256 KiB to 512 KiB: 1772 loading modules become 951. Preserve every original data byte, actor order and legacy data entry point. The complete package has about 38% fewer files than 0.9.0 without dropping worlds or functionality.
- Reuse unchanged vertex-color arrays, omit unused triangle/color work, and skip capsule reads in throttled callbacks. Geometry, normals, colors and indices match the delivered baseline in 21 differential cases; 120 moving uploads create 294 colors instead of 35280, with all 120 uploads retained.
- Local Node loading samples read 267 modules instead of 519 for the largest world. Actual FPS is not measured. Original collector files, settings, installed game and manager state are untouched by development; update through the manager to retire obsolete navigation shards.

中文：按用户要求撤回 0.9.0 多路线，恢复 0.8.7 单路线和原地图提示。合并路网分块，精简文件数而不删除地图或通道；复用丝线颜色并跳过节流回调的胶囊读取，保持原采样、几何、碰撞与刷新策略。重新构建为 0.8.8-fork.1；本地数据/几何对照与回归不能替代游戏内帧率和旧路线问题复测。

# 0.9.0-fork.1 — failure-only map route alternatives

- Keep up to three distinct, consistently colored map candidates while no complete primary route is available. Collapse to one when complete navigation is found. Draw lines only, without route labels, icons, status text or X markers.
- Preserve walking/atlas candidates before rejection, plus checked ladder/grapple prefixes whose final target connector remains unknown. Candidate snapshots are map-only and never replace the scene trip, scene line or arrival state.
- Generate extra atlas corridors only with an open map and an idle foreground planner. Use per-search penalties without changing atlas costs; cancel background work before foreground A*. Bound both background searches and map projection work, and cache finished projections.
- 97 JavaScript regressions include real-world replay, distinct colors, deduplication, success collapse, action-chain prefixes, scene isolation, preemption and projection budgets. Original collector files and atlas values are preserved. This build has not been verified in game; slippery terrain and complete traversal coverage remain separate field checks.

中文：正式接入地图彩色备选。暂未找到完整路线时显示最多三种不同走法，完整主路线出现后显示一条；线路不加文字、图标或 X，场景丝线仍只有一条。后台搜索与地图投影分帧，候选不会接管场景/到达状态。保留攀爬、钩索的已检查前段，最后未确认连接仅供地图查看。97 项 JS 与 Lua/原生/包校验属于本地验证，游戏画面、实际 FPS、滑坡与全部动作链仍待复测。

# 0.8.7-fork.1 — versioning rules and synchronized package

- Document when to increment the fork version, which files must agree, and how to preserve historical archives/validation records in the root README.
- Increment the base patch version and reset the candidate suffix. Synchronize runtime entries, native adapter, user instructions and package fields as 0.8.7-fork.1. Rebuild and verify the complete navigation package; behavior is unchanged from 0.8.6-fork.3.

中文：根 README 增加基础版本递增、候选后缀、同步与交付校验规则；当前版本统一升至 0.8.7-fork.1 并重新构建完整包。本次仅调整版本与文档，运行逻辑沿用 0.8.6-fork.3，屋顶路线与实际 FPS 的现场验证状态不变。

# 0.8.6-fork.3 — search budgets and frame spikes

Local experimental repair after fork.2 field failures. No installed game, collector or remote draft files changed.

- Keep collectible standing-point alternatives from exhausting the action search budget; check a nearby climb even when the player starts near the target height. Cache action standing pads and stop checking exits whose entrance is unavailable.
- Cap ribbon mesh refresh near 30 Hz and cache identical near collision geometry for 250 ms. Suppress equivalent diagnostic previews and use a 16 ms main timer. Never cold-load an interaction class during navigation.
- Load atlas modules and decode columns incrementally outside the route timeout. The original source data is preserved; generated shards and compatible old chunk entry points are checked against original byte/string/actor hashes. A first regional load takes several seconds instead of blocking in one large step.
- 81 JavaScript regressions, real Lua target/file round trips, native checks and archive checks. Simulation: idle near probes 1,740 → 116 per roughly one second; moving head uploads 63 → 25 at 125 Hz input. Local largest-world loading peak about 4.6 ms per slice; these are not in-game FPS measurements. Roof currency remains subject to in-game retesting.

中文：修补物品接近点耗尽动作搜索预算、整体高度相近时漏试附近攀爬；丝线约 30 Hz、静止近段 250 ms 缓存、重复受阻预览去重。路网改为分块分帧加载并保留旧导航路径兼容入口，原数值与动作顺序经过校验。81 项回归属于本地验证，不能据此宣称屋顶路线已现场成功或游戏 FPS 已提高。

# 0.8.6-fork.2 — interaction refresh and blocked markers

Local experimental candidate; no remote draft or installed game files changed. Author permission remains pending.

- Normalize buried movement anchors to their physical standing pads while preserving authored direction and unlock requirements. Keep a graph-search budget for nearby validated actions; avoid cold-loading irrelevant distant classes.
- Replace stale ground-floor jobs after landing or a change in origin/capsule context. Reject obsolete results without requiring another map selection.
- Replace temporary audit marks and show only the next unknown X. Preserve persistent door/lock information and route constraints.
- Split concise agent handoff in the root README from the complete user installation guide in docs/USER-GUIDE.md.
- Navigation-only package: original collector 1.0.9 files remain untouched. 68 JavaScript regressions include the station climb coordinates with simulated physics, ladders, mantles, rope links, wall runs, lifts and directional descent actions. Lua/native/package checks are also run locally. In-game station roof, gear and third-floor retests remain outstanding.

中文：修补交互落脚点、落地换层后自动重新规划、旧规划结果覆盖与重复米白色 X；附近通道预留搜索预算。根 README 精简为 Mod 制作和 Navigation 接手两部分，完整安装说明移至 docs/USER-GUIDE.md。只更新导航，不替换收集 Mod。68 项 JS 及 Lua/原生/包校验是本地验证，不能替代游戏内复测。

# 0.8.6-fork.1 — first Fork candidate

Based on azqwq333's 0.8.5-beta and the local-fix5 patch series. Experimental; author permission is pending and the Nexus page remains unpublished.

- Validate candidate routes against floor support and capsule clearance; compare feasible three-dimensional walking lengths and reject known-blocked fallbacks.
- Extend local walking checks/searches to about 120 metres, repair local rock detours, and preserve a checked map prefix, blocked X and unfinished dashed tail during/after unsuccessful searches.
- Approach collectibles from valid same-floor positions within interaction range; avoid treating uneven terrain as a floor change.
- Chain recognized static/loaded ladders, climbs, rope/grapple links, slides and lifts; preserve direction and unlock constraints, including fixed versus folded ladder handling.
- Replace stock trailing particles with an immediate thin-line mesh, raise the endpoint above ground, audit distant segments and bound repeated updates.
- Add a navigation-owned bridge for original Map Tracker Plus (UE4SS) 1.0.9 manual/automatic targets, switching, collection and cancellation. Hover-then-middle-click preserves item height. No collector files are bundled or replaced.
- Set the navigation runtime, native adapter, menu identity, ZIP name and EN/ZH instructions to 0.8.6-fork.1. Retain the original PBZQuestRoute install/config identity for replacement compatibility.

The 1.0.9 bridge does not port the legacy JS tracker's minimap route overlay, large icons or automatic accessory hints. Its supported runtime is UE4SS #5 1.0.3 / v3.0.1-1195-g1ceefac8 Shipping, guarded by file hashes.

Local validation: 46 JavaScript regressions, real Lua 5.4 module/file round-trips, native adapter tests and complete ZIP verification. These do not prove in-game compatibility. The gear and third-floor locations still require in-game retesting. World datasets are unchanged; no global shortest-path or measured FPS improvement claim.

## 中文

首个 Fork 候选，基于原版 0.8.5-beta 与 local-fix5。原作者授权待取得，Nexus 草稿保持未发布。

- 路线地面/胶囊碰撞校验、可行三维长度比较、拒绝已知受阻回退。
- 约 120 米局部绕障；搜索期间和失败后保留安全前段、X 与未确认虚线。
- 物品交互范围内站位、起伏地面修正、梯子/钩索等多动作串联及方向/解锁检查。
- 即时细线网格替换拖尾粒子，端点抬至地面上方，限制远段检测与重复更新开销。
- 原版收集 1.0.9 的目标/取消同步与保留高度的中键选择，不包含或覆盖收集文件。
- 统一版本、菜单、打包和中英文说明；旧 JS 收集联动三项功能尚未迁移到 1.0.9。

46 项 JS 回归、真实 Lua 联动、原生与 ZIP 检查属于本地验证。齿轮和三楼位置尚未现场复测，未重新生成路网，不承诺全局最短或具体 FPS 改善。
