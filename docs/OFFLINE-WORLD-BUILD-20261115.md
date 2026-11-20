# 完整旁镇：可续跑构建记录

日期采用用户时区America/Tijuana。当前是离线工程证据，1.9.4仍未安装或实机复验；没有启动游戏、改存档、安装、上传或改收集Mod。原工作树与1.9.4下载文件保留。


首轮全包与图块构建已完成，完整碰撞语义和实机验收仍未完成。最终机器可读账本为私有`build/offline-navigation/worlds/pbz_pangzhen_wp/world-build-summary.json`。

| 阶段 | 本轮结果 |
| --- | --- |
| 包提取与独立几何校验 | 32,819/32,819包；约1.324亿三角形；0错误 |
| 空间图块烘焙 | 58,867/58,867块；64,616高度层；0错误 |
| 导航数据 | 62,923个独立blob；约1.58 GB；保留空层与条件变体 |
| 冻结状态路线控制 | 一号约322.6米、附近铃铛约101.0米完整；JS/WASM坐标差0 |
| 独立身体检查 | 1,636+475个25厘米样点，0失败；最小净空58.68/59.95厘米 |
| 运行与发行 | 普通JS实验窗口已测；完整世界尚未接入发行Mod；1.9.4实机仍待验证 |

## 输入与范围

完整旁镇 `/Game/Maps/B08_09_10/PBZ_Pangzhen_WP` 的root包含32,822个runtime cell，32,818个有独立流送包，四个AlwaysLoaded由PersistentLevel承载。新inventory逐项对账，无包清单缺口。首区域877分区不是这里的构建范围。

声明的cell总bounds约48×46公里，并含很高的Z离群值，不能当成紧凑的可玩矩形。提取不按这个总bounds裁剪；空间索引按实际组件几何建立，候选图块由Recast同坡度规则可走的上向面确定，边界余量内仍包含所有碰撞三角形。过大面、Recast垂直范围、条件组合/多边形上限失败必须写账本。

## 复现与续跑

以下命令只写仓库忽略的build目录；游戏包和二进制只读，公开构建不读存档。

```powershell
py -3.12 tools/build-offline-world.py
py -3.12 tools/build-offline-world.py --summary-only
py -3.12 tools/audit-offline-world-semantics.py
py -3.12 tools/validate-offline-world.py
py -3.12 tools/build-offline-world-tiles.py index
py -3.12 tools/build-offline-world-tiles.py bake --jobs 2
py -3.12 tools/build-offline-world-tiles.py finalize
```

提取以包为事务，每个 `packages/<chunk>/receipt.json` 记录源码/schema指纹、容器hash、原包hash、依赖资产hash、碰撞hash、来源三角形区间、条件、class计数与失败。中断后重新运行会校验原包与碰撞文件，跳过有效receipt；`.tmp`不是成功记录。每个组件几何写入临时顶点/索引流，单包完成后合并为PBZCOL，不构造全世界顶点或索引列表。资产/属性缓存按包清理和限制。

空间索引 `spatial.sqlite` 保留每组件bounds和来源区间，图块输入逐窗从包级memmap筛选，保留原三角形。默认10厘米体素、256格图块（25.6米），半径45厘米、角色高192厘米、爬步50厘米、坡度55度；侵蚀与轮廓余量沿用现有设置。Z按5厘米网格对齐，图块共享全局原点；超过Recast高度范围时明确失败。

每图块receipt记录选中几何/条件/配置hash、编译器与lockfile指纹、变体hash和空图块。续跑同时核对输出blob真实hash。Detour使用默认256个驻留slot、每图块16,384个polygon的32位reference配置，保留十个salt位；这限制的是查询窗口，不是世界图块总数。当前权威未知门仍使用关闭变体。

`--limit`用于有意的阶段构建。索引默认拒绝未完成的提取；`--allow-partial`仅供诊断，输出持续标注实验。`--bounds MIN_X MIN_Y MAX_X MAX_Y`可单独重烘焙指定窗口；没有指定时遍历全部稀疏候选。

## 验证与边界

```powershell
node offline-navigation/build-runtime.mjs
py -3.12 tests/offline-world.test.py
py -3.12 tests/offline-recast.test.py
node --test tests/offline-runtime.test.cjs tests/recast-integration.test.cjs
```

新增端到端控制使用独立解析场景：完整三角形保真、负坐标图块接缝、条件门、深坑、窗口数量/字节预算、取消/加载失败恢复、损坏blob只重烘焙受影响图块，以及真实V8禁WASM/字符串代码生成的JS/WASM差分。它们不是旁镇实机验收。原9项Recast控制、2项Body测试和391项JavaScript回归也已通过。新增世界管线9项测试包括首个真实全图缺口与汇总失败的回归。

运行端窗口模块只进入build中的实验核心，没有复制到Mod发行目录。缺少长距离粗走廊/分层连接、游戏窗口调度和发行数据打包；完整地图不能靠一次常驻全部图块来接线。

包解析成功不表示全部游戏规则已建模。覆盖账本另列数据层/HLOD、运行时生成、骨骼/移动碰撞、CanCharacterStepUpOn、NavArea_Fire、水域和可破坏物生命周期。当前输出 `completeCollisionClaim:false` / `physicalVerified:false`，不能称为完整世界可通行或实机全程通过。

## 当前运行进度

首轮已经完成：32,819包、70,290,943顶点、132,431,747三角形；58,867/58,867空间图块、64,616个高度层（其中1,837为空）、62,923个独立blob，导航二进制共1,575,200,440字节。包解析、独立几何校验和烘焙错误均为0。`world-build-summary.json`保存最终产物hash、控制测试和保留的1.9.4 ZIP回执。可续跑文件位于 `build/offline-navigation/worlds/pbz_pangzhen_wp/`。


## 已处理的构建中断

首次提取至26,003个包后，首个真实解析缺口触发汇总器重复`package`键，汇总中断；所有已写几何仍在。缺口是cell `BYPC6DM3FOP6Z742EB33ALI9X`的48个SplineMesh缺少LandscapeSplinesComponent父变换。已按本机UHT和完整payload边界补齐Scene offset=117，重新提取该包后得到2,304顶点/3,456三角形，48项成功、0 unresolved。没有用编辑轨迹或人工道路弥补。

Windows扫描器偶发阻止JSON原子替换，已补有限短重试。其余26,002个包先验证原包与几何hash，再迁移元数据构建ID；只重建受新增父类支持影响的包。私有`summary-fix-migration.json`保留旧/新源码与构建ID、几何校验和定向重建清单。续跑已实际复用这些包，继续处理余下世界。

数据层审计另对32,822个cell及17个layer精确消费，0失败/0缺名；15,225个HLOD cell、21,808个带layer的cell。已恢复初始状态与父层，但没有将其冒充剧情实时状态；实验图块仍保留所有cooked layer几何，暂不可用于发行。


全包最终另发现9个Heightfield保存自身位移/缩放，已补齐Scene offset=125的真实字段，并在碰撞世界变换中应用，增加285,768三角形。最终包级结果为32,819/32,819包、132,431,747三角形、0已记录解析错误。新增`compatible-builds.json`将人工审阅过的纯解码扩展绑定到准确目标源码指纹；只复用hash校验成功且无解析错误的旧receipt，错误包必须重建。以后普通续跑无需重复参数，源码再变化时该兼容记录自动失效；不得为会改变已成功几何的改动声明兼容。


独立几何校验已核对全部32,819包，70,290,943顶点、132,431,747三角形、224份条件网格，0校验失败。全量SQLite索引含612,766个几何来源与58,867个稀疏候选图块；没有过大上向面或碰撞解析索引失败，另有148个包携带待处理的碰撞语义项。索引不是场景激活/实机完整性证明。

索引SHA：`9d656b716070e17ad3270c24474ca3100a3bf4ff4d91a5eca4bd52c0b2c5040d`；SQLite文件SHA：`59d90086077362125b838dc5a104fe560fb14db1f81bd7a3738f59e6811aaddf`。具体包及输入/输出hash仍以私有账本为准。


## 多层、密集图块与查询接缝

首个真实窗口同时存在普通地面和约30公里高的远景碰撞，单一Recast高度区间会超限。现在保留每个完整三角形，按实际三角形Z区间分组；相隔超过3米的空高度区间才分开，连续墙、坡道和楼梯不会被切断。各组独立调用同一上游Recast，写入Detour的layer身份字段；没有新建层间连接。普通查询使用有界高度窗口，避免加载无关高层。32层上限及真正连通高度超限仍会显式失败。

一个图块`(-74,2)`生成20,790多边形、2,895,812字节，超过默认单块16,384配额。保留原几何和10厘米体素，允许保存密集blob并记录实际poly count；查询前将Detour引用分配从256槽×16,384改为128槽×32,768。参数切换先暂存新图，再提交，取消会恢复旧图与引用布局。真实图块在同时禁止WASM和字符串代码生成的V8中加载成功，测试了索引16,384以上的多边形引用；与WASM坐标差0。这里的短查询时序仅是Node控制，不是游戏FPS证明。

仅这一密集块使用扩展后的编译器。`compiler-compatibility.json`记录准确的两个编译器ID和兼容性审阅；变化只在容量接纳与poly计数元数据，上游几何生成、角色、体素、状态和默认MSET参数均未改变。私有`compiler-sources/proof.json`归档两个源文件并验证旧源能精确还原全量构建的编译器ID。最终索引保留真实编译器来源列表，全部blob重新验hash；没有把旧输出冒记为新编译器生成。

附近铃铛曾在跨块入口拒绝约4.5厘米投影，核对[Detour外部portal的255级量化](https://github.com/recastnavigation/recastnavigation/blob/v1.6.0/Detour/Source/DetourNavMeshQuery.cpp)与真实前后多边形后，适配器只在实际相邻、裁剪过的外部portal入口允许一个边界量化单位的同多边形投影。内部样点仍用2厘米限制，楼层/多边形不变；没有放宽一般墙体或坑洞检查。真实失败案例已加入回归，两条新世界控制路径随后均通过独立原碰撞身体检查。

以上控制使用冻结参考状态加两扇雾门显式开放，不能当成当前存档或实时战斗状态。未知条件的权威图仍选关闭变体；只开两雾门而不提供其他参考状态时，部分路径仍受阻，账本原样保留此结果。

## 下一阶段与交付边界

- `component-coverage.json`逐类记录86类native组件的能力；71类尚未逐一作碰撞审计，其中也包括灯光/音频等类型。优先查6个PCGManagedISM、292个SkeletalMesh与86个Budgeted Skeletal、4个GeometryCollection、107个NavModifier及水域；10,501个blueprint export的祖先/构造时行为尚未穷尽。
- 17个数据层的名字、父层与初始值已恢复，剧情实时激活/HLOD策略尚未应用。实验图仍保留所有cooked layer几何，不是任一实时场景的完整认证。
- CanCharacterStepUpOn、火区域代价、水域与可破坏/移动生命周期仍需建模。特殊动作继续留作有条件连接阶段。
- 游戏接线还需要元数据分页、最大2.9 MB blob的普通JS数据分块、有限模块缓存及长距离分层走廊。当前有界窗口通过了离线V8控制，整张世界数据尚未复制到发行Mod。
- 两个1.9.4 ZIP与原回执SHA完全一致；本轮没有重打发行包、安装、启动或上传。1.9.4断线修复仍待用户现场验证。

追加验证入口：

```powershell
py -3.12 tools/audit-offline-world-components.py
node offline-navigation/validate-world-region.mjs build/offline-navigation/worlds/pbz_pangzhen_wp build/offline-navigation/route-001/saved-navigation-state.json
node offline-navigation/validate-world-dense.mjs build/offline-navigation/worlds/pbz_pangzhen_wp
py -3.12 tools/validate-offline-world-route.py build/offline-navigation/worlds/pbz_pangzhen_wp/route-route001-frozenReferenceAndTwoFogDoors.json
```
