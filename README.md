# Quest Navigation 本地修补

`Quest_Navigation_0.8.5` 可以直接修改：入口、寻路、碰撞、红绳绘制及兼容层都是可读 JavaScript。地图路网与表面数据也在包内，但没有附带其生成工具。`Map_Collectible_Tracker_1.0.9` 的入口可读，其他核心模块大部分是封装的 Lua 5.4 字节码。

本地补丁标识：`0.8.5-local-fix2`。这是在现有包上的修改，不是作者发布的新版本。开发和安装范围只有导航 Mod；收集 Mod 的原始文件保持不变。

## 已处理

- **红绳远段穿墙**：原先红绳自身的碰撞检测只覆盖角色前方约 10 米。补丁把远段也纳入检测，每次最多追加 12 次探测，并检查 2 毫秒的分帧预算。远段绘制使用已检测的折线；碰撞处停止绘制。动态障碍会定期复查。
- **红绳更新开销**：重塑及路线碰撞审计分别限制为每 16 毫秒最多一次，避免 8 毫秒定时器连续消耗两份预算；网格直接使用绘制样本，去掉头段每次 49 次样条坐标回读。样条使用线性连接，避免曲线插值在拐角额外偏移。
- **1.0.9 收集目标同步**：原导航只适配 JavaScript 版 Map Tracker Plus 0.6.7，与 UE4SS/Lua 版 1.0.9 不能直接通信。新增两端适配，将 1.0.9 的手动目标、自动追踪目标、收集完成和取消事件送给导航；导航取消也会通知收集 Mod。取消命令校验会话、目标和修订号，过期命令不能清除新目标。

## 范围与限制

桥接脚本和原生入口组件都放在导航拥有的 `platform/steam/ue4ss/Mods/PBZQuestRouteCompat/` 下，通过 UE4SS 启动事件在运行时连接收集目标服务，不替换、复制或修改 `PbzMapTracker` 目录。原版收集 Mod 无需更换。

原生组件针对当前 UE4SS `v3.0.1-1195-g1ceefac8` Shipping 版本及原版收集 Mod 1.0.9 构建，启动时验证两者的文件校验值。其他版本会停用收集联动，基础任务/落旗导航仍可使用；状态记录在导航桥接目录的 `PBZQuestRouteCompat-status.txt`。

- 没有提供具体穿墙点位，因此未改动 11 个世界的路网数据。此次修补的是通用红绳碰撞与绘制问题，不能视作已修完所有地图错点、错误连边或楼层问题。
- **1.0.9 已适配的是目标导航与取消同步。** 旧 0.6.7 适配层中的小地图路线叠加、放大图标及自动饰品提示没有迁移到 Lua 版；导航设置里的对应选项对 1.0.9 不生效。1.0.9 自身的小地图、图标和追踪功能仍由它管理。
- 检查了真实 Lua 1.0.9 目标模块与 JavaScript 导航接收器之间的文件通信，但未启动游戏验证 UE 原生碰撞、输入钩子、地图界面或帧率。不能据此承诺实际 FPS 提升幅度或完整游戏兼容。

## 安装补丁

完整包：`dist/Quest_Navigation_0.8.5-local-fix2-navigation-only-full.zip`。内含全部导航脚本、路网、图标和导航自己的桥接组件，可以替换原导航；包内没有收集 Mod 的文件。上一版 `local-fix1-patch.zip` 是增量包，不再用于管理器导入。

1. 退出游戏，保留管理器里现有的 Map Collectible Tracker 1.0.9，保持启用。
2. 把新的导航完整 ZIP 拖入 UE Mod Manager。保留导航游戏文件及 `PBZQuestRouteCompat` 两部分的勾选。
3. 管理器应识别为更新原 Quest Navigation，确认更新后启用导航。不要同时启用另一份旧导航。
4. 不要导入旧的增量包，不要替换或停用收集 Mod。若之前已手工应用过 fix1 对收集 Mod 的改动，应先恢复官方 1.0.9；按已检查的当前管理器记录，用户安装的收集 Mod 是原版。
5. 导航继续由 PBZModLoader 加载，导航自己的桥接组件使用现有 UE4SS。包内没有加载器或 UE4SS 本体，无需替换它们。
6. 重启游戏，在收集 Mod 中选择目标，检查大地图路线、场景红绳、切换目标、完成收集和取消追踪。

不要同时保留旧 JavaScript 收集 Mod；按 1.0.9 原说明移走旧 `pbz-map-tracker` 目录。这里没有复制或覆盖实际游戏安装目录。

联动文件保存在游戏实际 Saved 目录：`PBZQuestRoute-tracker.json` 和 `PBZQuestRoute-command.json`。它们是临时状态，不是存档。日志中出现 `UE4SS Map Tracker target adapter active` 表示导航已连接。

撤回时用管理器恢复原导航或移除新导航，收集 Mod 不需要恢复或重装。这里没有改动实际游戏目录或管理器数据。

## 本地验证

```powershell
node --test tests/navigation.test.cjs tests/tracker.test.cjs
python tests/run-lua-tests.py
python native/build-native.py --ue4ss "现有 UE4SS.dll 的路径" --test
python tests/build-patch.py
```

Lua 检查需要 Python 的 `lupa`，并明确使用其 Lua 5.4 运行时，或用 Lua 5.4 执行 `tests/tracker-bridge.lua`（需将收集 Mod 的 Scripts 目录加入 `package.path`）。

回归覆盖远段墙体、动态障碍复查、远段探测预算、重复重塑、样条回读、审计节流、目标同步、无效/过期状态、自动提示、断连恢复、过期取消、心跳与停止。另有真实文件往返：Lua 1.0.9 目标 → JSON → JavaScript 导航 Tracker → 取消命令 → Lua 1.0.9。

fix2 还检查独立桥接入口、require 恢复、重复加载、原生 ABI 布局、文件校验门限及启动分派。原生测试使用隔离测试接口，不等同于游戏内加载测试。

原生组件使用固定 UE4SS 提交 `1ceefac8b8c286f0fb3eb62b4aae075ff81df0bd` 的公开接口构建，编译器为 MSVC x64 Release/MD。[UE4SS 启动事件接口](https://github.com/UE4SS-RE/RE-UE4SS/blob/1ceefac8b8c286f0fb3eb62b4aae075ff81df0bd/UE4SS/include/Mod/CppUserModBase.hpp)。完整导航数据也使管理器可以按其“至少覆盖原条目一半文件”的规则识别更新。[管理器 1.6.4 更新识别规则](https://github.com/KintaroModding/uemodmanager/blob/v1.6.4/src/UEManager.Core/Mods/ModManager.cs)。
