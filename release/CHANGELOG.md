### Version 1.11.4

- Restored activated-bell alternatives when item routing fails, including nearby items and destinations reached through terrain transitions.
- 物品寻路失败后恢复已启用铃铛的中转建议，兼顾近处物品和需要地形接力的目标。
- Improved consecutive tower descents and local walking detours. Checked route previews remain visible when a detour first leads away from the target.
- 改善塔内连续下降与局部步行绕障；绕路需要先背离目标时，也保留已确认路段。
- Available as Release and Development packages. Development includes numbered test endpoints and light-attack recording controls.
- 同时提供发行版与开发版；开发版包含编号测试起终点和轻攻击录制操作。

### Version 1.11.3

- Regional maps now draw routes through their linked areas, including XiMeng on the Pangzhen chart.
- 区域地图会显示所属子区域的路线，包括庞镇地图上的戏梦山庄路线。
- Improved jump-down connections and show the best checked route so far while a full route is still being found or after a timeout.
- 改善跳落路段的连接。完整路线仍在计算或计算超时时，先显示当前已验证的最佳路段。

### Version 1.11.2

- Rebuilt navigation across 11 worlds with on-demand loading of compressed map data.
- 重建 11 个世界的导航，压缩地图数据按需加载。
- Improved guidance for consecutive wall runs, automatic slides, grapples and collapsed bridges.
- 改善连续跑墙、自动滑坡、钩索和塌桥路段的引导。
- Routes update when nearby gates or mechanisms change, with less repeated loading during planning.
- 附近的门或机关状态变化时更新路线，减少寻路时的重复加载。

### Version 1.11.1

- Improved custom start/end navigation, clear standing approaches, action connections and walking detours; reduced repeated loading when widening a route search.
- 改善自定义起终点导航、目标附近站位、动作连接和步行绕行，减少扩大寻路范围时的重复装载。

### Version 1.11.0

- Improved multi-floor routes with descents, climbs and current mechanism checks; corrected routes that stopped against walls or stayed on the previous floor.
- 改善下降、上攀及机关通路引导，修正路线指墙和换层后仍保留旧路线的问题。

### Version 1.10.1

- Reduced installed navigation size and file count with lossless on-demand compressed storage.
- 导航数据无损压缩并按需读取，减少安装体积和文件数。

### Version 1.10.0

- Expanded reconstructed world navigation and improved route loading responsiveness and failure messages.
- 扩展重建世界导航，改善路线加载响应与失败提示。

### Version 1.9.4

- Improved continuous ribbon display and floor checks around narrow seams.
- 改善行走中的绳子显示及窄接缝地面校验。

### Version 1.9.3

- Improved initial route selection, checked local obstacle detours and ribbon stability while walking.
- 改善起点选路、现场障碍绕行和行走时的绳子稳定性。

### Version 1.9.2

- Added a JavaScript navigation runtime compatible with the game host and improved loading message visibility.
- 导航运行端适配游戏宿主，改善加载提示显示。

### Version 1.9.1

- Improved regional navigation startup and added loading progress and failure feedback.
- 改善区域导航启动，补充加载进度与失败反馈。

### Version 1.9.0

- Added collision-based walking navigation for the first Pangzhen region, including conditional doors and cleared vines. No additional EXE is required.
- 旁镇首个区域接入碰撞重建步行导航，支持门与已清除藤蔓的状态，无需额外 EXE。

### Version 1.8.3

- Restored the original navigation data source and removed experimental model candidates.
- 恢复原有导航数据来源，移除实验模型候选。

### Version 1.8.2

- Removed the experimental reverse-search option.
- 移除实验性的反向搜索选项。

### Version 1.8.1

- Prioritized nearby collectible routes and reduced delays from model loading and repeated searches.
- 优先交付附近收集物路线，减少模型加载与重复搜索带来的等待。

### Version 1.8.0

- Added embedded terrain and structural surface candidates for route planning.
- 为路线规划补充内置地形与建筑支持面候选。

### Version 1.7.1

- Fixed development survey names and selection through Map Collectible Tracker1.0.14 item handling.
- 修复开发包补采点名称和选择，接入Map Collectible Tracker1.0.14的真实物品流程。
- Retired the 1.0.9 reference and compatibility tests.
- 删除1.0.9参考与兼容测试，后续仅维护1.0.14。

### Version 1.7.0

- Development: select numbered start/end map items; use light attack to start and finish a recording.
- 开发包可选择编号起终点标记，用轻攻击开始和结束记录。
- Heavy attack marks navigation issues; defense marks personal wrong turns. Expanded the survey set with chains and weapon mechanisms.
- 重攻击标记导航问题，防御标记个人误走；补采扩充锁链和影武装机关等路线。

### Version 1.6.0

- Development build: paired map markers automatically record a journey from start to finish.
- 开发包新增成对地图补采标记，到起点自动记录，到终点自动保存。
- Survey recordings retain progress and include any heavy-attack problem markers.
- 补采进度跨重启保留，途中重攻击问题标记与整段记录关联。

### Version 1.5.1

- Avoid immediate backtracking through the same ladder or reversible interaction.
- 避免沿同一梯子或双向机关立即往返。

### Version 1.5.0

- Added separate standard and development packages.
- 新增标准包与开发包。
- Development build: press heavy-attack Y to save a local navigation report.
- 开发包可按重攻击Y保存本地导航报告。

### Version 1.4.2

- Improved wall checks for walking routes and guide lines.
- 加强步行路线及引导线的墙体检查。

### Version 1.4.1

- Added the search-direction toggle to PbzModConfig.
- 在PbzModConfig中补上寻路方向开关。
- Corrected grapple approaches to use the standing launch area.
- 修正钩索入口，先引导至可站立的起跳区。

### Version 1.4.0

- Added a toggle to plan routes from the target or the player.
- 新增寻路方向开关，可从目标或玩家位置开始规划路线。

### Version 1.3.5

- Improved distant route guidance near bridges and caves.
- 改善桥洞附近远距离目标的前段引导。

### Version 1.3.4

- Improved route stability through climbs and ladder transitions.
- 改善攀爬和梯子衔接时的路线稳定性。
- Improved bridge and cave route connections.
- 改善桥梁与山洞的路线连接。

### Version 1.3.3

- Corrected ladder approach and descent guidance.
- 修正梯子入口和下梯路线的指向。

### Version 1.3.2

- Improved rooftop route connections after climbing.
- 改善攀爬后的屋顶路线衔接。

### Version 1.3.1

- Hide the custom-color preview when a red or blue rope preset is selected.
- 选择红色或蓝色绳子时隐藏自定义颜色预览。

### Version 1.3.0

- Choose red, blue or a custom guiding-rope color in PbzModConfig.
- 在PbzModConfig中选择红色、蓝色或自定义导航绳子颜色。

### Version 1.2.10

- Improved stair, multi-floor and climbing navigation.
- 改善楼梯、上下层和攀爬前后的路线衔接。
- Adjusted route calculation to reduce unnecessary waiting.
- 调整路线计算，减少不必要的等待。

### Version 1.2.1

- Fixed D-pad item selection and markers on combined maps.
- 修复十字键选物和合并地图标记问题。

### Version 1.0.1

- Added route-calculation and map-loading messages.
- 增加路线计算和地图加载提示。
