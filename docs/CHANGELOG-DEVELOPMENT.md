# 1.3.1 — hide the complete custom-color row (local candidate)

- User screenshot: red preset selected; custom-color text was hidden but its blue preview remained visible above Reset.
- Deterministic reproduction with the installed PbzModConfig1.0.4 Editors/NativeRows: the runtime collapses entry.row, while the swatch is a sibling inside entry.outer. Collapsing only the outer removes the square; it must also reopen when Custom is selected.
- Add a navigation-owned host dispatched into the PbzModConfig VM. Synchronize entry.outer on create/update only for PBZQuestRoute/ThreadCustomColor. Restore require after attachment; retain cleanup/world-discard guards and other provider behavior. No companion mod files are written or packaged.
- Tests: tests/rope-modconfig-rows.py --mod-config-scripts <Scripts> fails unpatched and passes with --patch, both early/late module attachment. Includes hidden/custom/preset transitions, duplicate boot, require restoration, cleanup/world discard and another-provider isolation. Actual widgets/game acceptance remains pending.

# 1.3.0 — configurable guiding-rope color (local candidate)

- Register a standalone navigation provider through the PbzModConfig client SDK, following the same shared-variable protocol as Map Tracker. Blue remains default; red and a custom color picker are available.
- Persist navigation-owned settings under Saved/PBZQuestRoute-settings.json; parse custom picker colors as sRGB and refresh stationary/moving mesh segments and private material tint. Keep the existing topology/color cache when unchanged.
- Verify provider registration, visibility, persistence, reset, stale/invalid commands, standalone boot, Lua-to-JS color transfer and actual PbzModConfig1.0.4 remote host. In-game menu appearance/color acceptance is pending.

# 1.2.10 — deliver a fully checked action route without waiting for speculative shortening (local candidate)

- Plan a complete action-chain proposal using cheap topology/cached results, validate its edges in order and replan on failure. Return the first fully checked chain instead of retaining it while probing optimistic alternatives.
- After the main planner's full physical audit and goal check, deliver a complete assisted route before optional atlas/pure-walk shortening. Existing complete-native walking comparisons remain.
- Explicitly reject partial walking connectors as complete chains. Keep all deadlines, connector quotas, floor/body/lock rules and same-job-only validation reuse. Add scalar collision details for the first8 rejected author edges.
- 修正两级已验路线等待：动作整链先验后返，主规划器审核后立即交付。优先及时可走路线，不保证全局最短；没有新碰撞豁免或运行时学习。

Validation:292 JS regressions plus Lua/native/package checks in VALIDATION-1.2.10.txt. Two-action minimum and25-direction captured replays fail on1.2.9; the main-planner delivery replay independently fails before its fix. Their walking/clock models are not game collision or elapsed-time measurements. Original bell-origin physics, latency and whole A-01 still need live acceptance.

# 1.2.9 — separate author-graph and live-grid connector ranges (local candidate)

- Search finite, live-checked author graph connectors before applying the45m expensive-grid cutoff. A captured first-floor bell is64.27m from its usable ascent entry; the old shared cutoff rejected it before using existing candidate data.
- Keep the graph's existing120m endpoint range,768-node/64-check/200ms limits, per-edge floor/body/lock certification, and same-job-only validation reuse. Full live-grid search remains limited to45m.
- 一层铃铛接入作者图与实时网格分别限距；未增加作者点、固定课程、跨请求凭证或碰撞例外。

Validation:288 JS regressions plus Lua/native/full-package checks in VALIDATION-1.2.9.txt. The captured-origin integration replay fails on pristine1.2.8, passes after the fix, and still rejects a locked wall and foreign/unrecorded world. Substituted physics is not a live route pass. Bell-origin and full A-01 acceptance remain pending.

# 1.2.8 — checked action chains before expensive grid repair (local candidate)

- Search action chains with native/atlas/author-checked walking connectors before enabling expensive local-grid repair. A speculative descending-ladder repair must not starve a reachable climb and its upstairs continuation.
- Share the existing deadline and connector quota across both phases; reserve half the quota for the full fallback. Reuse successful checks inside the job while allowing quick-negative links to retry with full repair.
- 调整动作分支调度：已验连接先组合成路，再对缺口做昂贵绕障；快速失败不永久封路、成功连接不跨请求复用，碰撞/楼层/锁检查保持。

Validation:287 JS regressions and Lua/native/full-package checks in VALIDATION-1.2.8.txt. Captured1.2.7 doorway boundaries reproduce30s starvation before the fix; the framed replay passes after it. Substituted walking callbacks are not game collision or live1.2.8 timings. Whole A-01 and doorway live retest remain pending.

# 1.2.7 — finite roadmap search with lazy live validation (local candidate)

- Separate cheap finite 3D graph search from expensive live floor/body/lock certification. Propose a path, check its directed edges, remove a failed edge and replan; unchecked proposals are never displayed as completed guidance.
- Repair the hard 210cm candidate cutoff that disconnected a captured 222cm sampling gap. A 3.5m proposal span still receives all ordinary fine-grained physical checks; no stair/action permission is inferred from distance alone.
- Limit graph expansion, physical connector checks and execution time separately. Reuse checked directed edges only inside the same request; each new request earns fresh physical validation.
- 普通步行候选先查图、再验路；失败边剔除重算。保留实际地面、身体、楼层和门锁，不新增运行时学习或固定课程。

Validation: 284 JavaScript regressions, real Lua/native/full-package checks in VALIDATION-1.2.7.txt. Captured-query operation controls are not game collision, real elapsed time or a live pass. 1.2.6 still timed out in the field; this candidate needs controlled game correctness/latency validation.

# 1.2.6 — bounded stair walking and finite hint search (local candidate)

- Try a nearby ordinary walk under 192 nodes / 200ms execution before expensive action entry probes. A higher bell can be reached by stairs without climbing above it.
- Check the finite author-point graph before generating offset grids; share the existing action connector budget and retain the full fallback after a failed hint search.
- An unwalkable centre side/riser hit now checks independently walkable opposite-side floor contacts. A single bank, no-step component, slope restriction, capsule wall or lock remains insufficient.
- 附近楼梯先做有界步行检查；已采脚点先有限搜索；台阶侧面命中后检查脚底两侧有效支撑。目标XYZ、角色碰撞和锁路限制保留。

Validation: 281 JavaScript regressions; Lua/native/full ZIP details in VALIDATION-1.2.6.txt. 1.2.5 field test failed; 1.2.6 has no live pass. Analytic support/candidate controls are not reconstructed game collision. No new fixed courses or full-map completion claim.

# 1.2.5 — wrong-floor native frontier and checked walking candidates (local candidate)

- A native partial endpoint within 3 m of the goal XY but more than 2 m away in height is search-only. It remains a seed, not primary upstairs guidance. Stop unconditionally appending the goal to every native partial path; only a same-level remainder within 8.5 m and 75 cm height difference may be promoted after the full physical audit.
- Add 546 grounded author-observed positions from the prior valley tower run as optional local-search neighbours. Lazy world-specific spatial indexing returns at most twelve nearby candidates per expansion. Every edge still uses the ordinary floor, capsule, slope and lock checks; no unchecked connections or action edges are generated.
- Use hints in traversal walking connectors, obstruction repair, endpoint reconnection and scene walking. Keep node/distance/time budgets. Retain local-search hint/rejection counters in action diagnostics.
- Replay the actual 1.2.4 native point list ending roughly 41 m below the summit. A narrow oblique walking model demonstrates grid-only failure and physically checked hint recovery; closed gates and vertical gaps remain rejected. This model is not reconstructed game collision.

Validation: 277 JavaScript regressions; Lua/native/full ZIP details in VALIDATION-1.2.5.txt. No live 1.2.5 pass yet. The 546 points are search hints, not fixed courses or live-learning data. Existing full-map coverage limits remain.

中文：修正低层原生部分终点引导高层目标的使用方式，并利用已采集地面点帮助局部搜索找到窄路入口。每一步仍实景复验，未放宽阻挡、未直接播放轨迹；A-01仍待新版本实测。

# 1.2.4 — bounded native/action diagnostics (local diagnostic candidate)

- Report top-level native query status, original partial flag, endpoints and up to 32 indexed points before any candidate endpoint extension. Record rejected/unavailable queries separately from the direct fallback. Keep verified goal XYZ unchanged.
- Record the first sixteen action-connector start/results with target/action identity, execution time and wall time. Record slow later results and any interrupted connector; generator cancellation now retains the boundary holding the planner.
- This adds observability only. It does not change routing policy or claim to fix the doorway direction failure. The 1.2.3 stationary cancel/reselect differential still failed before the user ascended stairs. Actual native path flags were missing from earlier evidence.

Validation: 273 JavaScript regressions, including three new diagnostic contract cases; Lua/native/full-package checks in VALIDATION-1.2.4.txt. No game validation yet. Diagnostics have bounded output but no measured FPS result.

中文：本地诊断版补齐原生路径状态、原始点列和动作连接耗时/中断信息。A-01仍未修复；下一次只在门内原地选一次同一塔顶目标，取得缺少的路径状态，不要求重跑全程。

# 1.2.3 — resident actions before expensive vertical native repair (local candidate)

- A vertical native/direct candidate still undergoes physical validation first. If rejected, try resident action chains before consuming its local repair budget; if actions do not finish, retain the original checked walking repair fallback. Same-level routing, safety checks and budget limits remain.
- A controlled framed replay reproduces a ready climb being starved until the 30-second wall timeout. The corrected ordering reaches the action first. A separate regression verifies walking fallback after actions are unavailable. These timings are simulated scheduling evidence, not game FPS/latency measurements.
- Record the failed 1.2.2 tower retest: wrong approach direction, delayed correction at the wall, then wrong direction/backtracking after the corner. This candidate does not claim the complete tower route or backtracking issue is resolved.
- Add the staged navigation roadmap and validation ledger; improve fresh-session read-only discovery and ability collection. Repair author/build references after the source directory was renamed to Quest_Navigation. Author tools and field traces are not packaged into the mod.

Validation: 269 JavaScript regressions; real Lua integration, native rebuild and full-package checks in VALIDATION-1.2.3.txt. In-game retesting pending. No new fixed courses or full-map coverage claim.

中文：先检查高差候选的真实可行性，失败后优先尝试攀爬等动作，再尝试原有步行修补，减少错误候选阻塞动作提示的机会。保留完整安全检查与预算。1.2.2现场仍有错指和折返，新版待复测。

# 1.2.2 — checked detour continuation and post-traversal stairs (local candidate)

- A locally checked bypass no longer ends repair when its unmodified remaining tail fails validation. Try the remaining bounded rejoin distances within the same deadline; retain a rejected checked prefix as a diagnostic if no complete repair succeeds.
- After a validated traversal, permit the existing bounded local walking connector to a higher goal. Previously a goal-height difference of 200 cm disabled that connector, including the recorded valley-tower climb followed by stairs. Keep the direct start-to-goal policy, connector limits, floor/capsule/lock checks and deadline.
- Make zero-distance Ground.step agree with valid CharacterMovement floor contact at the occupied feet. This does not certify neighbouring steps, another floor or airborne contact.
- Use actual tower movement boundaries and 385 sampled upper-walk positions in the planning-policy replay. Local physics/query behavior is substituted in regression tests. The four recorded routes are not installed as fixed courses and full-map coverage remains incomplete.

Validation: 267 JavaScript regressions pass, including the new failing-before/passing-after cases. Real tracker Lua integration, native rebuild and complete package verification are recorded in VALIDATION-1.2.2.txt. No new game validation of 1.2.2; remaining cave/wall-run and collision disagreements require retesting.

中文：修复一次局部绕行接回后段失败就停止、动作完成后高层目标无法使用局部楼梯，以及原地有效地面被重复扫线拒绝的问题。没有放宽行走碰撞/锁/楼层检查，没有把现场轨迹当作已启用路书。完整路线仍待进游戏复测。

# 1.2.1 — D-pad delivery and grouped-map item focus

- 1.2.0 handled D-pad presses only in the map's preview callback. Poll the CommonUI held-key router and the owning player controller as well, so selection still runs when no preview event is delivered. Event and polling paths share press/release state, a 350 ms initial hold delay and 180 ms repeat interval; one physical press cannot skip two items.
- Remove world equality from collectible chart membership. A merged chart may show HouJie or XiMeng items from another streamed world; use the native map-group/map-ID resolver and keep the selected item's own world and XYZ. Project each Lua item with its own map ID and discard the missing-projection origin.
- Add `pad focus` diagnostics with source, direction, chart, marker/candidate counts and selected key. Teleport menus and modal/filter UI retain their original controls.
- Capture 175 real 1.2.0 marker records with the user's map open. Replay actual cross-world records through the map tick and A-confirmation path without calling preview handlers. Retain the 1.2.0 wall-safety changes.

Validation: 264 JavaScript regressions, both real Lua integrations, native adapter and complete ZIP checks; see VALIDATION-1.2.1.txt. The live check confirms the 1.2.0 marker catalogue is available. The new 1.2.1 input behavior has not yet been retested in game.

中文：修复十字键实际收不到预览事件时无响应，以及合并地图跨世界物品被过滤/投影错误的问题。轮询与事件共用去重和长按节流；175条真实标记用于回放。新版游戏按键效果仍待复测。

# 1.2.0 — wall-safe route display and directional controller selection

- Revoke an expired far-ribbon collision proof before starting its incremental refresh. Reset its safe endpoint and release only the rechecked prefix; an old endpoint can no longer expose a wall-crossing suffix while the trace budget is exhausted. Keep the existing twelve-probe and time limits.
- A simple-collision miss now triggers a triangle-collision query with the same pawn collision profile. Apply this to walking capsules, supporting-floor/lock rays and the raised guiding thread, including its line-query fallback.
- Preserve projected route corners instead of applying cosmetic rounding and pixel-tolerance shortcuts. When an obstruction is known, retain its red marker/section and show the remaining route as unconfirmed.
- Add D-pad selection of the nearest visible collectible in a 90-degree screen-direction sector. Skip native bells/quests and collected/hidden icons; repeated presses advance without wrapping, with bounded key repeat. A confirms the original item coordinates and floor. Stick movement, map/layer changes or removal of the item release the focus; native bell snapping cannot steal an active item selection.
- Publish the currently displayed Lua marker set through the navigation-owned bridge. Focus/confirm commands require its current revision and session; reject stale or missing markers. Support both real tracker 1.0.9/1.0.14 modules and legacy JS marker slots without changing collector-owned files.

Validation: see VALIDATION-1.2.0.txt for the failing-before/passing-after reproductions, full JavaScript suite, real Lua modules/file round trips, native adapter and complete ZIP checks. Collision and input engine calls are simulated; this package has not been retested in game. Existing full-map coverage limits remain.

中文：修复远段检查过期复用旧终点、精细碰撞漏检、地图圆角抄近路及阻挡后段仍画可行白线。新增十字键按方向选择最近可见收集物、A保留真实楼层确认，并防止铃铛抢焦点；更新导航自有Lua桥接，保留收集Mod原文件。游戏现场仍待复测。

# 1.1.1 — tracker bell identity and checked obstruction detours

- Recognize the native tracker's explicit `pbz:bell:<id>` selection when its 3D position matches the game bell table. Preserve its original key and coordinates. Unopened tracker bells now enter overland/roadbook planning; activated tracker bells retain the previous walking/transfer comparison through the real selection/solve path.
- Restore the bounded repair budget for blocked generated roadbook candidates. Previously their context was initialized with both repairs already spent. Allow the same verified action connectors used by atlas repairs; measured fixed guides remain unchanged.
- A lock flag no longer suppresses all local repair. Search an open side passage using the same constrained ground/capsule/lock checks; never alter the lock, cross a closed wall or invent an action through it. Retain the existing search limits and honor even a zero/exhausted deadline.
- Add `local detour search`, `local detour result` and `local detour validation` diagnostics so attempted connectors, failed searches, blocked rejoins and pending prefixes are distinguishable.

Validation: 247 JavaScript regressions, including eight new selection/repair/safety cases. The tavern fixture uses the actual tracker key and logged target/obstruction coordinates with simulated side-passage physics. Installation audit confirms all 1,362 1.1.0 runtime files match the delivered package. See VALIDATION-1.1.1.txt. The full market-to-tavern route has not been retested in game; existing coverage limits remain.

中文：修复收集Mod铃铛丢失身份、路书遇阻被跳过局部修复，以及上锁标记直接禁止尝试侧路的问题。保持实际锁/碰撞约束，开放侧路可搜索，无侧路不放行；新增绕行与接回验证日志。实际市集→幻鬼酒馆仍待新版游戏复测。

# 1.1.0 — experimental traversal expansion and roadbook candidates

- Add legacy wall-running, pole wall-jump/execution, cross-obstacle ledge and lion-dance link adapters. Preserve directed action boundaries; ladder descent gets its own instruction. Prepare a representative of each movement kind before repeated volumes, with a 96-feature cap and the existing time deadlines.
- Parse 487 unique placed movement instances from eight cooked worlds, including 75 grapples. Keep source package hashes, strict native component schemas, transforms and spline facts in authoring tools. Runtime use requires the current loaded instance; current native curves take precedence. Static fallback also checks the actor root against its source position.
- Compile 86 directional 3D roadbook candidates from original navigation and placed movement geometry; retain the two existing trace references. For inactive bell targets, validate the candidate through ordinary support/capsule/requirement checks. Candidate actions must match current resident endpoints/state; short falls retain takeoff/descent/landing checks. Do not give generated candidates the measured guides' floor-audit exemption.
- Read real wharf boarding targets and the boat-wharf availability query. Sailing and recognized attached cinematic rides retain the selected target, stop ground-route searches and replan after disembarking/ending. Do not invoke boarding, riding, teleport or movement commands.
- Account for all 140 worksheet links: 86 candidates, two measured references, 49 geometry gaps, one identity gap, one cross-world transition gap and one missing endpoint. Full-map manual geometry, complete water navigation, general scripted riding and dedicated story-chase routes remain unfinished. See MOVEMENT-COVERAGE.md and VALIDATION-1.1.0.txt; no fresh in-game validation.

中文：扩展蹬墙/走壁/翻越/立柱/登船识别，接入487个关卡实例与86条需实景检查的路书三维候选；乘船/已识别剧情骑乘保留目标并在结束后续算。**全图仍缺52条连接，专用剧情追逐及完整水上航线未完成。**

# 1.0.2 — inactive bells, checked traversal connectors and nearby item walks

- Bell markers share the item target flag. Prevent inactive or currently non-teleportable bell targets from entering item-transfer planning; retain the existing two directed reference courses and ordinary walking/action fallbacks. Activated targets retain their existing transfer behavior.
- Do not return a transfer before checking the loaded scene's walking/action/local candidates. Compare every complete candidate with the transfer using the existing 85% threshold; pending/blocked walks still retain the checked transfer. The reported dock item is about 64 m away, while logs selected a 241 m transfer. Its real-atlas regression fails with the pristine old planner and passes with this change.
- When native walking is absent/incomplete between traversal actions, try the original atlas's walking-only corridor and physically validate it. Exclude movement edges, wrong floors, walls and locks. Bound each atlas query to 120 m, 750 ms wall time, 512 generator advances and the current action deadline; close abandoned generators.
- Down-slides use their actual TopCollision approach before the ledge spline. Rappelling appends the native GetRappellingLandTargetWorldTransform landing to the existing rope curve. Direction and current mechanism conditions remain enforced.

Validation: see VALIDATION-1.0.2.txt. New tests first failed for inactive-bell transfer planning, short-walk preemption, 60 m inter-action corridors, down-slide triggers and native rappel landings. Coordinates/atlas and reflected signatures are real; physics remain simulated. No new full-map manual courses, trail persistence or live-game success claim. Game and manager are read-only; this local package has not been uploaded.

中文：修复未解锁铃铛误推荐传送、近处物品跳过实景步行比较，以及攀爬/钩索之间不使用已有地面路网的问题；补下滑顶部入口与沿绳原生落点。保留既有路书和规则，完整游戏效果待复测。

# 1.0.1 — route loading feedback and consolidated public release

- Release the current route-feedback build under the user-requested 1.0.1 version. Align the JS entry points, native adapter, package metadata, bilingual instructions and audit headers.
- Include persistent blue calculation/loading status with elapsed seconds; retain checked bell transfers, Map Tracker 1.0.9/1.0.14 compatibility, 170 Chinese hints and the existing two directed reference courses.
- Keep only the current package in dist. Preserve previous ZIPs and prototypes outside dist with SHA256 records. Add VERSION-LOCK.json and build/package checks against accidental version rollback.

Validation: see VALIDATION-1.0.1.txt. Route planning behavior is unchanged from 0.15.2-fork.1; full-map authored XYZ coverage, complete live-game routes and the new HUD appearance remain unverified.

中文：按用户要求发布为 1.0.1，统一各处版本，包含路线加载提示与既有修补。dist 仅保留当前包，旧包和原型另行归档并记录哈希；增加版本锁以阻止误回退。全图手工三维路线仍未完成，本次未新增游戏实测结论。

# 0.15.2-fork.1 — route calculation and atlas loading feedback

- Verify the 1,334 installed 0.15.1 runtime files match its delivered archive. Its field logs show first useful output after roughly 10–14 seconds, with no script crash; short target selections were cancelled before that output. This update adds waiting feedback, without changing search order, execution budgets or route speed.
- Show persistent blue “Calculating route…” text above gameplay, with elapsed wall-clock seconds. Show “Loading map routes…” while a relevant atlas is streamed, including the gap between a completed empty request and the next automatic request.
- Repeat status beside the selected map marker, invalidating cached labels as the seconds change. Do not show “no connected road” while calculation or atlas preparation is pending. Existing checked routes and transfer candidates retain their guidance while a search continues.
- Clear the status on completion, cancellation, target removal, player/world reset or disabled navigation. Restart the timer when selecting a new target. Reuse the viewport/label instead of creating widgets every frame; throttle reads to five times per second and back off if a stock widget cannot be created. Status reads do not queue or pump route searches.

Validation: three new main-planner/frame-state regressions first failed on missing feedback, then passed; four more cover viewport reuse/recovery, relevant atlas/elapsed messages and actual map-label redraw. All 202 JavaScript regressions pass. Real Map Tracker 1.0.9/1.0.14 Lua modules and the native adapter are revalidated with the full ZIP. HUD/engine APIs are mocked; the new in-game appearance, first-route latency and full valley courses have not been validated on 0.15.2. Full-map authored XYZ coverage remains unfinished.

中文：新增持续显示的蓝色计算/路网加载提示与等待秒数，修复计算中提前显示无路线；完成、取消或重置后收起。0.15.1 安装匹配，现场等待确实较慢，本版未做提速。

# 0.15.1-fork.1 — stable item bell recommendations and checked departure detours

- Confirm all 1,334 installed runtime files match the 0.15.0 archive and its loader version. Field logs reproduce rejected walking previews hiding available transfers and immediate return-transfer recommendations after arrival. These are 0.15.0 failures, not evidence of a successful 0.15.1 game run.
- Publish a checked bell departure as soon as it is available; failed walking previews and planner timeouts retain it. Complete walking routes can still replace it when preferable. Reject partial departures and disable the unchecked legacy item-transfer fallback.
- Rank physically checked item access above continuous atlas corridors, and those above proximity-only estimates. Require matching route endpoints and floors. Within an evidence class, prefer nearby item bells, penalizing large detours instead of trusting small atlas-length differences. The reported currency coordinate now selects 溪谷杀气塔底 in the real-atlas regression. This remains an estimate until scene checks pass.
- Exclude known arrival walls, map locks and unavailable traversals. A corridor eliminated by a measured edge exclusion or a closed traversal cannot return as a proximity-only candidate. Never draw an unstreamed arrival walk as certified.
- Add at most two bounded local departure searches per request, using the bell's checked interaction approaches: at most 60 m, 1,600 nodes and 900 ms execution budget each. Retain the existing floor, slope, capsule, wall and lock rules and stationary bell access check.
- Consume teleport arrival before origin/revision changes restart planning. Finish the selected item's approach without another automatic transfer; clear this unsaved selection stage on a new target or cancellation. Standing at a better item bell must not recommend a worse bell just because self-transfer is excluded.

Validation: 195 JavaScript regressions, including 14 new cases; real Map Tracker 1.0.9/1.0.14 Lua integration; rebuilt native adapter and full ZIP checks. Engine physics/loading remain simulated. The exact second currency near 驿站前小院 is not identified by the last snapshot; both user scenarios still need game testing. No full-map authored-route, FPS or global reachability claim. Game and manager remain read-only.

中文：修复铃铛提示被短受阻预览覆盖、传送后反复返回、到达更好铃铛后推荐更差铃铛的问题；增加经检查的局部绕行与末段候选筛选。溪谷杀气塔底回归使用真实路网，尚待游戏复测。

# 0.15.0-fork.1 — Map Tracker API compatibility, item bell transfers and acquisition hints

- Confirm the installed collector's 110 files match repository 1.0.14. Reproduce the old native collector-entry SHA rejection, then remove that version lock while retaining the exact UE4SS 1195 ABI/runtime SHA gate. Validate target/selection service contracts in the collector VM; unsupported contracts restore original interfaces and preserve collector results.
- Exercise real 1.0.9 and 1.0.14 protected Lua modules through hover/middle-click, target changes, Z-preserving file round trips, stale-command rejection and cancellation. Guard write failures, duplicate installation, shutdown and later wrappers.
- Compare activated bell transfers before expensive item searches and before returning a longer same-map atlas path. Physically check departure approaches beside the bell collider, including stationary transfers, so nearby walls or closed doors cannot be bypassed by proximity. Keep unloaded arrival walking pending and replan the original item after teleport. A transfer never completes the item by itself. Existing same-level movement/retry limits remain.
- Audit every catalogue point (1,616), native detail row (530) and public marker across eight maps (1,435). Add 170 independently worded Chinese location/operation/use hints, including the tiger-cannon requirement for pigeon feed. Preserve existing detailed descriptions and other languages; require matching ID, contents, location and original generic hint on later updates. Ambiguous/no-source entries stay listed in the audit. No collector files, full source prose, API dumps or downloaded images are distributed.
- Keep player-trail learning and downloads disabled. Full-map authored 3D routes remain unfinished; the two existing reference courses and the valley fixes still require live-game verification.

Validation: 181 JavaScript regressions; real 1.0.9/1.0.14 Lua compose/presentation and bridge tests; native ABI/runtime gate and future-entry dispatch; complete ZIP/ownership/hash checks. Game physics/loading are simulated; no measured FPS or full reachability claim. Game and manager remain unchanged.

中文：修复 1.0.14 物品目标失联与入口版本锁，增加铃铛中转及传送后末段规划，补写 170 个目录点的具体中文提示；同名歧义与无来源项保留全量审计，不凭二维标记伪造路线。

# 0.14.0-fork.1 — directed bell-course composition and coverage audit

- Add a static directed bell-course network, with explicit bell identities and course-end continuity checks. Combine authored courses by traveled 3D distance; preserve action direction and indices when joining midway.
- Let items and map pins leave the existing spine through checked same-floor walking spurs up to 7.6 m. Reject walls and other floors; farther items retain automatic planning. Do not treat every nearby item as a bell endpoint.
- Exclude currently known locked intervals and unavailable resident actions when selecting complete combinations, allowing an open alternative and an item exit before a lock. Dynamic route auditing remains enabled.
- Audit all eight public maps, 171 game bell table entries and 4,324 ordered pairs. Record 140 source-linked manual topology worksheet entries and unresolved identities. These are NOT enabled XYZ routes; full-map hand-authored routing is unfinished. Only the existing two directed reference courses remain enabled and still need full in-game runs.
- Decode grouped map projection anchors (12 partitions / 7,365 points) and calibrate eight public maps for offline authoring. Projection triangles are not walking surfaces, and scene-copy heights must not be normalized away. No downloaded prose/images or extracted game resources enter the package.
- Keep runtime trail recording, persistence and downloads disabled. Preserve removed collector fixtures by retrieving the original test reference into build/ from Git; do not restore or modify user collector folders. Collector compatibility remains pinned to original 1.0.9.

Validation: 174 JavaScript regressions, original 1.0.9 Lua bridge round trips and native ABI/SHA-gate tests pass. Engine physics are simulated; full in-game courses are unverified.

中文：新增有向铃铛路线串联、经检查的物品短支线、锁路替代选择；完成全图逐对缺口核对。全图三维路线尚未编制完成，不把 140 条二维/拓扑工作条目冒充可走路线。

# 0.13.0-fork.1 — fixed 3D reference courses and reflected component discovery

- Verify the installed 0.12.0 runtime matches its delivered ZIP: 1333 exact file hashes, no missing/changed/extra JS and a matching loader startup. Game and manager remain read-only.
- Fix inherited traversal discovery using K2_GetComponentsByClass, the API actually used by game scripts; retain the older name as a compatibility fallback. The K2-only regression fails before the fix and passes after it.
- Download the public GamerSky roadbook and two map datasets for offline investigation. Their flat coordinates fail world-space calibration, so use route order as reference and author fixed world XYZ courses from existing continuous field evidence. No guide text/images/API dumps are redistributed.
- Add two directed reference courses for the known failures: Great Corridor Bridge -> lower cave -> two climbs -> grapple -> Xiaozhang; Mass Grave -> river -> actual uphill detour -> Mo Jizi cenotaph. Preserve measured bends/heights, checked same-floor joins and direction. Do not fabricate reverse actions or routes to nearby unrelated items.
- Choose these corrections before the known failing automatic candidates; other targets retain automatic planning. Distinguish guide reference lines from physical certification, keep map reference labels/dashes and the raised blue world strand, and preserve current body/ribbon collision, locks and resident mechanism conditions. Guide walls do not trigger repeated replans into the same guide.
- Keep the last ~3 m of the cave course incomplete until a local checked bell approach is available. No runtime learning, trail reads/writes or network requests. MANUAL-ROUTES.md documents provenance, calibration, coverage and limitations.
- 161 JavaScript regressions pass, including main-planner and guard integration. Engine APIs/physics are simulated; neither full course has passed a 0.13.0 live-game run. Collector sync remains pinned to original 1.0.9; the installed 1.0.12 is not certified. Preserve original atlas/collector files, earlier ZIPs and validation history.

中文：安装正确，修复真实组件接口缺陷。新增两条固定三维参考路线，保留洞内动作和真实上坡绕行，支持同层接入并继续检查当前阻挡；无需学习。两条全程仍待本版游戏验证。

# 0.12.0-fork.1 — game-data traversal rules and fewer redundant retries

- Withdraw 0.11.0 player-route memory, sampling, persistence and LearnRoutes settings. Old trail files are neither read nor written.
- Fix a completed route retaining a prior candidate retry. Diagnostic/frontier/off-route movement retries require 6 m horizontally or 75 cm vertically and no active search. Ordinary hops preserve the origin; same-height jumps over unwalkable gaps still invalidate it. Reduce stationary full-route audits to a 10-second interval while retaining movement and state triggers.
- Read CharacterMovement IsWalkable, component slope overrides and step-up restrictions. Add resident SpecialMoveVolume_SlopeSlide region/downhill queries using signatures checked against installed native metadata; reject forced-slide uphill walking.
- Expand discovery from 17 to 29 class entries, deduplicate blueprint/native actor scans and read inherited scene components. Correct ascent/mantle/swing endpoints; add one-way GapBlocker hook trigger/grab/landing extraction guarded by actual interaction requirements.
- Poll nearby discovered mechanism state: actual folding ladders, moving/broken lifts and native interaction requirements affect graph traversal and route audits. Fix discovery-cache reuse across graphs and clear states on reset.
- Read NeedItems as a TMap, resolve required/owned item counts and names, and inspect typed weapon/tag locks. Refresh map locks with the map closed. Read supported collided door/blocker conditions without triggering any interaction.
- Add GAME-TRAVERSAL-AUDIT.md with source evidence, 69 BP package paths, 76 related asset-name indexes and explicit unsupported cases. Preserve original atlas, collector files and previous releases.
- 150 JavaScript regressions pass, including observed red→green retry, inherited-component and conditional-hook flows. Game APIs/physics are simulated; native slope calls and both complete reported routes still require live-game verification. No measured FPS claim and no learning run prerequisite.

中文：撤回记忆方案，减少无效重算；从游戏资源和反射接入坡面、滑坡、攀爬/钩索组件、门锁物品与机关条件。完整支持范围见资源审计；两条路线尚未在本版游戏验证。

# 0.11.0-fork.1 — character floor limits and persistent directed 3D trails

- Read K2_GetWalkableFloorZ and actual step height; use CharacterMovement's walkable occupied floor only at the pawn footprint. Probe near the expected feet and choose the closest support instead of the topmost layer.
- Preserve unfinished planning during measured continuous uphill walking. Rebase results along that trace; actual landings, custom movement and world/lock changes still invalidate old origins. Increase the generator cap to192 within a2ms frame slice; retain slow-step and30-second wall limits.
- Add LearnRoutes, enabled by default, and a separate directed3D movement graph. Consecutive checked walking retains heights/corners; observed airborne/custom movement records directed jumps, drops and climb/grapple arcs. Never infer reverse actions. Reject teleports, menus, water, stale gaps, world changes and wrong-floor joins.
- Save navigation-owned trails while stationary or in menus to ProjectPBZ/Saved/PBZQuestRoute-trails-v1.json. Validate persistence before replacing live data. Current floor/collision and key locks still constrain recorded routes. Missing original links require travelling once with this release before reuse; no path is fabricated from sparse old logs.
- Add ground/trail diagnostics.149 JavaScript regressions pass, including main-planner learned climb/grapple integration. Delivered0.10.3 fails both new Ground cases. Physics/movement are simulated; neither complete bell route has passed a new live-game run. Preserve original atlas, collector and prior archives.

中文：修正固定坡度/跨步门槛与站立地面丢失，连续可走上坡保留搜索；增加保存实际三维通路的LearnRoutes。缺失的山洞钩索、坡道和跳落需实际走过后学习，保留方向限制并复查门锁/碰撞。两条全程仍需游戏验证。

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
