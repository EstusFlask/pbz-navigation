# 0.10.3-fork.1 — persistent wall exclusions and checked action frontiers

- Remember measured collision edges before yielding into repairs, so movement cancellation cannot discard them. Preserve individual portal edge IDs through corridor smoothing instead of attributing every failure to the final edge.
- Clip known-blocked atlas tails as well as failed native/direct chords. A checked scene prefix can replace a zero-progress atlas preview.
- Retain a physically checked multi-action frontier when the final connector is unavailable. A farther pending atlas backtrack cannot replace a closer checked climb chain; complete checked alternatives remain eligible.
- Attach prepared, direction-checked action pads using verified walking connectors and retry the atlas immediately. Timer discovery only caches actors, avoiding insertion of unchecked action approaches.
- Keep local start searches when the distant goal floor is unloaded, publish checked progress at termination, and refine wholly trapped broad-grid rows to 70/35 cm. Add bounded resident-action extraction and search termination/rejection diagnostics.
- Correct the cave investigation: the original one-based actor references already contain upward arcs for both cave ascents. The original route to the second ascent exit is about 23.91 m with both climbs; selecting the bell yields a different downhill/backtracking candidate. The full grapple connection remains unconfirmed.
- 132 JavaScript regressions pass. Replay of the delivered 0.10.2 sources fails 12 of the 13 new cases; the remaining case guards against attaching through a wall. Real atlas data is used alongside simulated physics/loading. Neither complete reported route is certified by a successful live-game run. Retain the raised blue strand, original datasets, prior packages and collector boundary.

中文：修复取消修补时丢失墙体、走廊封错边、已知穿墙尾段，以及已验攀爬前沿被更远的回头候选覆盖；已验动作及时接图，远端未加载也继续搜索起点，粗网格完全受困时细分出口并补充诊断。原表确有两次向上攀爬，之前“完全没接图”的判断不成立；完整钩索链与衣冠冢全程仍待游戏验证。132 项本地回归通过，不能据模拟场景宣称两条路线已走通。

# 0.10.2-fork.1 — cave candidates, checked detours and a raised blue strand

- Inspect authored same-world corridors before expensive failed native repairs. Retain pending atlas geometry and traversal actions; hide unchecked native/direct tails instead of drawing a wall-crossing chord.
- Distinguish unloaded/unconfirmed passages from measured obstructions: mechanism hints for pending checks, X for physical barriers, and lock/item hints for known locks. Keep action landing failures at the last safe prefix.
- Repair failed walking segments without discarding surrounding climbs/grapples. Try resident traversal connectors within the repair deadline and recheck the resulting route. Preserve known lock constraints.
- Extend bounded long scene searches to 200 m, publish checked prefixes during search, retain progress along verified slopes, and score diagnostic progress by checked route length so necessary detours can move away from the destination. Permit short downward drops only after landing and descent clearance checks; no reverse climbing is inferred.
- Change the world strand to blue at about 105 cm above ground through its endpoint. Collision clipping follows the actual raised shape; retain topology color caching.
- 119 JavaScript regressions pass. New tests include original 198.8 m cave data with simulated scene limits, simulated uphill detours, short drops, action preservation/repair, planner progress and raised rendering. Physics fixtures are simulated; neither reported route has completed in a live game with this candidate. Preserve all previous releases and original world data.

中文：根据 0.10.1 现场失败修补候选顺序、直线穿墙尾段、动作保留和待确认误标，加入经过检查的短跳落与长途实景绕行，保留沿已验坡道/山洞的进度。蓝线离地约 105 厘米。119 项 JS 回归通过；两条路线仍需游戏复测，不能据模拟用例宣称完整走通。

# 0.10.1-fork.1 — preserve selected bells and reject failed traversal edges

- Diagnose the reported Cemetery to Mo Jizi's Cenotaph failure from the complete retained loader session: one 38-pixel road snap selected [24160,67840,6769], about 101 m from Bell_YXZR_004. The goal remained wrong even when the player reached about 2.2 m from the bell.
- Select visible bell icons with their own ID, location and height for mouse/gamepad input. Use projected activated bells only when their focus row is absent; preserve hidden icon and collectible priority. Approach the bell within a checked interaction distance.
- Select the nearest road without connectivity changing the target, and cap ordinary map-pin snapping at 13 pixels. A distant road no longer becomes an unrelated click's navigation destination.
- Preserve authored traversal edge IDs and return them on failed landings, allowing another atlas candidate instead of repeatedly choosing the same failed action. Validate terminal action landings without loosening physical checks.
- 108 JavaScript regressions include production map-click paths with real reported coordinates and simulated projection, gamepad repeats, hidden bells, disconnected pins, alternative traversal selection and terminal landing support. Both complete reported routes still require fresh in-game testing. Prior archives and validation records are retained.

中文：现场日志证实衣冠冢目标从一开始就吸附到了约 101 米外，走近铃铛也没有改变。修复铃铛选择与无上限的道路吸附，保留目标坐标/高度；动作落点失败保留边编号，允许搜索切换其他候选。108 项本地回归通过，新增场景和地图投影仍为模拟，不能宣称两条实景路线已走通。

# 0.10.0-fork.1 — terrain, traversal chains and endpoint connectivity

- Refine failed ground samples across dense legal stair treads; require opposite capsule support across narrow cracks. Keep wide pits, high ledges and body collisions blocked.
- Scan all 17 resident traversal classes, including ziplines; defer physical action connectors in cost order so crowded starts do not exhaust the budget before a second action. Consider interactions for same-height obstructions and keep atlas attempts after partial native results.
- Charge local, traversal and repair budgets for active execution rather than frame suspension. Preserve per-frame limits, slow-step protection and the overall 30-second wall-time limit.
- Try collision-checked short walking repairs at disconnected endpoints of long atlas trips. Add only the measured direction and retain physical walking audits. Do not invent a connection from proximity alone.
- Read typed locks before GUID-name filtering, enumerate available map layers, preserve required-item hints, and share known lock constraints with planning and live audits. Inventory ownership is not queried; position constraints remain approximate.
- Audit 462 directed Lujiacun bell pairs against original data: 100 candidates and 362 disconnected-component pairs. Preserve the reported 198.8 m cave-detour candidate; its complete climbing/grapple chain and the cemetery-to-tomb route remain unverified in game. Add targeted rejection/budget logs.
- 100 JavaScript regressions cover simulated terrain, production scheduling/planning, interaction chains, locks and real atlas candidate discovery. Retain the single-route UI, original atlas bytes and collector files. Use a new feature version because the historical 0.9.0 experiment was withdrawn; preserve its archive and records.

中文：修补密集台阶、窄裂缝、滑索漏扫、多段动作搜索与分帧预算；长途端点只在实测可走后补接，已知门锁参与规划并保留钥匙/物品提示。保留用户确认有必要的山洞绕行，不按直线距离删路线。两条指定铃铛路线尚未在游戏复测；462 组合审计不是新版通行成功率。原路网和收集 Mod 保持原样，界面仍为单路线。

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
