# 戏梦山庄巨型 FastGeo 碰撞体核查

2026-11-16；仅只读调查，私有证据位于 `build/ximeng-fastgeo-research-20261116/`。没有修改生产代码、世界 receipt、游戏或存档，没有安装/启动。

**结论：巨型放置是真实 cooked 输入，现有实例矩阵读取没有导致这次体积异常。不是 21 个 instance，而是一个 FastGeo ISM component 的一个 instance，碰撞 BodySetup 含 21 个 box。它们确实 query-block Pawn、具有上向水平顶面，未发现本批数据将导航支撑关闭。不能按距离、大小、hidden、HLOD 或初始未激活层删掉。** 这里的“可走面”指碰撞/坡度条件下的支撑候选，不意味着玩家已能抵达、该 cell 当前已加载或实机验收通过。

## 准确来源与原始字节

`a06b0fa6b3db46ab00000001` 是 generated package `/Game/Maps/B08_09_12_13/PBZ_Ximeng_WP/_Generated_/8X1SLG4W7HGAB8BGDS708EBKU`，并非世界 persistent-level package；export 的 outer 名称是 `PersistentLevel`。该包 SHA256 为 `2dee02c326c42361fc4c8a4110765ac99f5c7354a65ce3e8116d1b431839d460`。

FastGeo export 0 `FastGeoContainer_8X1SLG4W7HGAB8BGDS708EBKU` 的一个 cluster、一个 ISM record、一个 instance，指向 StaticMesh `/game/maps/b08_09_12_13/_generated/s/voxelboolean_e99d2e1c`，mesh package SHA256 `61bca8b3b891bd198e5078a3a3eeef0dfa28136371ff9bda4101bdb1310a8d22`。mesh 内 BodySetup export 0、NavCollision export 1、StaticMesh export 2。FastGeo payload **1239 字节精确消费**。

以下 offset 均相对该 FastGeo export payload，由 [verify.py](../build/ximeng-fastgeo-research-20261116/verify.py) 记录实际读取范围，不是查找相似浮点数：

| offset | 类型 | cooked 值 |
| ---: | --- | --- |
| 92、172 | LocalTransform、WorldTransform，各 `10*f64` | quaternion identity；translation `(-209572.7508267543,87512.00960639004,3000030)`；scale `(1,1,1)` |
| 252 | LocalBounds `7*f64` | XY half extents `(15018246.8291,13429235.3569)` cm |
| 308 | WorldBounds `7*f64` | center `(-213552.6192,88154.3301,3000033.5376)`，同样的巨型 XY extents |
| 974 | native bulk width/count `2*i32` | **128 bytes、1 element** |
| 982 | instance matrix `16*f64` | XY 块 `[[-1567.46853865,4747.95138774],[-4747.95138774,-1567.46853865]]`；Z scale `1.38`；translation zero |
| 1146 | NavigationBounds `6*f64 + valid:u8` | `[-15144093.3595,-13303010.3035,2999823,14694191.1982,13476477.8678,3000237.0000158325]`，valid=1 |

矩阵 XY 两轴长度均为 **5000**，互相正交；Z 轴长 1.38。矩阵的 SHA256 为 `fab225b029c2d0d12e496c5073be14157a6ed9e9c08ce75c008fbc7730badee7`。bounds 在 cooked 数据中已经巨大，不是重建后才出现。引擎本身按 `FTransform(PerInstanceSMData[i].Transform) * WorldTransform` 创建物理实例，并用实例矩阵计算 WorldBounds/NavigationBounds。参见 [FastGeo ISM serializer / physics / bounds 源码](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoInstancedStaticMeshComponent.cpp)。

## 碰撞与导航开关

[probe.json](../build/ximeng-fastgeo-research-20261116/probe.json) 保留全部原始解析结果：

- Primitive flags：visible=true、staticWhenNotMovable=true、fillCollisionUnderneath=false、rasterizeFilledConvexVolume=false、**canEverAffectNavigation=true**。
- `customNavigableGeometry=1`（Yes），scene collision gate=true，rendererInstanced=true，`useDefaultCollision=true`。
- component BodyInstance：`CollisionEnabled=3`（QueryAndPhysics）、ObjectType=0（WorldStatic）、profile=BlockAll；没有 Pawn ignore/overlap。
- BodySetup DefaultInstance 同样为 BlockAll；CollisionTraceFlag=1（SimpleAndComplex）；21 个 AggGeom box 各 `CollisionEnabled=3`。本次普通角色碰撞重建输出的是这些 simple boxes，不是 complex render mesh。
- component 的 `bOverrideWalkableSlopeOnInstance=0`；WalkableSlopeOverride 的 behavior=0、angle=0。BodySetup 未保存其他 walkable-slope 覆盖。

Primitive 序列化字段及导航相关判定见 [FastGeoPrimitiveComponent.cpp](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoPrimitiveComponent.cpp#L760)。不能仅凭 BodyInstance 替代独立 scene collision gate；本例两者均开启。

进一步检查 StaticMesh 的 present slots 为 `[3,4,26,42]`，没有覆盖 slot 28 `bHasNavigationData`；固定引擎源码构造默认 true，`IsNavigationRelevant` 返回此值。NavCollision export 1 的 property header 为空，native CDO 模板，没有序列化 `bIsDynamicObstacle` 覆盖；固定源码默认 false。已提取 DefaultEngine.ini 中也没有该项配置覆盖。故没有证据可以把它认定为“只作动态导航障碍，不建顶面”。参见 [UStaticMesh 构造与导航判定](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/StaticMesh.cpp#L4378)、[NavCollisionBase 默认值](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/AI/Navigation/NavCollisionBase.cpp)、[导航导出分支](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Public/InstancedStaticMeshComponentHelper.h#L108)。这是 cooked/default 属性核查，未检查运行时动态改写。

## 独立尺寸与 cell 门控对照

第一个 box 本地尺寸 `4000 × 2818.251708984375 × 300 cm`，经真实 scale 后为 **200 km × 140.912585 km × 4.14 m**；顶面 `Z=3000237 cm`（约海拔 30 km，使用游戏坐标而非现实海拔）。21 box 各有两个上向水平三角形，共 42 个顶面三角形；不能因为跨度大就把法线相同的这些面改成不可走。

独立对照没有调用生产 `simple_mesh`、`instance_place` 或 `quaternion_place`：按 `FKBoxElem::GetFinalScaled` 的尺寸规则、该矩阵的 yaw 与等长 XY scale，直接计算每个 box 的八角和世界 AABB；与原 21 条 source bounds 最大差 **3.725290298461914e-9 cm**。本例 box rotation 只有 yaw，XY scale 等长，因此不会引入非均匀斜切的物理解码分歧。源码见 [FKBoxElem::GetFinalScaled](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/BodySetup.cpp#L1982)。

世界 root export 11091 的 runtime cell 也独立保存巨型 ContentBounds：约 `[-18757343,-17746266,2999815]` 至 `[18330238,17922574,3000252]` cm。它是 **非 HLOD、spatiallyLoaded=1**。其 DataLayer 是 Main_LA，父为 00_Main，再父为 Runtime；三层均显式 `InitialRuntimeState=2/Activated`。不是可依据初始关闭剔除的层。类型化解析与精确 payload 边界采用既有 `audit-offline-world-semantics.py`，输出 [gates.json](../build/ximeng-fastgeo-research-20261116/gates.json)。实时加载/激活状态依然未观察。

## 对索引的含义

`oversized-walkable-triangle` 在此表示索引的每三角形 tile 数上限被真实巨型面触发，不是坏矩阵的证据。原始碰撞、来源和失败必须保留；不能静默忽略这些顶面，也不能仅按距离、Z、hidden 或猜测美术意图将其排除。

若按完整 cooked 世界语义继续，需要让索引显式支持大面覆盖（例如单独的大面空间索引/按查询 tile 相交，并对导航候选域另作明确、可审计的表示）。若主任务采用游戏明确保存的导航域限制，也须单独证明域及其适用性，保留域外真实碰撞和未烘焙账本，不能拿任意高度/范围阈值代替。此研究没有实施索引策略。

## 复现与身份

```powershell
py -3.12 build/ximeng-fastgeo-research-20261116/probe.py
py -3.12 build/ximeng-fastgeo-research-20261116/verify.py
py -3.12 build/ximeng-fastgeo-research-20261116/gates.py
py -3.12 build/ximeng-fastgeo-research-20261116/provenance.py
```

root package SHA256 为 `4b673f9f78618b74cb659749d7a1305af646ea90b9f7c1d27c721bb02a6d9a0c`。详细字节 anchor、独立 bounds、world cell、源码与输入 hashes 在 [verification.json](../build/ximeng-fastgeo-research-20261116/verification.json)、[provenance.json](../build/ximeng-fastgeo-research-20261116/provenance.json)。离线结构验证通过；未做 mock 集成或实机验收，`completeCollisionClaim:false`、`physicalVerified:false`。
