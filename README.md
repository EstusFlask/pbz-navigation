# 影之刃零 Mod 开发与 Navigation 接手说明

## 一、影之刃零 Mod 制作

- 两套运行时：PBZModLoader 执行 Puerts JavaScript（`require('ue')` 调用游戏反射 API）；UE4SS 执行 Lua/C++。不同 Mod 的 Lua 环境与 Puerts 不共享模块单例，跨运行时要设计桥接。
- 按游戏根目录打 ZIP：JS 放 `ProjectPBZ/PBZModLoader/mods/<Mod>/main.js`；资源放 `ProjectPBZ/Content/Mods/<Mod>/`；UE4SS 放 `platform/steam/ue4ss/Mods/<Mod>/{Scripts/main.lua,dlls/main.dll,enabled.txt}`。只打包自己拥有的文件，保留设置与共享运行时。
- UE Mod Manager 按文件路径识别归属和更新。分发完整替换包，包含依赖的路网/图标；增量文件不能作为独立完整 Mod 启用。
- 修改前先读工作区差异；用失败回归复现，再修代码。模拟测试、真实模块测试、游戏现场测试分别报告，不能互相替代。
- 本机游戏：`D:/software/Steam/steamapps/common/PBZ`；管理器：`D:/software/pbz-mod-manager`。游戏目录和管理器数据默认只读，交付仓库 `dist/` 的包。

## 二、Navigation Mod 接手

基于 azqwq333 的 0.8.5-beta，Fork 整理者 kurosakana；版本以 `release/NEXUS-FIELDS.json` 和运行入口为准。原始路网约 438 MB，未附生成工具。详见 [用户说明](docs/USER-GUIDE.md)、[交互修补与现场坐标](docs/INTERACTION-REPAIR.md)、[历史排错](docs/LOCAL-FIX-HISTORY.md)。

- **修改边界**：只开发导航。`Map_Collectible_Tracker_1.0.9/` 是原版兼容测试参考；安装包不得包含或替换 `PbzMapTracker` 文件。
- **版本递增**：修复版递增基础版本末位（如 `0.8.6 → 0.8.7`），功能版递增中间位并将末位归零（如 `0.8.7 → 0.9.0`）。`fork.N` 仅区分同一基础版本的候选包，基础版本改变后从 `fork.1` 开始；同一批未交付编辑共用一个版本。已交付版本、ZIP 和验证记录保留。
- **版本同步**：以 `release/NEXUS-FIELDS.json` 的 `version` 为准，同步其 `archive/fileDescription`、两个 JS 入口的 `BUILD`、C++ 的 `ModVersion`、双语说明和 `docs/USER-GUIDE.md`；更新 `CHANGELOG.md`，重建原生组件和完整 ZIP，通过 `verify-package.py` 后保存本版验证记录。历史记录保留原版本；现场未验证的限制继续写明。
- **源码位置**：`Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/`。`main.js → PBZRouteEntry.js → PBZQuestRoute.js`；历史目录名和内部 `PBZQuestRoute` 安装/配置标识保留。
- **寻路分工**：`World/Surface/Feasibility` 管脚点、地面、碰撞和楼层；`LocalWalk/Repair/Goals` 管局部 A*、绕障和物品接近点；`Passages/Transitions/LiveLinks` 管已加载通道、入口出口、方向、解锁和多动作串联；`Jobs` 管分帧规划与取消。
- **路网构建**：原始 `PBZRouteWorlds/Faces/Chunks` 保留。`tests/stream-atlas.cjs` 生成忽略的 `build/` 缓存；512 KiB 数据块打包为 `PBZRouteStreaming`，旧块路径用等价兼容入口保留。`Atlas` 分帧加载后自动重算；使用构建脚本打包，避免旧缓存混入安装包。
- **显示与状态**：恢复 `0.8.7-fork.1` 单路线；`Blocked/Obstacles/Ink` 管安全前段、X 与未确认虚线。`PrivateRibbon/RibbonMath/RouteFiber` 管无拖尾细线网格，缓存同拓扑的颜色；场景线不越过已知障碍。`Arrival/Selection/Tracker` 管目标、到达与联动。
- **当前范围**：`0.9.0` 多路线已撤回。当前只做单路线精简与等效性能优化；细节和验证依据见 [回退与精简](docs/COMPACT-SINGLE-ROUTE.md)。
- **收集桥接**：导航自己的 `platform/steam/ue4ss/Mods/PBZQuestRouteCompat/`，C++ 启动钩子在收集 Mod 的 VM 内连接目标/悬停服务，经 Saved JSON 与 JS 同步。`native/` 为入口源码；固定 UE4SS 1195 Shipping ABI，并校验原版收集 1.0.9 入口哈希。旧 JS 0.6.7 的小地图路线、图标放大、自动饰品提示未移植。
- **排错入口**：读取游戏 `ProjectPBZ/PBZModLoader/loader.log`、`ProjectPBZ/Saved/PBZQuestRoute-log.txt`；目标快照通常在 `%LOCALAPPDATA%/ProjectPBZ/Saved/PBZQuestRoute-tracker.json`。上下层故障同时查规划起点是否过期、脚点高度、通道落点与状态、到达判定和 X 去重；不要把有预算的搜索失败宣称为不可达或全局最短。

```powershell
node --expose-gc tests/stream-atlas.cjs
node --test tests/atlas.test.cjs tests/context.test.cjs tests/navigation.test.cjs tests/planning.test.cjs tests/passages.test.cjs tests/tracker.test.cjs
python tests/run-lua-tests.py
python native/build-native.py --ue4ss "现有 UE4SS.dll 路径" --test
python tests/build-patch.py
python tests/verify-package.py
```

Lua 测试用 `lupa.lua54`，原生构建用 MSVC x64；构建只读取现有 UE4SS。涉及发布时先读 [PUBLISH-NOTES](release/PUBLISH-NOTES.md)：当前原作者授权待办未关闭，Nexus 草稿保持未发布。
