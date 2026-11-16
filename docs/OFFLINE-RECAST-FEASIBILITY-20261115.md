# 从游戏碰撞数据离线重建 Recast：可行性与当前缺口

日期：2026-11-15。范围：关闭游戏时，读取本机已安装游戏的数据，独立生成普通步行导航，再接入现有引导 Mod。本文只新增研究记录；没有实现碰撞导出器、重新烘焙地图、修改运行时或进行新的游戏内验路。外部结论来自 Epic 与开源项目本身的文档/源码；下文明确区分仓库事实和工程建议。

## 结论

**可以沿“离线提取游戏碰撞 → 独立 Recast 分块烘焙 → Detour 查询与拐点生成 → Mod 显示/跟随”的方向做完整标准核心。这是可行的工程路线，不要求游戏此刻启动。** Recast 接收三角形几何并体素化，Detour 提供导航网格查询；它们可以独立编译使用。这里重新建立自己的网格，不依赖游戏现有网格是否断开，也不依赖 Shipping 程序是否包含可用的运行时烘焙器。[Recast 官方项目说明](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/README.md)

**1 号路线按用户给出的“普通步行、无需特殊动作”要求，是这条路线合适的首个验收对象。** 本地参考记录对应庞镇 `pbz_pangzhen_wp`、戏梦山庄正门 `Bell_XM_015`，不是塔内 A-01。完整几何与角色规则正确时，重建可以找出已有图漏掉的普通道路；但尚未取得这种输入、也未运行新烘焙，当前不能宣布已解决 1 号路线或保证某次烘焙一定连通。[1 号路线参考记录](../authoring/route-001-reference-1.8.1-20261115.json)

**当前主要缺口是完整的离线碰撞与场景放置导出，而不是另找一个 A*。** 已能读取资产字节，尚未完成把这些字节还原为覆盖目标地区的真实碰撞。没有证据可据此断言“游戏包缺少必要数据”或“所有离线方案都不可能”。

## 本地能力：已完成与未完成

| 环节 | 当前证据 | 准备程度 |
| --- | --- | --- |
| 访问安装包 | [`Reader`](../tools/pbz_game_packages.py) 能按 chunk ID 读取 IoStore、解压并解析名称；本轮主任务实际读出 `BP_SplineWall.uasset` 的 16,320 字节、90 个名称，保存 SHA-256 与结果 | 已验证离线字节访问；不等于几何已解码。见[探针结果](../build/offline-recast-feasibility/spline-wall-asset-probe.json) |
| 发现关卡对象 | [`extract-placed-actors.py`](../tools/extract-placed-actors.py) 第 23 行按 `GapBlocker / Teleport / FloatingBoat / SpecialMove / ASM_ / Lift / TempLadder / LionDancing` 筛选 actor | 是交互/动作相关对象提取，不能充当全图碰撞对象清单 |
| 解析组件 | [`pbz_component_transforms.py`](../tools/pbz_component_transforms.py) 解析受支持的组件变换、部分 `BodyInstance` 与碰撞响应字段，对不支持前缀报错 | 可复用基础；没有实现完整的 cooked Chaos 顶点/索引、所有实例和地形碰撞解码 |
| 角色参数 | 1 号路线参考样本记录半径 45 cm、半高 96 cm、跨步 50 cm、地面法线阈值约 0.57357645（约 55°）；运行时从玩家组件读取规则 | 可作为有来源的初始配置；不是所有形态和状态永远相同的保证。[参考样本](../authoring/route-001-reference-1.8.1-20261115.json)、[`PBZRouteWorld.js`](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteWorld.js) |
| 新的完整构建/查询核心 | 本轮没有构建新的 Recast 网格或接入新的 Detour 查询 | 尚未实现，不能把旧路网或已有自有 A* 记为本次接入成果 |

资产探针中的 `UserConstructionScript` / `SimpleConstructionScript` 只是名称存在；它们不能证明具体生成逻辑、不能证明生成结果已保存，也不能证明碰撞数据一定只存在于运行中。

## 可以采用完整 Recast/Detour，项目仍需哪些适配

标准核心可直接采用上游：Recast 构建分块导航；Detour 做端点投影、走廊搜索、直线路径/拐点生成；需要持续跟随时使用其 corridor 能力。单角色路线引导不要求同时引入无关的群体 AI 模块。应实际调用上游核心，不只是沿用“Recast”名称或复制它的思路。上游提供 `findNearestPoly`、`findPath`、`findStraightPath` 与分片查询接口；另有 `DT_PARTIAL_RESULT`、`DT_OUT_OF_NODES`、`DT_BUFFER_TOO_SMALL` 等状态，必须保留并判断。[Detour 查询接口](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Detour/Include/DetourNavMeshQuery.h)、[状态定义](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Detour/Include/DetourStatus.h)、[路径走廊接口](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/DetourCrowd/Include/DetourPathCorridor.h)

以下是所需适配设计，不是已经具备的能力：

1. **还原实际阻挡与可站立表面。** 导出简单碰撞、凸体、复杂三角碰撞及相关标志，并依据玩家 collision profile / channel 判断是否真的阻挡。显示模型只能用于对照；不能把所有可见表面都当成碰撞，也不能丢掉不可见墙。Epic 明确区分简单形状、复杂三角碰撞以及二者替用的选项；Query Only 等设置也直接影响角色扫掠查询。[Epic 碰撞复杂度](https://dev.epicgames.com/documentation/en-us/unreal-engine/simple-versus-complex-collision-in-unreal-engine)、[碰撞响应设置](https://dev.epicgames.com/documentation/en-us/unreal-engine/collision-response-reference-in-unreal-engine)
2. **把资产放到正确的世界位置。** 枚举目标范围的关卡/外部 actor、组件继承默认值、父子变换、实例变换及流送单元；根据实际出现的类型支持地形、样条变形、程序网格。CUE4Parse 本身存在实例数据解析与模板回溯，说明只取共享 static mesh 或 actor 根变换会漏掉必要层次；是否适配本游戏仍需资产样本验证。[CUE4Parse 实例组件源码](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Assets/Exports/Component/StaticMesh/UInstancedStaticMeshComponent.cs)
3. **匹配普通步行规则。** 采用有来源的角色高度、半径、跨步和坡度；保留游戏特有的禁止跨步、强制滑坡、禁止通行区域等规则。Recast 的高度、半径侵蚀、台阶与坡度参数提供标准近似，参数本身不会自动读取 PBZ 的所有移动规则。还需统一 UE 与 Recast 的坐标轴、长度单位、三角绕序及镜像变换。[Recast 配置说明](https://recastnav.com/structrcConfig.html)、[Epic NavMesh 参数](https://dev.epicgames.com/documentation/en-us/unreal-engine/navigation-mesh-settings-in-the-unreal-engine-project-settings)
4. **建立有状态的障碍层。** 按实际资产审计导航修饰体、门/机关/剧情遮挡；静态底图与可变状态分别建模。离线可以构建若干确定状态或保守状态，当前存档中的门开关、活动 NPC 和刚发生的破坏不能仅凭安装包默认值获知。Epic 将动态障碍/区域修饰与静态网格区别处理；PBZ 是否使用某类功能须另查资产，不能从引擎能力倒推。[Epic 导航修饰与生成模式](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-how-to-modify-the-navigation-mesh-in-unreal-engine)
5. **分块构建与可追溯查询。** 每块记录源包/actor/组件、解码状态和参数，未解码的相关碰撞不能静默跳过。自己的烘焙器与查询端固定同一上游版本和序列化格式；无需假定上游 Detour 与游戏 Epic fork 的内部 ABI 相同。Mod 端的实际承载方式仍须依据 Puerts/本地桥接能力选择，当前研究没有验证可直接装入某个现成 DLL。

## CUE4Parse 的真实支持边界

本次直接检查 GitHub `master` 对应提交 `4d2301a8eb129f593f1c76ff82612400801f1a94`，而非只看 README 的“支持 UE4/5”。可复用解析能力与缺口如下：

| 一手实现 | 实际行为与含义 |
| --- | --- |
| [`UBodySetup.cs` 第 20–34 行](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Objects/PhysicsEngine/UBodySetup.cs#L20) | 读取 `AggGeom`，将 cooked 数据读为 `FFormatContainer`。这个类没有把 cooked blob 直接变成可供 Recast 使用的三角形。 |
| [`FKAggregateGeom.cs`](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Objects/PhysicsEngine/FKAggregateGeom.cs)、[`FKConvexElem.cs`](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Objects/PhysicsEngine/FKConvexElem.cs) | 读取球、盒、胶囊、凸体等属性；凸体顶点/索引按属性取值，缺失时为空。可用于存在这些序列化字段的资产；不能承诺 cooked 包保留编辑期凸体数组。 |
| [`FImplicitObject.cs` 第 34–74 行](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Objects/Chaos/FImplicitObject.cs#L34) | 已有若干 Chaos 基础形状与凸体支持；scaled/instanced TriangleMesh 分支被注释，普通 factory 没有 TriangleMesh / HeightField 分支，未支持类型抛异常。不能据此宣称完整 cooked Chaos 三角/高度场导出已经现成可用。 |
| [`ULandscapeHeightfieldCollisionComponent.cs` 第 24–33 行](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Assets/Exports/Component/Landscape/ULandscapeHeightfieldCollisionComponent.cs#L24) | 常规 cooked 分支直接跳过 `CookedCollisionData`。拥有 landscape 渲染导出器不等于已经导出其真实物理高度场。 |

因此可以把 CUE4Parse 当作资产解析基础或参考实现，必要时补本游戏的 Chaos/地形解码；**“解析器尚未实现”是具体工程工作量，“游戏包没有数据”是另一项需实证的结论。** 本次仅能确认前者的上述边界。

同样，[1.4.2 现场记录](FIELD-FIXES-1.4.2.md)证明某些 `BP_SplineWall` 实例有程序网格碰撞、简单形状为空且查询具有单面特征，需要纳入重建审计；它不证明这些网格无法从序列化的构造结果、样条参数或生成规则恢复。应先审计具体 actor 实例和引用资产，再确定是否需要重现生成逻辑。

## 不开游戏现在可以做什么，最后还需验证什么

**可以现在完成主要开发和批量验证。** 顺序建议先覆盖 1 号路线所在地区及足够的绕行范围，再沿同一管线扩展各世界，不先做一个只含已知路线的狭窄走廊，也不等待整张世界全部解析才验证第一条路线。

第一阶段交付物应是离线碰撞清单与几何查看器：能显示道路、楼梯、门洞、墙体以及无法解码的对象，并追溯来源。随后交付固定版本 Recast 烘焙与 Detour 查询工具，生成连通分量、分块接缝、端点投影误差和路线拐点；1 号路线只允许普通步行连接，不能靠钩索、攀爬、传送等 off-mesh link 补通。已有 1 号路线记录保持“验收参考”用途，不能把玩家走过的坐标喂回生成器，伪装成从几何推导出的道路。

离线可批量测：解析覆盖率、变换复合、形状碰撞、薄墙/反面墙负例、门洞宽度、头顶净空、楼梯/斜坡边界、多楼层投影、块间连通、Detour 完整/部分状态，以及对独立碰撞查询实现的路线复核。若重建后仍断开，可直接检查具体缺失几何、参数或真实断点；不能用扩大连边距离或放宽角色尺寸作为“已解决”的证明。

**离线通过表示在已重建的场景与规则中成立；最终与原游戏匹配仍需少量集成核对。** 同一份漏墙输入生成的网格和路线互相通过，不能发现被漏掉的墙。主要重建、算法和批量测试完成后，再用现有可信现场样本及必要的短程游戏验证核对碰撞和路线显示即可；不需要用户现在开游戏陪着完成开发。动态状态若在运行时变化，规划还需读取或检查相关状态。这里的边界是证据能证明到哪一层，不是把所有测试都推回手工走图。
