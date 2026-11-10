任务与探索导航 0.8.5-beta（本地修补 0.8.5-local-fix5）

安装版本：PBZModLoader 1.0.0
发布版本：0.8.5-beta

安装
1. 退出游戏，先安装 PBZModLoader 1.0.0
2. 将本包 ProjectPBZ 文件夹合并到 Steam“管理 → 浏览本地文件”打开的 PBZ 根目录
3. 确认入口：ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/main.js
4. 使用 Map Collectible Tracker 1.0.9 时保留其原版文件，同时安装本导航包的 platform 目录，其中 PBZQuestRouteCompat 是导航自有的桥接组件。目前适配目标导航与取消同步，小地图路线、放大图标和自动饰品提示未迁移
5. 正常通过 Steam 启动游戏

本版保留 PBZModLoader 目录布局，Mods Menu 作为游戏内设置菜单可选
两种完整包选一份，不要重复安装
从另一种布局迁移时，备份并移出旧 PBZQuestRoute 文件夹，保留 Paks/~mods/PBZQuestRoute.txt 配置
不要同时留下旧 0.7.x 的 zzz_PBZQuestRoute_P.pak、.utoc、.ucas 和 PBZQuestRouteMouse

本次改动
- fix5：石头等局部障碍优先修补附近路线；搜索期间和失败后保留大地图安全前段、X 与未确认虚线，场景丝线不越过已确认受阻处。采集点可走到交互范围，不强求穿过物品碰撞中心。
- fix5：修正起伏地面被直线高度插值误判为换楼层；连接静态及已加载的梯子、攀爬、抓绳/钩索、滑索和升降通道，支持多动作串联与方向、解锁状态检查。动作仍由玩家按游戏原键触发。
- fix4：导航改为先检查地面和胶囊碰撞，再在可走路径上比较实际长度；上下楼、同层绕墙都参与实景搜索。拒绝已知受阻回退路线。丝线完全改用即时网格，停用原生拖尾粒子，端点留在地面上方。
- 已通过 46 项本地回归及 Lua 联动检查；残偶谷底齿轮和三楼位置仍需游戏内复测。受场景加载、采样与搜索预算限制，不承诺整张地图的全局最短路径。
- 本地补丁：红绳远段分帧碰撞校验、限制重复更新、消除样条回读，并添加导航自有的 UE4SS 目标桥接；不改收集 Mod 文件，未改路网，未进行游戏内验证
- 增加明确的启动成功状态与失败记录，阻止同一会话重复安装导航钩子
- 支持 Mods Menu 原生目录，修正物品联动在原生目录、原始目录和加载器生成目录之间的解析
- 可选收集 Mod 缺失或启动失败不再让基础导航入口报失败
- 保留 0.8.4 的路线、取消、到达收线、分帧搜索和路网数据

操作
- 任务：用游戏原有任务追踪，新任务接替手动旗子
- 鼠标：1.0.9 图标左键追踪，也可悬停后中键导航；区域地图空白处中键落旗，长按约 0.6 秒取消。物品导航保留高度，普通落旗按地图选路面
- 手柄：移动地图准星，或吸附到物品后按 A，空白处长按约 0.6 秒取消
- 落旗时关闭筛选面板，拖动不落旗，铃铛窗口保留正常操作
- 地图线、场景红绳和小地图线分别开关，可选持续显示或洞照后显示 30 秒
- 无任务和手动目标、且角色位于迷雾区时，按洞照感知可达的本区铃铛
- 同层抵达后收线，走远不会自动恢复，需要重新选择目标
- 跨区优先步行，需传送时分成出发铃铛和目标铃铛两段，传送仍由玩家操作

设置与排查
Mods Menu 默认 F9，在任务与探索导航条目调整
配置文件：ProjectPBZ/Content/Paks/~mods/PBZQuestRoute.txt
开关：MapRoute、WorldThread、MinimapRoute、LargeItemIcons、AutoAccessory、FogBellSense，值为 on/off
DisplayMode=Always 持续显示，DisplayMode=Sense30 洞照后显示 30 秒
启动状态：游戏实际 Saved 目录中的 PBZQuestRoute-startup.txt
运行日志：ProjectPBZ/Saved/PBZQuestRoute-log.txt
使用时先确认落旗、取消、手柄选物和小地图是否正常，再确认场景红绳

导航说明
部分区域道路交错、楼层叠加，且包含特殊交互通道，目前仍可能出现绕路、漏路或错误衔接；遇到不通的路线请以实际场景为准，后续会继续修正
包体主要是 11 个世界路网和行走表面数据，本次未改路网数据
卸载时退出游戏，仅移出本包的 PBZQuestRoute 脚本文件夹与 ProjectPBZ/Content/Mods/PBZQuestRoute
