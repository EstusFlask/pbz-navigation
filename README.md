# 影之刃零 · 任务与探索导航

为任务、收集物和铃铛提供地图路线与场景蓝线。当前本地候选 **1.8.2**（公开版 1.3.1），仍在完善，部分路线可能缺失或不准确。

main已移除反向搜索及其菜单、入边索引和切换逻辑。小黑盒独立规划实验在`codex/heybox-navigation`分支维护；1号路线仅记录“最后一次F之后正确”，没有升级为全程通过。见[分支隔离说明](docs/HEYBOX-BRANCH.md)。

1.8.1针对近处货币等待和模型冷读暂停作修正：先交付已验近路，模型仅作有界补充。1.8.0的模型候选不等于已补齐跨层连通；本次现场记录与限制见[货币回归修复](docs/FIELD-FIXES-1.8.1.md)。素材读取、范围和复现方法见[地图素材接入](docs/HEYBOX-MAP-IMPORT.md)。

开发包补采现接入Map Collectible Tracker1.0.14的真实物品目录、名称提示和选择：47段、94个起终点；轻攻击起止，重攻击报错，防御记个人误走。已停止维护并删除1.0.9参考及恢复逻辑。见[补采说明](docs/DEVELOPMENT-SURVEYS.md)。

- 下载：[Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/994)
- 安装与操作：[使用说明](docs/USER-GUIDE.md)
- 本次更新：[Changelog](release/CHANGELOG.md)
- 更新发布：[简短发布规范](release/README.md)

原作者 azqwq333；Fork 整理 kurosakana。基于原版0.8.5-beta，保留原作者及资产署名。

开发、构建或排错前先读[开发与维护说明](docs/DEVELOPMENT.md)；继续游戏测试时先读[待做清单](docs/NAVIGATION-TODO.md)。
