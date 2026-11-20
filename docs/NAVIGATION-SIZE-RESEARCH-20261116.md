# 六世界导航包：体积与文件数研究（2026-11-16）

本报告只研究无损存储、读取与分发方式。没有改生产源码、游戏目录或存档，没有重烘焙世界，没有安装或发布研究产物。运行端继续普通 JavaScript，保留现有 UE4SS 适配器；不分发 EXE/COM/SCR/MSI，也不新增导航 DLL。碰撞解析缺口、现场寻路失败及卡顿仍独立跟踪，压缩往返成功不构成 `physicalVerified` 或 `completeCollisionClaim`。

**建议先验证“原逻辑分页文件 → 原生压缩 PAK”这一条链路；若游戏现有文本 API 无法读 PAK，则采用普通 JS 解压的有限文本包。** 两者都可完整保留现有 Detour 字节和所有门状态变体。先改变存储，不以放大 voxel、删除高度层、删除碰撞或删除旧世界支持换体积。PAK 的关键未决点是 PBZ 实际挂载及 `EasyCsv` 是否经平台文件层读取；本次只完成离线 PAK 构建与逐文件往返。

## 1. 本次基线与可复核证据

基线为 `build/offline-navigation/PBZQuestRoute-World-Integration-Development.zip`，对应 `integration-mod-paged.receipt.json`；归档 SHA256 为 `8078ff892f56ffda19230b580238d0345f09f8c4200374233932f568af747071`。以下汇总取自 ZIP 中央目录的全部 45,284 个实际条目，不是按一个世界估计：

| 范围 | 文件数 | 解压后文件字节总和 | ZIP 内压缩数据字节 |
| --- | ---: | ---: | ---: |
| 六世界 `packets/*.txt` | 34,556 | 9,057,883,028 | 2,121,078,142 |
| 六世界 `pages/*.json` | 5,336 | 208,346,195 | 45,400,629 |
| 六世界 `corridors/*.json` | 3,889 | 84,309,898 | 19,834,724 |
| 六世界 index 与 catalog | 7 | 717,031 | 108,192 |
| 原有 `PBZRouteStreaming` | 951 | 431,116,408 | 117,112,733 |
| 首区域 `PBZRecastData` | 107 | 36,020,521 | 8,198,685 |
| 原有 chunks/faces/worlds 兼容入口 | 313 | 493,083 | 122,998 |
| 其他代码、许可、资源、既有适配器等 | 125 | 12,092,582 | 3,371,012 |
| **合计** | **45,284** | **9,830,978,746** | **2,315,227,115** |

ZIP 实际文件 **2,327,837,465 字节（2.168 GiB）**，目录/条目等结构额外 12,610,350 字节。安装逻辑体积为 **9.831 GB / 9.156 GiB**。以每文件向上取整到 4 KiB 的模型计算为 9,853,870,080 字节，额外约 22.9 MB；这只是模型，不是实际卷分配测量，不含 NTFS 元数据、压缩、硬链接或驻留文件差异。当前主要浪费是存储表示和大量文件操作，并非几百 MB 的簇尾浪费。[测量脚本](../build/offline-navigation/size-research-20261116/measure.py)、[完整统计](../build/offline-navigation/size-research-20261116/metrics.json)。

六世界的导航二进制合计 **6,793,412,264 字节**。打包器已按 SHA256 在**每个世界内**去重，并按空间顺序把独立 blob 串入 196,608 字节包；随后 base64 编码成通常 262,144 字节的文本。因此不是“423,714 个 blob 各一个安装文件”，但 packet 仍占安装体积 **92.14%**、占文件数 **76.31%**。base64 每 3 字节映射为 4 字符的表示关系由 [RFC 4648 §4](https://www.rfc-editor.org/rfc/rfc4648.html#section-4) 定义；本包由 6.793 GB 增至 9.058 GB 的部分可直接核算。[本地实现](../tools/package-offline-world.py)。

| 世界 | 独立 blob | 二进制字节 | 当前 packet 文件 |
| --- | ---: | ---: | ---: |
| 庞镇 | 62,923 | 1,575,200,440 | 8,012 |
| 序章 | 16,777 | 454,280,064 | 2,311 |
| 序章 BE | 180 | 5,233,772 | 27 |
| 血色森林 | 7,154 | 658,520,772 | 3,350 |
| 幻术世界 | 10,960 | 665,522,848 | 3,386 |
| 断魂山 | 325,720 | 3,434,654,368 | 17,470 |

断魂山约占二进制 50.6%；它的高度层/变体数量需要单独审计，不能据体积大就断言重复或删除。首区域 36 MB、旧 streaming 431 MB 虽可另行改格式，但当前不能删除：前者仍是区域内实际提供器，后者还承担其他世界与旧路网支持。[提供器分派](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteRecastProvider.js)、[暂存规则](../tools/stage-offline-world-mod.py)。

## 2. ZIP 压缩为何没有解决安装体积

当前暂存工具用 ZIP DEFLATE level 6；解压安装后仍然是 34,556 个未经内部压缩的 base64 文件。提高 ZIP level 只影响下载归档；把外层改成 7z 也不会自动改变安装格式。需要让压缩后的数据保持在安装目录，并由已有引擎文件层或普通 JS 按需解压。[归档实现](../tools/stage-offline-world-mod.py)、[DEFLATE 无损格式](https://www.rfc-editor.org/rfc/rfc1951.html)。

小样本比较使用各世界均匀间隔最多 32 个 packet、包含两端；小世界只有 27 个，因此总共 **187 个不同 packet**。这是确定性覆盖样本，不是随机置信估计，也不是全世界重新压缩。原始二进制 36,191,912 字节，原 base64 48,255,892 字节。所有研究转换均校验还原后的原始字节 SHA256。[样本列表与数值](../build/offline-navigation/size-research-20261116/metrics.json)。

| 同一批数据的表示 | 实测字节 | 实际物理文件数 | 说明 |
| --- | ---: | ---: | --- |
| 当前 base64 文本 | 48,255,892 | 187 | 现有安装表示 |
| 当前文本逐文件 ZIP DEFLATE-6 数据 | 11,216,516 | ZIP 内仍 187 项 | 不含 ZIP 结构 |
| 原二进制 | 36,191,912 | 取决于分组 | 精确去掉 base64 开销，尚未压缩 |
| 原二进制各块 DEFLATE-6 | 8,985,756 | 取决于分组 | 与现有算法输出逐字节一致 |
| 上行压缩结果再 base64 | 11,981,252 | 187 | 安装字节减少 75.17% |
| 独立压缩块放入 ≤1 MiB JSON 包 | **12,003,005** | **14** | 含 id、长度、SHA256 与 JSON 开销 |
| 原文本放入 Zlib/V11 PAK | **13,803,443** | **1** | 原 187 个虚拟路径/内容保留 |

DEFLATE-9 的二进制结果为 8,953,554 字节，只比 level 6 小约 **0.36%**；这不是本轮最值得投入的方向。不要把 JS 文本的 minify、清注释或许可删减当主要方案：当前生成核心 `PBZRecastRuntime.js` 只有 3,524,564 字节，占整个安装约 0.036%。

逐世界按各自样本压缩比例加权到该世界全部 `navigationBytes`，二进制压缩 packet 估计 **1,692,675,210 字节**；压缩后 base64 packet 估计 **2,256,945,508 字节**。仅替换 packet、其余保持基线，则安装约 **3.030 GB**，比 9.831 GB 低约 69.2%。这是**样本外推**，尚无全量压缩回执；不应作为交付大小承诺。5,336 个 metadata 和 3,889 个 corridor 页也可压缩/合并：本次各世界最多 16 页的样本中，压缩 base64 分别约为原文的 34.0% 和 34.7%，但须保留每条逻辑记录的解压上限。[采样与算法](../build/offline-navigation/size-research-20261116/measure.py)。

## 3. 首选候选：引擎原生压缩 PAK，保留原分页

这一路径的价值在于把**物理文件数**降至一个或数个，而不把世界变成一次读取/解压的大对象。Epic 将 `FPakPlatformFile` 定义为 `IPlatformFile` 的 PAK 包装，公开 `FileExists`、`OpenRead` 和查找已挂载 PAK 的接口；`FFileHelper::LoadFileToString` 具有经 `IPlatformFile` 的重载。因此，经正确平台文件层读取一个已挂载的虚拟文本文件，在架构上不要求 JS 获得随机区间读。[FPakPlatformFile](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/PakFile/FPakPlatformFile)、[FFileHelper::LoadFileToString](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Core/FFileHelper/LoadFileToString)。

UE5 的 IoStore 并不意味着普通数据必须变成 `.utoc/.ucas`：Epic 的 Zen Loader 文档明确保留 `.pak` 承载普通 loose file；压缩 PAK 可降低客户机存储空间。[Zen Loader](https://dev.epicgames.com/documentation/unreal-engine/zen-loader-in-unreal-engine)、[Packaging Projects：压缩 PAK](https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-projects?application_version=4.27)。这里使用导航自己拥有的 `.txt/.json`，不需要把数据伪装成 UE 资源，也不重打包游戏资产。

建议的两个路径层次必须分清：

- **物理 PAK**：候选放在游戏已经扫描的 `ProjectPBZ/Content/Paks/~mods/` 内导航自有文件名；不能仅把 `.pak` 放进 `Content/Mods/` 就宣称会自动挂载。
- **PAK 内虚拟路径**：`ProjectPBZ/Content/Mods/PBZQuestRoute/PBZRecastWorlds/<world>/...`；JS 读它们的明确项目路径，继续原 packet/page/corridor 粒度。

Epic 只保证位于项目 PAK 搜索目录的补丁会自动挂载，具体搜索目录来自 `FPakPlatformFile::GetPakFolders`；PBZ Shipping 构建的扫描范围、签名要求、优先级与纯 loose-file PAK 必须单独验证。[Epic 挂载说明](https://dev.epicgames.com/documentation/unreal-engine/how-to-create-a-patch-in-unreal-engine)。本机 `Content/Paks/~mods` 存在不等于此次导航 PAK 已验证可挂载。`FPakPlatformFile::Mount` 是原生接口，不是已经对 Puerts 反射暴露的 JS 函数。[Mount API](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/PakFile/FPakPlatformFile/Mount)。

### 已完成的离线 PAK 证明

使用工作区已有离线工具 `build/tools/repak/repak.exe`（`repak_cli 0.2.3`）将上述 187 个**现有编码文本**按拟议虚拟路径打为 Zlib/V11 PAK，得到 **13,803,443 字节**，随后离线解包，精确清单和 187 项 SHA256 全部一致。工具、其依赖 DLL 不进入 Mod。PAK SHA256：`9e440d13934ea90d37c3b3ad227f2fcb432f86533b5a3f21ef3f83085ade5aad`。[复现脚本](../build/offline-navigation/size-research-20261116/pak-bench.py)、[回执](../build/offline-navigation/size-research-20261116/pak-bench.json)。

PAK 比样本 ZIP 数据稍大并不矛盾：本机工具使用的压缩块/压缩速度策略不同；上游实现的 Zlib 写入走 `Compression::fast()`，分块上限为 `0x3e << 11`。本机 CLI 的 `--compression` 和成功往返是实际能力证据，不能只读上游 README 旧句子“写入不支持压缩”下结论。[repak 压缩源码](https://github.com/trumank/repak/blob/master/repak/src/data.rs)。

若六世界各一个 PAK，则六世界部分可从 **43,788 个物理文件降到 6 个**，整个基线约从 45,284 降至 **1,502 个**（其余 1,496 个不变）。这是结构计算，尚未构建全量六 PAK。也可按 128～256 MiB 压缩后大小分卷，换取更新粒度；仅一大 PAK 的更新可能要求重新下载整文件。PAK 索引仍有 43,788 个逻辑条目，挂载内存与耗时要测，不能把文件数下降直接换算成 FPS 提升。

### 尚未证明的游戏端链路

当前 `textFile` 使用 `BlueprintPathsLibrary.FileExists(path)` 与 `UE.EasyCsv.LoadStringFromLocalFile(path, out)`；SDK 对后者只有反射签名，**没有公开实现保证它一定使用 PAK 包装层**。必须验证这两个调用都看得到已挂载的导航虚拟文件，且最终文本长度/hash 与 loose file 相同。否则外层 `FileExists` 就可能先把读取挡住。[现有调用](../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZQuestRoute.js)、[EasyCsv 声明](https://github.com/zoneoflkf/PBZModLoader/blob/7ff94fffcad31e591b9730408d9880cd90828b40/sdk/types/generated/EasyCsv.d.ts#L27)。

PAK 只放数据，不把主程序或旧 atlas 的可执行 CommonJS 数据模块一并塞入来扩大试验。既有加载器对 script PAK 有独立政策，普通导航文本不应顺带改变代码加载安全设置。

## 4. 可独立推进的回退：普通 JS 解压的有限文本包

若 PAK 的游戏读取链路不通，现有整文件文本 API 已可读取导航数据，可引入 versioned `packed-deflate-text` 存储层：**每个解压块继续不超过 196,608 字节**，多个独立压缩 base64 块放进不超过 1 MiB 的物理 JSON/ASCII 包；只解压查询需要的块。索引把现有 packet id 映射到物理包及块位置，blob 的 `parts`、SHA256、门状态变体、tile 身份全部保留。

离线原型已把同样 187 个文本文件变为 **14 个 ≤1 MiB JSON 文件，合计 12,003,005 字节**，最大文件 1,035,189 字节；所有原始二进制 SHA256 还原一致。它只证明格式可行，未接生产 `PagedWorld`。[原型与回执](../build/offline-navigation/size-research-20261116/text-packs-bench.json)。

仅将原 base64 串每四份拼成一个 1 MiB 文件（索引放外部）也可把 packet 文件从 34,556 降至约 8,641，**但安装数据仍约 9.058 GB**。因此“只加大包”主要改善文件数；要降低安装体积仍需内部压缩。压缩文本包继续合并 metadata/corridor 后，有机会把总文件数压到数千；准确数值需要完整打包一次，没有本次全量回执。

`fflate@0.8.2` 的同步 `inflateSync` 是普通 JS 路径。此次在 Node VM 中同时设 `WebAssembly: undefined`、`codeGeneration.strings: false`、`codeGeneration.wasm: false`，用固定预分配输出还原全部 187 个样本，4 遍全部 SHA256 匹配；没有启用 Worker/异步压缩接口。[fflate 同步实现](https://github.com/101arrowz/fflate/blob/v0.8.2/src/index.ts)、[实验代码](../build/offline-navigation/size-research-20261116/decode-bench.cjs)。

本机 Ryzen 7 9700X、Node v20.10.0 的**仅解压**测量：冷遍 p95 约 3.43 ms、最大 4.66 ms；后三遍 p95 约 0.79～0.80 ms、最大 1.29 ms。包含的 UMD 库 32,665 字节，SHA256 `c3b34f2e9f5e74d4d7d64e01cac7a0c01954c6c406414d42185c7b53d6875ddf`。这些不含游戏磁盘 API、字符串跨桥、JSON/base64、GC、tile 插入和 Detour 查询成本，**不能当作游戏帧时或解除 50 ms 保护的依据**。[原始计时](../build/offline-navigation/size-research-20261116/decode-bench.json)。

实现时应保留两个粒度：外包只有限缓存，已解压 packet 仍用现有 4 项 LRU；tile 继续 8 MiB LRU，窗口预算不增加。一次同步 `inflateSync` 不能被生成器中途抢占；若游戏冷态超过预算，应缩小独立压缩块或使用可分片 inflater，不能放开停算保护。不要调用依赖 Node `worker_threads`、Web Worker、Blob URL 或动态 Function 的异步接口；PBZ SDK 明确提示宿主没有 DOM/Node API。[SDK 宿主说明](https://github.com/zoneoflkf/PBZModLoader/blob/7ff94fffcad31e591b9730408d9880cd90828b40/sdk/README.md)。

## 5. 二进制索引容器与随机读取：能力尚未落实

能读二进制并不等于能按区间读取。`MHScriptIO.ReadFileAsArrayBuffer(path)` 只出现在提取的 `puerts/wasm3_helper.js` 注释测试中，上游腾讯文件也保留同一注释；它既没有 offset/length 参数，也不能证明 PBZ Shipping 注册了这个类。本次下载的完整官方 loader SDK 没有 `MHScriptIO` 声明；缺声明同样不能反证其绝对不存在。[腾讯上游注释](https://github.com/Tencent/puerts/blob/master/unreal/Puerts/Content/JavaScript/puerts/wasm3_helper.js)、[本地游戏原件](../build/game-extract/ProjectPBZ/Content/JavaScript/puerts/wasm3_helper.js)。

因此暂不能承诺“每世界一个几 GB `.bin`，JS 只读其中几 KB”。在只有全文件读的条件下，这会迫使巨量临时分配，并破坏现有有限缓存。`ArrayBuffer.slice`/`Uint8Array.subarray` 只能在**已经读入的**数据上切片，不能把整文件 API 变成磁盘区间读。

若将来实测确认二进制 API，可先用有限的几 MiB 压缩 shard，移除 base64 开销；若进一步确认真实范围读，可再使用大容器+分页索引。格式需明确 magic/version、字节序、数值范围、压缩算法、压缩/解压长度、offset+length 溢出检查、来源索引 hash、世界身份及每块完整性；所有解压上限在分配前检查。原生 `FFileHelper` 文档存在 block/range 读取能力，但它是 C++ API，不能据此声称已暴露给游戏 JS。[Epic FFileHelper](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Core/FFileHelper)。

PAK 路径正是绕开这项未知能力：由引擎已存在的索引文件层访问小逻辑文件，JS 无需得到 C++ handle，也无需新增 DLL。

## 6. 必须纠正的加载器假设

公开 loader 仓库 commit `7ff94fff` 的 `syncMods` 会复制 `mods` 到 `Content/JavaScript/PBZModLoader/generated-mods`；它还拒绝 reparse point。因此如果某个安装确实使用该版本，数据留在 `mods` 会带来重复磁盘树和启动复制成本。[该版本源码](https://github.com/zoneoflkf/PBZModLoader/blob/7ff94fffcad31e591b9730408d9880cd90828b40/src/core.hpp#L146-L164)。

**本机当前安装不是这个架构，不能把它写成已经发生了双份 9 GB。** 只读检查结果：导航 `mods` 中六世界数据 43,788 文件/9,351,256,152 字节；上述 generated 目录不存在。当前 `version.dll` SHA256 为 `f443eff4e2a70cbbec27e88b6b73ba7347fa0bd4a4365a015f71142a43f1a4da`，bootstrap 是 DLL 注入脚本的占位文件。DLL 内实际脚本明确通过改变 root 最后一段大小写分离热重载缓存，并写明不复制模块树。[本机计数](../build/offline-navigation/size-research-20261116/installed-duplication.json)、[只读提取的实际嵌入脚本](../build/offline-navigation/size-research-20261116/installed-loader-embedded.js)。

迁移数据到导航自有 `Content/Mods/PBZQuestRoute` 仍可避免代码目录与数据目录耦合，但不能将收益虚报为本机再省掉一份实际不存在的副本。`__dirname` 的实际含义也须按本机加载器核对；2026-11-16 新现场日志已有 `recast world ready pbz_fujizhilin_wp`，本次不能把无路线归因于“catalog 根本没读到”。现场 50 ms 停算与卡顿的具体阶段另由故障记录追查。

## 7. Recast 10 cm 与 tile 尺寸：不要与存储合并混为一谈

实际六世界空间索引配置均为 `cellCm=10`、`tileCells=256`、每边 `extentCm=2560`（25.6 m），几何边界余量 91 cm；编译器 `ch=5 cm`，agent 半径 45 cm、高 192 cm、步高 50 cm、坡度 55°。`maxSimplificationError=0.25 voxel` 与 `0.7071 voxel` 边界预留共同进入保守侵蚀半径。[空间索引实现](../tools/build-offline-world-tiles.py)、[实际烘焙实现](../offline-navigation/build-world-tile.mjs)、[安全设置](../offline-navigation/build-settings.json)。

Recast 将 `cs/ch` 定义为体素分辨率，把 `tileSize` 定义为一边的 voxel 数；改变前者会同时影响多种以 voxel 表达的参数。提高 `cs` 会降低障碍细节，较大的 `ch` 会改变矮台阶/沟缝的连接。[Recast rcConfig](https://recastnav.com/structrcConfig.html)。Epic 同样展示了增大 cell 后窄通路消失的例子；其 32～128 cell/tile 建议针对**运行时重烘焙性能**，不能直接当作本项目离线数据最省空间的最优点。[Epic 生成性能说明](https://dev.epicgames.com/documentation/unreal-engine/optimizing-navigation-mesh-generation-speed-in-unreal-engine)。

| 改动 | 是否保持现有 Detour 字节 | 本次判断 |
| --- | --- | --- |
| 多个已有 packet/页进入 PAK 或压缩文本容器 | 是，可逐 hash 核对 | 优先；不重烘焙 |
| 相同 10 cm/5 cm，tile 从 256 扩为 512 cells | 否，需要重烘焙 | 可能减少边界/页数，但每块面积 ×4，密集块更大、poly 上限和读取峰值更易超限；条件 actor 组合数也可能增加 |
| tile 保持物理宽度，cell 从 10 扩为 15/20 cm | 否 | 会改变窄路、侵蚀、边缘及 portal；不能作为无损压缩 |
| 降低 detail mesh 或简化精度、删除高度层/状态变体 | 否 | 直接影响高度/通行与状态正确性；本轮不采用 |

本项目 10 cm 下保守 walkableRadius 为 `ceil((45+0.9571×10)/10)=6 cells`，20 cm 时为 4 cells，对应有效侵蚀从约 60 cm 变为约 80 cm；不是只减少文件数。更大 tile 也不保证总字节按四分之一缩小：多边形/高度细节仍存在，新增条件组合可能反向增大数据。若以后研究，应只复制一小片真实碰撞，覆盖窄门、台阶、密集多层与条件门，对照完整候选、跨块 portal、poly 上限及独立身体检查；本轮没有做几何参数试验，也没有无区别重建六世界。

## 8. 推荐实施顺序与验收边界

1. **先保留现场证据并定位卡顿。** 压缩格式不能替代对同步读取、JSON/base64、tile 插入和查询阶段的计时；不放宽 50 ms 停算保护。该步骤由故障工作独立推进。
2. **交付一个小 PAK 探针包到工作区**：只含导航自有短文本/JSON与一页现有 packet 的精确副本，采用 Zlib/V11；明确候选虚拟路径。授权安装后才验证挂载、两个现有文本 API、长度/hash、冷/热帧耗时、卸载与路径归属。探针通过后才制作全量世界 PAK。
3. **优先保留现有逻辑分页与所有二进制 hash。** 可按世界或有限压缩大小分 PAK；重建暂存/安装清单，让校验工具递归验证包内清单，仍排除私有冻结状态和验证轨迹。只分发 `.pak` 数据，不携带离线 repak/UnrealPak 或额外 DLL。
4. **PAK 链路不通则接入压缩文本容器**：先保留现有独立解压块上限，新增有限外包缓存和 versioned reader；复用取消/恢复、已知关闭、未知门与坏文件失败保护；在禁 WASM/字符串代码生成环境中进行完整往返与查询对照。
5. **全量转换后再报告实际收益**：精确记录下载 ZIP 字节、安装物理文件数/文件字节/卷占用、启动与首次查询峰值、冷/热同步阶段 p95/max、LRU 峰值和所有 blob hash；离线、mock 与真实游戏验收分别记账。

目前得到的是两个可复现的无损格式原型和一个明确的实际 API 缺口。尚无全量新格式安装包、PAK 游戏读取通过、FPS 改善或路线实走通过结论。
