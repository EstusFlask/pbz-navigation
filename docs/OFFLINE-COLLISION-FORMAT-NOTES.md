# 离线碰撞格式：UE5.6 源码核对笔记

日期：2026-11-15。用途：支持本仓库从安装包解码真实碰撞，再交给独立 Recast/Detour。本文是格式研究，不代表碰撞覆盖、场景重建或 1 号路线验收已经通过。

## 来源与版本边界

本轮读取了 Epic 原始引擎代码的公开镜像 `katataki/UES5.6`，固定提交 [`6b2c694ab693a2711ff7c1e45e66ced95f8d7de5`](https://github.com/katataki/UES5.6/tree/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5)。这是镜像的版本声明，不能单凭仓库名认定 PBZ 的定制引擎字节格式完全相同。Epic 官方仓库在本会话未认证请求下返回 404；相关源文件只下载到忽略目录 `build/physics-research/`，不随仓库分发。Epic 官方 API 可交叉确认 [TriangleMesh 索引缓冲类型](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Chaos/FTrimeshIndexBuffer)与 [HeightField 数据类型](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Chaos/FHeightField)。

另核对 CUE4Parse 固定提交 [`4d2301a8eb129f593f1c76ff82612400801f1a94`](https://github.com/FabianFG/CUE4Parse/tree/4d2301a8eb129f593f1c76ff82612400801f1a94)。它可参考容器、属性和指针处理，但该版本的 Chaos factory 不支持普通 TriangleMesh/HeightField，不能把其常规网格导出当作真实 Chaos 碰撞导出。[实现](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Objects/Chaos/FImplicitObject.cs)

下表均指小端的现代分支。`bool32` 是 Unreal archive 的四字节布尔值；它不同于 unversioned 属性的布尔值。`Array<T>` 是 `int32 count` 后跟元素，除非另有说明。不能给每个结构体按 C++ 内存对齐补齐字节。[Archive bool 实现](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Core/Public/Serialization/Archive.h#L1506)、[Chaos 数组实现](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/ChaosArchive.h#L382)

## BodySetup 与 bulk 定位

`UBodySetup::Serialize` 在 `Super::Serialize` 完成后依次写入：`BodySetupGuid`（16 字节）、`bCooked:bool32`；若 cooked，继续 `bHasCookedCollisionData:bool32`、`FFormatContainer`。容器是 `int32 NumFormats`，每项 `FName format` 加一个 `FByteBulkData`。GUID 在 cooked 标志之前。现代分支没有额外必读的 levelset 数组；历史版本有受 Fortnite 版本条件控制的旧分支。[BodySetup.cpp](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/BodySetup.cpp#L823)、[容器源码](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/CoreUObject/Private/Serialization/BulkData.cpp#L1695)

现代 Zen 包存在 `BulkDataMap` 时，每项 `FByteBulkData` 的引用可以只有一个 `int32 dataIndex`；先用它索引 map，获得 flags、serial offset、serial size、cooked index。不要无条件把这四个字节误读为旧 flags。CUE4Parse 的实现先检查当前 realm 的 map，再检查 owner package；它明确处理 optional segment 的独立 map。[FByteBulkDataHeader.cs](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Assets/Objects/FByteBulkDataHeader.cs#L39)

旧 inline bulk header 则为 flags:u32、element count（i32，Size64Bit 时 i64）、size on disk（u32，Size64Bit 时 i64）、offset:i64，另有旧版本/重复可选 payload 条件字段。重要 flags：ForceInline `0x40`、PayloadInSeparateFile `0x100`、OptionalPayload `0x800`、Size64Bit `0x2000`、NoOffsetFixUp `0x10000`。payload 来源必须按 flags 及包的 bulk map 选择，不应把物理 blob 假定为 export 尾部余下的全部字节。[header 实现](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Assets/Objects/FByteBulkDataHeader.cs#L81)、[flags](https://github.com/FabianFG/CUE4Parse/blob/4d2301a8eb129f593f1c76ff82612400801f1a94/CUE4Parse/UE4/Assets/Objects/EBulkDataFlags.cs)

本地现有 `build/tools/zen.rs:272` 的 map entry 布局为：`serialOffset:i64, duplicateSerialOffset:i64, serialSize:i64, flags:u32, cookedIndex:u8, padding[3]`（32 字节）；`:918` 还处理 UE5.4 起 map 前的 padding 长度。该现有文件是 retoc 源码副本，适合与包头字段交叉检查。

BodySetup 的 Chaos blob 本身依次是：`PrecisionSize:i32`（此分支 float 为 4）、`Array<ConvexPtr>`、`Array<TriangleMeshPtr>`、UVInfo、`Array<int32> FaceRemap`。UVInfo 是 int32 索引数组、FVector3d 位置数组、嵌套 FVector2d UV 数组。[写入器](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/Experimental/ChaosDerivedData.cpp#L101)、[UVInfo](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Classes/PhysicsEngine/BodySetup.h#L45)

**blob 没有自带 custom-version 表。** 标准读取器重新构造 `FBufferReader`、`FChaosArchive` 后直接读上述字段，未复制外层 package custom versions。解析器应明确固定引擎 dialect 并用完整边界、数值、索引校验验证，不能盲目依赖外层属性版本。[ChaosDerivedDataReader.cpp](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/Experimental/ChaosDerivedDataReader.cpp#L10)

## Chaos 指针、三角网格与凸体

指针先读 `exists:bool32`；真时读 `tag:i32`。tag 已出现时复用对象，没有类型或正文；首次出现才走 factory，然后读取正文。必须在整个 blob 内共享 tag 表。factory 的类型是单字节：Convex=8、TriangleMesh=11、HeightField=12；scaled/instanced 使用高位标志并有各自包装格式，遇到未支持包装应明确报错。[指针](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/ChaosArchive.h#L175)、[factory](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Private/Chaos/ImplicitObject.cpp#L409)、[类型](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/ImplicitObjectType.h)

现代 implicit base 正文为 `isConvex:bool32, doCollide:bool32, collisionType:u8`。`doCollide` 不能直接当作组件的 CollisionEnabled：正常 TriangleMesh 构造器本身就传入 DisableCollisions；最终 scene query 仍有组件与 shape filtering。[base](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Private/Chaos/ImplicitObject.cpp#L337)、[三角网格构造器](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/TriangleMeshImplicitObject.h#L490)

TriangleMesh 在 base 后的顺序如下。**Chaos 的向量序列化即使模板参数为 double，也逐分量降为 float32**；不能根据 C++ 的 FReal/double 类型推断 wire 宽度，也不能统一按 blob PrecisionSize 解释所有浮点量。[ChaosCore Vector.h 的 SerializeReal 与两种重载](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/ChaosCore/Public/Chaos/Vector.h#L1333)

| 字段 | 现代分支布局 |
| --- | --- |
| Particles | `bool32 serialize`，随后 `Array<3*f32>` 顶点 |
| Elements | `bool32 requiresLargeIndices`，随后三角数组；每项 `3*i32` 或 `3*u16` |
| LocalBoundingBox | `min3*f32, max3*f32` |
| FastBVH | `Array<Node>`，每 node 两项 `{bounds6*f32, childOrFace:i32, faceCount:i32}`，即 64 字节；随后 `Array<bounds6*f32>` |
| MaterialIndices | `Array<u16>` |
| ExternalFaceIndexMap | `Array<i32>` |
| ExternalVertexIndexMap | `Array<i32>` |

UE5Main `UseTriangleMeshBVH=61` 起采用上述 FastBVH；`RemoveTriangleMeshBVHFaces=71` 之前，FastBVH 的 face bounds 后还有旧 `Array<i32>`。更早分支使用 AABBTree，不能套用 64 字节 node 跳过法。该 UE5.6 文件没有额外序列化 `bCullsBackFaceRaycast`。来源：[trimesh 正文](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/TriangleMeshImplicitObject.h#L619)、[BVH](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/TriangleMeshImplicitObject.h#L94)、[版本值](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Core/Public/UObject/UE5MainStreamObjectVersions.inl#L193)、[Particles](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/Particles.h#L122)

现代 Convex 在 base 后依次为：平面数组（每项 point3f+normal3f）、顶点数组3f、bounds6f、volume:f32、centerOfMass3f、margin:f32、StructureData、unitMassInertiaTensor3f、rotationOfMass 四元数4d。StructureData 首字节 indexType：0 无、1=u8、2=i16、3=i32；非零时是四个数组：Plane（firstHalfEdge, numHalfEdges 两个 index）、HalfEdge（plane, vertex, twin 三个 index）、Vertex（firstHalfEdge 一个 index）、Edge（一个 index）。face 的第 k 个顶点为 `HalfEdges[Plane.firstHalfEdge+k].vertex`，可按实际环序三角化。来源：[Convex](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/Convex.h#L911)、[indexType](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/ConvexStructureData.h#L284)、[half-edge](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/ConvexHalfEdgeStructureData.h#L49)

## Landscape HeightField

组件 Super 属性之后，现代原生 tail 是 `bCooked:bool32` 与 `TArray<uint8>::BulkSerialize`，即 elementSize:i32（1）、count:i32、raw bytes，**此处不是 FByteBulkData**。raw bytes 为 `containsSimple:bool32`、主 HeightField 指针、若含 simple 再跟 simple HeightField 指针。[Landscape 序列化](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Landscape/Private/LandscapeCollision.cpp#L2390)、[加载 cooked 高度场](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Landscape/Private/LandscapeCollision.cpp#L983)

HeightField base 后的现代字段：`realSize:i32`（8）、`storageSize:i32`（2）、`Array<u16> heights`、scale3f、min/max 各 f64、numRows/numCols 各 u16、range/heightPerUnit 各 f64、`Array<u8> materials`、低分辨率数组（每项 min/max 两个 u16）、numColsLowRes:u16；接着 FlatGrid2D（min2f、max2f、cells2i、dx2f）、flattened bounds min2f/max2f、local bounds6f。这里向量走降精度重载，标量 FReal 走 FChaosArchive 的现代 double 重载。低分辨率数据存在性受 UE5Main 83/84 分支控制；旧版本还有 cell bounds/float heights 分支。[HeightField.h](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/HeightField.h#L363)、[数据](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/HeightField.h#L731)、[UniformGrid](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/UniformGrid.h#L105)

原始点为 `(i%cols, i//cols, min+heights[i]*heightPerUnit)`。cell `(x,y)` 的 material 索引为 `y*(cols-1)+x`；255 表示 hole，两个三角形都应略去。正缩放下，quad 角点 v0、v1、v2、v3（行优先）的三角形为 `(v0,v1,v3),(v0,v3,v2)`。[点与三角形](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/HeightField.h#L112)、[hole](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Experimental/Chaos/Private/Chaos/HeightField.cpp#L891)

**Landscape 不应把 cooked Scale 与组件缩放重复相乘。** 物理实例创建时引擎重设 HF scale；其导航导出使用组件 full transform 再乘 `(CollisionScale,CollisionScale,1/128)`。若选择较粗的独立 simple HF，XY 要改用 `CollisionScale*CollisionSizeQuads/SimpleCollisionSizeQuads`。存在 simple HF 时主 HF 只标为 complex，simple HF 用于 simple 查询；对象类型和通道响应还委托给 LandscapeProxy 的 BodyInstance。[物理实例与过滤](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Landscape/Private/LandscapeCollision.cpp#L330)、[引擎导航导出](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Landscape/Private/LandscapeCollision.cpp#L2530)

## BP_SplineWall 与生成几何

本轮本机包的只读探针确认：`/Game/PBZContent/Blueprint/PCG/InvisibleWall/BP_SplineWall` 的 16,320 字节 blueprint 含 `DynamicMeshComponent`、`DynamicMesh`、`BodySetup_0`、`UserConstructionScript`（9,558 字节）以及两条 spline。它不是只能用标准 ProceduralMeshComponent 假定处理的类型。名称表含 `SampleSplineToTransforms`、`AppendSweepPolygon`、BaseFrames、TopFrames、Size、bUseTopSpline、bLoop。名称存在不等于已解出生成算法。

本地 blueprint 默认对象的 `DynamicMesh` export 171 字节，看起来为空容器；`BodySetup_0` 为 125 字节，最后 28 字节的字段对应 GUID、cooked=1、hasCooked=0、numFormats=0。因此 **默认模板没有 cooked 几何**，仍需检查放置实例的导出，不能由模板为空推断整张地图没有碰撞。该探针副本在忽略目录 `build/physics-research/eacf9101b1b46ccc00000001.bin`。

随后对本地 `build/roadbook-11/roots/PBZ_Pangzhen_WP.bin` 的实际放置导出进行了只读几何前缀解码：116 个 DynamicMesh 全部成功读出位置与三角索引；其中 72 个沿 outer 链归属于 BP_SplineWall，71 个非空，共 5,840 个顶点、11,396 个三角形。其余一个为空，actor 尾标为 `1981330487`。全部 DynamicMesh 合计 6,326 顶点、12,192 三角形。探针校验了 Oodle 块与总长、有限坐标及索引范围，没有解析属性集合、世界放置或认定全部对象都阻挡玩家；结果记录于忽略目录 `build/physics-research/pangzhen-dynamicmesh-geometry-probe.json`。这直接证明这些放置墙体的生成几何可离线读取，无需先重现 sweep。

这些放置 DynamicMesh 的精确 prefix 均为：2 字节空 unversioned header、offset 2 的 UObject `hasGuid:bool32=0`，随后 offset 6 开始三个 options `bool32=[0,1,1]`；第一个 vertex count 在 offset 18。例：root export 1287，DynamicMesh size 4,228，76 顶点、148 三角形，attribute flag 位于 offset 1,779。偏移均相对于单个 export payload。

标准 UDynamicMesh 的 Serialize 会在 UObject 属性后直接序列化 FDynamicMesh3；组件 MeshBodySetup 是可序列化 instanced 属性。应优先读取放置实例的 DynamicMesh 或 BodySetup，若为空再研究 construction script。标准 ProceduralMeshComponent 同样保留 ProcMeshSections 和 instanced ProcMeshBodySetup，但这只是另一个相关类型的能力。[UDynamicMesh](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/GeometryFramework/Private/UDynamicMesh.cpp#L313)、[DynamicMeshComponent](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/GeometryFramework/Public/Components/DynamicMeshComponent.h#L789)、[ProceduralMeshComponent](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Runtime/ProceduralMeshComponent/Source/ProceduralMeshComponent/Public/ProceduralMeshComponent.h#L287)

DynamicMesh 是否用于碰撞还取决于组件的 `bEnableComplexCollision`、CollisionType 与 scene query 过滤。引擎复制其顶点/三角形用于复杂碰撞时剔除重合点及面积不足的三角形，并设置 `bFlipNormals=true`；Chaos cooker 随后把 `(v0,v1,v2)` 变为 `(v1,v0,v2)`。因此从 DynamicMesh 读取的三角绕序与 cooked Chaos mesh 不同，坐标轴变换、镜像与 Recast 法线处理必须记录数据来源。[DynamicMesh 到碰撞](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/GeometryFramework/Private/Components/DynamicMeshComponent.cpp#L1468)、[Chaos cooker 绕序转换](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/Experimental/ChaosCooking.cpp#L36)

现代 FDynamicMesh3（UE5Main >=56）先写 preserve/compact/compression 三个 bool32。compact 分支先为位置 DynamicVector（FVector3d），然后可选 normal3f/color3f/UV2f（各 bool32 加 vector），再 triangle DynamicVector（3*i32）、可选 group vector、group counter、属性集合。DynamicVector 是 `u32 count`，非零时才有 `compressed:bool32`，再跟原始数据或 `SerializeCompressedNew`；它没有 element-size 前缀。[FDynamicMesh3](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/GeometryCore/Private/DynamicMesh/DynamicMesh3_Serialization.cpp#L236)、[DynamicVector](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/GeometryCore/Public/Util/DynamicVector.h#L853)

压缩 wrapper 为 magic/chunkSize 两个 i64，现代 magic `0x222222229E2A83C1` 后接 compressor 编码字节（2=Oodle；0 时后跟 FString 名），再 summary 的 compressed/uncompressed 两个 i64，接每块的两个 i64 大小和压缩 payload。块数由未压缩总长除 chunkSize 向上取整。必须按每块尺寸验证 Oodle 返回长度。[Archive.cpp](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Core/Private/Serialization/Archive.cpp#L738)、[compressor 编码](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Core/Private/Compression/CompressionUtil.cpp#L22)

若最终必须重现 sweep，原始 `AppendSweepPolygon` 实现明确把 path transform 的位置、旋转轴与 Y/Z scale 交给 GeneralizedCylinderGenerator，再应用 PrimitiveOptions、cap、loop、起止 scale 与 transform；仅按 spline 连接几面墙不能声称等价。[GeometryScript 实现](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Runtime/GeometryScripting/Source/GeometryScriptingCore/Private/MeshPrimitiveFunctions.cpp#L1049)

## 对实现的约束

本地道路样本 `SM_Road_Mub_F` 的实际 Chaos blob 用上述 float-vector 布局完整消费 8,576/8,576 字节：两个凸体各 24 顶点、44 三角形；一个 complex mesh 为 81 顶点、128 三角形、7 个 BVH node。局部 bounds 起点 offset 3,904、BVH 起点 3,928；complex mesh 结束 offset 8,560，其余是空 UVInfo/FaceRemap。第二个样本 `SM_StairsB_002` blob 为 28 字节、simple/complex 数组均为空。这些是具体样本结果，不能推论名字为 stairs 的资产一定使用复杂碰撞；还需读取 AggGeom 属性及实际组件 collision trace flag。

每个物理 blob 应校验 count 非负且受长度约束、所有坐标有限、索引有效、bounds 包含几何、完整正文消耗位置正确；未知版本或包装显式失败。外层 scene reconstruction 另需模板继承、组件父子变换、ISM/HISM 实例、独立 spline bodysetup、collision profile 与 simple/complex 选择。遗漏项必须进入覆盖报告，而不能静默当作可走空间。以上是根据已核对格式提出的实现约束，不是本轮已经完成的验收。

## Cooked 凸体数组与实际形状对应

`SimpleImplicits` 长度可能大于 `AggGeom.ConvexElems`，不能把全部 cooked 凸体都加入场景。引擎先写 non-mirrored bank，再写 mirrored bank；`FinishCreatingPhysicsMeshes_Chaos` 只遍历 AggGeom 的凸体数，按相同下标赋值，之后清空剩余 cooked 数组。`SM_Road_Mub_F` 的 AggGeom 只有一个凸体，两个 cooked hull 的顶点、三角形和 bounds 完全相同，因此此例只使用 `simple[0]`。[赋值实现](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/BodySetup.cpp#L599)、[bank 写入顺序](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/Experimental/ChaosCooking.cpp#L196)

CookInfo 生成时已经将 `FKConvexElem.Transform` 应用于 VertexData，得到 body-space 顶点；此分支 mirrored 输入先 X 取反，cooker 构造 mirrored hull 时又 X 取反。实例创建使用已烘焙凸体，只增加 body/component scale 与 local transform wrapper，不再次应用 elem transform。`BuildScale3D` 对应 authoring 阶段重设 VertexData 和 elem translation 的 bookkeeping，不应再次乘到 cooked 顶点。[CookInfo](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/BodySetup.cpp#L265)、[凸体构造](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/Experimental/ChaosCooking.cpp#L185)、[实例 wrapper](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/Experimental/ChaosInterfaceUtils.cpp#L246)、[RescaleSimpleCollision](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/PhysicsEngine/BodySetup.cpp#L734)

## FastGeo：源码结构与 PBZ 的具体扩展

FastGeo 不能作为普通 StaticMeshComponent 的重复物而略过。原始 cell transformer 复制可转换组件到 FastGeo，随后从 actor 移除原组件并 MarkAsGarbage，完全转换的 actor 也从 Level.Actors 移除。FastGeo 使用真正的 BodyInstance 与 physics 创建流程；其 StaticMesh 的 BodySetup 仍来自所引用的 UStaticMesh。[转换与移除](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoWorldPartitionRuntimeCellTransformer.cpp#L312)、[BodySetup 来源](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoStaticMeshComponent.cpp#L84)

容器先按 UObject 属性读 Assets 引用数组，Super 结束后进入 native tail：`Array<ComponentCluster>`，随后 `Array<HLOD>`。native 里的所有 UObject 引用已 remap 为 Assets 的 int32 下标，-1 为 null；它们不是 package import index。Cluster 是 FString name、int32 clusterIndex、各组件类型的数组，数组顺序提供类型，标准格式没有额外 factory ID。[容器](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoContainer.cpp#L653)、[asset remap](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoContainer.cpp#L37)、[cluster](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoComponentCluster.cpp#L39)

PBZ 的具体扩展与公开镜像不完全相同，下面区分源码解释与本地字段边界探针。对区域清单 699 个容器，474 个只有 HLOD；其余 **225 个普通 cluster 容器已全部读到 export payload 精确末尾，零失败**。共发现 28,348 个 FastGeo mesh record、348,831 个实例、2,460 个 decal record；其中 19,574 个 record 的 BodyInstance.CollisionEnabled 属于 query-enabled 集合。这只是字段探针统计，未解析 body default profile 覆盖或输出这些实例的完整几何，不能当成已通过碰撞覆盖验收。探针报告位于忽略目录 `build/physics-research/fastgeo-normal-probe.json`。

PBZ 普通 cluster 有六个组件数组。前四个对应原始 StaticMesh、ISM、SkinnedMesh、InstancedSkinnedMesh；第五类型尚未语义确认，本轮 225 个容器均为空（本机程序还包含 FastGeoProceduralISMComponent 源路径字符串）；第六为 decal，记录长 388 字节。本轮 skinned 两类也均为空。最小 decal-only 容器 492 字节，单 asset 引用解析为血迹 decal material；两个 decal 的 880 字节样本也按 388 字节逐项准确对齐。未知第五类如果后续非空，必须报出，不应猜作 ISM。

StaticMesh/ISM 共同记录的已确认碰撞相关前缀如下。这里 FTransform 为 quaternion4d、translation3d、scale3d；这是 UE 数学类型，不是 Chaos 的 float-vector 重载。

1. ComponentIndex:i32；LocalTransform:10d；WorldTransform:10d；LocalBounds:7d；WorldBounds:7d。
2. 五个 bool32：visible、staticWhenNotMovable、fillCollisionUnderneath、rasterizeFilledConvex、canAffectNavigation。
3. CustomPrimitiveData:Array<f32>；DetailMode:u8；HasCustomNavigableGeometry:u8；RuntimeVirtualTextures:Array<assetIndex:i32>。
4. BodyInstance：按本游戏 unversioned FBodyInstance schema 序列化，直接使用现有 BodyInstance 属性解析器；这里没有额外 GUID。

原始顺序见 [Primitive 序列化](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoPrimitiveComponent.cpp#L67)。本地 HLOD 单 SM 样本 `00a54dfb2c88168700000001.bin` export 1：record 起点 91，BodyInstance 为 397..741；普通单 ISM 样本 `b1aaa846cd3893e200000001.bin` export 158：record 起点 84，BodyInstance 为 390..560。

BodyInstance 之后是 renderer 数据。PBZ 样本的材料数组固定从 `BodyInstanceEnd+264` 开始，完整 225 容器已验证此跨度；其中可以按 47 个 bool32、原始其余 scene suffix 63 字节、PBZ 额外 13 字节对齐。**额外字段语义尚未从本游戏 serializer 独立还原；不能宣称公开镜像已完整覆盖。** 公开镜像此处有 46 个 renderer bitfield bool。helper 宏是临时 bool 加 archive bool，确实是四字节，不是 packed byte。[helper 宏](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Core/Public/Serialization/Archive.h#L67)

随后为 OverrideMaterials:Array<i32>；StaticMesh assetIndex:i32；OverlayMaterial:i32；OverlaySlots:Array<i32>；overlay draw distance:f32；forcedLOD/minLOD/wpoDistance 各 i32；nanite distance/shadow bias/shadow visibility 各 f32；lightmap resolution:i32；十个 renderer bool32；bUseDefaultCollision:bool32。PBZ 在该 source base 后还有固定 36 字节扩展跨度，然后才是 ISM 数据或下一个 record/类型 count。前述 264 与 36 字节跨度是本游戏完整边界探针结果，并非跨版本通用格式。[Mesh 材料](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoMeshComponent.cpp#L13)、[StaticMesh base](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoStaticMeshComponent.cpp#L29)

`bUseDefaultCollision` 为真时，runtime 用 StaticMesh BodySetup 的 DefaultInstance 外部碰撞 profile 替换本地 profile；不能只以 FastGeo 序列化 BodyInstance 的通道数组作最终结论。[初始化](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoStaticMeshComponent.cpp#L59)

FastGeo 还有独立的 scene collision gate：`FFastGeoPrimitiveComponent::IsCollisionEnabled()` 返回 SceneProxyDesc.bCollisionEnabled，ISM 转换会再将它与 `!bDisableCollision` 相与。只处理 BodyInstance profile 不能在一般情况下替代此 gate。[getter](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoPrimitiveComponent.cpp#L528)、[ISM gate](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoInstancedStaticMeshComponent.cpp#L53)

PBZ 47 个 renderer 布尔值的 gate 下标 **39** 得到以下本地交叉证据支持；这是序列化映射的验证，未声称从本机二进制符号直接恢复 getter：

- 本机 reflected primitive schema 多出 `bOutputRTDepthMaskInDepthPass`，位于 bVisibleInRayTracing 后；其位置与 renderer 在旧源码下标 8 插入一个布尔值相符。
- 全部 699 容器、46,849 mesh record 中，renderer[42] 是 47 项中**唯一**与实际 static/instanced 数组类型完全匹配的位。它对应旧源码 renderer[41] 的 bIsInstancedStaticMesh，为同一序列后段提供独立锚点。
- renderer[39] 与 raw BodyInstance.CollisionEnabled!=0 在全部 46,849 项中完全一致：19,574 真、27,275 假。18,501 个 HLOD record 全部为假。

结果在 `build/physics-research/fastgeo-collision-flag-probe.json`。另有 565 个普通 record 的 gate=false 且 useDefaultCollision=true，应特别防止外部默认 profile 将它们重新启用；对当时保存的 110,826 条 collision-audit source 逐项交叉检查，这 565 项实际**没有任何已输出的几何**。因此该区域现有几何未发现由缺少此 gate 导致的额外碰撞，不能将增加 gate 描述为已经解释或修复路径断连。交叉报告为 `build/physics-research/fastgeo-disabled-emitted-probe.json`。

PBZ ISM 追加数据已在单项、两项及全部普通容器中验证：

| 顺序 | 布局 |
| --- | --- |
| PerInstanceSMData | BulkArray，elementSize=128，count 后每项 4×4 double matrix；不是 64 字节 float matrix |
| RandomSeed | i32 |
| PerInstanceCustomData | BulkArray<f32>（elementSize=4） |
| AdditionalSeeds | Array<{startIndex:i32,seed:i32}> |
| PBZ 附加数组 | BulkArray<u32>（elementSize=4；语义尚未确认） |
| NavigationBounds | min3d、max3d、valid:u8 |
| 显示参数 | lodScale:f32、minDraw/startCull/endCull 各 i32、gpuLOD:bool32 |
| PBZ 附加尾字段 | i32（本轮样本多为 0，语义尚未确认） |

原始 ISM 顺序见 [FastGeoInstancedStaticMeshComponent.cpp](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/FastGeoStreaming/Source/FastGeoStreaming/Private/FastGeoInstancedStaticMeshComponent.cpp#L26)。例如两项样本 `e2ea3d4fed631a9300000001.bin` export 76 长 2,380：record 0 为 88..1222，record 1 为 1222..2360；余下五个零 count 是四个空类型数组和 HLODs，恰好到末尾。单项样本的 matrix bulk header 在 offset 976，(128,1)，matrix 从 984 开始，NavigationBounds 在 1140..1189。

## 普通 UInstancedStaticMeshComponent

普通 UObject ISM 与 FastGeo native ISM 是两种外层布局。游戏 UHT 表的 ISM 有 19 个 own property，其中 `CachedBounds` 为静态数组 ArrayDim=3，故占 21 个 unversioned slot。以已验证 StaticMesh 的 SceneComponent offset=173 为基准，ISM 的 SceneComponent offset=194；PrimitiveComponent offset=80，BodyInstance slot=178。本机恢复的 SceneComponent 有 29 个 own slot，ActorComponent 因而从 slot=223 开始。原始 metadata 表保存在忽略目录 `build/physics-research/scene-actor-native-schema.json`，此处没有按字段值猜测类布局。

`CachedBounds` **不是 TOptional**。它是 `FBoundsCacheElement[3]`，单个元素包含 reflected `bIsValid:bool, Hash:uint32, Value:FBoxSphereBounds`。因此读取元素自己的 unversioned header，bool 属性是一字节，Value 又有自己的 unversioned header，通常三个字段为 Origin:3d、BoxExtent:3d、SphereRadius:d；必须遵循 zero mask，不能无条件固定跳 65 字节。65 字节只是本轮所有字段存在的样本长度。[结构声明](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Classes/Components/InstancedStaticMeshComponent.h#L97)、[静态数组](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Classes/Components/InstancedStaticMeshComponent.h#L783)

具体样本 `a6a28c7077f149be00000001.bin` export 71 长 834 字节，unversioned fields 为 `[4,17,18,19,195,226,227,235]`、zero mask 包含 226。字段解释和 native tail 完整对齐如下：

| offset | 解释 |
| --- | --- |
| 13 | own field 4 InstancingRandomSeed:i32=29963 |
| 17..212 | own fields 17/18/19 三个 CachedBounds；本例各 65 字节 |
| 212 | field 195=Scene.AttachParent:i32=146，指向 export 145 `DefaultSceneRoot1` |
| 无字节 | field 226=ActorComponent.UCSSerializationIndex（zero） |
| 216 | field 227=ActorComponent.bNetAddressable:u8=1 |
| 217 | field 235=ActorComponent.CreationMethod:u8=1 |
| 218 | UObject hasGuid:bool32=0 |
| 222 | ActorComponent native UCSModifiedProperties count=2 |
| 226..282 | 两个 FSimpleMemberReference，每项 objectRef:i32、FName:2*i32、Guid:16bytes；名称为 PerInstanceSMData、InstancingRandomSeed |
| 282 | StaticMeshComponent native LODData count=0 |
| 286/290 | MeshPaintTexture cooked:bool32=1、texture objectRef:i32=0 |
| 294/298 | ISM cooked:bool32=1、hasSkipSerializationPropertiesData:bool32=1 |
| 302 | PerInstanceSMData BulkArray header=(128,4) |
| 310..822 | 四个 4×4 double instance matrix |
| 822 | PerInstanceSMCustomData BulkArray header=(4,0) |
| 830 | cooked render data present:bool32=0；到 834 精确结束 |

该样本没有序列化 local relative transform，应沿模板和 AttachParent 继承/组合；不能将 field 195 误判为 BodyInstance，也不能将后面的 ActorComponent slots 误判为位置和旋转。

完整 native 链需要依次处理各层 Super：ActorComponent 的 UCSModifiedProperties 数组；若有效 `bComputeBoundsOnceForGame` 为真，SceneComponent 还有 cooked bool32 及条件 Bounds7d；StaticMeshComponent 的 LODData 数组和 MeshPaintTexture cooked bool/object ref；最后才是 ISM cooked bool、skip-property-data bool 及条件 matrix/custom bulk arrays。`hasSkipSerializationPropertiesData=false` 时，实例数据可能来自 archetype，不能当成零实例。[ActorComponent::Serialize](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Components/ActorComponent.cpp#L3149)、[Scene cooked bounds](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Components/SceneComponent.cpp#L3922)、[StaticMesh native](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Components/StaticMeshComponent.cpp#L335)、[ISM Serialize 与继承逻辑](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/InstancedStaticMesh.cpp#L3330)

cooked ISM render suffix由 FPrimitiveInstanceDataManager 读取：先 bool32 bHasCookedData；若真，再读 Hashes 与 ProxyIndexToComponentIndexRemap 两个 BulkArray。它们是预计算渲染排序信息，不应替代前面的物理 instance transforms。[ReadCookedRenderData](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/InstancedStaticMesh/ISMInstanceDataManager.cpp#L1144)

## 区域剩余类型与运行时准备度审计

### NavModifier 与 lake

本轮九个 NavModifierComponent 的 placed export 都只覆盖 ActorComponent 元数据；沿模板引用追溯后，AreaClass 均为 `/Game/RenewalContent/Prototypes/Navigation/NavArea_Fire`，FailsafeExtent=(60,60,60) cm。其 CDO 只有两个非默认字段，经过游戏 UHT 表确认是 **DefaultCost=10、FixedAreaEnteringCost=10**。九个 owner 是七个 brazier、一个 campfire、一个 arrow trap。它们是有代价的导航区域，不是 NavArea_Null，也没有证据表明该组件会给玩家创建物理墙。是否将火焰风险转化为玩家路线成本，属于独立移动策略；不能仅凭名字改为不可通行。完整本地证据在 `build/physics-research/nav-lake-properties-probe.json`、`nav-area-schema.json`、`navigation-water-runtime-readiness-audit.json`。

这个区分符合引擎实现：NavModifierComponent 用 FAreaNavModifier 注记区域，其构造器原始默认值虽然是 NavArea_Null，但本游戏模板已明确覆盖为上述 Fire 类。不能忽略模板而套用 native constructor 默认值。[NavModifier 源码](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/NavigationSystem/Private/NavModifierComponent.cpp#L32)

唯一 LakeCollisionComponent 属于 WaterBodyLake，own fields 是 CachedBodySetup 引用和 BoxExtent；BodySetup export 0 确实保存了 138,796 字节，并非缺少碰撞数据。但有效组件 BodyInstance 为 QueryOnly、WaterBodyCollision、Pawn=Overlap、AIPawn=Overlap、EnvCheck=Block，与本机 DefaultEngine.ini 的 WaterBodyCollision profile 相符。应将它视为水查询体，不能作为玩家阻挡地面加入烘焙；同时，Overlap 并不证明玩家能在其中安全步行或游泳，水深/溺水/游泳规则仍需另外核验。引擎 lake 组件会根据 water spline 生成凸体，并有专门导航导出处理，外观水面不能替代该规则。[Lake 类声明](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/Water/Source/Runtime/Public/LakeCollisionComponent.h)、[生成凸体](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/Experimental/Water/Source/Runtime/Private/LakeCollisionComponent.cpp#L358)

### 五个 attachment 缺口

四个失败项的 owner 为 BP_HangSkMesh，挂接的普通 StaticMesh 是 `SM_Scan_Basket_001_005`、profile BlockAll；并非 NPC 武器。SkeletalMeshComponentBudgeted 的 Scene offset 为 239，这些放置数据的 parent、可选 relative location 和 ActorComponent 标志可单独读取，不需要先实现整个 skeletal physics exporter。四处根层近似位置为 (-172218,107332,908)、(-174144,104810,1503)、(-173735,104702,1519)、(-173283,106896,1105) cm。实际 socket/骨骼动态姿态仍不能仅凭根变换认定。见 `build/physics-research/attachment-gaps-classification-probe.json`。

Houdini 项则不能因编辑工具名称而剔除。其子网格为 `/Game/HoudiniEngine/Temp/CollisionVDB/1F54B5F3/CollisionVDB_3_702_0_rendered_collision_geo_0`，profile Profile_LD_GroundIK（WorldStatic、QueryAndPhysics，没有忽略 Pawn），CTF_UseComplexAsSimple，377 个 cooked 顶点的 bounds 为 (-177318,113927,-3095) 至 (-176198,115389,-2950)，确实位于目标区域。游戏 UHT 表恢复 57 个 Houdini own slots，继承 PrimitiveComponent 后 Scene offset=171；这个 placed 根组件没有覆盖位置/旋转/缩放，几何本身已包含大世界坐标。应补这类父组件的变换前缀，而不是启动 Houdini 或重建编辑期程序。见 `build/physics-research/houdini-native-schema.json` 与 `houdini-ground-collision-probe.json`。

### Puerts WebAssembly 的静态证据边界

官方 Puerts 固定提交 [`d9099a2a2a69a5510d84cc9c60494cda68dcf1e8`](https://github.com/Tencent/puerts/tree/d9099a2a2a69a5510d84cc9c60494cda68dcf1e8) 的 native `Wasm_OverrideWebAssembly` 直接按编译宏 `WASM3_OVERRIDE_WEBASSEMBLY` 返回 true/false，**不是按照 V8/QuickJS 做运行时自动选择**。同版本 Build.cs 默认 UseQuickjs=false、UseWasm=false、OverrideWebAssembly=false；复制 JavaScript Content 的构建步骤仍会带上 helper 和 wasm 示例文件。因此游戏包内出现 wasm3_helper.js / wasm 样本，不证明 V8 的标准 WebAssembly 被替换。[native guard](https://github.com/Tencent/puerts/blob/d9099a2a2a69a5510d84cc9c60494cda68dcf1e8/unreal/Puerts/Source/JsEnv/Private/JsEnvImpl.cpp#L4898)、[编译默认值](https://github.com/Tencent/puerts/blob/d9099a2a2a69a5510d84cc9c60494cda68dcf1e8/unreal/Puerts/Source/JsEnv/JsEnv.Build.cs#L131)、[复制 Content](https://github.com/Tencent/puerts/blob/d9099a2a2a69a5510d84cc9c60494cda68dcf1e8/unreal/Puerts/Source/JsEnv/JsEnv.Build.cs#L174)

本机 helper 仅在 native guard 为真时赋值 global.WebAssembly=Wasm3。该 fallback 的 API 是部分实现：Table.get 未实现；没有完整标准 compile/validate；instantiate 的返回形状也与标准 WebAssembly 不完全相同。官方文档建议通常只在 iOS 启用 Wasm3/override。另一方面，普通 Windows V8 的默认配置保留标准 WebAssembly；不能因为 helper 存在就提前判定 Emscripten 模块不可用。[helper 源码](https://github.com/Tencent/puerts/blob/d9099a2a2a69a5510d84cc9c60494cda68dcf1e8/unreal/Puerts/Content/JavaScript/puerts/wasm3_helper.js)、[官方 wasm 说明](https://github.com/Tencent/puerts/blob/d9099a2a2a69a5510d84cc9c60494cda68dcf1e8/doc/unreal/zhcn/wasm.md)

当前没有启动游戏，故尚未实测这份 PBZ 自定义构建的宏值或新导航模块加载。静态证据支持继续准备以 wasmBinary 内存字节初始化的标准 V8 模块，并在承载环境用最小内存模块及所需 API 检测实际能力；不应将 Node 离线测试写成游戏集成已通过。`require('wasm')` 也不是这里已核实的通用 Puerts 内建模块。现有证据不要求提前安装 Emscripten SDK 或转换为 WASM=0；若真实承载能力测试失败，再针对明确错误选择兼容方案。

## 已安装存档的只读状态来源

默认完整几何包含可破坏物的完整状态。要用当前存档规划，必须另外读取有来源的 actor 状态，不能因为一条路线受阻就按坐标删除资产。研究核对了两个项目自身的源码与格式记录：MIT 的 PBZ-Editor 固定提交 [`5fdb13483cefde94e6a2f3dba3d258c84e747582`](https://github.com/qry6868/PBZ-Editor/tree/5fdb13483cefde94e6a2f3dba3d258c84e747582)，以及 SaveSmith 固定提交 [`d06f0331b381af62a38671d9f7bf106a20ffa52b`](https://github.com/gundamff/SaveSmith/blob/d06f0331b381af62a38671d9f7bf106a20ffa52b/docs/games/phantom-blade-zero.en.md)。本轮只读取本机存档，在内存认证、解压和查找明确指定的 actor；没有启动游戏，没有上传存档，没有写回存档，也未把完整解密 JSON 保存到工作目录。

PBZS v3 的具体读取布局如下：

| 层 | 布局 |
| --- | --- |
| outer header | 12 字节：`PBZS` + `<BBHI>`，依次 version=3、flags=1、slotCount:u16、sealedDirectorySize:u32 |
| sealed block | 8 字节 `PBZS\x01\x01\0\0`、nonce[12]、GCM tag[16]、ciphertext；最小 36 字节 |
| authenticated directory | 解密结果的前 12 字节必须与 outer header 完全相同；之后逐 slot row |
| directory row | nameByteLength:u16、UTF-8 name（不含另加的 terminator）、compression:u8、sealedFlag:u8=1、rawSize:u32、relativeOffset:u32、sealedBlockSize:u32 |
| payload block base | outer offset `12+sealedDirectorySize`，再加 row 的 relativeOffset |
| compression | 先认证解密，再按 0=raw、1=zlib、2=Oodle 解压；Oodle 是压缩数据本身，不是前文 Unreal SerializeCompressedNew wrapper |

AES-256-GCM 使用 nonce，AAD=None；许多库需要将源码布局中的 `ciphertext + tag` 重新拼接后调用 AEAD decrypt。也可使用分开的 decrypt_and_verify，必须验证 tag。目录和每个 slot 都独立认证。应检查唯一 slot 名、相邻连续 offset、目录精确消费、整个文件精确消费以及解压后与 rawSize 完全一致；zlib 还需 EOF、无余尾/未消费输入。参考实现设单 slot 64 MiB、文件 256 MiB 的读取上限。[PBZSContainer 实现](https://github.com/qry6868/PBZ-Editor/blob/5fdb13483cefde94e6a2f3dba3d258c84e747582/pbz_editor/core.py#L141)

密钥材料来自本机 PE 的数据区。参考实现定位 UTF-16LE、null-terminated 诊断字符串 `sealed but block is PLAINTEXT`，检查其后 0..15 字节 padding 的相邻 64 字节材料，将两个 32 字节部分逐字节 XOR 得到 AES key；**只能在目录 GCM 认证与 header 副本均通过后接受候选**。必须约束 PE section 范围和候选数，不能把任意字符串邻域命中当成成功。本文不包含密钥、材料字节或用户账号标识。[只读定位与认证](https://github.com/qry6868/PBZ-Editor/blob/5fdb13483cefde94e6a2f3dba3d258c84e747582/pbz_editor/compatibility.py#L66)

物理主文件是 `PBZSaveGame.sav`，AutoSave/ManualSave 等是其内部目录 slot；1RealTime、2Hourly、3Daily 为另行保存的备份目录。必须选主文件并读取 `__Advanced__.LastContinueSlot`，确认它精确指向已有目录 entry；不能按备份 mtime 或 slot 排序猜当前继续位置。[项目格式说明](https://github.com/gundamff/SaveSmith/blob/d06f0331b381af62a38671d9f7bf106a20ffa52b/docs/games/phantom-blade-zero.en.md#save-location-and-slots)、[LastContinueSlot 读取](https://github.com/qry6868/PBZ-Editor/blob/5fdb13483cefde94e6a2f3dba3d258c84e747582/pbz_editor/core.py#L729)

本地目标 actor 在所选有效 slot 的 schema 为：`LevelActorManager["<WorldName>-<ActorName>"].Broken`，值是 JSON bool；**保存字段叫 Broken，不是 UE 命名里的 bBroken**。应将精确 world+actor 身份及存档来源 hash 与几何关联，并验证该类的 broken 状态对应何种碰撞变化，不能全局删掉同名 static mesh 的其他放置。最小只读探针结果保存在忽略目录 `build/physics-research/save-format/selected-vine-state-probe.json`，仅保留来源 hash、slot 标签、明确选定的 actor ID 与该 bool，不包含背包、账号或其他进度数据。

### BP_ThornyVine 的状态到碰撞语义已核对

仅凭名为 Broken 的 bool 不足以删除几何。本轮进一步解码本机 `/Game/RenewalContent/Actors/GameplayBlocker/BP_ThornyVine` 与其 `/AdvancedSpecialMove/BP/Actor/SpecialMoveVolume/BP_GameplayBlocker_Base` 父类的相关 cooked Kismet 指令，建立了具体调用链：

| 函数与 export | 已核对的语义与边界 |
| --- | --- |
| base OnLoadedActorData，33 | 48 字节 stored script / 36 字节 VM script 完整消费；将传入 JSON wrapper 放入 persistent frame，调用 base ubergraph，entry point=599 |
| base ubergraph，10 | VM 599 读取 JSON bool 字段 `Broken`；VM 644 将返回 BoolData 赋给实例 `bBroken`；VM 663 虚调用 `RefreshVisual(bBroken)`；VM 686 跳至 return |
| vine RefreshVisual，12 | 147 字节 stored script / 127 字节 VM script 完整消费；VM 0 的 JumpIfNot 在参数 Broken=false 时跳到 VM 124 return；true 分支隐藏 Vine，并调用 Vine.SetCollisionEnabled(0)、Plane.SetCollisionEnabled(0) |

Vine RefreshVisual 的 export superclass 经 Zen public-export hash 解析，确实指向 base export 39 的 RefreshVisual，排除了把同名普通函数误当 override 的解释。相关 export SHA-256 与解析后的最小指令树在忽略目录 `build/physics-research/save-format/vine-broken-bytecode-proof.json`；没有提交原始游戏脚本或存档正文。这里区分 stored offset 与 VM offset，避免 FieldPath/指针及 FScriptName 序列化宽度不同造成错误跳转定位。

指令语义由引擎自身实现交叉确认：JumpIfNot 只在条件为 false 时跳转；EX_LocalVirtualFunction 使用实例 FindFunctionChecked 进行动态函数查找；ECollisionEnabled::NoCollision 是数值 0，表示没有查询或模拟碰撞。[JumpIfNot](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/CoreUObject/Private/UObject/ScriptCore.cpp#L2599)、[虚调用](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/CoreUObject/Private/UObject/ScriptCore.cpp#L3282)、[opcode 序列化](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/CoreUObject/Public/UObject/ScriptSerialization.h)、[碰撞枚举](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Classes/Engine/EngineTypes.h#L1531)

因此有证据支持的离线规则是：**对这一个已核对的 BP_ThornyVine 类，按 world+actor 身份查到经认证保存的 Broken 严格等于 true 时，将其 Vine 与 Plane 组件标为 NoCollision。** 这不是按路线坐标挖洞，也不是删除所有 SM_Dead_Tree_013 放置，更不能推广成所有类的 Broken=true 都关闭碰撞。未匹配状态、字段缺失或未经核对的其他类应保留原规则并明确审计。存档文件 hash 定义的是该已保存状态快照，不能代表未保存的游戏内即时状态。

### FogDoor 的开闭与战斗状态不能压成静态墙或永久通路

近铃的一处实际行走跨越与静态模型分量断开对应 `BP_FogDoor` 的 SplineMeshComponent。为防止采用过时的提取文本，本轮直接从已安装 `ProjectPBZ-Windows.pak` 重新读取两个 JavaScript member，校验 Pak 索引 SHA-1、读取与解压边界，并与旧提取逐字节比较：

| installed Pak member | 字节数 / SHA-256 |
| --- | --- |
| JavaScript/Level/Actor/Switch/FogDoor.js | 3271 / `d90237aac0da5a1996c2b2fbd72b77571623a81de1ed18fa71ee97e93647e813` |
| JavaScript/Gameplay/AI/MobGroupScript_LinkFogDoor.js | 14373 / `2dad97a65d7e08b5f010f3d43a46b4f44504f6715dd657f8c63558f67d2bb47c` |

二者均与当前 `build/game-extract` 完全相同。这里证明的是本机安装包来源，不替该安装包作原厂发行物认证。只读副本与 provenance 在忽略目录 `build/physics-research/fogdoor-installed/`。

`BP_FogDoor` 的 generated class 自身 40 个 property descriptor 已按类型完整读到边界，确认 bInitiallyPassthrough 为 slot 10、bDesiredState 为 slot 11；这两项既未在 CDO 覆盖，也未在所查 placed actor 覆盖，故该 actor 的默认值是 **false / false**。不能因 bDesiredState=false 就判为已开放：BeginPlay 与 ResetToDefaultState 的分支实际读取 bInitiallyPassthrough。完整证据在 `default-state-proof.json`，包含 class/CDO/placed export hash、字段表与准确目标 actor ID。

本机 cooked Kismet 的完整消费结果：ConstructFogDoor 为 8137 stored / 5553 VM 字节，ubergraph 为 4204 stored / 3160 VM 字节。其物理状态语义为：

| 状态或事件 | 明确行为 |
| --- | --- |
| ConstructFogDoor | 创建两类 spline mesh 后设 Profile_LA_InvisibleWall，并 SetCollisionResponseToChannel(23,2)；本机 channel 23 是 AISight，2 是 Block，并非 Pawn Ignore |
| BeginPlay | 调用 TSBeginPlay；bInitiallyPassthrough=true 时 UpdateAfterOpen，false 时激活雾效；不能据此推导“默认关闭外观但玩家可穿” |
| ResetToDefaultState | bInitiallyPassthrough=false 进入 UpdateAfterClose；true 进入 UpdateAfterOpen |
| Close By Mob Script | bInitiallyPassthrough=false，随后 UpdateAfterClose |
| UpdateAfterClose | 遍历 K2_GetComponentsByClass(SplineMeshComponent)，设 Profile_LA_InvisibleWall，再播放显现动画 |
| OpenByMobScript | bInitiallyPassthrough=true，触发保存 Open 字段，再调用 UpdateAfterOpen |
| UpdateAfterOpen | 播放 FogDisappearAnim 并停止 FogShowAnim；**不是立即关闭碰撞** |
| FogDisappearAnim Finished | entry 3123 进入循环；VM 3029 对全部 SplineMeshComponent 调用 SetCollisionProfileName(NoCollision,true)，然后停用雾效 |
| OnLoadedActorData | 读取 JSON `Open` bool，赋给 bInitiallyPassthrough，然后按该值刷新 |

完整类函数中没有找到给 Pawn 设置 Ignore，或 SetActorEnableCollision 的调用；两次 SetCollisionResponseToChannel 均在构造器且参数为 AISight/Block。NoCollision profile 与 InvisibleWall 的区别必须在组件状态层保留，不能仅看雾是否可见。相关节点树在 `bytecode-graph-proof.json`、`construction-bytecode-proof.json`、`wrappers-proof.json`。

installed MobGroupScript_LinkFogDoor.js 的 OffCombat/Clear handler 对各自 door 数组设置 bDesiredState=false 并调用 OpenByMobScript；InCombat handler 调用 Close By Mob Script。其 Blueprint graph 也已完整解析（5737 stored / 4101 VM）：OnGroupOffCombat 绑定对应 handler；OnGroupDeactivated 路径还直接调用 OffCombat handler。因此**已知处于该控制器相应列表、并发生 off-combat/deactivated/clear 事件的门**有开放语义，而不是整个 FogDoor 类无条件开放。

对明确目标 `BP_FogDoor_C_UAID_60CF848217CA978002_1366641873` 的最初审计，根关卡九个 LinkFogDoor script 的 32 个对象数组引用均未匹配；当时按 bounds 选取的 856 个 cell 没有额外同名 script instance。随后发现缺少 ContentBounds 的 cell 仍可能有有效内容，已补做下一节所述审计：又找到 26 个 script、84 个引用，依然没有目标匹配。该结果不是全世界不存在外部控制器的证明，也不是该门永远关闭的证明；它表示**已检查的 35 个 script / 116 个引用没有建立这个具体门的 off-combat 控制器关联**。准确目标与引用列表在 `target-fogdoor-link-proof.json` 和 `unbounded-target-link-proof.json`。不要混用另一处 ThornyVine 的 actor ID。

可采用的状态模型至少应区分 closed、opening、open、unknown。closed/unknown 不能因路线需要而删除；已确认 open 且动画完成的状态可关闭相应 spline 碰撞，后续战斗关闭必须能重新生效。历史行走记录能证明门在采样时可穿，不能代替当前保存状态或未来战斗状态。若构建明确的“门已开放”场景，应将该假设写入场景来源，而不是称作从默认资产或缺失存档记录推导出的永久通路。

#### 显式 saved Open=true 的闭合恢复路径

对远处尚未加载的门，可将经认证的 `Open === true` 作为**加载后将恢复开放**的计划状态；不能将缺失记录当作 true。原始已安装 Blueprint 的函数 hash 已重新核对：

| export / 函数 | SHA-256 |
| --- | --- |
| 12 OnLoadedActorData，137 字节 | `dde896457b4bdc64b49ad9a9aab0bd71afa2421e644db53053d3ca8a4038227d` |
| 6 ExecuteUbergraph_BP_FogDoor，6643 字节 | `0aaa6d776a612a4780ea722d776023922e45565a532e1c366631e67dcff08a74` |
| 20 UpdateAfterOpen，52 字节 | `312312f308e1d643f8a0070e341e7fcbdd00862a43a2c8f48209d6d65881a10c` |
| 7 FogDisappearAnim__FinishedFunc，52 字节 | `eb58c5008af61ac8c5dd901a0fd8005402d7f9dd93eae5dcefce3ae5a8b1618c` |

OnLoadedActorData wrapper 完整消费 48 stored / 36 VM 字节：传入 wrapper 后调用 graph entry1748；graph TryGetBoolField("Open") 后在 VM1791 赋 bInitiallyPassthrough，VM1810 跳转 VM30，true 分支 VM44 调用 UpdateAfterOpen。BeginPlay 的 initial-pass-through=true 分支也调用同一函数。UpdateAfterOpen **本体仅是 wrapper**，进入 VM1640 后播放 FogDisappearAnim 并停止 FogShowAnim，没有直接关闭碰撞。

动画完成回调的关联也已从实际 TimelineTemplate 核验：export37 `FogDisappearAnim_Template` 保存的 FinishedFunctionName 正是 `FogDisappearAnim__FinishedFunc`，不是仅凭相似函数名推断；模板时长为名义 1 秒。引擎使用该字段 `BindUFunction` 后调用 `SetTimelineFinishedFunc`。[引擎完成委托绑定](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/BlueprintGeneratedClass.cpp#L1794)

Finished wrapper 进入 VM3123 → VM3084 初始化遍历；K2_GetComponentsByClass 的参数明确为 SplineMeshComponent，VM3029 为每项设置 NoCollision profile。故 saved Open=true 的恢复语义有闭合字节码及委托证据，但存在动画过渡。**门已加载后始终以实际组件碰撞为准**，尤其是恢复动画尚未结束或战斗重新关门时。相关最小指令链、hash 和模板绑定保存在 `saved-open-collision-rule-proof.json`，不依赖特定 actor ID 全局删门。

### 缺失 ContentBounds 的 cell 不能在覆盖审计中略去

原区域索引报告 25 个 WorldPartitionRuntimeCellDataHashSet 缺少 ContentBounds。本轮逐个解析其 outer cell UID，并在安装包索引查找对应 `_Generated_/<UID>.umap`，**21 个包存在，4 个未索引到**。这些不是可以统一当作空 cell 的条目：21 包中共有 2360 个 BodySetup、787 个 DynamicMesh、1540 个 SplineMeshComponent、557 个 StaticMeshComponent、53 个 ISM、2 个 FastGeoContainer、142 个 MobGroup。应保守加入候选，再根据实际组件世界 bounds、profile 和状态筛选；缺少上层空间 bounds 不等于没有碰撞。

其中 0PMY20VK9CFFXG8MDIWUYDCKG、9MNPQBUK8GIWDIWOAMGM1EYTR、CVIY43F7XO1UQVBR8G2AJISPY 分别含 6、19、1 个额外 LinkFogDoor script。它们的 84 个对象数组引用里，78 个可解析为本地 actor，6 个为显式 null；没有导向所查目标 FogDoor 的 import 或 soft-reference。完整包清单、class counts、原始引用解释在 `build/physics-research/fogdoor-installed/unbounded-cells-probe.json`。这修正了最初仅检查 856 个有 bounds 的 cell 的覆盖范围；不能沿用先前较窄范围来声称已穷尽全部 controller。

最初未找到 generated package 的四个 UID，随后已通过类型化属性和全表对账解决：31C0JUDO2WKFJ2P0XDQ7PDVO5、8OU46Y9YLPYKP9VU15I3LP6SP、BK1S1LEBPJCLB497VLNYKTAYO、CGWXBY3FR97UQ75R7XU227TNE **正好是仅有的四个 bIsAlwaysLoaded=true、LevelStreaming=null 的 cell**，不是四个遗失的 streamed package。它们各自 47 字节 payload 的 fields=[1,9,10,12]，按本机 UHT schema 解释为 AlwaysLoaded=true、CellDebugColor、CellGuid、RuntimeCellData；全部精确消费，并验证 RuntimeCellData 指向正确 class 且 outer 回指当前 cell。leaf slot 0 是 LevelStreaming，未覆盖时继承 native constructor 的 nullptr。

全局一一对应也已验证：32,822 个 RuntimeLevelStreamingCell 中，32,818 个具有非空 LevelStreaming 引用；这些引用唯一且恰好覆盖 root 的全部 32,818 个 WorldPartitionLevelStreamingDynamic export；它们的 UID 集合与安装包索引中 32,818 个 generated package UID 集合完全一致，所有 chunk 都在主 IoStore lookup 中。结果是 **missing streamed package=0、unaccounted cell=0**，不需要为了这四项猜测另一个 optional container。该结论仅解决包/流送对象覆盖，不自动证明每种碰撞类型的解码与过滤均正确。

引擎 cook 路径解释了实际布局：OnPrepareGeneratorPackageForCook 只处理 always-loaded cell，将其 actor package 内容移入 `OuterWorld->PersistentLevel`，随后清空 cell 的 Packages；生成独立 cell package 的路径明确要求 `!IsAlwaysLoaded()`。因此四项应记为 **accounted-by-persistent-level**，前提是碰撞提取确实包含 root PersistentLevel；不能只是从失败列表中删除四个 UID。依据包括 [always-loaded actor 移入 PersistentLevel](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/WorldPartition/WorldPartitionRuntimeLevelStreamingCell.cpp#L418)、[独立生成包条件](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/WorldPartition/WorldPartitionRuntimeLevelStreamingCell.cpp#L539)、[runtime null-streaming always-loaded 处理](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/WorldPartition/WorldPartitionRuntimeLevelStreamingCell.cpp#L632)。本地证明文件 `always-loaded-cell-accounting-proof.json` 记录 root SHA、四个 cell payload SHA、类型化解析结果和全部对账计数。

这也区分了两种“无 bounds”：21 个实际上有独立 package 的 cell 仍应纳入候选；四个没有独立 package 的 always-loaded cell 则由 PersistentLevel 承载。不能以同一个空 bounds 条件跳过两者，实际 data-layer 状态也仍须另行处理。

本机 UHT 恢复的 **UWorldPartitionRuntimeCell 基类 12 个 own slot 顺序**如下，可直接写入工具 schema，而不依赖 build 下的探针结果文件。derived UWorldPartitionRuntimeLevelStreamingCell 先有一个 LevelStreaming:kind82/objectRef:i32，再接此表，故 derived slot=base slot+1。

| base slot | 名称 | kind / wire |
| --- | --- | --- |
| 0 | bIsAlwaysLoaded | 76 / 属性 bool:u8 |
| 1 | bIsSpatiallyLoaded | 76 / 属性 bool:u8 |
| 2 | DataLayers | 25 / FDataLayerInstanceNames struct |
| 3 | bClientOnlyVisible | 76 / 属性 bool:u8 |
| 4 | bIsHLOD | 76 / 属性 bool:u8 |
| 5 | bIsCustomHLODPlaceholderCell | 76 / 属性 bool:u8 |
| 6 | bBlockOnSlowLoading | 76 / 属性 bool:u8 |
| 7 | ContentBundleID | 25 / Guid16 |
| 8 | CellDebugColor | 25 / 4*f32 |
| 9 | CellGuid | 25 / Guid16 |
| 10 | SourceCellGuid | 25 / Guid16 |
| 11 | RuntimeCellData | 82 / objectRef:i32 |

### CineCamera 附件父节点的实际 schema

新增的两个 DynamicMesh 附件解析缺口指向 cell `3B8Z0216UQATIW4LYRB1G9YQO` export 379 `CineCamera`，owner 为 BP_AppearancePreviewPoint。其继承链是 **CineCameraComponent → CameraComponent → SceneComponent**，没有 PrimitiveComponent 层；不能减去 114 个 Primitive slot。游戏 UHT 表提供 CineCamera 的 19 个 own property、Camera 的 26 个 own property，因此 Scene offset=45、ActorComponent offset=74。

按主任务授权，已在 [offline-native-serialization-schema.json](../authoring/offline-native-serialization-schema.json) 仅追加相应 key：`cineCamera` 为 45 条 `{name,kind}`；`cameraLens` 为 7 条；`cameraFocus` 为 6 条；`cameraPostProcess` 为含静态数组展开的 597 条。结构声明可与 [CineCameraComponent.h](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/CinematicCamera/Public/CineCameraComponent.h)、[CameraComponent.h](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Classes/Camera/CameraComponent.h) 对照；实际顺序以本游戏 UHT 为准，其中还有游戏自己的 delegate/ExposureMethod 字段。

placed camera 只有 29 字节：fields=[7,46,71,77,78,86]、zeros={71,77}。header 结束 offset 11；slot7 是 **CurrentFocusDistance:f32=1.5**，不是 slot6 的 CurrentAperture；slot46 AttachParent:i32=757，指向 export756 Root；slot71 Mobility=zero，slot77 UCSSerializationIndex=zero；slot78 bNetAddressable:u8=1、slot86 CreationMethod:u8=1；最后 UObject hasGuid=false 与 UCSModifiedProperties count=0，精确消费到 29。

只支持 placed 的 slot7 仍不够，因为它继承 `/Game/PBZContent/Blueprint/System/BP_AppearancePreviewPoint` export6 的 camera 模板。模板 244 字节，fields=[2,3,6,30,31,44,50,51]、zeros={6,30}，已完整解析：

| 模板 offset | 数据 |
| --- | --- |
| 11..14 | LensSettings unversioned header，fields=[2] 且该项 zero；MinFStop=0，无 scalar 数据 |
| 14..21 | FocusSettings header fields=[0,1]，FocusMethod:u8=2，ManualFocusDistance:f32=320 |
| 21 | bConstrainAspectRatio:u8=0 |
| 22..65 | PostProcessSettings header；102 个 present fields，其中 3 个 zero |
| 65..156 | 91 个实际选中、由 UHT 确认为 kind12 的 override bool，各 u8 |
| 156..188 | 7 个 f32 与 1 个 objectRef:i32；准确字段见下一段 |
| 188..212 | Scene.RelativeLocation:3d=(376.485056,-71.215961,114.343660) |
| 212..236 | Scene.RelativeRotation:3d=(-10.198993,-189.999999,约0) |
| 236..244 | hasGuid=false、UCSModifiedProperties count=0 |

该 PP 的非布尔实际字段为：329 FilmSlope:f32、330 FilmToe:f32、332 FilmBlackClip:f32、411 AutoExposureBiasCurve:objectRef、425 LocalExposureShadowContrastScale:f32、430 LocalExposureDetailStrength:f32、462 AmbientOcclusionIntensity:f32、464 AmbientOcclusionRadius:f32。零项为 415、416、436。应按 header 与绑定 schema 读取，遇到未支持 struct 等类型明确失败，不应固定跳过 123 字节。

Lens own 顺序为 MinFocalLength、MaxFocalLength、MinFStop、MaxFStop、MinimumFocusDistance、SqueezeFactor（均 kind10/f32）、DiaphragmBladeCount（kind3/i32）。Focus own 顺序为 FocusMethod（kind30/u8）、ManualFocusDistance（kind10/f32）、TrackingFocusSettings（kind25/struct）、bSmoothFocusChanges（kind12/u8）、FocusSmoothingInterpSpeed、FocusOffset（均 kind10/f32）；本例没有序列化 TrackingFocusSettings。

当前 camera 模板链只有 placed379 → template6 → native CDO。其 Root 已有世界位置 (-162409.542,95231.798,-3998.569)，组合后的 camera 原点约 (-162033.057,95160.582,-3884.226)；这些坐标仍应交给实际几何 bounds 筛选，而非按“预览 actor”名字略去。完整字段值、偏移、payload SHA 与精确末尾校验在 `build/physics-research/cinecamera-template-chain-probe.json` 和 `cinecamera-template-decoded-proof.json`。


## 完整旁镇：cell / data-layer 完整消费审计（2026-11-15）

`tools/audit-offline-world-semantics.py` 对相同hash的完整world root执行了额外只读审计，输出在私有`build/offline-navigation/worlds/pbz_pangzhen_wp/cell-semantics.json`。32,822个RuntimeLevelStreamingCell和17个DataLayerInstanceWithAsset全部精确消费到payload末尾；failure=0，cell引用的layer名全部能对应root实例。15,225个cell的HLOD标志为真，21,808个有非空DataLayers。四个AlwaysLoaded仍由PersistentLevel承载。

本机UHT描述确认FDataLayerInstanceNames的序列化顺序为`bIsFirstDataLayerExternal:u8`和`DataLayers:Array<FName>`，数组内的inner descriptor不另占unversioned slot。遵守struct自己的header与zero mask，再按root name table解析FName。与固定源码的[DataLayerInstanceNames声明](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Public/WorldPartition/DataLayer/DataLayerInstanceNames.h)一致，实际布局结论同时受全表边界验证约束。

PBZ的DataLayerInstanceWithAsset cooked slot为：0 DataLayerAsset/objectRef，1 InitialRuntimeState/u8，2 Parent/objectRef，3 Children/Array<objectRef>。游戏UHT另含ShortName，但其editor-only字段不进入cooked slot。17个实例的实际present fields只使用0/1/2；它们的asset和parent全部解析并记录。状态值0/1/2分别为Unloaded/Loaded/Activated；没有序列化InitialRuntimeState的实例按[构造器默认Unloaded](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/WorldPartition/DataLayer/DataLayerInstance.cpp)记录初始值，并明确标记该值并非live状态。

main_la初始Activated，引用它的cell为21,373个；main_logic为575个。其余包括初始Unloaded的LD、剧情、远景和厂商演示layer，不能仅因初始关闭就从整个游戏模型删除，也不能把全部几何的并集当成任何时刻的真实场景。当前几何提取完整保留所有包，实验图块尚未应用激活条件；运行时剧情切换/父层传播仍是单独的语义缺口。HLOD虽然已恢复标志，碰撞仍须依据各组件实际gate，不能由HLOD名称一概剔除或放行。


### 完整世界新增的 LandscapeSplines 附件

全包扫描在cell `BYPC6DM3FOP6Z742EB33ALI9X`发现48个SplineMeshComponent的父变换未支持，不能略去这些道路。两父节点export69/70为LandscapeSplinesComponent。本机UHT精确给出三个cooked数组：ControlPoints、Segments、CookedForeignMeshComponents（inner descriptor不占slot），与固定[引擎类声明](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Landscape/Classes/LandscapeSplinesComponent.h)中的PrimitiveComponent继承关系一致。三项own slot之后为114个Primitive slot，因此Scene offset=117，RelativeLocation为slot122。

两个placed payload分别144/88字节，fields均为[0,1,122]；前两数组count为13/12和6/5。解析后分别停在136/80，余下8字节精确为UObject无GUID与空UCS修改数组。实际父世界位置为(-179064.816,-2789.926,807.089)及(-179064.816,-1449.350,973.528)厘米。包SHA为`11eeed871fcd5824a9ded594cfa198c2f99c9bf995fc4fe2a7be1991431a5096`，完整私有证明在world构建目录的`landscape-splines-proof.json`；新增真实包回归检查了世界放置、数组数与末尾边界。提取器重建受影响包，而非给旧失败记录改成成功。


### 全包最后九个 Heightfield 的自身变换

完整旁镇最终扫描到cell `D2A3ECYNYDGG1H303H1NLBDUL` export9—17的LandscapeHeightfieldCollisionComponent额外保存Scene.RelativeLocation/RelativeScale3D。该类11个own slot加114个Primitive slot，Scene offset=125，因此slot130/132为3d位移/缩放。先前只读AttachParent会报错；不能只跳过字段后继续用父变换，那会把该组地形移错126米。

已按原schema恢复location/rotation/scale，并仅在实际有自身变换时将其加入FTransform链。export9的location=(126,0,0)，scale=(1,1,0.9999999999999999)，Heightfield为127×127、31,752三角形；全部9项新增285,768三角形。真实包回归同时验证原生高度场完整消费和自身变换值。修复后完整32,819包的已记录解析错误清零，但游戏规则覆盖结论不变。
