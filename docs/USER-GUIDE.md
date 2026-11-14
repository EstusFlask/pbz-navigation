# 任务与探索导航 / Quest and Exploration Navigation

版本 / Version **1.3.2** · 实验版 / Experimental

## 安装与更新

1. 退出游戏，保留原配置。安装所需的PBZModLoader。
2. 使用UE Mod Manager导入完整ZIP并替换旧导航；或将包内`ProjectPBZ`和`platform`合并到游戏根目录。只启用一份导航。
3. 使用收集物导航时，另行安装Map Tracker Plus及其所需的UE4SS；这些Mod不包含在本包内。

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
- 可选：Mods Menu0.7.2、PbzModConfig1.0.4、Map Tracker Plus1.0.9/1.0.14及其UE4SS依赖。
- 导航仍在完善。多层建筑、特殊动作和未加载区域可能缺路或指向不准确。
- 路线出现不代表整条路线已经实测通过；请以游戏实际道路和机关状态为准。

## Installation and controls

Install PBZModLoader, then import the complete ZIP into UE Mod Manager or merge its `ProjectPBZ` and `platform` folders into the game root. Keep one navigation installation and preserve your settings.

Select a map target and follow the map route/blue guide. With a supported tracker, hover an item and press the middle mouse button, or use the D-pad and press A on a controller. Climbing, grappling, jumping and sailing remain manual. Mods Menu is optional for the existing navigation settings. For rope colors, install PbzModConfig and UE4SS, then open the Mods settings page → Quest & Exploration Navigation → Rope color. Choose Red, Blue (default), or Custom to show the color picker. Changes apply within about one second and persist in PBZQuestRoute-settings.json in the actual ProjectPBZ/Saved directory. Map Tracker is optional for this setting.

Experimental: some multi-floor routes, special moves and unloaded areas still need testing.

Original navigation and assets: azqwq333,0.8.5-beta. Fork:kurosakana. Code and documentation assisted by AI.
