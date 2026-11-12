# Quest and Exploration Navigation - Fork

任务与探索导航分支，版本 **0.10.3-fork.1**。基于 **azqwq333** 的 [Quest and Exploration Navigation 0.8.5-beta](https://www.nexusmods.com/phantombladezero/mods/472) 及本地 `0.8.5-local-fix5`。Fork 整理：kurosakana。原导航系统、11 个世界路网、行走表面数据及原包资产归原作者。本分支代码与说明使用 AI 辅助生成。

**当前为待授权发布候选。** 原页面要求修改及资产使用先取得作者许可；停止维护的声明没有开放这些权限。目前尚未取得授权，完整包供本地审阅，Nexus 草稿 #994 保持未发布。

## 本版改动

- 0.10.3 根据 0.10.2 的失败复测，修复移动取消时丢失已测墙体、道路走廊封错边，以及已知受阻的原路网尾段继续显示的问题。
- 已验的连续攀爬可作为安全前沿保留，最后钩索暂不可用时不再整链丢弃；更远离目标的未完成回头候选不能覆盖它。动作经入口、出口和步行连接检查后可及时接入主图并重试。
- 远端未加载地面不再阻止起点搜索；长途网格在完全受困的小平台细分至 70/35 厘米，仍保留胶囊、落点与方向检查。日志补充驻留动作提取及搜索结束/拒绝原因。
- 0.10.2 根据两条铃铛路线的 0.10.1 复测修补规划顺序、候选显示与上下层绕行。先检查原路网山洞候选，避免在失败直线的昂贵修补后才发现；原生/合成直线失败后只保留已检查前段。
- 尚未确认的原路网远段保留为地图虚线；实测受阻尾段裁掉。保留攀爬和钩索动作。局部修补仅替换失败的步行段，可尝试已加载交互补接，再重新验路。尚未加载的通道用机关提示，实测阻挡才用 X，已知锁保留锁和物品提示。
- 常规实景局部搜索约 120 米，长途可到 200 米；允许经落点与下降空间检查的短跳落，仅开放向下方向。搜索期间先发布已检查前段，绕行暂时远离目标也能更新；沿已验坡道移动不会反复取消任务。仍受场景加载、节点、执行预算和 30 秒总时限约束。
- 场景引导线改为蓝色，离地约 105 厘米，末端保持同样高度；碰撞检查按实际抬高后的线形执行。
- 铃铛图标中键/手柄确认保留该铃铛的坐标和高度，独立于普通路网落旗。修复 0.10.0 实测中衣冠冢目标吸附至约 101 米外的问题；普通落旗限制在 13 像素内，超出时只留纸面标记，不把远路当终点。
- 路线动作保留路网边编号。攀爬落点验证失败时可排除对应连接并尝试其他候选；路线恰好终止于动作落点时也检查支撑。铃铛允许在同层交互距离内接近，日志记录铃铛 ID、选点来源和最终坐标。
- 密集台阶失败处细分采样；窄裂缝检查胶囊两侧支撑，仍拒绝宽坑、高坎和身体碰撞。
- 预扫描全部 17 类已驻留交互，补上滑索漏扫；按候选代价逐步检查动作连接，避免多段攀爬/钩索被起点探测耗尽预算。
- 局部、交互和修补搜索按实际执行时间计费，暂停等待下一帧不消耗这些预算；整次规划仍有 30 秒总上限。
- 长途路线的起终点附近可独立尝试经过碰撞检查的步行补接，只开放已测方向。已知门锁及钥匙/物品条件参与规划和持续验路；尚未接入背包查询。
- 依据用户反馈保留大廊桥至小张藏身处约 198.8 米离线候选。陆家村 22 个铃铛的 462 个有向组合已审计，其中 362 个在原始图内断开；这不是游戏不可达判定或新版成功率，详见 [铃铛审计](BELL-ROUTE-AUDIT.md)。
- 保留任务追踪、地图落旗、大地图路线、场景引路线、同层抵达收线、跨区域铃铛分段及迷雾寻铃。
- 接受原生或离线路线前校验地面支撑和角色胶囊碰撞；局部搜索比较可行三维步行长度，拒绝已知受阻回退。
- 撤回 0.9.0 多路线，恢复 0.8.7 单路线。地图显示已检查前段及原路网待确认虚线；失败的原生/合成直线没有未检查尾段，场景线停在已检查位置。
- 采集目标可使用同层交互范围内的站位；修正起伏地面被高度插值误判为换层的问题。
- 串联已识别的梯子、攀爬、抓绳/钩索、滑索及升降通道，检查方向与解锁状态。玩家仍需自行执行动作。
- 以即时细线网格替换原生拖尾粒子，端点留在地面上方；远段按预算检查碰撞，限制重复更新。
- 为原版收集 Mod 1.0.9 增加目标/取消同步和保留物品高度的中键选择。
- 修正交互动画锚点低于真实落脚面时漏掉通道的问题；攀爬、梯子、钩索和升降等入口继续检查站位、方向与解锁。
- 落地、换层或角色胶囊尺寸改变后更新规划起点；中途的旧楼层结果不会覆盖新状态，无需重新标记。
- 临时障碍去重，待确认通道与实测阻挡分别提示；为已识别通道预留搜索时间。
- 动作搜索先比较少量物品接近点，避免在攀爬前耗尽预算；目标高度与角色接近时仍检查附近的上楼入口。
- 丝线网格最多约 30 次/秒更新，静止近段碰撞缓存 250 毫秒，重复受阻预览不再重建整条丝线。不会主动加载未驻留的交互类。
- 路网改为小块分帧加载，首次进入新区域需等待数秒后自动规划；原路网数值保持不变。实际 FPS 尚未测量。
- 路网数据块从 256 KiB 合并为 512 KiB，加载模块由 1772 个减到 951 个；原数据内容不变。
- 同拓扑丝线复用颜色数据，跳过节流回调的胶囊读取；不降低采样、碰撞检查或刷新频率。此前 21 种形状的一致性验证属于 0.8.8 的历史记录；本版按用户要求调整颜色和高度。

## 依赖与兼容

| 用途 | 依赖 |
| --- | --- |
| 基础导航 | [PBZModLoader #113，1.0.0](https://www.nexusmods.com/phantombladezero/mods/113) |
| 可选导航设置菜单 | [Mods Menu #149，0.7.2](https://www.nexusmods.com/phantombladezero/mods/149)，也可编辑配置 |
| 可选收集物目标 | [Map Tracker Plus - Minimap and Collectibles (UE4SS) #187，1.0.9](https://www.nexusmods.com/phantombladezero/mods/187)，本地包名 Map Collectible Tracker |
| 1.0.9 目标桥接 | [UE4SS for Phantom Blade Zero #5，1.0.3](https://www.nexusmods.com/phantombladezero/mods/5)，`v3.0.1-1195-g1ceefac8` Shipping |

本次只提供 **PBZModLoader 布局完整包**，没有独立 Mods Menu 布局包。内部 `PBZQuestRoute` 标识、安装目录及配置名保留，作为原导航的替换版本；不要同时启用原版和 Fork。

1.0.9 已适配手动/自动目标、切换、完成收集、取消同步和悬停后中键选物。**旧 JS 0.6.7 联动的小地图路线叠加、放大图标、自动饰品提示没有迁移到 UE4SS 1.0.9。** 这些导航设置对 1.0.9 不生效；收集 Mod 自身的小地图、图标与追踪继续由它管理。保留的旧 JS 适配代码不代表本版重新验证过 0.6.7；不要同时安装两代收集 Mod。

桥接只安装在导航自己的 `platform/steam/ue4ss/Mods/PBZQuestRouteCompat/`，不包含或替换 `PbzMapTracker` 文件。启动时核对 UE4SS.dll 与收集入口校验值；其他构建会停用收集联动，基础任务/地图落旗导航仍可用。状态见桥接目录的 `PBZQuestRouteCompat-status.txt`。

2026-11-12 本机只读检查发现收集 Mod 已为 1.0.12，其入口不匹配 1.0.9 哈希。本候选不会开启该版本的收集目标桥接；物品联动需单独适配和验证，铃铛及地图落旗可独立测试。

## 安装与更新

完整包：`dist/Quest_and_Exploration_Navigation_Fork_0.10.3-fork.1.zip`。不包含加载器、UE4SS 本体或收集 Mod。

1. 退出游戏，备份 `ProjectPBZ/Content/Paks/~mods/PBZQuestRoute.txt`。
2. 安装 PBZModLoader 1.0.0。需要收集联动时，另行安装上表对应 UE4SS 与原版 Map Tracker Plus 1.0.9。
3. 手动安装：停用旧导航，将旧脚本目录移到游戏外，保留配置。将 ZIP 的 `ProjectPBZ` 和 `platform` 文件夹合并到 Steam“管理 → 浏览本地文件”打开的游戏根目录。
4. 或向 UE Mod Manager 导入完整 ZIP，同时勾选导航游戏文件与 `PBZQuestRouteCompat`。路径与原导航相同，管理器可能识别为原导航更新。仅启用一份导航，收集 Mod 保持原版。
   从分块较多的旧包迁移时，选择更新现有导航；手动安装按上一步先移出旧脚本目录，直接合并覆盖会留下不再使用的分块。
5. 如从旧版迁移，移出旧 JS 收集目录 `ProjectPBZ/PBZModLoader/mods/pbz-map-tracker/`。旧导航 0.7.x 的 `zzz_PBZQuestRoute_P.pak/.utoc/.ucas`、`PBZQuestRouteMouse` 及其他布局导航副本也需移出。
6. 确认入口 `ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/main.js`；收集桥接另需 `platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll`。正常经 Steam 启动。

卸载时退出游戏，通过管理器移除本导航，或仅移出本包的 `ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/`、`ProjectPBZ/Content/Mods/PBZQuestRoute/`、`platform/steam/ue4ss/Mods/PBZQuestRouteCompat/`。保留配置、收集 Mod 与共享运行时。恢复原版前先移出 Fork 脚本与桥接，避免混用。

## 操作与设置

- 任务沿用游戏原追踪，新目标接替手动旗子。
- 1.0.9 物品可左键追踪，或悬停图标后中键导航，保留物品高度。
- 地图空白处中键落旗，按地图选路面；空白处长按约 0.6 秒取消。落旗不等同于选择该位置楼上的物品。
- 铃铛图标中键选择，手柄用确认键选择；使用铃铛位置作为终点，不按当前可达路网改写目标。超出吸附范围的空白落旗只显示标记，需重新靠近道路选点。
- 手柄沿用确认键（默认 A）选择，空白处长按取消。
- 落旗前关闭筛选面板，关闭地图查看场景线；`WorldThread=on`，Sense30 模式需先洞照。
- Mods Menu 默认 F9，条目“任务与探索导航 - Fork”。配置仍是 `ProjectPBZ/Content/Paks/~mods/PBZQuestRoute.txt`。
- `MapRoute`、`WorldThread`、`FogBellSense` 为 on/off；`DisplayMode` 为 Always/Sense30。`MinimapRoute`、`LargeItemIcons`、`AutoAccessory` 是旧 JS 收集适配选项。

启动状态：游戏实际 Saved 目录的 `PBZQuestRoute-startup.txt`。运行日志：`ProjectPBZ/Saved/PBZQuestRoute-log.txt`。桥接 JSON 文件是临时状态，不是存档。

## 验证范围

132 项 JavaScript 回归、原始路网字节与交互数据校验、真实 Lua 1.0.9 文件往返、原生构建及完整 ZIP 检查用于本地验证。本轮 13 项新增用例覆盖取消修补时保留墙体、道路边归属、已验攀爬前沿不被回头候选覆盖、动作接图、窄出口和搜索诊断。物理与场景加载为模拟；山洞动作坐标及原始向上边来自真实数据。上一版 ZIP 的只读回放在 13 项用例中失败 12 项，另 1 项用于防止动作接图绕过墙体；这些结果不等同于游戏成功率或 FPS 测量。

**0.10.3 候选包尚未完成两条路线的游戏验证。** 原图从山洞入口到第二次攀爬出口可形成约 24 米、含两次向上攀爬的路线，但指向小张铃铛时仍选择下坡回绕，完整钩索连接仍未确认；不能把这一点写成“两次攀爬完全没接入原图”。衣冠冢起点的实际落差及完整上坡绕行也待复测。优先检查大廊桥至小张藏身处是否进入山洞、连续攀爬后保持钩索方向，以及乱葬岗至墨玑子衣冠冢的起点和坡道，再分别检查返程。驿站屋顶货币、残偶谷底齿轮和三楼目标仍待现场验证。常规约 120 米、长途最多 200 米的实景范围，场景加载、节点和时间预算都会影响结果。11 个世界路网没有重新生成，复杂区域仍可能漏路、连错或没有路线，不承诺全局最短或具体 FPS。

动作通道不会自动控制角色；实测阻挡 X、待确认机关提示与虚线分别表示不同状态，待确认路线不代表完整可达。门锁约束基于已知未解锁位置，仍属近似；物品标识可读时显示，但不会断言玩家背包缺少哪一把钥匙。新增日志记录候选长度/动作、验路拒绝位置、驻留动作提取结果，以及搜索的地面缺失、无可走邻接、节点/时间预算结束原因。场景线依赖 ProceduralMeshComponent 与可用材质，能力缺失时记录错误并隐藏场景线。

```powershell
node --expose-gc tests/stream-atlas.cjs
node --test tests/atlas.test.cjs tests/context.test.cjs tests/navigation.test.cjs tests/planning.test.cjs tests/passages.test.cjs tests/tracker.test.cjs tests/terrain-regression.test.cjs tests/connectivity.test.cjs tests/locks.test.cjs tests/map-target.test.cjs
node tests/audit-bells.cjs
py -3.12 tests/run-lua-tests.py
python native/build-native.py --ue4ss "现有 UE4SS.dll 路径" --test
python tests/build-patch.py
python tests/verify-package.py
```

Lua 检查使用 `lupa.lua54`；原生构建只读取现有 UE4SS，使用固定公开提交 `1ceefac8b8c286f0fb3eb62b4aae075ff81df0bd` 的接口。源码目录 `Quest_Navigation_0.8.5` 保留历史名称，包内运行版本已更新。

发布正文、字段、授权待办和更新日志见 `release/`；历史记录见 `docs/LOCAL-FIX-HISTORY.md`。PiPiFanDev 的 Map Tracker Plus 是独立作品，不在本包内。保留桥接随包的 UE4SS-LICENSE.txt。
