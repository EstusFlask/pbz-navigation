# 未保存样条碰撞与 GeometryCollection 父变换研究（2026-11-16）

本轮只读研究，没有修改生产解码器、world receipt 或游戏文件，没有安装、启动、上传。私人输入、脚本与证明在 `build/spline-gc-research-20261116/`。这里的结论区分真实包解析、固定引擎源码推导和实际游戏验收；后两者不能混称已实机验证。

## 结论与集成边界

- 后街的一个解析错误可以通过**类型化 GeometryCollection 父组件解析**解决：本机 cooked Scene offset 为 **197**，三个 template/placed payload 均已精确消费到底。ProxyMesh 有真实的 StaticMesh 碰撞，可以恢复其保存姿态的放置；这不等于已还原破碎、移动或隐藏生命周期。
- 枷笼山的32项缺口全部来自同一包、同一来源 Mesh。实例明确 `BlockAll`、`CollisionEnabled=3`；不能以 hidden、来源 BodySetup 的 NoCollision、位置很远等理由删除。
- 已恢复来源 Mesh 的 **LOD0 SourceMeshBounds**，不是由碰撞几何反推。因而样条重建所需的坐标归一化输入已经齐全。正确实现还须按引擎的形状转换和 cook 路径处理；原模型直接放置、直接弯曲原始 box 三角面均不正确。
- 后续原型发现同包另有32个参数完全相同、已经保存真实 deformed BodySetup 的 sibling。**32/32严格内容键匹配、独立 float32 warp 差分及12个拒绝控制通过**；本批可以复用这些真实 cooked local body，再应用目标自己的变换。通用 Chaos cook 等价物仍未验收；研究没有改写生产回执。

## 权威输入和复现

本机安装 PE 的 SHA256 为 `4415933ce33476f14c837abb61a1b60af8b78cd81783896501913a7aac69e423`，UTOC 为 `d5c3764cdae2030361a7fa8ed1eb204787c77e767df92bbe947763b4a2d0186b`。`tools/pbz_native_schema.py` 只把 PE 当作数据读取 UHT 描述，不运行游戏。真实包读取使用已有 `Reader`，只向私人研究目录缓存。

```powershell
py -3.12 build/spline-gc-research-20261116/probe.py
py -3.12 build/spline-gc-research-20261116/decode.py
```

`probe.py` 从两个世界当前 `coverage.json` 选择32项 spline 错误和一项 GC 父错误；`probe.json` 保留每个 export 的 header、payload SHA、解析属性和源 body。`schema.json` 是本机 UHT 原始表。`decode.py` 使用这些表，精确核对 GC 模板/实例的 property 与 native tail 边界，并按 StaticMesh 原生序列化前缀读取 SourceMeshBounds，输出 `decoded.json`。脚本的头部重编码仅用于私人探针把相同继承字段交给既有 reader；生产实现应直接增加 GC 类型分支与 schema。

| 输入 | 身份 |
| --- | --- |
| 32项 spline 所在 cell | `1MV3GLY6SNG8OZK162I9IWC2D`，chunk `1acb8d5beae1becd00000001` |
| spline 包 SHA256 | `440fc9972dfa52ac7d096ddbc9423b5dd2cff60f52c8f528d86b45673fc3510f` |
| 唯一来源 mesh | `/AkashaEffects/FluidNinjaLive/Tutorial/Meshes/SM_plane_8x8_bottompivot`，StaticMesh export2、BodySetup export0 |
| 来源 mesh 包 SHA256 | `10ef6d594e6288aa0419c206b1ff260b41e45410fee42bb177b790e2c9911357` |
| GC 父错误所在 cell | `DAP8FIT604YGA1I7C4T1CEP05`，chunk `5924ab6e55966d4700000001` |
| GC 包 SHA256 | `3bea4afcd22af3dc6f5ea41aba4769d6558ce6ec5640a2c3a004a8b4bbc20109` |

固定的引擎实现参考为仓库现有 `build/physics-research/engine-source.json` 记录的 `katataki/UES5.6@6b2c694ab693a2711ff7c1e45e66ced95f8d7de5`。它是 Epic 源码的镜像，代码属于一手实现，但**不是本机 Shipping 函数逐指令等价证明**。安装 PE 的 UHT 和真实包边界负责证明本机序列化布局；算法依据另列，避免把通用源码默认为本游戏全部编译策略。

## 样条：默认值、实例覆盖与 cook 策略

固定实现的构造器设 NoCollision、`bNeverNeedsCookedCollisionData=false`、Z 方向 up、单位横截面 scale、边界0；`SetCollisionProfileName` 也会关闭 `bUseDefaultCollision`。这些是缺省来源，实际实例仍优先。见 [SplineMesh 构造器及重建实现](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Components/SplineMeshComponent.cpp) 与 [StaticMeshComponent 碰撞配置入口](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Components/StaticMeshComponent.cpp)。

真实32项均有 `BodyInstance.CollisionProfileName=BlockAll`、`CollisionEnabled=3`，named responses 另覆盖 IkTrace、AIPawn、EnvCheck、VFXTrace、AISight、Traversal。均未保存 `splineBodySetup`、`splineNeverCook` 或自定义边界/axis。来源 body 虽默认 NoCollision，却确有一个 box 和一个 cooked complex mesh。可见性字段 `bHiddenInGame=1,bVisible=0` 不提供碰撞删除依据。它们保留的位置为约 `(-60765.742,-103059.737,10037619.653)`cm，scale约 `(0.6,0.600000024,15.000000596)`；这些值只说明保存放置，不说明 actor 的实时有效性。[真实包记录](../build/spline-gc-research-20261116/probe.json)

`GetBodySetup()` 不会回退返回未变形的来源 body。`OnCreatePhysicsState` 发现 GUID 不同后调用 `RecreateCollision`，后者复制/刷新来源 BodySetup，再变形各形状及创建物理网格。形状算法有区别：球与胶囊处理中心和尺寸；box 先把半径每轴至少夹到1cm，再变为八点 convex；convex 须先应用自身局部 transform，再逐点弯曲。复杂三角碰撞由独立 `GetPhysicsTriMeshData` 路径逐顶点变形。[引擎形状重建](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Components/SplineMeshComponent.cpp#L1013)

`CreatePhysicsMeshes` 会在无 cooked format 且拥有 game world 时调用 `RuntimeCookPhysics_Chaos`；后者实际执行 FCookHelper。不能仅看到同文件中返回 false 的 `IsRuntimeCookingEnabled()` 就认定此路径被禁用，该 helper 不是这条调用的 gate。`bNeverNeedsCookedCollisionData` 则是明确的提前退出条件。[BodySetup 物理网格与运行时 cook 实现](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/BodySetup.cpp)、[Epic 对 Never Needs Cooked Collision Data 的说明](https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-spline-mesh-component-property-reference-in-unreal-engine)

这里的来源 box `X=200,Y=3.2584135624347255e-05,Z=199.99998474121094`cm，中心 `(0,3.909823590220185e-06,100.06580352783203)`。因此引擎生成 convex 时 Y 半径将变成1cm；直接弯曲来源薄 box 的原三角形会产生不同碰撞，不能作为正确实现。

## 样条：真正用于弯曲的 Mesh bounds

`FSplineMeshSceneProxyDesc::InitializeFrom` 默认依据 `r.SplineMesh.FitToSourceMeshBounds=true` 选 LOD0 `SourceMeshBounds`，旧路径才是 `StaticMesh->GetBounds()`。默认边界相等时，alpha由来源 mesh 的 forward-axis 范围计算。跨出可视范围用切线外推，roll/scale/offset 还受 smooth flag 控制；方向 frame、轴排列和 float 转换也须保持。[完整 CPU slice 算法](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/SplineMeshSceneProxyDesc.cpp)、[Epic slice API](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/USplineMeshComponent/CalcSliceTransformAtSplineOffset)

真实来源包 StaticMesh export2 的 unversioned properties为 `[3,4,5,6,42]`。slot42是本机 UHT 确认的 `ExtendedBounds`，不是通过值搜索找到。前序 FStaticMaterial 与 UVChannelData 均按 header 消费；property尾117。随后顺序读取 UObject GUID标志、strip `(5,0)`、cooked=true、BodySetup ref1、NavCollision ref2、LightingGuid、空 sockets、LOD数1、LOD strip `(5,4)`、一个40字节 section；接下来 **payload offset205** 即7个double的 LOD0 SourceMeshBounds。

| 字段 | 真实值 |
| --- | --- |
| SourceMeshBounds.Origin | `(0,3.909823590220185e-06,100.06580352783203)` |
| SourceMeshBounds.BoxExtent | `(100,1.6292067812173627e-05,99.99999237060547)` |
| SphereRadius | `141.42135620117188` |
| LOD section | material0、128 triangles、vertices0..80、collision=true |
| 紧随字段 | MaxDeviation0、cookedOut=false、inline=true、rayTracing=false |

这与 [StaticMesh/LOD/Section 序列化顺序](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/StaticMesh.cpp) 对应。探针只需读取到277，不宣称已解析其余7361字节 render tail。[完整偏移证明](../build/spline-gc-research-20261116/decoded.json)

ExtendedBounds 的 Y origin为 `3.909824044967536e-06`，与 SourceMeshBounds 有微小差别，说明两者不应被全局混用。在当前32个 X-axis实例中，使用真实 bounds 得到 `alpha=(x+100)/200`。本例没有保存自定义边界；不能把这个简式推广到所有 mesh/axis。

## GeometryCollection：本机字段和完整模板链

UGeometryCollectionComponent 继承 UMeshComponent；它还具有破碎、根骨骼变换及每粒子碰撞配置能力。[Epic 类文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/GeometryCollectionEngine/UGeometryCollectionComponent) 佐证这些能力，但实际 slot 顺序来自本机 UHT。

UHT 原表87项，扣除4个 enum underlying 描述符、5个数组 inner 描述符，GC own为78项；UMesh own5、Primitive own114，因此 Scene offset=`78+5+114=197`。完整 `{name,kind,flags}` 见 `decoded.json.gcSchema/meshSchema`，不能从原始描述符数量直接推 Scene offset。

placed export7 `GeometryCollection` 的 fields为 `[35,40,202,203,204,229,230,238]`，zero为229。头结束13；slot35、40分别为 OnChaosBreakEvent、OnChaosPhysicsCollision，均为 `count:i32=1` 加一个 `objectRef:i32,FName:2u32`，分别从13、29开始。两者都绑定同 actor export2，不可固定跳过所有 delegate。

| payload offset | 真实字段 |
| --- | --- |
| 45 | slot202 RelativeLocation=`(-274364.232939,43263.707366,-3287.394433)` |
| 69 | slot203 RelativeRotation=`(0,-35,0)` |
| 93 | slot204 RelativeScale3D=`(0.447247,0.447247,0.447247)` |
| 117、118 | bNetAddressable=1、CreationMethod=1 |
| 119 | UObject hasGuid=false |
| 123 | UCSModifiedProperties count3，各28字节，指向 RelativeLocation/RelativeRotation/RelativeScale3D |
| 211 | 精确结束 |

模板依次为 `/Game/PropDestructionSystem/DestructablePropsSamples/SampleProps/BP_Prop_Table` export3，再到 `/Game/PropDestructionSystem/DestructablePropsCore/BP_PropDestruction_DProp_MASTER` export36，再到 native CDO。第一层14字节，只有RestCollection slot1；第二层71字节，fields `[1,4,14,41,161,181,210]`、zero161，含 ObjectType3、三个 DamageThreshold、bNotifyBreaks、BodyInstance与bVisible。两层均无额外保存的 Scene transform/parent；所有尾部已精确消费。

因此 StaticMeshComponent export13 `ProxyMesh` 的已保存相对原点仍为零，parent ref8指向export7；完整两级链得到上述 GC 世界位置、yaw与scale，而不是错误地使用全零父变换。研究脚本成功恢复了该链。[typed decode 与全部 payload SHA](../build/spline-gc-research-20261116/decoded.json)

这只解决可证明的保存姿态。父 GC 可以破碎/移动，ProxyMesh 是 destructible blueprint 的一部分；尚未还原其 Blueprint 生命周期函数或碎片状态。因此可以记录为“保存姿态几何、动态生命周期仍未知”，不能作为永久静态可走地面或 physicalVerified。

## 建议的下一步

1. 生产 schema 增加 GC own与Mesh own表；组件 reader使用197 Scene offset并按类型消费 multicast delegate。增加这一个真实包与两层模板的末尾、变换、payload SHA控制，再重新提取受影响包。
2. 样条实现优先限定为已经审计的格式；从实际 StaticMesh property与LOD prefix读取 bounds。按原生 sphere/sphyl/box/convex规则生成变形形状，对 box采用原生1cm半径下限；convex需重新求凸壳。复杂碰撞另行处理，并保持 collision complexity、默认碰撞和实例覆盖关系。
3. 加入真实已保存变形 BodySetup 的独立差分，至少覆盖弯曲、不同axis、镜像缩放、custom boundary和smooth roll/scale，遇到未支持layout明确失败。不要只检验同一段自写公式两次。
4. 更新当前错误账本时，把“typed prefix恢复”“离线几何再生”“动态状态未建模”“实机接受”分别记账。继续保留 `completeCollisionClaim:false` 与 `physicalVerified:false`。

## 本轮补充：32项严格 sibling 复用原型及真实差分

同一个包内，export50–81已保存32个deformed BodySetup，export82–113缺失；它们按 `target=sibling+32` 一一具有完全相同的 deformation 输入。候选由类型和内容键选择，**代码没有使用这个序号关系匹配**。本批实际的 body export为3–34，且其 `outer` 精确指向对应保存 spline。

可复用 Python 位于 `build/spline-gc-research-20261116/spline_rebuild.py`：

```python
index = exact_sibling_index(assets, package, source_mesh_sha)
saved_body, provenance, target_info, sibling_info = resolve_exact_sibling_body(
    assets, package, target_export, index
)
# saved_body 是未经世界变换的真实 cooked BodySetup。
# collision_meshes(saved_body) 的每个点必须再 place(point, assets.chain(package, target_export))。
```

`exact_sibling_index` 要求候选是同包的 SplineMeshComponent 与 BodySetup，并验证 BodySetup.outer。strict key包括：resolved来源 mesh包SHA/export、来源 BodySetup payload SHA和GUID、类型化 LOD0 SourceMeshBounds、全部11个FSplineMeshParams（含默认scale/roll/offset）、axis/up/min/max/smooth/neverCook/dirty，以及规范化后的完整非几何BodySetup properties（明确补全CollisionTraceFlag、BuildScale3D、neverCook缺省值）。候选保存body GUID、候选spline缓存GUID、来源body GUID三者必须全等；保存body除AggGeom外的属性必须与来源设置相等。目标与候选的bUseDefaultCollision、来源defaults叠加后的实际BodyInstance也须全等。任一不符、无候选或多候选均拒绝。

本批来源 GUID 为 `fd63bf00f706074a991b31b5d682a797`；源和保存body均为cooked、hasData、单一Chaos format。它们的BuildScale3D全部为默认单位值，collision complexity全部相同。组件scale不进入local body deformation key：保存组件自身scale `(1,1,25)`，但父链还含约0.6缩放；目标自身保存的是约 `(0.6,0.600000024,15.000000596)`。探针独立组合两条链后发现，本批两者最终world transform恰好完全相等。集成仍应始终应用目标链，不能依赖这一巧合。

`source_box_convex` 先按原生规则把来源box半径每轴至少夹到1cm，生成八角，应用box局部transform，再按float32 slice算法弯曲、计算凸壳。`warp_vertex(..., complex_vertex=True)` 另将来源cooked complex顶点按FVector3f输入输出规则弯曲。对照不是第二份自写公式，而是上述32个真实保存deformed BodySetup：

| 验证 | 结果 |
| --- | --- |
| 严格内容键唯一匹配 | 32/32 |
| 来源/保存/缓存GUID一致 | 32/32 |
| 完整非几何BodySetup属性与有效BodyInstance一致 | 32/32 |
| 生成八角与保存AggGeom.VertexData按原顺序最大坐标差 | `0.000006416737392100913`cm |
| 生成complex与保存complex顶点双向Hausdorff最大值 | `0.0010918300671385692`cm |
| 修改axis/up/min/max/smooth/dirty/neverCook/startScale/endRoll/defaultCollision/instanceCollision及制造歧义 | 12/12明确拒绝 |
| 单独修改世界location/scale | local key保持相同，仍须目标变换 |

float32原型已经显式处理float运算顺序、Frenet frame、double FTransform的轴归一化/四元数转换；CPU编译器FMA/向量化、Chaos cook的重排/简化尚未逐位仿真。因此生成几何只是独立差分佐证，**建议生产路径复用经hash约束的真实保存body，不采用这些近似生成点替代真实cook**。当前差分覆盖的是本批实际使用的默认X轴、平面曲线、单位横截面scale；没有因此宣称其他axis、custom boundary或smooth分支已通过。

私有 `exact-sibling-targets.pbzmesh` 实际由真实保存body的local cooked几何和各目标链生成，为256顶点、384三角形；独立读取检查finite=true，32个组件各边恰有两面、均闭合。它不修改world输出，也不证明该高处actor在实际游戏中的激活状态。详见 `spline-differential.json` 与 `spline-geometry-validation.json`。

建议本批生产修复限定上文精确包SHA和来源mesh SHA，按同包typed sibling+exact key恢复；记录原body export、原body payload SHA、target export及key SHA。其余输入继续明确失败。这样本批缺口可以通过真实保存数据解决，无需先声称通用runtime cook已完成。

复现命令：`py -3.12 build/spline-gc-research-20261116/spline_rebuild.py`。本轮产物SHA256：

- `spline_rebuild.py`: `f2d41e545a36ae5befd5744e3e48044209b110420201da4fb3d25478ebe41b23`
- `spline-differential.json`: `615ee633af4c0bb94e2adfb3a4f4b75003670651a26abb0aefbd08b0b56e9f1a`
- `exact-sibling-targets.pbzmesh`: `774423540b0596452bc597cf0452fc8e7400b709099c50c4b360cd99b1e2af12`
- `spline-geometry-validation.json`: `9874804e1b429b254a6f5d914f219d58eaf2585a0864eba834d3c36f515a57dd`

关键研究产物 SHA256：`schema.json=afb80950d4aa4382f8c3ddd3237ccb009572fb5095ff90ef54cfcec100198c13`；`probe.json=7989f9de50d4b566c6386e9dc813f5c233864b5adf84786e438d7ac8e42fde4f`；`decoded.json=206336a407cc5f7cf6f7aabd470ee00232c2d0777e087ca468a93922b97810ce`。最后一个输出含typed LOD prefix，后续如重新生成，应重新记录文件hash。
