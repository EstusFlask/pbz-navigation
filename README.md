# 影之刃零 · 任务与探索导航

导航重建的目标、当前失败与下一步见[持久项目状态](docs/OFFLINE-NAVIGATION-STATE.md)。继续开发或上下文压缩后先读该文件。

为任务、收集物和铃铛提供地图路线与场景蓝线。当前本地候选 **1.9.2**（公开版 1.3.1），仍在完善，部分路线可能缺失或不准确。

1.9.2 在旁镇一号路线及周边首个区域接入从游戏碰撞重建的 Recast/Detour 导航；离线使用WASM烘焙，游戏运行端使用普通JavaScript，不分发EXE、不新增导航DLL。门和藤蔓按实际状态选择图块，显示前继续检查已加载场景。其他区域保留原有导航。见 [实现与验证](docs/OFFLINE-RECAST-IMPLEMENTATION-20261115.md)。尚未重建全游戏，也没有新增实机全程通过结论。

小黑盒素材、工具、实验代码和原包本地副本集中在 [小黑盒归档](archive/heybox-20261115/README.md)，不参与构建或运行。1号路线历史上仍只记录“最后一次F之后正确”；本轮离线结果单独记账。

导航原理、撞墙原因与 UE／开源方案实际采用范围见 [代码与资料核对](docs/NAVIGATION-EXPLANATION-20261115.md)。本次恢复范围见 [恢复说明](docs/HEYBOX-ARCHIVE.md)。

开发包补采现接入Map Collectible Tracker1.0.14的真实物品目录、名称提示和选择：47段、94个起终点；轻攻击起止，重攻击报错，防御记个人误走。已停止维护并删除1.0.9参考及恢复逻辑。见[补采说明](docs/DEVELOPMENT-SURVEYS.md)。

- 下载：[Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/994)
- 安装与操作：[使用说明](docs/USER-GUIDE.md)
- 本次更新：[Changelog](release/CHANGELOG.md)
- 更新发布：[简短发布规范](release/README.md)

原作者 azqwq333；Fork 整理 kurosakana。基于原版0.8.5-beta，保留原作者及资产署名。

开发、构建或排错前先读[开发与维护说明](docs/DEVELOPMENT.md)；继续游戏测试时先读[待做清单](docs/NAVIGATION-TODO.md)。
