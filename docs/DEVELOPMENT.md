发布更新时先读[简短发布规范](../release/README.md)。上传成功后核对版本、文件与文案，不监控Nexus扫描状态。文件说明只写玩家可见的功能和变化，测试与验证状态留在开发文档。以下保留详细开发与验证资料，公开更新说明按发布规范另写。

# 影之刃零 Mod 开发与 Navigation 接手说明

## 一、影之刃零 Mod 制作

- 两套运行时：PBZModLoader 执行 Puerts JavaScript（`require('ue')` 调用游戏反射 API）；UE4SS 执行 Lua/C++。不同 Mod 的 Lua 环境与 Puerts 不共享模块单例，跨运行时要设计桥接。
- 按游戏根目录打 ZIP：JS 放 `ProjectPBZ/PBZModLoader/mods/<Mod>/main.js`；资源放 `ProjectPBZ/Content/Mods/<Mod>/`；UE4SS 放 `platform/steam/ue4ss/Mods/<Mod>/{Scripts/main.lua,dlls/main.dll,enabled.txt}`。只打包自己拥有的文件，保留设置与共享运行时。
- UE Mod Manager 按文件路径识别归属和更新。分发完整替换包，包含依赖的路网/图标；增量文件不能作为独立完整 Mod 启用。
- 修改前先读工作区差异；用失败回归复现，再修代码。模拟测试、真实模块测试、游戏现场测试分别报告，不能互相替代。
- 本机游戏：`D:/software/Steam/steamapps/common/PBZ`；管理器：`D:/software/pbz-mod-manager`。游戏目录和管理器数据默认只读，交付仓库 `dist/` 的包。

## 二、Navigation Mod 接手

- **当前1.8.3／原数据来源恢复**：移除小黑盒MapData、MapHints、预热、模型回退及专属预算；只保留原有atlas、UE原生查询、已审核脚点、动作和物理检查。相关文件集中在`archive/heybox-20261115/`，不得自动恢复到运行时或安装包；历史1.8.0—1.8.2说明只作记录。见[归档与恢复](HEYBOX-ARCHIVE.md)和[原理核对](NAVIGATION-EXPLANATION-20261115.md)。未安装到游戏、未上传；旧实机结论不变。

- **1.8.2/main正向搜索**：按用户要求删除反向搜索模块、菜单、配置读取、三套求解器反查和入边预计算；单向动作、锁、物理认证与正向最短路径回归保留。旧保存配置中的方向键忽略。小黑盒独立分支不混入旧几何，见[分支隔离说明](../archive/heybox-20261115/docs/HEYBOX-BRANCH.md)。1.8.1四份新F报告只将最后F之后记为用户确认的正确后段，证据为`authoring/route-001-reference-1.8.1-20261115.json`，不编入规划。

- **1.8.1近处货币回归**：读取用户1.8.0-dev实机日志，币目标首次约47.5米平距/10.1米高差；完整短线到靠近约10米才提交。新增近物品已加载路线优先、近处上下层动作先于铃铛估算和初始离线图、实测候选与模型候选分工、模型页在规划器外每帧最多一页、普通网格先试、本请求模型失败去重与总100ms配额。保留50ms停算保护和所有现场物理/锁检查；实机整段未验收，不能把模型导入或回归通过记为路线通过。见[本次修复](FIELD-FIXES-1.8.1.md)。

- **1.8.0素材接入**：只读解析用户指定的PBZ1.4.0 WKP2/HB3DPACK包，将全部12章模型与导航显示面编译为11个世界的地形/结构面候选，附近分块读取。0/10/11章为旧实例网格，1—9章是`manifest.baseModel`中的量化底模，旧实例索引为空不表示没有模型；两种坐标分别转换。实测候选图先试，失败后新支持面共用原时间/节点/碰撞检查预算；实时网格保留原坐标相位。不能据此宣称全图可通行或现场通过。读取器、生成器和数据说明见[素材接入](../archive/heybox-20261115/docs/HEYBOX-MAP-IMPORT.md)。

- **1.7.1真实收集物品模式**：补采通过MCT1.0.14的Catalog/Compose/Repository/NativePresentation/Selection生成94个物品，旧自绘模块已移除。启动宿主仅在开发Lua flavor下挂接；不改收集文件和存档。名称适配覆盖仓库复制后的source记录，真实命中、追踪与文件桥接已测试。当前只维护1.0.14；用户要求删除1.0.9参考目录和Git自动恢复逻辑，后续不可恢复或重新加入兼容测试。见[当前补采说明](DEVELOPMENT-SURVEYS.md)。

- **1.7.0补采物品与手动控制**：47段、溪谷6段，补入锁链/影武装/升降梯/滑索等对照；导航自有物品式标记可悬停看“某号路线开始/结束”，鼠标左/中键或手柄十字键+A定位。起终点轻攻击明确开始/结束，重攻击为导航问题、防御为个人误走；地图定位不再中断录制。四个开发模块仅进开发包。默认键已从本机IMC数据核对，改键不会自动跟随。详见[当前补采说明](DEVELOPMENT-SURVEYS.md)。`tools/build-survey-catalog.cjs`可复现生成任务表；导入器将误走与问题分别列出。游戏外观、焦点和实景按键仍待首次验收，未安装、未上传。

- **1.6.0地图补采**：开发包增加11张有向短段卡，区域地图绿起橙终，到点落地自动开始/结束，整段10Hz分块保存并关联Y标记；独立于正式路网。完成后运行`tools/import-development-cases.py`读取清单、分块及对照摘要。保留1.5.1动作环修补；没有重采A-01—A-04或改变缺口验收状态。详见[地图补采说明](DEVELOPMENT-SURVEYS-1.6.0.md)，任务清单见`authoring/development-survey-plan.json`。首轮游戏触发与地图显示待验；未安装、未上传。

- **A-04/1.6.0复盘**：已读到1.5.0-dev的12份实机报告；误走梯子19:13:18—19:13:51往返从人工参考中单独排除，保留1288个正确参考足点，A-04导航不算全程通过。另一架梯子的立即上下动作环已在正反两方向回归修补，数据未自动变成固定路线。见[本次复盘](FIELD-REVIEW-A04-1.5.0.md)。报告原件可能为UTF-16 BOM，读取时使用`json.loads(path.read_bytes())`，不要固定UTF-8解码。

- **1.5.0标准/开发包**：开发包角色控制中按重攻击Y/键盘Y保存目标、实际路线/蓝线和前20秒后5秒上下文，文件在实际Saved下`PBZQuestRoute-dev-*.json`；用户说“已标记”后先运行`py -3.12 tools/import-development-cases.py`读取，避免反复索要路线/坐标。标准包排除采集器，两包互相替换。反向开关现明确为候选图，实际solver方向分别记账。详见[开发采集说明](DEVELOPMENT-CAPTURE-1.5.0.md)。

- **1.4.2本地候选**：正反向均无法连接八卦阁/正门的原始路网分量，完整路线仍缺；截屏堵门处发现单面复杂碰撞，封住胶囊与蓝线只查前向导致背面可漏检的回归。只增加正向两次均漏检后的反向复杂复核，不补造道路或开放反向动作。现场效果/性能待验，详见[断网与墙面排查](FIELD-FIXES-1.4.2.md)。

- **1.4.1本地候选**：反向开关补入实际PbzModConfig提供器，并统一Lua/JS使用引擎Saved路径；钩索入口优先使用实际TriggerBox，抓点固定保留在动作中，避免把空中瞄准球当作必须先步行到的入口。基于杀气塔顶货币现场前后快照及失败回归，待新版原点验收，详见[钩索与菜单修复](FIELD-FIXES-1.4.1.md)。

- **1.4.0本地候选**：新增可开关的目标侧反向搜索，覆盖离线路网、有限步行候选图和动作串联；所有物理认证保持实际行走方向。修正不一致启发式下关闭节点不重开的代价偏差。正反向离线对照未证明普遍加速，现场待验，详见[反向搜索对照](FIELD-FIXES-1.4.0.md)。

继续现场合作、规划下一轮或核对完成度时，先读[导航完善清单](NAVIGATION-TODO.md)和[验证台账](../authoring/navigation-validation.json)，按`activeCase`一次给用户一张测试卡。完成采样、代码通过和当前版本实走通过分别记账。

基于 azqwq333 的 0.8.5-beta，Fork 整理者 kurosakana；版本以 `release/NEXUS-FIELDS.json` 和运行入口为准。原始路网约 438 MB，未附生成工具。详见 [用户说明](USER-GUIDE.md)、[交互修补与现场坐标](INTERACTION-REPAIR.md)、[历史排错](LOCAL-FIX-HISTORY.md)。

- **修改边界**：开发导航；本轮用户另行授权补齐收集描述，使用导航自有组件在运行时补充。仓库1.0.14是唯一维护参考；1.0.9参考副本及从Git自动恢复逻辑已删除，不再测试或恢复。安装包不得包含或替换 `PbzMapTracker` 文件。
- **版本递增**：当前发布线从用户指定的 `1.0.1` 开始，后续修复版递增末位、功能版递增中间位，使用无 `fork.N` 后缀的版本。`release/VERSION-LOCK.json` 的当前版本、下限和历史记录必须同步；构建与包验证拒绝低于下限/历史或不等于锁定版本的包。`dist/` 只留当前包，旧包移到 `build/release-archive/` 并记录 SHA256，历史验证记录保留。
- **版本同步**：以 `release/NEXUS-FIELDS.json` 的 `version` 为准，同步其 `archive/fileDescription`、两个 JS 入口的 `BUILD`、C++ 的 `ModVersion`、双语说明和 `docs/USER-GUIDE.md`；更新 `CHANGELOG.md`，重建原生组件和完整 ZIP，通过 `verify-package.py` 后保存本版验证记录。历史记录保留原版本；现场未验证的限制继续写明。
- **源码位置**：`Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/`。`main.js → PBZRouteEntry.js → PBZQuestRoute.js`；内部 `PBZQuestRoute` 安装/配置标识保留。
- **寻路分工**：`World/Surface/Feasibility` 管脚点、地面、碰撞和楼层；`LocalWalk/Repair/Goals` 管局部 A*、绕障和物品接近点；`Passages/Transitions/LiveLinks` 管已加载通道、入口出口、方向、解锁和多动作串联；`Jobs` 管分帧规划与取消。
- **1.3.2本地候选**：A-01已由用户验收，A-02两次上墙正确、屋顶后缺线及回指穿墙未通过。合入已有worksheet-015地面候选，有限候选图支持调用原短落差检查，动作组合保留落差元数据；299项JS回归通过，尚待屋顶原点实测，详见[本轮修复](FIELD-FIXES-1.3.2.md)。以下1.2.x状态为历史记录，当前现场状态以完善清单及验证台账为准。
- **1.3.3本地候选**：1.3.2原地重选木板起点6150毫秒出正确路线、木板到第一梯入口步行已由用户确认；梯子入口动作线错位未通过。保留原交互/落脚检查，梯子显示改取同一Actor的有效模型轴线，并按落脚高度作有符号修正；300项JS回归通过，仍待游戏验收，详见[梯子显示修复](FIELD-FIXES-1.3.3.md)。连续攀爬后初次缺线另行保留。
- **路网构建**：原始 `PBZRouteWorlds/Faces/Chunks` 保留。`tests/stream-atlas.cjs` 生成忽略的 `build/` 缓存；512 KiB 数据块打包为 `PBZRouteStreaming`，旧块路径用等价兼容入口保留。`Atlas` 分帧加载后自动重算；使用构建脚本打包，避免旧缓存混入安装包。
- **显示与状态**：恢复单路线；Blocked/Obstacles/Ink 区分安全前段、实测阻挡 X 与待确认机关/虚线。PrivateRibbon/RibbonMath/RouteFiber 管离地约 105 厘米的蓝色细线，缓存同拓扑颜色；场景线不越过已知障碍。
- **当前范围**：1.2.10修复动作图与主规划器两个提交等待点：先规划整链再按路验边，完整链经主规划器物理审核和目标核对后及时交付，不以纯步行寻优阻塞。优先已验可走路线，不保证全局最短；保持检查/预算、拒绝部分连接冒充完成，并为首8个失败边保留标量碰撞诊断。292项JS回归。1.2.9已进入作者图，但完整连接后仍比较分支并启动纯步行搜索；一层铃铛与全程A-01仍未实景通过，待新版原点验证。详见[路线提交修复](FIELD-FIXES-1.2.10.md)。1.2.9修复一层铃铛到正确攀爬入口64.27米时，45米实时网格限制误挡有限作者图；作者图保留120米端点距离和768节点/64边检查/200毫秒预算，实时网格仍45米，地面/身体/锁检查保持。288项JS回归；1.2.8用户观察门口出线，一层铃铛无路线，新版待原点复测、整条A-01未通过。详见[接入范围修复](FIELD-FIXES-1.2.9.md)。1.2.8动作组合先试已验原生/离线/作者连接，再进入昂贵局部绕障；总期限/配额保持、预留完整回退，成功连接同轮复用、快速失败可在完整阶段重试。287项JS回归；1.2.7楼梯与二楼已观察到正确引导，大门口正确攀爬入口402毫秒找到后被无关向下梯子的28.55秒绕障拖至超时。新版本待门口原地复测，整条A-01未通过。详见[调度修复](FIELD-FIXES-1.2.8.md)。1.2.7将作者三维候选图搜索与现场边验证分开，每次候选图搜索最多768节点、整次预检64次连接验证、200毫秒执行预算；修正210厘米阈值下222厘米间隙断连。失败有向边本轮剔除，已验边只在同轮复用，原地面/身体/锁检查保留。284项JS回归；1.2.6仍多次现场超时，A-01未通过，新版待测速验路。详见[算法修复](FIELD-FIXES-1.2.7.md)与[官方/开源调研](NAVIGATION-ARCHITECTURE-RESEARCH-20261114.md)。1.2.6增加附近192节点/200毫秒步行预检、有限脚点候选优先检查和台阶侧面命中后的两侧支撑恢复；详见[本轮修复](FIELD-FIXES-1.2.6.md)。1.2.5现场仍缺路且末段错指攀爬，A-01保持未通过；新版待短段复测。1.2.5把目标列错误楼层的原生部分终点降为搜索线索，加入546个普通地面候选点辅助局部搜索，每步仍检查碰撞/楼层/锁；277项JS回归，1.2.5现场仍缺路和错指攀爬。不是新增固定课程，覆盖统计保留。1.2.4本地诊断候选增加原生查询/部分路径点列、动作连接开始/结果/中断记录，寻路与目标XYZ保持。A-01进门即错、原地重选仍错，尚未修复；273项JS回归。详见[诊断计划](FIELD-DIAGNOSTICS-1.2.4.md)。1.2.3针对1.2.2实测延迟，先验证高差原生候选，再优先尝试动作，未完成才回退步行修补；269项JS回归，现场仍待复测。当前计划与未解决问题以[完善清单](NAVIGATION-TODO.md)及验证台账为准。1.2.2修复绕行后段失败即放弃、动作后高层目标禁用局部楼梯连接，以及原地地面检查不一致；267项JS回归通过，保留所有碰撞、楼层和锁检查。四条1.2.1现场实走记录只作为作者证据，没有新增固定课程；1.2.2游戏复测待补，详见[现场修复](FIELD-FIXES-1.2.2.md)。1.2.1补齐十字键轮询、事件去重及合并地图跨世界选物/投影；现场读取175个真实标记用于回归回放，新版仍待游戏复测。保留1.2.0修复远段碰撞凭证过期后复用旧安全终点、三角面碰撞漏查、地图圆角抄近路与阻挡后段仍画白线；新增手柄十字键吸附该方向最近可见收集物，A确认真实三维位置并防止铃铛抢焦点。保留1.1.1修复收集Mod铃铛身份、路书遇阻跳过修复及锁路侧路绕行；保留1.1.0扩展动作适配与487个关卡放置实例，编制86条需实景检查的路书候选；乘船/已识别骑乘保留目标并续算，全图尚余52/140连接待补。保留1.0.2未激活铃铛陆路分支、近处物品中转比较、动作间地面路网连接及下滑/沿绳落点，保留路线计算/路网加载提示与等待秒数，保留物品铃铛推荐、出发绕行及抵达后的末段状态；保留按明确铃铛 ID 串联有向三维课程，以及最长 7.6 米、经碰撞/地面/锁检查的物品/标记支线。不可用机关和锁路参与组合选择。8 图、171 个游戏表项、4,324 个有序对及 140 条路书工作表连接已核对。**全图未完成：两条轨迹参考+86条需当前场景检查的三维候选，仍缺52条工作表连接**；尚无全程游戏验证。详见[移动支持与缺口](MOVEMENT-COVERAGE.md)。见 [全图覆盖与缺口](BELL-NETWORK-COVERAGE.md)、[固定路线](MANUAL-ROUTES.md)。无运行时采样、存盘或联网。
- **规划更新**：诊断/前沿/偏离重试要求平面移动至少600厘米或高差75厘米，并等待当前搜索结束；普通小跳与已验连续坡道保留搜索。门锁1250毫秒、已发现附近机关900毫秒更新；静止全路线审计10秒，近段线形检查独立。没有帧率实测；未加载区域、未知机关和旧图缺边仍可能导致缺路。

- **绳子颜色（1.3.0）**：导航自己的UE4SS Lua入口通过PbzModConfig客户端SDK注册`PBZQuestRoute`，不依赖收集Mod。`PBZRouteConfig.lua`独占`Saved/PBZQuestRoute-settings.json`，JS每900ms读取有效配置；`PBZRouteColor`解析预设和sRGB自定义色，`PrivateRibbon/Fiber`在颜色变化时刷新远近段及独立材质，保留同色缓存。SDK来源见适配器目录`PbzModConfig-SDK.txt`。真实PbzModConfig1.0.4主机协议测试可用`tests/run-lua-tests.py --mod-config-scripts <Scripts目录>`运行；菜单外观和场景颜色仍需游戏验收。

- **颜色菜单兼容（1.3.1）**：`PBZModConfigHost.lua`在PbzModConfig VM中仅包装导航自定义色行的创建/更新，同步行外层容器可见性，避免1.0.4只隐藏行文字而遗留兄弟预览块。原生入口按精确Mod名分发，不写入共享Mod目录。`tests/rope-modconfig-rows.py --mod-config-scripts <Scripts目录> --patch`使用真实Editors/Rows模块回归；去掉`--patch`应复现蓝色方块残留。

- **收集桥接**：导航自己的 `platform/steam/ue4ss/Mods/PBZQuestRouteCompat/`，C++ 启动钩子在收集 Mod 的 VM 内连接目标/悬停服务，经 Saved JSON 与 JS 同步。0.15.0 固定 UE4SS 1195 Shipping ABI/SHA，收集端改为公开服务契约检测；真实 1.0.9 和 1.0.14 模块通过测试，入口版本文字变化不再阻断联动，接口不兼容则恢复原服务。旧 JS 0.6.7 的小地图路线、图标放大、自动饰品提示未移植。
- **物品中转**：比较已激活且允许传送的铃铛与直接路径。先显示可用中转，受阻预览不覆盖它。起点接近段必须检查至铃铛，可有界局部绕行；物品附近铃铛按实景检查/路网连续/仅邻近估算分级，已知阻挡排除，远端不画未检查的步行线。手动传送后只继续该物品末段，切换目标清除阶段；等待传送不误判物品已到达。保留同层小幅移动重算限制。0.15.1 的 1,334 个已装运行文件匹配归档，现场首次出线约需 10～14 秒；1.2.10的完整JS/Lua/原生与包检查见release/VALIDATION-1.2.10.txt，机关/候选/乘船阶段使用模拟引擎验证；完整路线仍待游戏验证，没有FPS实测。
- **描述补充**：全量审计八图、1,616 目录点和 530 nativeDetails，补写 170 项中文获取提示；原生详情缺物品身份、同名歧义和游民无描述项保留清单。仅在 saveId/物品键/位置/原通用描述都匹配时补入，不覆盖新作者说明。见 [描述审计](ITEM-DESCRIPTION-AUDIT.md)。运行时不联网，不改收集文件。
- **排错入口**：读取游戏 `ProjectPBZ/PBZModLoader/loader.log`、`ProjectPBZ/Saved/PBZQuestRoute-log.txt`；目标快照通常在 `%LOCALAPPDATA%/ProjectPBZ/Saved/PBZQuestRoute-tracker.json`。上下层故障同时查规划起点是否过期、脚点高度、通道落点与状态、到达判定和 X 去重；不要把有预算的搜索失败宣称为不可达或全局最短。

```powershell
node --expose-gc tests/stream-atlas.cjs
node --test tests/atlas.test.cjs tests/context.test.cjs tests/navigation.test.cjs tests/planning.test.cjs tests/passages.test.cjs tests/tracker.test.cjs tests/terrain-regression.test.cjs tests/connectivity.test.cjs tests/locks.test.cjs tests/map-target.test.cjs tests/guides.test.cjs tests/bell-network.test.cjs tests/bell-coverage.test.cjs tests/route-status.test.cjs tests/roadbook.test.cjs tests/traversal.test.cjs tests/field-repair.test.cjs
node tests/audit-bells.cjs
py -3.12 tests/run-lua-tests.py
python native/build-native.py --ue4ss "现有 UE4SS.dll 路径" --test
python tests/build-patch.py
python tests/verify-package.py
```

Lua 测试用 `lupa.lua54`，原生构建用 MSVC x64；构建只读取现有 UE4SS。涉及发布时先读 [PUBLISH-NOTES](../release/PUBLISH-NOTES.md)，按当前页面状态与用户授权更新，不用历史草稿状态覆盖已发布页面。
