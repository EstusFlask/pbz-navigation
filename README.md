# 影之刃零 Mod 开发与 Navigation 接手说明

## 一、影之刃零 Mod 制作

- 两套运行时：PBZModLoader 执行 Puerts JavaScript（`require('ue')` 调用游戏反射 API）；UE4SS 执行 Lua/C++。不同 Mod 的 Lua 环境与 Puerts 不共享模块单例，跨运行时要设计桥接。
- 按游戏根目录打 ZIP：JS 放 `ProjectPBZ/PBZModLoader/mods/<Mod>/main.js`；资源放 `ProjectPBZ/Content/Mods/<Mod>/`；UE4SS 放 `platform/steam/ue4ss/Mods/<Mod>/{Scripts/main.lua,dlls/main.dll,enabled.txt}`。只打包自己拥有的文件，保留设置与共享运行时。
- UE Mod Manager 按文件路径识别归属和更新。分发完整替换包，包含依赖的路网/图标；增量文件不能作为独立完整 Mod 启用。
- 修改前先读工作区差异；用失败回归复现，再修代码。模拟测试、真实模块测试、游戏现场测试分别报告，不能互相替代。
- 本机游戏：`D:/software/Steam/steamapps/common/PBZ`；管理器：`D:/software/pbz-mod-manager`。游戏目录和管理器数据默认只读，交付仓库 `dist/` 的包。

## 二、Navigation Mod 接手

基于 azqwq333 的 0.8.5-beta，Fork 整理者 kurosakana；版本以 `release/NEXUS-FIELDS.json` 和运行入口为准。原始路网约 438 MB，未附生成工具。详见 [用户说明](docs/USER-GUIDE.md)、[交互修补与现场坐标](docs/INTERACTION-REPAIR.md)、[历史排错](docs/LOCAL-FIX-HISTORY.md)。

- **修改边界**：开发导航；本轮用户另行授权补齐收集描述，使用导航自有组件在运行时补充。仓库新版 Map Tracker 是兼容测试参考；已删除的 1.0.9 从 Git 导出到 build/ 测试，不恢复用户删除。安装包不得包含或替换 `PbzMapTracker` 文件。
- **版本递增**：当前发布线从用户指定的 `1.0.1` 开始，后续修复版递增末位、功能版递增中间位，使用无 `fork.N` 后缀的版本。`release/VERSION-LOCK.json` 的当前版本、下限和历史记录必须同步；构建与包验证拒绝低于下限/历史或不等于锁定版本的包。`dist/` 只留当前包，旧包移到 `build/release-archive/` 并记录 SHA256，历史验证记录保留。
- **版本同步**：以 `release/NEXUS-FIELDS.json` 的 `version` 为准，同步其 `archive/fileDescription`、两个 JS 入口的 `BUILD`、C++ 的 `ModVersion`、双语说明和 `docs/USER-GUIDE.md`；更新 `CHANGELOG.md`，重建原生组件和完整 ZIP，通过 `verify-package.py` 后保存本版验证记录。历史记录保留原版本；现场未验证的限制继续写明。
- **源码位置**：`Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/`。`main.js → PBZRouteEntry.js → PBZQuestRoute.js`；历史目录名和内部 `PBZQuestRoute` 安装/配置标识保留。
- **寻路分工**：`World/Surface/Feasibility` 管脚点、地面、碰撞和楼层；`LocalWalk/Repair/Goals` 管局部 A*、绕障和物品接近点；`Passages/Transitions/LiveLinks` 管已加载通道、入口出口、方向、解锁和多动作串联；`Jobs` 管分帧规划与取消。
- **路网构建**：原始 `PBZRouteWorlds/Faces/Chunks` 保留。`tests/stream-atlas.cjs` 生成忽略的 `build/` 缓存；512 KiB 数据块打包为 `PBZRouteStreaming`，旧块路径用等价兼容入口保留。`Atlas` 分帧加载后自动重算；使用构建脚本打包，避免旧缓存混入安装包。
- **显示与状态**：恢复单路线；Blocked/Obstacles/Ink 区分安全前段、实测阻挡 X 与待确认机关/虚线。PrivateRibbon/RibbonMath/RouteFiber 管离地约 105 厘米的蓝色细线，缓存同拓扑颜色；场景线不越过已知障碍。
- **当前范围**：1.0.1 增加路线计算/路网加载提示与等待秒数，保留物品铃铛推荐、出发绕行及抵达后的末段状态；保留按明确铃铛 ID 串联有向三维课程，以及最长 7.6 米、经碰撞/地面/锁检查的物品/标记支线。不可用机关和锁路参与组合选择。8 图、171 个游戏表项、4,324 个有序对及 140 条路书工作表连接已核对。**全图手工三维路线未完成，仅原有两个方向启用，仍待全程游戏验证**；工作表不进入游戏。见 [全图覆盖与缺口](docs/BELL-NETWORK-COVERAGE.md)、[固定路线](docs/MANUAL-ROUTES.md)。无运行时采样、存盘或联网。
- **规划更新**：诊断/前沿/偏离重试要求平面移动至少600厘米或高差75厘米，并等待当前搜索结束；普通小跳与已验连续坡道保留搜索。门锁1250毫秒、已发现附近机关900毫秒更新；静止全路线审计10秒，近段线形检查独立。没有帧率实测；未加载区域、未知机关和旧图缺边仍可能导致缺路。

- **收集桥接**：导航自己的 `platform/steam/ue4ss/Mods/PBZQuestRouteCompat/`，C++ 启动钩子在收集 Mod 的 VM 内连接目标/悬停服务，经 Saved JSON 与 JS 同步。0.15.0 固定 UE4SS 1195 Shipping ABI/SHA，收集端改为公开服务契约检测；真实 1.0.9 和 1.0.14 模块通过测试，入口版本文字变化不再阻断联动，接口不兼容则恢复原服务。旧 JS 0.6.7 的小地图路线、图标放大、自动饰品提示未移植。
- **物品中转**：比较已激活且允许传送的铃铛与直接路径。先显示可用中转，受阻预览不覆盖它。起点接近段必须检查至铃铛，可有界局部绕行；物品附近铃铛按实景检查/路网连续/仅邻近估算分级，已知阻挡排除，远端不画未检查的步行线。手动传送后只继续该物品末段，切换目标清除阶段；等待传送不误判物品已到达。保留同层小幅移动重算限制。0.15.1 的 1,334 个已装运行文件匹配归档，现场首次出线约需 10～14 秒；本版 202 项 JS 回归通过，新增等待反馈，未做提速，提示外观及完整路线仍待游戏验证。
- **描述补充**：全量审计八图、1,616 目录点和 530 nativeDetails，补写 170 项中文获取提示；原生详情缺物品身份、同名歧义和游民无描述项保留清单。仅在 saveId/物品键/位置/原通用描述都匹配时补入，不覆盖新作者说明。见 [描述审计](docs/ITEM-DESCRIPTION-AUDIT.md)。运行时不联网，不改收集文件。
- **排错入口**：读取游戏 `ProjectPBZ/PBZModLoader/loader.log`、`ProjectPBZ/Saved/PBZQuestRoute-log.txt`；目标快照通常在 `%LOCALAPPDATA%/ProjectPBZ/Saved/PBZQuestRoute-tracker.json`。上下层故障同时查规划起点是否过期、脚点高度、通道落点与状态、到达判定和 X 去重；不要把有预算的搜索失败宣称为不可达或全局最短。

```powershell
node --expose-gc tests/stream-atlas.cjs
node --test tests/atlas.test.cjs tests/context.test.cjs tests/navigation.test.cjs tests/planning.test.cjs tests/passages.test.cjs tests/tracker.test.cjs tests/terrain-regression.test.cjs tests/connectivity.test.cjs tests/locks.test.cjs tests/map-target.test.cjs tests/guides.test.cjs tests/bell-network.test.cjs tests/bell-coverage.test.cjs tests/route-status.test.cjs
node tests/audit-bells.cjs
py -3.12 tests/run-lua-tests.py
python native/build-native.py --ue4ss "现有 UE4SS.dll 路径" --test
python tests/build-patch.py
python tests/verify-package.py
```

Lua 测试用 `lupa.lua54`，原生构建用 MSVC x64；构建只读取现有 UE4SS。涉及发布时先读 [PUBLISH-NOTES](release/PUBLISH-NOTES.md)，按当前页面状态与用户授权更新，不用历史草稿状态覆盖已发布页面。
