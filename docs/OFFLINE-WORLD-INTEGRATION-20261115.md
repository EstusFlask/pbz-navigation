# 多世界重建与分页 Mod 接线

日期为用户时区 America/Tijuana 的 2026-11-15。延续 `codex/recast-routing-193` 原工作树及全部既有未提交改动；没有安装、启动游戏、上传或写游戏目录/存档。

上轮只执行了“先完整庞镇，再其他世界”的第一阶段，未完成其他世界或全镇数据的发行接线。本轮已经实际执行全部 11 个 PBZ 世界的首轮提取，并推进普通步行的开发接线；不能称为全图可用或实机验收完成。

## 本批实际结果

11 世界共 80,956 包，清单对账失败 0。已提取几何 485,975,107 个三角形；每世界均有独立包/mesh/source-range 校验，已知输出几何校验失败 0。**另有 60 项碰撞解析缺口，不能与已知输出几何校验混为一谈。**

| 世界 | 包 | 空间图块 | 当前解析缺口 |
| --- | ---: | ---: | --- |
| 庞镇 / 梅谷湖 `pbz_pangzhen_wp` | 32,819 | 58,867 | 0 |
| 序章 `pbz_wp_zhulinguwu` | 8,635 | 16,650 | 0 |
| 序章另一版本 `pbz_wp_zhulinguwu_be` | 443 | 185 | 0 |
| 血色森林 `pbz_fujizhilin_wp` | 7,497 | 6,345 | 0 |
| 幻术世界 `pbz_huanshuyiji2_wp` | 1,396 | 9,977 | 0 |
| 断魂山 `pbz_duanhun_wp` | 3,428 | 178,380 | 0 |
| 悲泣溪谷 `pbz_xigu_wp` | 5,223 | 未烘焙 | 3 个 SafeDoor 骨骼挂点 |
| 正道大营 / 陆家村 `pbz_zhengdaodaying_wp` | 9,702 | 未烘焙 | 4 个挂点 |
| 戏梦山庄 `pbz_ximeng_wp` | 2,669 | 未烘焙 | 6 个骨骼挂点 |
| 庞镇后街 `pbz_houjie_wp` | 6,511 | 未烘焙 | 9 个挂点、1 个 GeometryCollection 父组件 |
| 枷笼山 `pbz_dengdingshandao_wp` | 2,633 | 未烘焙 | 32 个缺失的变形样条 BodySetup、5 个挂点 |

六个通过本批解析检查的世界完成 **270,404 个空间图块、489,136 个高度层、423,714 个独立 blob**，烘焙失败 0，导航二进制合计 6,793,412,264 字节。失败世界不进入开发数据目录，继续保留原有导航回退。序列、过场、性能和服务地图保留在 census，未冒算为已重建世界。

机器可读快照：`build/offline-navigation/worlds/catalog-build.json`。各世界的 `coverage.json`、`progress.json`、`spatial-index.json`、`navigation-index.json` 是原始依据；旧庞镇 `world-build-summary.json` 是上一阶段的历史回执，其部分元数据文件后来更新，当前 hash 应看本批快照。

## 解码修复与兼容性

- 新增严格的 SplineComponent（Scene offset 132）、ChildActorComponent（5）、SkeletalMeshComponent（236）变换前缀和 tick 字段读取，完整消费真实测试 payload；没有把未知父节点当作原点。
- 镜像非均匀变换只扩展先前明确拒绝的分支，按 [UE 的 signed-axis 矩阵分解](https://raw.githubusercontent.com/katataki/UES5.6/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Source/Runtime/Core/Public/Math/TransformNonVectorized.h)恢复旋转与目标 scale。普通成功分支保持不变。
- 显式 `bNeverNeedsCookedCollisionData=true` 且没有 Chaos convex 的枯树，按引擎实际空形状处理，不由编辑器顶点补造 hull；真正缺少必需 cook 的情况继续失败。
- 枷笼山一个 DynamicMesh 的“NaN”来自等长 Oodle 块：旧代码把 `compressedSize == rawSize` 当作未压缩。`SerializeCompressedNew` 实际仍调用解压器。已补真实 20 顶点 / 36 三角形回归并重建该失败包，恢复 36 个三角形。
- 对全部实际输出/失败目标的 3,004 个 DynamicMesh 组件做了旧分支审计，等长块只有上述原本失败的一项，旧成功输出不受此解码修复影响。原审计在各世界 `dynamic-compression-audit.json`，可用 `tools/audit-offline-dynamic-compression.py` 复核。
- 同一 buildID 下仍带 unresolved 的 receipt 也必须重试。原包及 mesh hash 都匹配的旧成功 receipt 才可复用；兼容说明绑定准确目标指纹，失败项不能迁移为成功。

当前提取器兼容目标为 `408ba9aa5574ecdc439082dbd4b1dba2823c5165ed5cd03962e01ee7543148f5`。所有 11 世界的 `compatible-builds.json` 已登记经审阅的纯扩展关系，证据为 `build/offline-navigation/decoder-extension-compatibility.json`，没有改写成功几何或既有 coverage 来冒充新生成。源码再次变化时该关系失效，续跑仍须核对原包/mesh hash。

一次通用循环曾误开始重复提取庞镇，已停止该子进程。前 1,000 个输出与旧 SQLite 的几何 hash 一致，且只替换 buildID 即精确恢复旧 receipt 原 SHA，已恢复这些原始 receipt。证明为 `redundant-extraction-recovery.json`，1,000 匹配、0 unmatched；原图块没有重烘焙。

## 分页、走廊与 Mod 接线

- 元数据按空间分组，每页最多 128 个高度图块。blob 按空间顺序合并为最大 192 KiB 的二进制片段，再编码为纯文本数据页；不进入 Puerts 永久 CommonJS 模块缓存。庞镇 62,923 blob 合并为 8,012 数据页。
- `PagedWorld` 默认最多缓存 8 个元数据页、4 个数据页和 8 MiB 解码后的 tile；粗图缓存最多 16 页，每页 256 节点。保留旧的逐 blob 格式读取兼容。
- 默认每个 Detour 图窗口最多 256 槽 / 32 MiB payload，密集块动态使用 128 槽 × 32,768 polygon。换图先构建完整暂存图再提交，正常换图 payload 峰值最多两个窗口；临时候选保留权威图时最多三个窗口，除此还有固定核心、查询器和上述缓存。不能将 32 MiB 误称为整个进程的内存上限。
- 取消、损坏数据或 I/O 中断时直接恢复保留的权威图对象，不依赖再次读盘；已补数据源突然不可读的失败回归。未知门仍关闭，已知关闭不能被候选放开。
- 粗图内部组来自真实烘焙多边形，跨块边由上游 Detour 成对加载后读取实际外链。庞镇 165,990 分量 / 332,384 有向边，断魂山 640,999 / 2,164,090。粗图只提议走廊，最终每段仍由当前条件的 Detour 规划；没有由轨迹、直线邻接或参考端点补造道路。
- `PBZRouteRecastProvider.js` 已接实际主入口：首区域继续原提供器，其他已打包位置/世界使用分页提供器。首区域不会重复初始化/轮询闲置的全世界提供器。冷请求初始化在登记查询之前执行，已回归修正生成器自取消异常。
- `stage-offline-world-mod.py` 生成完整未发布开发 Mod 目录及可选 ZIP，带既有适配器、原 atlas、当前普通 JS 核心和清单引用的数据。运行核心有源码指纹，暂存时拒绝损坏或重建过期核心。只复制明确的公开数据文件，不带私有验证路线、冻结 actor 状态或校验侧车，不增加导航 DLL、不含 EXE/COM/SCR/MSI。

## 语义审计与仍未完成的工作

庞镇 15,225 个 HLOD cell 的已提取碰撞来源和三角形均为 0，现有物理 gate 没有重复导入这些 HLOD。初始未激活数据层仍包含约 55 万三角形，初始值不能代替实时剧情状态。6 条 PCGManagedISM 是资源管理对象；对应 cooked FastGeo 浮灯记录全部关闭查询碰撞。证据为 `cooked-gates-audit.json`，这不证明运行时生成已穷尽。

SafeDoor 已有 71 骨骼的参考姿态探针及三个 socket 完整 payload 解析，保存在 `build/physics-research/safedoor-reference-skeleton-probe.json`；mesh→skeleton 的类型化绑定与实时动画姿态尚未闭合，因此未拿参考姿态填补缺口。32 个无变形 BodySetup 的样条也不能直接拿未变形模型替代。继续处理这些 60 项，再处理数据层激活、骨骼/移动/GeometryCollection、构造生成、CanCharacterStepUpOn、火、水、可破坏物生命周期，以及特殊动作的有条件连接。

## 验证界限与复现

392 项 JS、10 项世界管线、4 项组件扩展、9 项 Recast 控制通过。新增 1.18 公里合成走廊在最多 32 驻留块下完成，覆盖禁 WASM/字符串生成、实际 Mod 提供器组合、已知关闭、候选取消、损坏数据与世界切换。

真实庞镇分页数据经实际 WorldCache + 禁代码生成核心取得冻结参考状态下一号 322.575 米 / 968 点及近铃 100.950 米 / 233 点完整候选。实际 Mod 暂存文件也做相同控制，且两条暂存候选分别经独立原碰撞身体检查，失败均为0；六世界均通过禁代码生成核心的小图块加载/查询冒烟。上述均不是游戏现场测试。

另有最大 cooked 连通分量的 3,339.110 米候选，142 个粗分量、7,849 点，最多 32 驻留块完成。Node 的实际 Jobs 调度器在模拟 60Hz 下多次通过，**但一次曾触发 50ms 单步保护，冷态生成器也曾超过 50ms**；保护和 30 秒墙钟上限没有放宽，游戏性能仍未验收。独立原碰撞检查共 15,247 样点，3 处未找到规定容差内的垂直支撑，因此这条长线未通过身体验收，不能当作可玩的完整游戏路线。新数据布局没有改变其坐标，原失败保持。

```powershell
py -3.12 tools/build-offline-catalog.py status
# 先查账本，只对未完成或已明确失效的世界运行提取/烘焙；不要重复全量烘焙六个完成世界。
py -3.12 tests/offline-world-extensions.test.py
py -3.12 tests/offline-world.test.py
node offline-navigation/build-runtime.mjs
node offline-navigation/build-world-corridors.mjs build/offline-navigation/worlds/<world>
py -3.12 tools/package-offline-world.py --world build/offline-navigation/worlds/<world>
py -3.12 tools/stage-offline-world-mod.py --output build/offline-navigation/integration-mod-paged --archive build/offline-navigation/PBZQuestRoute-World-Integration-Development.zip
```

开发产物的确切文件、hash 和 ZIP 验证以 `build/offline-navigation/integration-mod-paged.receipt.json` 为准；缺少回执不能视为组装完成。该快照沿用本地 1.9.4-dev 源码标识，**不是正式版本发布**，没有覆盖 `dist/` 的两份 1.9.4 ZIP。以后正式交付需按维护指南递增并同步版本。所有输出继续 `completeCollisionClaim:false` / `physicalVerified:false`；1.9.4 断线修复与本轮新接线均没有新增实机通过结论。

## 已生成的未发布快照

完整目录：`build/offline-navigation/integration-mod-paged/`；ZIP：`build/offline-navigation/PBZQuestRoute-World-Integration-Development.zip`。共45,284个清单文件，ZIP 2,327,837,465字节（约2.33GB），SHA256 `8078ff892f56ffda19230b580238d0345f09f8c4200374233932f568af747071`。每个输入文件的hash、ZIP精确清单与CRC均已核对；私有状态/验证路线/packet校验侧车、可执行分发格式、收集Mod和共享配置Mod路径均未进入快照。

汇总回执为 `build/offline-navigation/world-integration-summary.json`，完整文件hash见 `integration-mod-paged.receipt.json`。现有标准/开发1.9.4 ZIP与原回执SHA一致，未覆盖；工作树原有改动保留。未安装、启动或上传。下一轮从60项错误与语义规则继续，不需要重新执行已完成的80,956包或270,404块全量构建。
