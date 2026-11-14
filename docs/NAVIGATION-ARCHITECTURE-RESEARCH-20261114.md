# Shipping 游戏导航：候选图、延迟验证与开源实现调研

调研日期：2026-11-14。范围是已打包的第三方 Shipping UE 游戏内、以 Puerts JS / UE4SS 为入口的只读引导 Mod。本笔记只检查本地资料、Epic 官方文档、论文作者页面和项目源码；没有启动游戏、修改游戏目录、替换发布包或证明新方案已在游戏中走通。现有边界见 [README](../README.md) 和[前一份引擎调研](NAVIGATION-ENGINE-RESEARCH.md)。

## 结论与当前故障

**值得做的是“先在有限候选图中找路，再只验证候选路线”的改造，并修复候选图的楼梯断边；现在没有证据支持整套替换成另一种导航插件。** 这与 Lazy PRM 的核心办法一致：暂时把候选边当作可用，求一条路线，检查该路线，删除失败边后重算。收益来自减少昂贵的碰撞查询，不是放松检查。论文并不保证在本游戏中达到某个毫秒数。[Bohlin / Kavraki：Lazy PRM 原始论文与摘要](https://kavrakilab.rice.edu/publications/bohlin-kavraki2000path-planning-using.html)

本地失败样本本身已经说明为什么只换 A* 的实现不够：

| 证据 | 能得出的结论 | 不能得出的结论 |
| --- | --- | --- |
| [下层楼梯回归样本](../tests/fixtures/tower-stair-budget-20261114.json)：原始查询 `expanded=107`、`probes=1015`、其中 `hintAccepted=1001`，最后报 `time budget` | 即使多数候选检查通过，逐个邻点进行现场检查也可能消耗大量预算；需要分别计量图搜索和物理查询 | 不能把预算耗尽叫作“游戏中无路” |
| 同一样本保存的候选图上限为 210 cm，跨分量最短缺口为 222.049 cm；两端为 `[-63339.1,219760.6,-12205.5]`、`[-63519.8,219797.7,-12081.9]` | 在该候选连边规则下，这条跨越根本不存在；移除碰撞检查也不能让搜索跨过去 | 把半径改大只会增加候选边，不证明该边能走；仍需沿途地面、角色空间和锁检查 |
| 父任务读取的 1.2.6 现场日志摘要：上层起点成功约 583–885 ms，下层起点请求达到约 30 s | 同一目标受起点和候选连通性影响明显；应保留同一组起终点比较前后版本 | 本研究未重新计时，不能把这组数当作新实现的实测结果 |

父任务另做的无碰撞图重放在 210 cm 条件下耗尽 345 个源点，280 cm 及以上条件下出现拓扑通路。这是**候选图诊断**，与上表物理查询日志不是同一种证据；也没有重建现场碰撞。本笔记据此建议修连通性，但不建议把“280 cm”当作全图普适的可通行阈值。

父任务完成的最终算法对照：对17个捕获请求，以无障碍`world.step`替身比较原始1.2.6与新有限候选图；旧版找到3条、调用14,366次，新版找到15条、调用282次。另2个请求在当前普通步行候选图中未连通，以0次`step`调用结束后保留动作等回退。按每35厘米一段计算的几何采样工作从46,646段变为1,935段，避免把更长的候选边误当成零成本。单个下层失败样本为9次`step`、36次图扩展；其调用输入与脚点均来自实际记录。图搜索与物理认证分别设置每次768个图节点、整次64次连接检查上限，执行预算仍200毫秒；这些是算法预算参数，不是200毫秒墙钟出线承诺。**对照是无碰撞算法控制，不是实际游戏碰撞、毫秒耗时或玩家通行证明。** 原始对照在`build/lazy-hints-127-before.json` / `after.json`；可由`tools/benchmark-walk-hints.cjs`复现。早期192图节点上限曾使另4个有拓扑候选的请求提前结束，现已分别计量图节点与物理认证，并区分节点预算耗尽与图不连通。


## Epic 官方能力与 Shipping 边界

| 能力 | 官方材料实际支持什么 | 在本 Mod 中的用途和限制 |
| --- | --- | --- |
| `FindPathToLocationSynchronously` | 接受 NavData、Pawn 或 Controller 作为查询上下文；同步返回路径。[Epic：NavigationSystemV1 5.5](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/NavigationSystemV1?application_version=5.5) | [现有 `nativeWalk`](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZQuestRoute.js) 已传玩家 Pawn。更换调用名不会补出原生网格缺失的连接；返回对象也不能代替完整性、楼层和终点残差检查。这里引用 Python 文档核对接口语义，不代表可在 Puerts 中照搬 Python 参数形式。 |
| 端点投影与过滤 | `K2_ProjectPointToNavigation` 是 BlueprintPure，带 `NavData`、`FilterClass`、`QueryExtent`；原生 `ProjectPointToNavigation` 另有代理属性重载。[Epic：接口列表](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/NavigationSystem/UNavigationSystemV1) | 优先记录原点、投影点、XYZ 偏差、NavData 和结果末点；针对同层接近点做有限候选查询。**推论：投影找到附近网格，不等于找到目标所在楼层，更不等于两点连通。** 目标错投楼层时不能把投影末点当成已到达。 |
| `FindPathAsync` | 原生 C++ 接口接收 `FNavAgentProperties`、`FPathFindingQuery` 和结果 delegate，返回请求 ID；可选 normal / hierarchical 模式。[Epic：FindPathAsync](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/NavigationSystem/UNavigationSystemV1/FindPathAsync?lang=en-US) | 异步能改变等待和调度方式，不能创造缺失的图边。官方签名未把它列为 BlueprintCallable；不能假定现有 `require('ue')` 反射调用可直接使用。若以后接 C++，仍须验证目标 Shipping 版本的符号、类型布局、回调寿命和取消机制。 |
| 运行时重建 | Static 加载离线网格；Dynamic 可更新相关块；Dynamic Modifiers Only 只修改已有网格的区域/代价，不生成新可走面。[Epic：三种生成方式](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-how-to-modify-the-navigation-mesh-in-unreal-engine) | “打开动态导航”不是本轮只读 Mod 的现成修复。需要实际存在的生成器、碰撞、Bounds、导航相关数据和匹配构建能力；本研究没有证明这些条件在本游戏全部满足。 |
| 静态配置与流送 | `ConfigureAsStatic` 说明可以不保存运行时生成数据，并明确不应把它当作运行时开关；World Partition 导航块随空间加载/卸载，动态构建也限于已加载空间。[Epic：ConfigureAsStatic](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/NavigationSystem/UNavigationSystemV1/ConfigureAsStatic?lang=en-US)、[Epic：World Partition NavMesh](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partitioned-navigation-mesh) | 不能从网上的 Editor 演示推断 Shipping 内可以补烘焙全图。现场先区分“走近后数据出现”和“同一缺边始终存在”；未加载空间保留未知状态。这里也不能反向断言本游戏一定剥除了生成器。 |
| 特殊动作连接 | 自动 Nav Link 仍需要 Link Proxy Class 实现自定义动作；官方还指出采样变稀可能留下碰撞错误。[Epic：自动导航链接](https://dev.epicgames.com/documentation/en-us/unreal-engine/automatic-navigation-link-generation) | 保留现有有向动作图：走到入口、动作条件、落点、接回普通步行各自核对。自动链接不提供本游戏绳索、机关和剧情动作的完整语义。 |

Epic 当前默认文档页面可能显示 5.8 / 5.9；上表是能力边界，不是对本游戏二进制版本的识别。已经能调用的反射函数继续作为首选；未验证的原生接口应作为后续能力实验，不成为本轮算法改造的依赖。

## 直接相关的开源实现

下列游戏 Mod / UE 插件 / Recast 源码链接固定到本次检查的 commit，避免将之后的改动混作本次证据；OMPL 使用项目在线文档与许可页。**Runtime UE 插件、可独立编译的算法库、现成游戏的注入 Mod 是三种不同的集成条件。** “Runtime” 表示模块可用于对应工程的运行时，不表示 DLL 能加载进任意已经打包的 UE 游戏。

| 项目与许可 | 核对到的实现 | 可以采用什么；是否移植 |
| --- | --- | --- |
| **Recast / Detour**；[zlib 许可](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/License.txt) | Recast 生成网格，Detour 加载和查询网格；两者是独立模块。[项目说明](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/README.md) `initSlicedFindPath → updateSlicedFindPath(maxIter) → finalizeSlicedFindPath` 显式支持分片搜索。[查询头文件](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Detour/Include/DetourNavMeshQuery.h) | 值得借鉴“查询状态与每次工作量分开”。若以后确认能导出合法且完整的网格数据，可评估独立 Detour 查询；**现在不建议直接解引用游戏内部 Detour 指针或假定上游与 Epic fork 的 ABI/序列化格式相同**。独立库不会自动得到游戏网格、楼梯、锁和动作。 |
| **OMPL LazyPRM**；[BSD-3-Clause](https://github.com/ompl/ompl/blob/main/LICENSE) | `constructSolution` 先查候选路线的顶点，再调用 `checkMotion` 检查边；失败时移除边并重新处理图连通性。[官方源码](https://ompl.kavrakilab.org/LazyPRM_8cpp_source.html) `clearQuery` 可保留路网，`clearValidity` 将节点/边有效性重置为 UNKNOWN。[官方类文档](https://ompl.kavrakilab.org/classompl_1_1geometric_1_1LazyPRM.html) | **本轮最值得采用的结构。** 以现有有限作者点和原生路径点作为 roadmap，无需引入完整 OMPL/Boost。借用延迟验证办法即可；不应声称本实现继承了随机采样规划器的完整性或最优性结论。 |
| **DoN AI Navigation**；[MIT](https://github.com/VSZue/DonAINavigation/blob/96241fb3714f4cc9f4b1c6ece382efce3f3f0c59/LICENSE.md) | 为飞行 AI 的 3D 体素导航 UE 工程插件；manifest 标注 UE 4.19 和 Runtime 模块。[项目与说明](https://github.com/VSZue/DonAINavigation/tree/96241fb3714f4cc9f4b1c6ece382efce3f3f0c59)、[manifest](https://github.com/VSZue/DonAINavigation/blob/96241fb3714f4cc9f4b1c6ece382efce3f3f0c59/DonAINavigation.uplugin) 分开限制 path solver 和 collision solver 的每 tick 迭代量，默认按需加载碰撞。[管理器接口](https://github.com/VSZue/DonAINavigation/blob/96241fb3714f4cc9f4b1c6ece382efce3f3f0c59/Source/DonAINavigation/Classes/DonNavigationManager.h#L692) | 采用任务队列、按需碰撞、搜索/碰撞双预算的想法。**不整套移植**：飞行体素的“空中无障碍”不能认证脚下有地、能跨台阶或能执行动作；现成工程模块也不是本 Shipping 游戏的即插即用注入组件。 |
| **Abiotic Factor / AF LiveMap**；[MIT](https://github.com/x1m4x/af-livemap/blob/2dc60695730003b3be70121ec6f55c1c2c93d03a/LICENSE) | 是实际的 UE4SS Lua 注入 Mod：游戏线程读取位置和调用 `LineTraceSingle`，`LoopAsync` 处理 JSON/写盘。[Lua 源码](https://github.com/x1m4x/af-livemap/blob/2dc60695730003b3be70121ec6f55c1c2c93d03a/mod/Scripts/main.lua) 浏览器 JS 在扫描到的多层地面上 A*，另建电梯、定向传送门、轨道车边。[路由源码](https://github.com/x1m4x/af-livemap/blob/2dc60695730003b3be70121ec6f55c1c2c93d03a/web/app.js#L1467) | 借鉴“多高度地面 + 显式特殊边”和游戏内/纯数据工作分离。**不照搬可走性规则**：源码将玩家走过的单元持续视为可走，扫描规则不等价于 PBZ 的胶囊/门锁认证。其自动采样、持久化和本地网络服务器也超出本仓库当前范围。README 的流畅性描述不是 PBZ 性能证据。 |
| **PalworldAccessibility**；[主体 MIT，附带 Tolk 另有 LGPL-3.0](https://github.com/game-a11y/PalworldAccessibility/blob/3c1bad0a164dabc36d85a62c188f9bcdb19bb878/LICENSE) | UE4SS C++ Mod；POI 导航以目标方向、距离和高差驱动音频 beacon。[README](https://github.com/game-a11y/PalworldAccessibility/blob/3c1bad0a164dabc36d85a62c188f9bcdb19bb878/README.md)、[Nav.cpp](https://github.com/game-a11y/PalworldAccessibility/blob/3c1bad0a164dabc36d85a62c188f9bcdb19bb878/src/Nav.cpp) | 是注入环境读取真实 POI、做三维引导的具体实例；**不能当成绕障寻路成功的实例**。这里检查的导航实现用于方向提示，不提供 PBZ 缺失的可走图。 |
| **Satisfactory / Vehicle Path Viewer**；仓库[GPL-3.0 许可文件](https://github.com/mklierman/SatisfactoryMods/blob/bf082eae668ece83c6c71e3a11f37bd981b7a72a/LICENSE.txt) | manifest 说明显示车辆 spline 路径；模块依赖 `FactoryGame`、`SML`、`InstancedSplinesComponent`。[manifest](https://github.com/mklierman/SatisfactoryMods/blob/bf082eae668ece83c6c71e3a11f37bd981b7a72a/ShowSplinePath/ShowSplinePath.uplugin)、[构建依赖](https://github.com/mklierman/SatisfactoryMods/blob/bf082eae668ece83c6c71e3a11f37bd981b7a72a/ShowSplinePath/Source/ShowSplinePath/ShowSplinePath.Build.cs) `SSP_Subsystem` 将已有 spline 变成实例化网格并关闭其碰撞。[显示实现](https://github.com/mklierman/SatisfactoryMods/blob/bf082eae668ece83c6c71e3a11f37bd981b7a72a/ShowSplinePath/Source/ShowSplinePath/Private/SSP_Subsystem.cpp) | 有参考价值的是复用已有路径数据并集中显示；它没有解决从任意玩家起点到任意收集物的行走路径。是针对 SML/FactoryGame 的游戏 Mod，不能直接移植到 PBZ；本轮仅参考设计，不复制代码或资产。 |

也定向检索了 Grounded、Smalland、Hogwarts Legacy 的开源导航 Mod，但本轮没有确认到同时具备可检查的绕障路径源码、许可和相近集成条件的项目。此处是检索范围说明，不是“这些游戏没有导航 Mod”的结论；不将通用小地图、Mod 安装器、UE 模板工程或游戏自带引导效果当作已实现的开源寻路证据。

## 建议的最小架构

以下为结合本地失败证据提出的工程设计，不是 Epic 对此游戏的保证，也不是新版本的完成报告。

1. **先做不触碰物理世界的有限候选图。** 来源包含现有作者地面点、已取得的原生路径点、现有图入口/出口、起终点同层接近点；同 XY 的不同高度保留不同节点。作者点只代表候选拓扑，不因来自作者数据而取得物理通行凭证。用空间索引/邻接缓存减少重复枚举；连接半径和垂直变化上限是候选生成参数，应由断边审计和实际验证分别约束。
2. **分开图搜索与认证。** 先仅用数值代价找候选路线；随后依序调用已有地面、跨步、身体空间、楼层与锁检查。失败时禁用该 job 的失败有向边，重新求路；不要把相同边换个名字再重复探测。若没有新边可试或预算到期，明确区分“当前候选图不连通”“验证阻挡”“时间预算耗尽”。这对应 Lazy PRM 的延迟认证结构；本地作者图没有随机采样等前提，不直接等同于完整 LazyPRM 算法。[原始论文](https://kavrakilab.rice.edu/publications/bohlin-kavraki2000path-planning-using.html)、[OMPL 的失败边移除与 `checkMotion`](https://ompl.kavrakilab.org/LazyPRM_8cpp_source.html)
3. **成功检查仅在同一 job 的有效上下文内复用。** 缓存键包含方向与实际检查参数；新请求不继承旧物理有效性。场景/流送、门锁、世界、目标、角色尺寸或起点上下层变化时，取消或使相关认证失效。只缓存拓扑可以长期复用；物理有效性必须另有生命周期。OMPL 也把可复用路网与可重置 validity 分开，但这里针对实时游戏的失效规则是本 Mod 的工程要求。[OMPL：`clearQuery` / `clearValidity`](https://ompl.kavrakilab.org/classompl_1_1geometric_1_1LazyPRM.html)
4. **保持双预算。** 图扩展数、碰撞/地面查询数各自计数，每帧还要有实际耗时预算；生成器在阶段之间和查询之间让出。仅给总任务一个 30 s 截止时间不能防止某个同步调用造成帧尖峰。DoN 的搜索/碰撞分开配额和 Detour 的 sliced search 可作实现参考；它们都不证明某个固定迭代数在本机恰好等于多少毫秒。[DoN 配额](https://github.com/VSZue/DonAINavigation/blob/96241fb3714f4cc9f4b1c6ece382efce3f3f0c59/Source/DonAINavigation/Classes/DonNavigationManager.h#L697)、[Detour 分片接口](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Detour/Include/DetourNavMeshQuery.h)
5. **纯数据工作与 UE 调用分开。** 如果以后有独立工作线程，仅将已复制的数字节点/边交给它；未经验证不把 UObject 或现场碰撞调用搬到后台。当前 JS 分帧版本无需为此新增线程。UE4SS 提供 `ExecuteInGameThread`，说明其回调由游戏线程在有机会时执行；这不是调用零成本的承诺。[UE4SS 官方文档](https://docs.ue4ss.com/lua-api/global-functions/executeingamethread.html)
6. **输出只消费通过验证的部分。** 可先显示连续且当前有效的安全前段；未知后段仍保持未知。平滑、抽稀、拼接和终点接近必须重新检查新产生的线段。原生部分路径继续只是候选/前沿；Detour 也将 `PARTIAL_RESULT` 明确定义为未到终点的 best guess，另列 `OUT_OF_NODES` / `BUFFER_TOO_SMALL`，说明“返回了点列”与“完成到达”是不同状态。[Detour 状态定义](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Detour/Include/DetourStatus.h)
7. **保留局部地面搜索作为有界修补。** 候选图确实断开时，在断口附近进行有限补点/局部搜索，或报告缺连接；不要把整个三维区域重新进行高频物理栅格搜索。对当前 546 点规模，优先修拓扑、去重复查询、认证候选路线；是否需要堆优化、增量搜索或更复杂层级，留给分阶段计量决定。

在检查器能正确描述玩家通行、场景在凭证有效期内不变的条件下，上述分工可以保留现有的通过标准并减少认证次数。检查器自身若误判台阶、薄墙或落点，延迟验证仍会继承该错误；**算法名不能证明“玩家一定走得通”**。候选边变多只改善表示能力，也可能增加需要排除的坏边；因此需要下面的对照验证。

## 怎样判断确实又正确又快

| 维度 | 需要记录/检查 | 建议通过条件 |
| --- | --- | --- |
| 候选图完整性 | 节点/边数、分量数、最近断口、起终点接入节点及高度；对 210 / 280 cm 等规则重放 | 下层失败样本在纯数值重放里有解释明确的连通结果；禁用碰撞不再无效等待物理预算。不能把图不连通升级为世界不可达 |
| 延迟验证是否有效 | 图搜索耗时/扩展数、候选路线数、不同有向边认证数、总 trace/地面查询数、同 job 命中复用数 | 与逐邻点认证基线相比，记录物理查询数及耗时变化；失败边不重复认证，未选中的边不预先做完整认证。最坏情形仍可能检查很多边，应如实保留 |
| 障碍与楼层正确性 | 墙、锁门、无支撑、上下重叠层、可走楼梯、只单向动作；目标真实 XYZ 与末点残差 | 已知负例全部拒绝；新候选边、平滑线段、动作接回步行均经过检查；错误楼层不报到达 |
| 时效与取消 | 门锁切换、流送边界、重选目标、上下楼、世界切换；故意在认证中改变上下文 | 过期 job 不覆盖新结果；旧物理凭证不跨请求使用；未知/超时不显示成安全实线或永久阻断 |
| 现场性能 | 冷/暖加载分组，各固定路线至少重复 10 次；首次安全前段、完整路线、p50/p95、最大一次 pump 耗时、FPS/帧时尖峰 | 可先把“已加载短楼梯 p50 ≤ 1 s、p95 ≤ 2 s，Mod pump 目标 ≤ 2 ms”设为**待验证工程目标**；同步原生查询单独记峰值。没有现场计量前不能宣称达标或零卡顿 |
| 真实通行 | 同一存档与加载状态下，上下层起点、相反方向、墙前/锁前，各保存请求编号和玩家实际走通/失败结果 | 本地模拟通过、源码级操作数减少、游戏真实走通分别记账；原先 583–885 ms 成功与约 30 s 失败的组必须复测，不能只展示容易的上层起点 |

推荐先比较三组：现有逐邻点认证、相同候选图上的延迟认证、补上候选断边后的延迟认证。这样才能分别回答“变快来自减少查询，还是仅来自图终于连通”。本轮不建议为了比较而关闭墙、楼层、锁或胶囊检查；性能目标也不应成为放松负例的理由。

本次研究仅新增本文件。外部项目代码和资产未复制进仓库，算法/接口未在本研究任务中接入运行时；许可栏记录的是所链接来源的标注，实际引入任何代码或依赖时仍须保留其对应许可与归属。
