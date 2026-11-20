# 任务与探索导航 / Quest and Exploration Navigation

版本 / Version **1.11.2** · 实验版 / Experimental

本地实验版扩展从游戏碰撞重建的世界导航，按需加载普通步行路线。门、战斗雾门和藤蔓仍取决于当前状态；未加载或未确认的路段会停止指引。攀爬、跳跃和机关通路仍受动作覆盖限制，尚未完成全图规则与实机全程验收，无需运行额外 EXE。

## 安装与更新

区域导航首次加载时显示进度；加载失败会显示不可用状态，计算超时或中断会保留原因与重试提示。替换版本后须重启游戏。

1. 退出游戏，保留原配置。安装所需的PBZModLoader。
2. 使用UE Mod Manager导入完整ZIP并替换旧导航；或将包内`ProjectPBZ`和`platform`合并到游戏根目录。只启用一份导航。
3. 使用收集物导航时，另行安装Map Tracker Plus及其所需的UE4SS；这些Mod不包含在本包内。
4. 标准包和文件名带`Development`的开发包选择一个安装，互相替换，保留配置后重启游戏。

## 开发版地图补采

- 使用Map Collectible Tracker1.0.14的真实物品模式，共47段、94个起终点。开启收集Mod的任务物品相关筛选或显示全部，可查看“某号路线开始/结束”与说明，并按其原有方式选中追踪。
- 鼠标左键选择，悬停后中键导航；手柄十字键选择真实标记、A确认。先明确路线编号，开始点附近轻攻击开录，结束点附近轻攻击结束。
- 重攻击为导航问题，防御为个人误走。默认X/鼠标左键、Y/F（保留旧键盘Y）、LB/鼠标右键；不自动跟随改键，地图/菜单不触发。
- 已采进度跨重启保留，收集Mod刷新后隐藏已采点。详见开发包内`DEVELOPMENT-SURVEYS.md`。当前只维护1.0.14；1.0.9参考和测试已移除。

## 开发版标记

- 开发包在操控角色时，按默认重攻击的手柄Y或键盘F（旧键盘Y也保留）保存问题候选；不会拦截攻击。地图和菜单中不标记，长按不重复，连续标记间隔至少2秒。
- 出现“已保存问题标记 #编号”后，当前位置、目标、版本、设置、实际寻路器和方向、当前路线/实际蓝线、碰撞失败、前20秒和后5秒的上下文会写入本地。启动初期不足20秒时保留实际已有数据；切图/传送不拼接成连续道路。没有截图或联网。
- 文件位于引擎实际Saved目录；本机为`%LOCALAPPDATA%/ProjectPBZ/Saved/PBZQuestRoute-dev-*.json`。首次立即保存，5秒后补齐后段；提前退出时首次文件仍保留。每个会话最多100个案例。
- 后续告诉助手“已标记”即可读取本机报告，不必重述路线、目标和坐标。标记默认待复核；误按、正确路线对照和仅画面可辨认的问题仍请补充一句或截图。
- 开发记录监听上述默认键；修改游戏按键时，记录键不会自动跟随。标准包不包含采集器，不轮询此键，也不保存这些开发报告；两包使用相同的导航核心，开发包不会学习或开放走过的道路。

## 操作

- 在地图上选择铃铛或导航目标，跟随地图路线和场景蓝线。
- 使用兼容的收集Mod时，可选中收集物后确认导航；鼠标悬停收集物后按中键选择。
- 手柄在地图中用十字键选择对应方向的收集物，再按A确认。
- 攀爬、钩索、跳跃和乘船仍由玩家操作；导航只提供指引。
- Mods Menu可选装，用于调整原有导航设置。
- 绳子颜色：另装PbzModConfig及其UE4SS依赖，在游戏设置的Mods页选择“任务与探索导航”→“绳子颜色”，可选红色、蓝色（默认）或自定义；选择自定义后使用颜色选择器。约1秒内生效并自动保存，不需要Map Tracker。
- 颜色配置保存在实际ProjectPBZ/Saved目录下的PBZQuestRoute-settings.json，更新时保留该文件。

## 兼容与限制

- 必需：PBZModLoader1.0.0。
- 可选：Mods Menu0.7.2、PbzModConfig1.0.4、Map Tracker Plus1.0.14及其UE4SS依赖。
- 导航仍在完善。多层建筑、特殊动作和未加载区域可能缺路或指向不准确。
- 路线出现不代表整条路线已经实测通过；请以游戏实际道路和机关状态为准。

## Installation and controls

Install PBZModLoader, then import the complete ZIP into UE Mod Manager or merge its `ProjectPBZ` and `platform` folders into the game root. Keep one navigation installation and preserve your settings.

Select a map target and follow the map route/blue guide. With a supported tracker, hover an item and press the middle mouse button, or use the D-pad and press A on a controller. Climbing, grappling, jumping and sailing remain manual. Mods Menu is optional for the existing navigation settings. For rope colors, install PbzModConfig and UE4SS, then open the Mods settings page → Quest & Exploration Navigation → Rope color. Choose Red, Blue (default), or Custom to show the color picker. Changes apply within about one second and persist in PBZQuestRoute-settings.json in the actual ProjectPBZ/Saved directory. Map Tracker is optional for this setting.

Experimental: some multi-floor routes, special moves and unloaded areas still need testing.

Choose one complete package: standard or Development. The development package records local reports when you press gamepad heavy-attack Y or keyboard Y during gameplay, without consuming the attack. It saves the current target, actual route/render inputs, effective solver/direction, collision failures and up to 20 seconds before / 5 seconds after the mark. Reports are `PBZQuestRoute-dev-*.json` in the engine Saved directory; they stay local. Menus are excluded, held input is debounced, and reports remain unreviewed observations. The standard archive excludes the recorder. Restart after changing packages. The reverse-candidate option affects atlas/hint/action graphs; native and local-grid fallbacks retain their own direction.


Original navigation and assets: azqwq333,0.8.5-beta. Fork:kurosakana. Code and documentation assisted by AI.
