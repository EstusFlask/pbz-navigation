# 参与开发与维护交接 / Contributing

欢迎 bug 修复、性能分析、文档和游戏实测贡献，也希望找到愿意接手维护的开发者。请开 [GitHub Issue](https://github.com/EstusFlask/pbz-navigation/issues/new?template=maintainer.yml)，介绍导航 Mod、寻路、UE Mod 或类似经验，尽量附仓库 / Mod 链接及 Nexus Mods 账号。由维护者评估后邀请 GitHub 协作并加入 Nexus Mod contributor；申请不会自动授予权限。

## 从哪里开始

1. 阅读 [README](README.md)，再读[当前项目状态](docs/OFFLINE-NAVIGATION-STATE.md)的目标、当前活动目标及最新现场记录。该文件保留历史，旧版结论不能覆盖最新状态。
2. 阅读[开发与维护说明](docs/DEVELOPMENT.md)。运行时入口是 `Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/main.js`；离线流程见 [offline-navigation/README.md](offline-navigation/README.md)。
3. 从最新 `main` 创建工作分支。提交前查看已有工作区差异；一次 PR 聚焦一个问题，说明触发条件、修改后的行为和实际验证结果。
4. 导航改动更新持久项目状态，把离线候选、独立碰撞检查、模拟接线和游戏实测结果分开记录。未完成的游戏验收继续保留。

## 环境与本地输入

开发以 Windows / PowerShell 为主，使用支持 `node:test` 的 Node.js、npm 和 Python 3.12；编译已有适配器另需 MSVC x64 / Windows SDK。离线 npm 依赖版本由 lockfile 固定。从根目录安装：

```powershell
npm --prefix offline-navigation ci --ignore-scripts
```

下列输入由开发者自行准备，不提交 Git：

| 输入 | 用途与位置 |
| --- | --- |
| Map Collectible Tracker 1.0.14 | 真实联动测试；从 [Nexus #187](https://www.nexusmods.com/phantombladezero/mods/187) 自行下载，在根目录解压为唯一的 `Map_Collectible_Tracker_1.0.14*` 目录，内部保留 `platform/steam/ue4ss/Mods/PbzMapTracker/Scripts/main.lua`。见 `tests/collector_fixture.py`。 |
| Python `lupa` | Lua 5.4 测试：`py -3.12 -m pip install lupa`；也可安装到 `tests/run-lua-tests.py` 支持的临时依赖目录。 |
| 游戏数据、解码依赖与本地密钥 | 离线重建需要；当前脚本含原维护者本机路径，先检查参数和 `--help`，再在本地配置。步骤见离线说明，仅克隆源码不足以复现所有数据。 |
| 已校验的全图暂存及其 receipt | 完整双包构建需要。默认位置由 `release/NEXUS-FIELDS.json` 的 `offlineWorldStage` 指定；可用 `--world-stage` 指定 `build/offline-navigation/` 下相同版本、通过校验的暂存。不能用空目录绕过数据检查。 |
| 已安装的 UE4SS.dll | 只读用于适配器链接和 ABI 核对，不将共享运行时复制进仓库或发行包。 |

全图暂存不会从 Nexus 安装包自动恢复；缺失时按离线说明重新生成并校验，或先做不依赖它的源码工作。游戏、存档、管理器和其他 Mod 默认只读；安装、启动游戏或发布需要用户明确授权。

## 验证

不依赖游戏或收集 Mod 的最小源码检查：

```powershell
node --test tests/context.test.cjs tests/navigation.test.cjs tests/rope-color.test.cjs
```

备齐真实收集参考、离线 npm 依赖及相关本地输入后，运行全部 JavaScript 源码测试与 Lua 联动测试：

```powershell
$navigationTestFiles = @(Get-ChildItem tests -Filter '*.test.cjs' | ForEach-Object FullName)
node --test @navigationTestFiles
py -3.12 tests/run-lua-tests.py
```

Python 离线重建和物理检查按修改范围选择，命令见离线说明与维护指南。模拟结果只能证明对应协议或候选；游戏中是否可走、帧卡是否改善需要真实宿主验收。

修改版本或交付安装包时，先读 [release/README.md](release/README.md)，同步版本锁与文案，重建需要的原生适配器，再构建、校验两个完整包：

```powershell
py -3.12 native/build-native.py --ue4ss '你的只读 UE4SS.dll 绝对路径' --test
py -3.12 tests/build-patch.py --flavor all
py -3.12 tests/verify-package.py --flavor all
```

`dist/` 只保留当前两包；旧包按发布规范归档。Nexus 仅上传 Release；Development 只在开发者本地使用。纯文档和 Git 整理不递增 Mod 版本、不重建安装包。

## Issue / PR 要求

- 路线故障：提供 Mod / 依赖版本、区域、目标、起终点楼层、步骤和实际行为，附裁剪后的相关日志。开发录制见[补采说明](docs/DEVELOPMENT-SURVEYS.md)，无需上传整份存档。
- PR：说明原因、行为变化、检查结果和尚未验证部分，保留署名与许可。导航结果遵守当前地面、胶囊、方向、能力、门锁和机关检查，实走轨迹只作验算参考。
- 提交前检查 `git diff --check` 和暂存列表，确保没有密钥、凭证、个人存档、诊断录制、下载的 Mod / 游戏源包、`node_modules/`、`build/` 或 `dist/`。
- 本仓库公开源码并保留现有权限，未授予新的统一开源许可证；参与修改和再分发前阅读[来源与权限说明](THIRD-PARTY-NOTICES.md)。

## English handover notes

Open a [maintainer application Issue](https://github.com/EstusFlask/pbz-navigation/issues/new?template=maintainer.yml) with your navigation/pathfinding/modding experience, repository or mod links, and Nexus account. The owner will review it before granting collaboration access and Nexus contributor credit.

Read the [persistent state](docs/OFFLINE-NAVIGATION-STATE.md), then the [maintenance guide](docs/DEVELOPMENT.md). Most detailed engineering notes are currently in Chinese. Start from `main`. Install locked offline dependencies with `npm --prefix offline-navigation ci --ignore-scripts`; the three-file smoke check above needs no game installation. Full integration tests need your own MCT 1.0.14 reference. Complete packages also need verified world staging and its receipt, local game-data tooling, and the existing UE4SS adapter. A clean clone is not a complete installable mod.

Keep offline results, mocked integration and actual game acceptance separate. Game installs and saves are read-only by default. Build and verify both flavors locally; publish Release only when authorized. Existing ownership and third-party licenses remain in effect.
