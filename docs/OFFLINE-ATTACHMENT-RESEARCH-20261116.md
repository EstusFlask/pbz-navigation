# 五世界附件挂点：类型化绑定与参考姿态重建

2026-11-16；研究技能的独立后台任务。仅只读读取安装包与本机 PE 数据，探针和缓存写入 `build/attachment-research-20261116/`。没有访问或修改存档，没有安装、启动或上传，没有修改生产 Python/JS、世界 receipt 或发行包。

**27 个附件失败现在都能恢复确切的“源 mesh 参考姿态下的世界变换”；其中没有一个是真正的 StaticMeshSocket。27 个均经过 SkeletalMeshComponent 的骨骼挂接。类型化绑定与字节边界已闭合，当前游戏姿态和实际可通行状态尚未闭合。** 不能把此次参考姿态解码称为实机闭门状态，也不能删除这些组件或退回父原点。离线重建可以明确标注参考几何，实际状态仍须独立处理。

## 账本与绑定结论

直接读取五份 `coverage.json` 的 `Socket attachment` 项，共 27 项、12 个 actor：

| 世界 | 项数 | 放置类型 |
| --- | ---: | --- |
| 悲泣溪谷 `pbz_xigu_wp` | 3 | 一个 MainFrame 门的门叶与面具 |
| 正道大营 `pbz_zhengdaodaying_wp` | 4 | 一个 MainFrame 门的三件附件、一个 CageDevice 钥匙 |
| 戏梦山庄 `pbz_ximeng_wp` | 6 | 两个 MainFrame 门的门叶与面具 |
| 后街 `pbz_houjie_wp` | 9 | MainFrame 三件、Snake 三把钥匙、Snake 门叶的两个 Box、Snake_root 的 Sphere |
| 枷笼山 `pbz_dengdingshandao_wp` | 5 | 五个 CageDevice 钥匙 |

完整 package/export、owner 身份、继承后的属性、引用来源在 [attachment-lineage.json](../build/attachment-research-20261116/attachment-lineage.json) 与 [lifecycle-inventory.json](../build/attachment-research-20261116/lifecycle-inventory.json)。`Assets.resolve_global` 按 imported package 与 public export hash 唯一绑定；继承属性中的 object reference 必须在**实际声明该属性的模板包**解释，不能拿子包的 import 表解释继承值。

| 真实 parent mesh | 对应 Skeleton | 附件名的真实种类 |
| --- | --- | --- |
| `SafeDoor_MainFrame` | `SafeDoor_MainFrame_Skeleton` | `door_l`=bone 1；`door_r`=bone 6；`mask_pt`=bone 7，父为 bone 6 |
| `SafeDoor_MainFrameSnake` | `SafeDoor_MainFrameSnake_Skeleton` | `door_l`=bone 1；`door_r`=bone 2；`Snake_root`=bone 3，父为 bone 2；`keypt04_01/02/03`=bones 5/6/7，父均为 bone 3 |
| `CageDevice_PowerSet` | `CageDevice_PowerSet_Skeleton` | `pt_KeyPoint` 对应 `Pt_KeyPoint` bone 7，父为 bone 5；FName 比较忽略大小写 |

`CageDevice_Key` 是真正的 StaticMesh，但其 `StaticKey` 组件挂在 skeletal parent 的骨骼上。它不是静态 mesh socket。MainFrame 的 Skeleton 确有 `KeyPt04` socket，绑定 `KeyPt01`；那与 Snake 的 `keypt04_01/02/03` 三根骨骼是不同对象，不能按名字前缀混用。三个 mesh 的 `Sockets` 均无序列化覆盖；Skeleton 的实际 socket 引用也已逐个解析并验证 class=`SkeletalMeshSocket`、payload 精确消费。详见 [typed-bindings.json](../build/attachment-research-20261116/typed-bindings.json)。

引擎先查命名 socket，再查 bone；骨骼必须使用完整父链及当前 component-space pose。找不到名称时引擎有返回组件变换的回退，但离线工具应明确失败，避免把缺失挂点放到父原点。参见 [USkinnedMeshComponent::GetSocketTransform 源码](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Components/SkinnedMeshComponent.cpp#L3221) 与 [Epic API](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/Components/USkinnedMeshComponent/GetSocketTransform?application_version=5.5)。

## 已证明的解码入口

最小 schema 为 [minimal-native-prefix-schema.json](../build/attachment-research-20261116/minimal-native-prefix-schema.json)，20,229 字节；包含 mesh 的 35 个 slot、递归 struct/array/optional 类型、AnimationData 的五个字段及 native 序列化例外。实现探针为 [typed.py](../build/attachment-research-20261116/typed.py)、[mesh_probe.py](../build/attachment-research-20261116/mesh_probe.py) 与 [binding_probe.py](../build/attachment-research-20261116/binding_probe.py)。

关键不是扫描浮点数或搜索骨骼名称：`Metadata` 读本机 UHT property descriptors；struct 类型通过 `Z_Construct_UScriptStruct` 的确定 `lea` 指令定位 `FStructParams`，验证 Name、PropertyArray、NumProperties，继续解析 `SuperFunc`。源码布局见 [FStructParams / FPropertyParams](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/CoreUObject/Public/UObject/UObjectGlobals.h#L4025)。本机具体 schema 优先于外部引擎版本的声明；外部源码用来解释 serializer，不能替代本机字段表。

`SourceModels` 的元素是 `FSkeletalMeshSourceModel`，有七个 own slot，继承 `FSkeletalMeshLODInfo` 的二十个 slot。只按后者解析会错位。own 字段为 `TriangleCount`、`VertexCount`、`Bounds`、`CachedSkinWeightProfileNames`、`CachedMorphTargetNames`、`CachedHasVertexColors`、`CachedVertexColorGuid`。本机 UHT struct constructor 与父 constructor 均已记录在 `typed-struct-schemas.json`。Optional 的 present flag 是 **i32 boolean**，随后才是内部 bool；不能只读一个字节。`Bounds.SphereRadius` 的 kind 32 为 LWC real，本批为 f64。

`AnimationData` 是 `FSingleAnimationPlayData`：slot 0 `AnimToPlay:i32/objectRef`，1 `bSavedLooping:u8`，2 `bSavedPlaying:u8`，3 `SavedPosition:f32`，4 `SavedPlayRate:f32`。CageDevice 模板仅覆盖 slot 2 为零。源码明确这些是初始化设置，不能当作当前播放状态。见 [SingleAnimationPlayData.h](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Public/SingleAnimationPlayData.h)。

mesh 属性解析后顺序读取：UObject GUID flag（本批 0）→ strip flags（本批 `[5,0]`）→ ImportedBounds `7*f64` → native FSkeletalMaterial 数组 → native FReferenceSkeleton。材料数组每项按 object reference、FName、ImportedMaterialSlotName flag、UV 两个 i32 bool、四个 f32 density、overlay object reference 读取；本批 imported flag 均为 false。参见 [USkeletalMesh::Serialize](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/SkeletalMesh.cpp#L1759)、[材料 serializer](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/SkinnedAssetCommon.cpp#L268)。

`SamplingInfo.BuiltData.WholeMeshBuiltData` 不是空 UHT struct，而是 native sampler：`Array<f32> Prob`、`Array<i32> Alias`、`f32 TotalWeight`。本批三个 mesh 的五个 LOD sampler 均为空数组/零权重。参见 [SkeletalMeshSampling.cpp](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/SkeletalMeshSampling.cpp#L103)、[WeightedRandomSampler.cpp](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/WeightedRandomSampler.cpp#L83)。

FReferenceSkeleton 按 `RawRefBoneInfo:Array<FName,i32 parent>`、`RawRefBonePose:Array<4d quaternion,3d translation,3d scale>`、`RawNameToIndexMap:Array<FName,i32>` 读取。验证根 parent=-1、其余 parent 在前、bone/pose/map 数量相同、map 每项准确回指对应骨骼；下一个 native 字段全部为 cooked=1、LOD count=5。源码见 [ReferenceSkeleton serializer](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Animation/ReferenceSkeleton.cpp#L909)。没有解析后续 render LOD，不能声称整个 SkeletalMesh payload 已消费。

| mesh | 属性末尾/原生开始 | reference skeleton 范围（payload 字节） | bones | materials |
| --- | ---: | --- | ---: | ---: |
| MainFrame | 970 | 1124..8520 | 71 | 2 |
| MainFrameSnake | 964 | 1074..6494 | 52 | 1 |
| CageDevice_PowerSet | 962 | 1204..2672 | 14 | 4 |

这里 mesh→Skeleton 是真实 slot 1 `Skeleton` object reference 的解析结果，不再是从相似名称推断。mesh 自己的 reference skeleton 已直接取得，因此不再需要假定 USkeleton 的参考姿态与 mesh 相同。

## 生命周期：已经证实什么，尚未证实什么

[bytecode_probe.py](../build/attachment-research-20261116/bytecode_probe.py) 已完整解析三个 actor BP 和两个 AnimBP 的所有 Function 脚本，stored bytes 与 VM bytes 均精确匹配，无 opcode 未支持项。脚本入口使用唯一结构约束的 count pair：脚本后固定 12 字节尾，最后 opcode 为 EndOfScript，再要求整个 token 流与声明内存尺寸一致；这不是完整 UFunction property-descriptor 前缀解析。逐节点证据在 [lifecycle-bytecode.json](../build/attachment-research-20261116/lifecycle-bytecode.json)，简读在 `lifecycle-readable.txt`。VM token 格式依据 [ScriptSerialization.h](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/CoreUObject/Private/UObject/ScriptSerialization.h)。

- **MainFrame**：`ReceiveBeginPlay` wrapper 进入 graph VM3711；调用父 BeginPlay，VM3866 检查 `IsOpen`。true 在 VM3880 调 `SnapshotPoseAndDisableTick(SafeDoor_Main, SafeDoor_MainFrame_OpenState, 0.0)`，随后设置 `IsOpenFinished=true`。false 到 VM4011，缩放 KeyIn 为零并设 `IsOpenFinished=false`。这条 false 分支没有指定闭门动画。`OnLoadedActorData` 入口 VM4889/4953 读取保存字段 **IsOpen、IsHideKey**；开门动作 VM5862 播放 `Anim_Phase_OpenDoor`，VM5819 可播放 `Anim_Phase_Talk`。
- **Snake**：组件显式绑定 `ABP_SnakeDoor`。BeginPlay wrapper 进入 VM7027，经父 BeginPlay、隐藏 KeyIn、DebugCheckKey，再到 VM6427。`IsOpen=true` 在 VM6441 snapshot `SnakeDoor_KeyAnime` 的 **24.299999237 秒**，再更新钥匙状态与 tick；false 到 VM6555，同样更新状态。保存恢复 VM8270 起读取 **IsOpen、HasKey1、HasKey2、HasKey3**。开门/插钥匙另有 montage、notify 和延时分支。reference pose 不等于保存的 opened pose，也未证明等于其动画图的当前 closed pose。
- **CageDevice**：组件显式绑定 `CageDevice_PowerSet_Skeleton_AnimBlueprint`。Construction 调父 Construction、`ResolveCageAssets`；BeginPlay VM1430 调父 BeginPlay、ResolveCageAssets，然后建立 lift 事件绑定。PlayLoopAnim VM1479 获取 BaseSkeletalMesh 的 AnimInstance，VM1521 播放 `LoopMontage`；StopAnim 从 VM1732 停 montage。仅 `bSavedPlaying=false` 不能阻止 AnimBP、montage 或父 actor 后续改变姿态。

MainFrame 本批继承后的组件没有 serialized AnimClass/AnimationData 覆盖，与“原生初始化时可能使用 reference pose”一致；这仍是**附条件推论**，不是已证明的 live closed pose。未完成全部父 BP/本机 native `SnapshotPoseAndDisableTick` 实现、Actor CDO/placed 自定义属性及 AnimGraph pose 的求值，故三个家族均不得写 `closedPoseVerified:true`。引擎也明确初始化可 ResetToRefPose，后续动画会更新当前骨骼；参见 [InitAnim](https://github.com/katataki/UES5.6/blob/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Engine/Private/Components/SkeletalMeshComponent.cpp#L1115)。

## 可实施的重建与状态策略

1. 解码本机 mesh reference skeleton 与 typed sockets，在完整骨骼父链后插入挂点变换，继续原有组件/actor 链、absolute flags、镜像/非均匀 scale 合成。不能跳到 bone 的父原点，也不能只用 bone 的 local translation。27 个输出 q/t/scale 在 [reference-placements.json](../build/attachment-research-20261116/reference-placements.json)，由 [placement_probe.py](../build/attachment-research-20261116/placement_probe.py) 产生。
2. 这些真实 StaticMesh/shape 的 authored reference geometry 可重建并进入**明确标注参考姿态的离线基线**。每个 source 保留 actor ID、component、mesh/skeleton/package hashes、bone 名称与 index、`posePolicy=source-mesh-reference-pose`、`dynamicPoseUnknown=true`。不能称 live 精确几何、不能根据 `IsOpen` 猜测关碰撞，也不能为了通过世界构建而省略来源。
3. 参考姿态下保留阻挡，禁止这些不确定移动组件提供可走支撑面。**这只能防止把门/钥匙烘焙成地板，不能单独证明动态障碍安全**：移动后的障碍可能处于参考几何之外。权威离线路线若会依赖其占用区，须有经数据证明的全姿态保守占用包络或保持未验证区域受限；没有包络就不能把参考 mesh bounds 冒充 swept bounds。显示路线继续依赖当前加载碰撞/地面/胶囊检查的已确认前缀。
4. 状态适配应按准确 actor 身份工作。MainFrame 与 Snake 的保存字段是 `IsOpen`，不能复用 FogDoor 的 `Open` 规则。开放状态仍需真实碰撞优先；保存为 true 时播放/冻结特定动画的事实，不等于可以直接删除所有附件。打开/关闭/钥匙可见性、tick 禁用与碰撞启用分别记账。

本研究可以将“缺少类型化挂点 transform”转成“参考几何已恢复、动态状态待验证”的显式语义账本；是否允许该基线世界进入开发快照由主任务实施并回归，不能把本研究的 27 个成功 transform 记成全图实际验收。

## 复现与输入身份

从仓库根目录依次运行，输出全部位于同一私有研究目录：

```powershell
py -3.12 build/attachment-research-20261116/schema_probe.py
py -3.12 build/attachment-research-20261116/probe.py
py -3.12 build/attachment-research-20261116/mesh_probe.py
py -3.12 build/attachment-research-20261116/binding_probe.py
py -3.12 build/attachment-research-20261116/placement_probe.py
py -3.12 build/attachment-research-20261116/lifecycle_probe.py
py -3.12 build/attachment-research-20261116/bytecode_probe.py
py -3.12 build/attachment-research-20261116/minimal_schema.py
py -3.12 build/attachment-research-20261116/provenance.py
```

`probe.py` 首次冻结附件失败清单，后续从 `frozen-attachment-failures.json` 重放，避免主任务修复 coverage 后丢失原始 27 个验算对象。`minimal_schema.py` 重跑三个 mesh 的 native-prefix 对照并导出最小 schema。完整输入/探针/已下载源码 hash 在 [provenance.json](../build/attachment-research-20261116/provenance.json)，包含本机 PE（`4415933ce33476f14c837abb61a1b60af8b78cd81783896501913a7aac69e423`）、UTOC（`d5c3764cdae2030361a7fa8ed1eb204787c77e767df92bbe947763b4a2d0186b`）、每个使用的解包 package、tools/schema 输入与私有脚本。以下为核心 package 的 SHA256：

| 输入 | SHA256 |
| --- | --- |
| MainFrame mesh | `b5b3ba4c626c6de0cfabe0ac95a260149cf8e56e4fd4fadb55969bf5f07869c6` |
| MainFrame Skeleton | `baeeacb6d0baa69fd3eaa6745563c4b31d4ecd81424694d7713f46ec68189e17` |
| MainFrameSnake mesh | `fc61ef3a6bcb6e85942c1a96ea85ec9e8de55d0553f43ef8c609623d5bf6d4f6` |
| MainFrameSnake Skeleton | `ab815d0cba3e215f0a7d4d01ef3512263c3ceb71f501e0ae03042681be8a4224` |
| CageDevice_PowerSet mesh | `6272619ba68881c4d23644b3be7ed85acf17fb204db9c666aef3053f8f1efc4c` |
| CageDevice_PowerSet Skeleton | `218dbf15d976204cfc0c202fe2361db8580f0fa9e7cc554fd07b85a558fb50fb` |
| MainFrame actor BP | `dbdcdf1019449b4032dcf85632b2313d201968b9d275629bec30e09e073da75e` |
| Snake actor BP | `c452e3159a482abdfb085cc450590bb32fbb58301615ec44ce2ccca65b707ea1` |
| CageDevice actor BP | `59efc43eedba3ca24ef76fdb02263e9f686fc5b8c746b466d72a605ba91c5ca0` |

离线结构/参考变换已验证；mock 集成与实际游戏验收均未执行。`completeCollisionClaim:false`、`physicalVerified:false` 保持。
