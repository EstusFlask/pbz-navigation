# 影之刃零 · 任务与探索导航

**Quest and Exploration Navigation - Fork** 为任务、地图标记、收集物和铃铛提供区域地图路线及场景蓝色引导线。基于 azqwq333 的 **0.8.5-beta**，由 kurosakana 维护。本仓库用于公开源码、问题追踪和开发交接。

- [下载发行版 / Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/994?tab=files)
- [完整使用说明](docs/USER-GUIDE.md) · [更新记录](release/CHANGELOG.md)
- [参与开发 / 接手维护](CONTRIBUTING.md) · [报告问题](https://github.com/EstusFlask/pbz-navigation/issues)
- Agent 从 [AGENTS.md](AGENTS.md) 开始；当前进度以[持久项目状态](docs/OFFLINE-NAVIGATION-STATE.md)为准。

## 当前版本与限制

当前源码／本地候选 **1.12.0**，提供 **Full 与 Lite**。全图版已接入 11 个世界的首轮碰撞重建导航，仍属实验版本：部分路线缺失、跨层或特殊动作连接不准确，性能也有继续优化的空间。离线候选和模拟测试通过不代表游戏中已走通；当前问题及实测证据见[项目状态](docs/OFFLINE-NAVIGATION-STATE.md)。

1.11.5 新增对 UE4SS 4.0.0（保留 1195）的收集联动与绳色界面适配器兼容；1.11.4 改善物品寻路失败后的铃铛备用、连续下降候选和绕路前段显示。传送、攀爬、钩索等动作仍由玩家操作。游戏运行端使用普通 JavaScript；Recast/Detour 的 WASM 只用于离线工具，不要求游戏宿主支持 WASM。

**Nexus 仅发布发行版。Development 开发版供开发者本地构建和测试，不公开分发。** 1.12.0 Lite 保留全部原有功能，增加按需使用的精简铃铛路网，其他目标保留旧数据寻路；切换版本前关闭游戏，卸载旧导航并保留配置，只启用一份导航。

## 安装与基本操作

1. 安装 [PBZModLoader](https://www.nexusmods.com/phantombladezero/mods/113)（已测试 1.0.0），从 Nexus 下载导航发行包。
2. 退出游戏并备份配置。**先解压 ZIP**，向 UE Mod Manager 导入同时包含 `ProjectPBZ` 和 `platform` 的解压目录；手动安装则将这两个目录合并到游戏根目录。
3. 收集物联动另需 [Map Tracker Plus](https://www.nexusmods.com/phantombladezero/mods/187)（已测试 1.0.14）及其 [UE4SS 依赖](https://www.nexusmods.com/phantombladezero/mods/5)。这些依赖不包含在本包中，导航不替换收集 Mod 的文件。
4. 在地图上选择目标。收集物可悬停后按鼠标中键，或用手柄十字键选择并按 A 确认；关闭地图查看场景引导线。绳色设置另需 [PbzModConfig](https://www.nexusmods.com/phantombladezero/mods/173)。

配置、卸载、旧版迁移、完整按键及日志位置见[使用说明](docs/USER-GUIDE.md)。直接从仓库复制文件不等于安装完整发行包：全图数据和生成物不全在 Git 中。

## 寻找贡献者与接手维护者

我平时比较忙，也已经通关游戏，对接下来如何优化暂时缺少明确方向，希望找到愿意继续开发或接手维护的人。有导航 Mod、寻路、Unreal Engine Mod 或类似开发经验更好。

有兴趣请在 [GitHub Issues](https://github.com/EstusFlask/pbz-navigation/issues/new?template=maintainer.yml) 联系我，介绍相关经验，尽量附上自己的仓库或 Mod 链接及 Nexus Mods 账号。双方确认合适后，我会邀请你参与 GitHub 协作，并加入 Nexus Mod 的 contributor 名单。普通 bug 修复、性能分析、文档和实测贡献也欢迎，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发入口

| 目录 / 文档 | 用途 |
| --- | --- |
| `Quest_Navigation/` | 导航 JavaScript、资源和自有 UE4SS Lua/C++ 适配器的安装布局 |
| `offline-navigation/`、`tools/` | 游戏碰撞读取、Recast/Detour 离线烘焙、打包与诊断 |
| `native/` | 已有 UE4SS 兼容适配器的 C++ 源码和构建工具 |
| `tests/` | JavaScript、Lua、Python 回归与发行包校验 |
| `authoring/` | 开发测试端点和参考证据；实走轨迹不用于补造道路 |
| `docs/` | 维护、设计、现场问题和验收记录 |
| `release/` | 版本锁、Nexus 文案、发布规范及历史验证记录 |
| `archive/heybox-20261115/` | 冻结的小黑盒实验和来源说明，不参与当前构建或运行 |

先读[贡献指南](CONTRIBUTING.md)，再按[开发与维护说明](docs/DEVELOPMENT.md)选择验证范围。游戏安装、密钥、原始数据包、收集 Mod 参考副本、全图暂存、日志和 `dist/` 不随源码克隆；完整构建需要自行准备相应输入。

## 署名与权限

原导航及随包资产：**azqwq333**；Fork 维护：**kurosakana**；Map Tracker Plus：**PiPiFanDev**。代码、文档和页面文案使用 AI 辅助。

本次公开源码**不新增统一开源许可证，也不改变现有权限**。原作者内容、游戏衍生数据和第三方组件各自保留原有权利与许可；公开仓库不代表其中全部内容可以任意再分发或重新授权。来源与现有许可文件见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## English

Quest, map-pin, collectible and bell navigation for **Phantom Blade Zero**, with regional-map routes and a blue world guide. Current source/local candidate: **1.12.0**, in Full and Lite editions. Lite retains all original features and adds compact bell corridors. Full-world navigation is experimental; missing routes, traversal connections and performance still need work. Download the complete Release package from [Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/994?tab=files), extract it, then import the folder containing both `ProjectPBZ` and `platform` into UE Mod Manager. See the bilingual [user guide](docs/USER-GUIDE.md). Development builds are for local developer use only.

**Contributors / maintainer wanted:** I am busy, have finished the game, and am unsure where to take the next optimizations. Experience with navigation mods, pathfinding, Unreal Engine modding or related work would be helpful. Please open a [GitHub Issue](https://github.com/EstusFlask/pbz-navigation/issues/new?template=maintainer.yml) with your experience, repository/mod links and Nexus Mods account. After we agree on the handover, I can invite you to collaborate on GitHub and add you as a contributor on the Nexus mod page. Start with [CONTRIBUTING.md](CONTRIBUTING.md); agents should read [AGENTS.md](AGENTS.md).

Source publication retains existing permissions; no new repository-wide open-source license is granted. See [third-party notices](THIRD-PARTY-NOTICES.md).
