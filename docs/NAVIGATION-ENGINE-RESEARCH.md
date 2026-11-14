# UE 导航能力与本 Mod 的改进方向

调研日期：2026-11-13。仅阅读仓库和 Epic 官方资料；本调研没有启动游戏、执行现场探针、下载存档或证明任何路线已经走通。官方资料描述的是引擎能力，游戏实际引擎版本、Shipping 构建配置、反射暴露范围与驻留数据仍须现场确认。

## 结论

**建议保留现有混合规划，先测原生导航覆盖，再修碰撞、楼层与特殊动作接点。** 本 Mod 已使用 UE 原生寻路，改成“用 UE 导航”本身不会补齐缺失的路。优先目标是减少穿墙、错误绕路、错层和动作断连；需要用实际通行结果区别：原生网格缺边、目标投影错层、碰撞查询与角色运动规则不一致、动作入口/出口错误。[本地入口与实现](#本地依据)

当前架构可继续分工：原生 Recast 与已有离线路网提供步行候选；实际地面、胶囊和门锁查询认证近段；有向动作图连接梯子、攀爬、钩索、落下、船等通行；跨世界入口与铃铛另行连接。这是结合现有代码和下面引擎限制提出的工程建议，尚非现场比较结果。

## 哪些 UE 能力有用

| 能力 | 官方定义与边界 | 对本 Mod 的建议 |
| --- | --- | --- |
| Recast / Navigation Mesh | 导航系统依据关卡碰撞生成分块、多边形图，用代价求路；它描述可导航空间，不是全部玩家动作规则。[Epic：Navigation System](https://dev.epicgames.com/documentation/unreal-engine/navigation-system-in-unreal-engine?lang=en-US) | 已有离线面数据和原生查询均可继续用。是否比自有局部搜索更准，要在同一起终点、同一加载状态下比较。 |
| `FindPathToLocationSynchronously` | 同步求路径；`Pathfinding Context` 可传 NavData、Pawn 或 Controller，并影响查询参数。[Epic：Find Path](https://dev.epicgames.com/documentation/unreal-engine/BlueprintAPI/AI/Navigation/FindPathtoLocationSynchronously?lang=en-US) | 当前 `nativeWalk` 已传玩家 Pawn。保留查询耗时、点列与失败状态，避免高频同步调用造成卡顿；不能只以“返回对象”判为到达。 |
| `ProjectPointToNavigation`、`IsValid`、`IsPartial` | 前者把点投到 NavigationData，并接受查询范围、NavData 与 Filter；路径另有有效和部分路径接口。[Epic：NavigationSystemV1](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/NavigationSystemV1?application_version=5.5)、[Epic：NavigationPath](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/NavigationSystem/UNavigationPath) | 值得加入诊断：记录玩家脚点与目标各自的投影、位移/高差、最终端点残差。**投影成功只说明附近有网格，不能证明起终点连通或投到了正确楼层**，这是该接口语义下的推论。Puerts 的实际反射函数名、out 参数形式须先核对，不能照搬 Python 调用。 |
| Nav Link / Smart Link | `ANavLinkProxy` 连接原本不连续的网格；Smart Link 可动态启停、切换区域类型，并在到达时把控制交给自定义行为，再恢复路径跟随。[Epic：ANavLinkProxy](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/AIModule/ANavLinkProxy) | 概念与现有 `Passages/LiveLinks/Transitions` 很接近。可读出游戏已有链接作为证据；新建链接也仍需真实入口、出口、方向、条件和行为。导航线 Mod 不需要为了画线接管玩家 AI 跟随。 |
| 自动跳落链接 | UE 5.5 引入自动生成 Nav Links；文档标为 Experimental，依赖跳长、落差、轨迹采样等参数，仍需自定义行为实现跳跃。[Epic：Automatic Navigation Link Generation](https://dev.epicgames.com/documentation/en-us/unreal-engine/automatic-navigation-link-generation) | 不能据此承诺本游戏可直接开启，也不能自动推导绳索、走壁、剧情船、机关顺序。先确认游戏版本和是否包含该功能。 |

## 为什么不能直接承诺运行时重建全图

Epic 明确区分三种生成方式：`Static` 加载离线结果且运行时不改变；`Dynamic` 可在运行时更新受影响块；`Dynamic Modifiers Only` 修改已有网格的代价/阻挡，**不会新增可走面**。[Epic：Runtime Generation](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-how-to-modify-the-navigation-mesh-in-unreal-engine)

Navigation Invoker 只是按目标附近的半径生成/移除块。官方范例要求开启相应 NavigationSystem 配置、使用 `Dynamic`，并放置覆盖区域的 `NavMeshBoundsVolume`。它不能替代缺失的碰撞、导航相关数据或配置。[Epic：Using Navigation Invokers](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-navigation-invokers-in-unreal-engine)

World Partition NavMesh 的块随空间流送加载/卸载；动态构建仅覆盖**已加载空间**。全图烘焙还涉及 Editor 或 `WorldPartitionNavigationDataBuilder` 等项目构建流程。这些是有工程、资源和构建链时的能力，不等于在第三方已打包 Shipping 游戏内可通过 JS 完整复现。[Epic：World Partitioned Navigation Mesh](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partitioned-navigation-mesh)

本地提取的 `build/game-extract/ProjectPBZ/Config/DefaultEngine.ini:418–427` 有 `RecastNavMesh` 的 `bIsWorldPartitioned=True`、`CellSize=10`、`TileSizeUU=512`，以及 `NavigationSystemV1` 的 `bAutoCreateNavigationData=False`、`bAllowClientSideNavigation=True`。这支持优先检查现有 NavData 和流送行为；**并不证明没有预生成数据，也不证明运行时生成被完全剥除或可以开启**。该段未给出 `RuntimeGeneration`；最终值可能来自资产/配置层，必须读取实际实例验证。

因此，只有现场确认现有 Recast/NavData、匹配玩家的代理参数、生成模式、Bounds、必要碰撞和可调用 API 后，才值得做局部实验。现阶段不建议改配置强制重建全图，也不承诺能在 Puerts/UE4SS 层做到。

StateTree 是状态机，EQS 用于生成并评分环境候选，Mass 是面向大量实体的数据处理框架；据其职责推断，它们不会自行补出本游戏缺失的可通行几何、机关条件或动作落点，当前换用这些系统的收益低于补全证据。[Epic：StateTree](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-state-tree-in-unreal-engine)、[Epic：EQS](https://dev.epicgames.com/documentation/en-us/unreal-engine/environment-query-system-in-unreal-engine)、[Epic：MassGameplay](https://dev.epicgames.com/documentation/unreal-engine/overview-of-mass-gameplay-in-unreal-engine?lang=en-US)

## 与玩家配合时最值得收集的数据

开发工具优先级、用户操作与复测协议见[现场采集计划](FIELD-VALIDATION-PLAN.md)；其中的开发采集模式、强制步行与原生导航探针均为待实现建议。

先选 4 类短路段各 1–2 条：已知普通步行可达、容易穿墙/绕远、上下层重叠、必须特殊动作。每次尽量用明确地标或铃铛固定起终点，包含一次失败和玩家实际走通的对照。

1. **原生覆盖与加载边界**：世界名、起终点 XYZ、NavData/Recast 实例与可读的代理/生成设置；端点投影是否成功及偏移；原生路径有效/部分状态、点列、终点残差、耗时。在同一点等流送稳定后重试，再实际靠近断点重试。用“走近后才连通”与“始终缺同一段”区别流送缺块和真正缺连接，不能用一次失败宣称不可达。
2. **实际脚点与模组物理查询**：角色胶囊中心/半高/半径、碰撞 Profile、MovementMode、`CurrentFloor` 的落点/法线/可走标志、跨步高度；同一时刻 Mod 的 `floorAt/step` 结果、命中 Actor/组件与判拒原因。优先定位“玩家站得住但探针无地面”“玩家能上台阶但探针撞墙”“投到楼上/楼下”。记录玩家真的走过的边及探针误判处，供修规则；不会仅按玩家 XY 轨迹猜楼层。
3. **动作前后完整连接**：机关稳定身份（类、路径/GUID）、当前解锁/折叠/运动状态，进入触发区前的脚点、触发区/样条、动作完成后真正可站立的脚点，以及可否反向。特别保留“走到入口→执行动作→落地→接回普通路”的四段；只拿机关中心或样条末点不够。
4. **目标与门禁**：目标稳定 ID、原始 XYZ、同层接近点、失败时门/障碍的实际状态；分别标记“能通过”“能交互”“目标已收集”。全解锁、接近全收集存档很适合几何与动作验证，但不能独自验证未解锁状态、首次收集交互和剧情中间态。
5. **用户可复现描述**：游戏/Mod 版本、路线名、截图或短录像时间点，以及对应诊断日志编号。记录真实通行、查询结果、推测三种证据等级；成功走一次不能自动推广为所有存档都可用。

建议先做按需诊断快照和少量失败路段验证，再决定是否值得额外提取整张原生图。若要新增自动连续采样或保存玩家通路，应明确设计范围与开关；当前发布版声明没有运行时通路学习，不应悄悄改变这一行为。[本地通行审计](GAME-TRAVERSAL-AUDIT.md)

## 本地依据

- [README](../README.md)：Puerts / UE4SS 边界、混合规划职责、全图覆盖尚未完成、现场验证限制。
- [PBZQuestRoute.js](../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZQuestRoute.js)：`nativeWalk` 已调用原生同步求路，检查 `IsValid/IsPartial` 和起终点偏差；`makePlan` 组合路网、场景、动作与修复。
- [PBZRouteWorld.js](../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteWorld.js)：`feet/standingFloor/floorAt/step` 处理胶囊脚点、CurrentFloor、地面与跨步。
- [PBZRouteFeasibility.js](../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteFeasibility.js)：原生“完整”路径仍作为候选，进一步核对地面、身体空间和动作后落地。
- [PBZRouteSurface.js](../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteSurface.js)、[PBZRouteLocalWalk.js](../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteLocalWalk.js)：已使用离线 Recast 面和经物理检查的局部搜索。
- [移动支持与缺口](MOVEMENT-COVERAGE.md)、[游戏通行审计](GAME-TRAVERSAL-AUDIT.md)：特殊移动、放置实例、方向/条件和未完成连接；已有本地测试不能替代玩家现场走通。

本次只新增本笔记，没有修改运行时代码、游戏配置或发布包；没有进行游戏现场验证。
