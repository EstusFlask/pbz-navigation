# 为什么仍会撞墙：UE / Recast 方法与当前实现核对

日期：2026-11-15（America/Tijuana）。本报告核对 Epic、Recast/Detour、UE4SS 和 OMPL 的第一方文档/源码，以及仓库代码和历史。审计基线为提交 `84145afc`（本地候选 1.8.2），下文代码行号均指该基线。**同轮主任务已把 main 更新到 1.8.3，移除活动运行时的小黑盒数据与回退；本报告的小黑盒分析是在解释移除前的实现，不表示它仍参与当前 main 规划。** 本报告只新增这份文档，没有操作游戏、安装包、存档或运行时，也没有进行新一轮现场验路。

## 先回答两个问题

**此前确实使用了 UE 原生寻路，也参考了开源方法；但没有把整个导航系统替换成经过重新烘焙和验证的 UE / Detour 管线。** 更准确的描述是：沿用原包的离线多边形路网、原生 UE 路径查询和自有动作图，再逐步增加本地候选搜索、物理认证、调度和显示修补。

这不是只有堆结构或循环速度变化。1.2.7 把“扩展邻点便检查碰撞”改为“先求候选路线、只检查该路线、剔除失败边再求”，是实际的规划结构变化；但它是借鉴 Lazy PRM 的有限候选图实现，没有移植 OMPL，也没有重新生成全图可走面。[本地 1.2.7 记录](FIELD-FIXES-1.2.7.md)明确写出了这一边界；[OMPL 官方源码](https://ompl.kavrakilab.org/LazyPRM_8cpp_source.html)可对照其 `constructSolution`、`checkMotion` 和失败边删除。

**“调用 UE 成功”或“图上存在路线”都不等于玩家能通过。** 图必须正确反映墙体、玩家身体尺寸、楼层、机关条件和当前加载状态；最终显示的路径还必须与认证过的路径一致。任何一层数据或规则失真，都可能留下错误引导。当前最新一处撞墙的具体原因仍须对应现场记录，不能仅凭这次源码阅读认定。

## 正规方法实际处理了哪些层

下面是能力分工，顺序中的特殊动作链接参与图搜索；它们的执行发生在角色走到入口以后。

```mermaid
flowchart LR
    A[碰撞几何] --> B[可走面与身体净空]
    B --> C[邻接图与特殊动作链接]
    C --> D[搜索多边形走廊]
    D --> E[走廊内拉直路径]
    E --> F[现场认证与引导更新]
```

| 层 | UE / Recast / Detour 实际职责 | 为什么仅拿模型或换 A* 不够 |
| --- | --- | --- |
| 几何与可走面 | UE 从关卡碰撞几何生成分块多边形图。Recast 将输入三角形体素化，筛除不可行区域，构建区域与导航多边形。[Epic 导航系统](https://dev.epicgames.com/documentation/en-us/unreal-engine/navigation-system-in-unreal-engine)、[Recast 项目说明](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/README.md) | 显示模型只告诉我们表面在哪里；它不自动包含可靠的阻挡、相邻面连通、头顶净空和存档条件。这是由输入与生成流程区别得出的工程判断。 |
| 身体净空 | Recast 的 `walkableHeight`、`walkableClimb`、坡度限制分别描述头顶空间、跨步和斜面；`walkableRadius` 会把靠近障碍和边界的可走区域向内缩。[Recast 配置与侵蚀接口](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Recast/Include/Recast.h#L228)、[Epic Agent 参数](https://dev.epicgames.com/documentation/en-us/unreal-engine/navigation-mesh-settings-in-the-unreal-engine-project-settings) | “一条零宽度线没穿墙”和“角色胶囊能过”是不同问题。若烘焙参数不匹配玩家，图上路线也可能贴角、过窄或进不了门。 |
| 图搜索 | Detour `findPath` 搜索从起始多边形到目标多边形的通路；查询过滤器控制允许的区域、标志与代价。[Detour 查询文档](https://recastnav.com/classdtNavMeshQuery.html)、[过滤器源码](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Detour/Source/DetourNavMeshQuery.cpp#L27) | A* 找的是给定图的通路。图缺边时换更快的 A* 不会补路；图错误连穿墙边时，搜索算法也不会自动知道。 |
| 走廊与拉直 | 搜索的多边形序列构成 corridor，相邻多边形共享的可通行边为 portal。Detour `findStraightPath` 在这个 corridor 内做 string pulling；源码维护 apex、left、right 并在漏斗收紧时输出转角。UE `FNavMeshPath` 也分别保存 corridor 和 portal，并提供 `PerformStringPulling`。[Detour 实现](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Detour/Source/DetourNavMeshQuery.cpp#L1686)、[Epic FNavMeshPath](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/NavigationSystem/FNavMeshPath) | 拉直以 corridor 正确且适配 agent 为前提；它不能替错误碰撞、错误楼层或缺失身体净空兜底。后续任意圆滑、跨点连线若离开该走廊，需要重新认证。 |
| 特殊通行 | UE Nav Link 在不连续网格之间增加有方向的连接；Smart Link 示例仍需自定义跳跃行为。入口、出口、启用条件和行为必须有人提供。[Epic Nav Link / Smart Link 示例](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-how-to-modify-the-navigation-mesh-in-unreal-engine#3-using-navigation-link-proxies) | 钩索、爬梯、船、剧情门和只能单向下落不能仅按两点距离算普通步行。 |
| 运行中跟随 | Detour `dtPathCorridor` 根据实际移动更新走廊并检查有效性；UE CharacterMovement 执行移动物理，动态避让另有 RVO / Detour Crowd。[Detour corridor](https://recastnav.com/classdtPathCorridor.html)、[Epic 移动物理](https://dev.epicgames.com/documentation/en-us/unreal-engine/understanding-networked-movement-in-the-character-movement-component-for-unreal-engine)、[Epic 动态避让](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-avoidance-with-the-navigation-system-in-unreal-engine) | 查询点列不会自动变成角色的执行与重新规划。对本 Mod，适合采用的是引导更新、失效检查和明确的动作提示；是否接管玩家移动是另一项产品决定。 |

## 仓库实际采用到什么程度

以下运行时文件原位于 `Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/`，表内保留精确文件名和基线行号。原生查询和候选图的可变文件链接指向移除前归档快照，其余所引实现未因移除小黑盒而改变；后续代码调整时应以基线提交和符号名定位。

| 方法 | 核实结果与本地证据 |
| --- | --- |
| UE 原生 NavMesh 查询 | **已调用。** [PBZQuestRoute.js](../archive/heybox-20261115/integration-before-removal/Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZQuestRoute.js) `nativeWalk` 第 246–261 行：调用 `UE.NavigationSystemV1.FindPathToLocationSynchronously`，以玩家 Pawn 为上下文，读取 `PathPoints`，检查 `IsValid`、`IsPartial`、起点/终点偏差。它把结果作为 `provider:'native'` 的候选。这也存在于初始提交 `8ea3fe97` 的旧目录 `Quest_Navigation_0.8.5/.../PBZQuestRoute.js`，不能算最近才新接入的能力。官方确认 Pawn / Controller / NavData 可作为查询上下文：[Epic NavigationSystemV1 5.5](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/NavigationSystemV1?application_version=5.5)。 |
| 原包离线多边形路网 | **已读取和搜索，来源证明有限。** [PBZRouteCore.js](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteCore.js) 第 42–47、66–75 行解码点、顶点、边、邻接、分量、面等列；第 122–149 行是自有 A*；第 166 行读取普通相邻面的 portal 两端。[PBZRouteSurface.js](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteSurface.js) 第 2–16 行声明并使用 cooked convex Recast faces。但[开发说明](DEVELOPMENT.md)基线第 39 行明确写原始约 438 MB 路网未附生成工具；第 48 行所述 streaming 工具只是重编码原列。故可说“原包标注为 Recast 的面与图被沿用”，不能宣称本次独立核验过全图的烘焙输入、agent radius、碰撞覆盖和提取完整性。 |
| 标准 Detour funnel 移植 | **未发现整套移植。** [PBZRouteCore.js](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteCore.js) 第 200–207 行的 `followPortalsJob` 以 portal 中点作候选，最多向前看 32 个点，检查连线是否按顺序穿过中间 portal；求交使用 XY，交点 Z 来自 portal。它是自有的贪心可见性简化，初始提交已有这一结构。它没有 Detour 的 apex / left / right 更新过程，不能称为已接入 Detour funnel。**这并不单独证明它会穿墙**：在正确的凸面走廊上按序过门可以保留走廊约束，实际安全还依赖几何和后续物理检查。 |
| 按玩家身体进行近段物理认证 | **已有相当多实现。** [PBZRouteWorld.js](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteWorld.js) 第 51–56 行读取实际胶囊、跨步与可走坡度；第 64–82 行做 profile 线/胶囊查询及反向复杂复核；第 104–115 行读取 `CurrentFloor`；第 167–204 行沿步检查支撑、坡度、台阶、身体和细分失败段。[PBZRouteFeasibility.js](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteFeasibility.js) 第 3–5 行明确所有 provider 都是候选；第 43–51 行按约 35 cm 分段调用 `world.step`；第 39–41、56–58 行检查动作后落地。它是 Mod 的查询近似，不是逐帧执行整个游戏 CharacterMovement。 |
| Lazy PRM 思路 | **结构已采用，库未移植。** [PBZRouteHintWalk.js](../archive/heybox-20261115/integration-before-removal/Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteHintWalk.js) 第 8–11 行说明候选与物理凭证分开；第 27、45–65、85–111 行实现有限图提案、选中边检查、失败有向边剔除及本请求内结果复用；第 15–17 行分别限制图节点、物理检查与执行时间。[1.2.7 说明](FIELD-FIXES-1.2.7.md)也明确没有移植其他项目代码。 |
| off-mesh / 动作连接 | **有自有实现，与 Nav Link 职责相似。** [PBZRouteCore.js](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteCore.js) 第 78–92 行维护动作状态与运行时有向边；第 158–190 行将不同动作转为入口、动作点列、出口与检查。不能据此说已把这些自有边注册成游戏的 `ANavLinkProxy`，或所有游戏动作都已完整覆盖。 |
| Detour corridor 持续跟随 / UE AI 跟随 | **未发现采用标准对象接管玩家。** 主入口第 680–686 行用当前位置与路径的距离及物理接回判断偏离；第 692–731 行用自有 auditor 复查、截断显示并触发修补。它不等于 `dtPathCorridor` / `UPathFollowingComponent`。对手动跟随蓝线的 Mod，并非必须采用 AI Controller 才算有效导航。 |

本地没有证据支持“已完整接入 Recast 从碰撞重建全图 + 独立 Detour 查询/漏斗/跟随”的说法。UE 原生查询内部具体采用哪个 NavData、匹配哪个 agent、是否启用了 string pulling，必须进一步读取实际实例或引擎结果；仅看到 `PathPoints`，不能替游戏内部实现作完整断言。

## 现有证据怎样解释撞墙与缺路

1. **缺路网连接是真实存在的，但不能当作游戏不可达。** [1.4.2 记录](FIELD-FIXES-1.4.2.md)第 7–9 行：八卦阁前路口到戏梦山庄正门时，原生查询 `invalid path`，离线锚点落在不同分量，动作链失败，局部搜索耗尽；最后 64 米是 blocked preview。这说明混合候选未得到完整通路，不能把已有预览当成全程完成。
2. **碰撞认证曾经有实际漏洞。** 同记录第 11–18 行记载单面复杂墙、旧前向查询漏检及新的反向复杂复核；Epic 说明 `Double Sided Geometry` 决定三角网格场景查询是否检测两面。[Epic Physics Bodies](https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-bodies-reference-for-unreal-engine)。记录第 24 行也明确没有捕获旧截图整条链的每次查询，因此它是已确认的一类漏洞，不能被扩大成所有穿墙的唯一根因。
3. **模型候选没有自动补上 NavMesh 生成步骤。** 基线 1.8.x 的小黑盒接入把显示三角面采样为建议点，依靠原 `world.step` 验边；没有为它重建完整阻挡体积、agent radius 侵蚀、可靠面邻接或游戏动作条件。原记录现在归档于[小黑盒素材说明](../archive/heybox-20261115/docs/HEYBOX-MAP-IMPORT.md)。候选更密可能找到以前遗漏的路，也可能增加无效候选和预算消耗；两者都不能作为“已经换成完整几何导航”的证据。
4. **目前认证范围与显示更新都有限。** `PBZRouteFeasibility.js` 第 5、15–18、36、46 行的范围前沿会保留未知；主入口的后续 auditor 再随玩家移动复查。旧离线远段、尚未加载的碰撞与动态门状态需要分别处理。原包有面数据，并不意味着任意远段在当前游戏状态下已验证。
5. **规则仍需与实际角色运动逐项对照。** 查询的 profile、简单/复杂碰撞、胶囊尺寸与步进近似、楼层投影、动作落地都可能产生差异。这里是待排查的类别，不是本次新确认的故障。当前代码已有修补，只有把同一失败点的玩家实际通行、查询命中和最终显示线段对应起来，才能知道剩下哪一项失真。

因此，不能以“再加几个点”“搜索再快些”宣布撞墙问题已经解决；也不能因为仍有失败就说此前完全没有采用 UE 或开源思路。前者夸大验证，后者抹掉已有事实。

## 通过 UE4SS 能否直接用游戏 NavMesh

**可以尝试调用游戏现有且暴露的导航 API；本仓库实际上已经通过 Puerts 调用了其中一个。** 主入口第 2 行是 `require('ue')` / `require('puerts')`，原生查询由 JS 发起。`native/QuestRouteCompat.cpp` 第 71–88 行和 UE4SS Lua 入口负责兼容宿主、设置和收集桥接，不能把这些桥接组件误称为新接入的寻路引擎。

UE4SS 官方文档说明 `UObject.__index` 可以返回可调用 UFunction，`CallFunction` 可在对象上调用 UFunction，并提供对象查找与游戏线程调度。这支持探测已存在的反射接口，**不代表任意 C++ 方法、Detour 内部结构或编辑器烘焙器都可直接调用**。[UE4SS Lua API](https://docs.ue4ss.com/dev/lua-api.html)。同理，Puerts 侧已有函数可用，也不等于本游戏暴露全部 Epic C++ API。

可用范围必须分别确认：实际 NavData 实例、agent 参数、起终点投影及偏移、路径完整性、末点残差、加载距离和耗时。投影只寻找附近导航位置，不能独自证明连通或正确楼层，这是由接口语义得出的推论。[Epic 投影/查询接口](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/NavigationSystemV1?application_version=5.5)。

运行时“补烘焙全图”还有额外前提。Epic 区分 Static、Dynamic 和 Dynamic Modifiers Only；最后一种只能修改已有网格，不能新增表面。World Partition 的动态构建也限于已加载空间。[Epic 生成模式](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-how-to-modify-the-navigation-mesh-in-unreal-engine#4-generating-the-navigation-mesh-at-runtime)、[Epic World Partition](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partitioned-navigation-mesh)。本地提取配置 `build/game-extract/ProjectPBZ/Config/DefaultEngine.ini:418–427` 有 Recast、World Partition 和禁用自动创建 NavData 的设置，但不能据此确定最终实例生成模式，更不能证明运行时生成器已被剥除或肯定能启用。

## 接下来真正需要验证的改造边界

若继续落实正规导航方法，应把任务拆成可证明的结果：先用同一组起终点测清原生 NavData 覆盖与参数；对原包 faces / portal / adjacency 验证拓扑和烘焙来源；再对一条失败走廊比较现有过门算法与标准 funnel，保持楼层、身体净空和动作边约束；最后把最终蓝线的每一段与实际认证段对应。缺几何或缺动作连接时补证据，查询近似错误时修规则，不能用换算法掩盖数据缺口。

标准 funnel 值得作为明确候选进行对照，但它的引入不会自动修好缺失碰撞、未知 agent radius、未加载场景和剧情动作；是否部署应由同点回归及游戏实走决定。本报告没有实现或验收这一替换，也没有把旧现场结论升级为当前版本全程通过。
