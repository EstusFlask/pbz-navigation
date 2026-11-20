# 影之刃零 · 任务与探索导航

导航重建的目标、当前失败与下一步见[持久项目状态](docs/OFFLINE-NAVIGATION-STATE.md)。继续开发或上下文压缩后先读该文件。

为任务、收集物和铃铛提供地图路线与场景蓝线。当前公开版本 **1.11.4**，同时提供发行版与Development开发版，另保留 **1.9.4 Lite**，仍在完善，部分路线可能缺失或不准确。

**1.11.4** 修复物品寻路失败后的铃铛备用分支、塔内连续下降的候选选择和绕路前段显示。开发版保留47段测试起终点及轻攻击录制，见[补采操作](docs/DEVELOPMENT-SURVEYS.md)。两个完整包可从[Nexus文件页](https://www.nexusmods.com/phantombladezero/mods/994?tab=files)选装其一。

1.11.0 修复上下层动作漏接、部分路线误报完整和换层旧线，已安装开发包；仍保持无损压缩数据。尚待用户实测，详见[现场修复](docs/FIELD-FIX-1.11.0.md)。

1.10.0 将11个分区世界的首轮碰撞重建导航接入Mod，并把密集图块装载分帧，保留计算中断提示。戏梦山庄的巨型高层使用独立保守网格，普通地形保持10厘米体素；不同高度网格没有虚构连接。离线使用WASM烘焙，游戏运行端使用普通JavaScript，不分发EXE、不新增导航DLL。门和藤蔓按实际状态选择图块，显示前继续检查已加载场景。动态规则、特殊动作和全程实机验收仍未完成。

小黑盒素材、工具、实验代码和原包本地副本集中在 [小黑盒归档](archive/heybox-20261115/README.md)，不参与构建或运行。1号路线历史上仍只记录“最后一次F之后正确”；本轮离线结果单独记账。

导航原理、撞墙原因与 UE／开源方案实际采用范围见 [代码与资料核对](docs/NAVIGATION-EXPLANATION-20261115.md)。本次恢复范围见 [恢复说明](docs/HEYBOX-ARCHIVE.md)。

开发包补采现接入Map Collectible Tracker1.0.14的真实物品目录、名称提示和选择：47段、94个起终点；轻攻击起止，重攻击报错，防御记个人误走。已停止维护并删除1.0.9参考及恢复逻辑。见[补采说明](docs/DEVELOPMENT-SURVEYS.md)。

- 下载：[Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/994)
- 安装与操作：[使用说明](docs/USER-GUIDE.md)
- 本次更新：[Changelog](release/CHANGELOG.md)
- 更新发布：[简短发布规范](release/README.md)

原作者 azqwq333；Fork 整理 kurosakana。基于原版0.8.5-beta，保留原作者及资产署名。

开发、构建或排错前先读[开发与维护说明](docs/DEVELOPMENT.md)；继续游戏测试时先读[待做清单](docs/NAVIGATION-TODO.md)。
