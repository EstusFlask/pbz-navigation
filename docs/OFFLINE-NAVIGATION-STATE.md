# 离线导航：持久项目状态

这是导航重建的当前接手入口；日期为用户时区 America/Tijuana。每次实测反馈或实现阶段变化后更新本文件。历史实现细节放在带版本/日期的记录中，本文件保留目标、当前事实和下一步。

## 用户目标与约束

- 最终目标：从游戏 data 的真实碰撞与场景放置重建完整世界，采用 Recast/Detour 完成普通步行寻路，再逐步接入特殊动作。首个验收对象是一号路线“八卦阁前路口→戏梦山庄正门”，不是塔内 A-01。首区域不是最终范围。
- 分发包禁止EXE/COM/SCR/MSI，不增加导航DLL。**游戏宿主已明确禁止WASM代码生成，运行端使用普通JavaScript；离线烘焙工具可继续使用WASM。** 已有UE4SS兼容适配器保留。
- 小黑盒素材、工具与实验在 `archive/heybox-20261115/`，作为日后参考保存；活动构建使用游戏碰撞，不自动恢复小黑盒接线。
- 尽量使用离线数据继续开发。游戏安装目录、存档和收集 Mod 默认只读；新包交付到 `dist/`，安装/启动/上传另按用户授权处理。
- 旧轨迹只能作为验算与端点参考，不作为补造道路/连接的输入。门状态未知时保持关闭；已加载碰撞优先于保存的开放状态。

## 当前阶段：1.9.2 纯JS运行端候选，实际效果待确认

2026-11-15 用户反馈：一号路线没有算出；随后选择很近的老黄家门口也没有算出。**1.9.0 不能标记可用或实机通过。** 此反馈优先于先前离线测试成功记录。

分支 `codex/offline-recast-navigation`。当前工作区包括尚未提交的重建管线、区域数据与接线；继续前检查差异，保留这些工作。当前候选1.9.2；用户已实测1.9.0和1.9.1开发包均失败。1.9.2尚未安装、启动游戏或上传。

冻结的本次日志在 `build/field-recast-190-no-route/`：`loader.log`、`route-log.txt`、`UE4SS.log`。原日志位于游戏 `ProjectPBZ/PBZModLoader/loader.log` 和 `ProjectPBZ/Saved/PBZQuestRoute-log.txt`。滚动 route log 只保留约130条，不能用它缺少启动行来证明启动没发生。

已知信号：启动标记为1.9.0-dev，收到 `Bell_XM_015` 和 `Bell_SZ_016`（黄家宅邸前路口）选择；完整 loader.log 没有 `recast ready`、`recast query` 或 Recast 报错。区域外旧 atlas 查询仍能进入求解。

1.9.1用户又报告走到一号终点仍无线、看不到加载/超时提示。新完整日志在`build/field-recast-191-no-route/`，已确认关键安装模块与ZIP相同。**17:21:27明确报`Wasm code generation disallowed by embedder`；这是游戏禁止编译WASM，不是等待时间不足。** 精简证据在`tests/fixtures/recast-191-codegen-20261115.json`。不要再仅通过同步/异步切换尝试修复这个限制。

1.9.2通过Binaryen wasm2js将锁定的Recast/Detour模块转译为普通JS，保持原算法和图块。真实V8同时禁用WASM与字符串动态代码生成的回归中，旧核心复现同一错误，新核心可初始化并规划两个目标及终点附近短路段；也通过完全无WASM API的测试。纯JS与原WASM查询结果逐坐标差小于0.01cm。提示模块补充可见性恢复、显式视口/DPI尺寸、游戏字体和上层挂载。378项JS测试、9项核心控制与原Lua回归通过；**尚未实际目视确认新HUD或实机全程通过。** 详情见[1.9.2修复记录](FIELD-FIX-1.9.2.md)。

## 已有实现与证据

技术与命令入口：[实现记录](OFFLINE-RECAST-IMPLEMENTATION-20261115.md)、[工具 README](../offline-navigation/README.md)、[碰撞格式研究](OFFLINE-COLLISION-FORMAT-NOTES.md)。更早的可行性报告描述实施前状态。

- `tools/extract-offline-region.py` → `build-offline-collision.py --scenario base` → `partition-offline-collision.py` → `offline-navigation/build-variants.mjs`，输入来自游戏碰撞及世界变换。
- `offline-navigation/query.mjs`、`runtime.mjs`、`build-runtime.mjs` 与 `package-data.mjs` 生成便携核心和图块。运行端为Binaryen转译的普通JS；转换缓存含源模块hash、编译器版本/参数及结果hash，原生代码生成不再是运行条件。发行模块为 `PBZRouteRecast.js`、`PBZRecastStates.js`、`PBZRecastRuntime.js`、`PBZRecastData/`。
- 首区域约300×250米，877流送分区加PersistentLevel；21无bounds分区已纳入，4个AlwaysLoaded cell由PersistentLevel承载。处理范围内解析错误0，不代表所有碰撞种类或全游戏完整。
- 当前支持普通/样条/实例 StaticMesh、FastGeo、Chaos简单形状/凸体/三角网格、地形、保存的 DynamicMesh。原生schema绑定本机游戏二进制SHA；升级后要重新核对。
- 门/藤蔓条件独立烘焙，保存的Broken/Open仅针对准确actor。雾门恢复Open会先播放动画，完成后才关闭碰撞；运行时加载状态必须覆盖存档预测。
- 明确开放两扇相关雾门的离线场景可得约317米完整路径；此前脚点覆盖与独立几何检查通过。Node/VM与反射API mock通过。**这些均未覆盖本次真实游戏宿主失败。** 版本回执在 `release/LOCAL-CANDIDATE-1.9.0.json`，不可据此覆盖本轮用户反馈。

## 后续顺序与完成标准

1. **宿主可用性**：重放两次选择，验证区域核心确实初始化、图块加载、请求完成；补齐初始化失败/超时与阶段进度，保留目标。通过标准是实际宿主链路有查询结果，不是仅WASM文件存在。
2. **首区域正确性**：验证一号路线和附近老黄家门口；开关门、切角色/世界、取消重选、已加载地面/胶囊检查均正确。离线、mock、实机分别记账；用户未确认前不标全程通过。
3. **全世界扩展**：把当前区域提取推广为可续跑的分区构建，逐世界记录包/碰撞种类覆盖与失败清单、输入hash和图块hash。先扩完整旁镇，再扩其他世界；不能把300×250米成果称为全图。改为流式提取/图块窗口，控制纯JS运行端内存和单次查询耗时，不能直接把整个世界累积进Python列表或一次性常驻整个游戏图。
4. **规则与条件覆盖**：处理数据层、构造时生成碰撞、骨骼/移动物体、更多机关、NavArea_Fire代价及水域策略。未知条件显式停止/提示，不能静默删除障碍。
5. **特殊动作**：把可验证的钩索、攀爬、升降梯等接为带条件的off-mesh连接，步行连接继续由Detour负责。
6. **交付与回归**：独立几何检查、真实图块/宿主环境测试、现场验收以及无EXE/私有数据检查。每次交付新版本同步版本锁、原有适配器和文档，归档旧包及hash。

## 继续时的第一步

先核对更新的实测和日志，再运行 `node --test tests/recast-integration.test.cjs tests/offline-runtime.test.cjs tests/route-status.test.cjs`。该命令覆盖真实V8禁WASM生成标志、两个目标、终点短段和提示载体，但不替代游戏验收。1.9.2新日志先看`recast backend javascript-wasm2js`、`recast ready`、`recast query`及`route status UI mounted font=game`；再看端点投影、门状态和现场物理拒绝。确认首区域可用后继续全世界构建，不把本阶段当作最终完成。
