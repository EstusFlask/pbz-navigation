任务与探索导航分支
版本：1.11.5（实验版）

为任务、收集物和铃铛提供地图路线与场景蓝线。部分路线仍需完善和测试。

安装：退出游戏，先解压ZIP，再用UE Mod Manager导入同时包含ProjectPBZ和platform的解压目录替换旧导航；或手动将这两个文件夹合并到游戏根目录。保留配置，只启用一份导航。
版本选择：无Development后缀的是发行版，用于日常游玩；Development开发版含47段测试起终点，轻攻击开始/结束记录、重攻击标导航错误、防御标自己走错。两版互相替换，详见DEVELOPMENT-SURVEYS.md。
依赖：PBZModLoader1.0.0。Mods Menu可选装；收集物导航另需Map Tracker Plus及其UE4SS依赖。
操作：在地图选择目标；收集物可悬停后按中键，手柄使用十字键选择、A确认。攀爬等动作由玩家操作。

绳子颜色：安装PbzModConfig及其UE4SS依赖，在Mods设置页的“任务与探索导航”中选择红色、蓝色（默认）或自定义，修改后自动保存并生效。

本次改动见CHANGELOG.md，详细安装与操作见INSTALL-README.md。
原作者azqwq333（0.8.5-beta）；Fork整理kurosakana。代码与说明使用AI辅助生成。

补采：开发包含47段编号起终点标记。地图选点定位，起终点轻攻击开始/结束；重攻击标导航错误，防御标自己走错。详见DEVELOPMENT-SURVEYS.md。

补采物品模式使用Map Collectible Tracker1.0.14原有目录、名称提示和选择服务，需启用其任务物品筛选。1.0.9已停止维护。
