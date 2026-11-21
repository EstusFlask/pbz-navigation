# 来源、署名与现有权限 / Attribution and existing permissions

本次只公开源码，**不新增统一开源许可证，不改变已有内容的权属或分发权限**。下表是现有说明的索引，不替代对应许可文本，也不表示维护者可以替其他权利人授权。

| 内容 | 来源 / 现有说明 |
| --- | --- |
| 原导航代码、路网和随包资源（包括 `Quest_Navigation/ProjectPBZ/Content/Mods/PBZQuestRoute/` 中的图标） | azqwq333 的 [Quest and Exploration Navigation 0.8.5-beta](https://www.nexusmods.com/phantombladezero/mods/472)。Fork 保留署名；发布授权记录见 `release/NEXUS-FIELDS.json` 的 `permissionEvidence`。该记录描述 Nexus 发行授权，不扩展成统一开源许可。 |
| Fork 的导航维护、工具、文档与页面文案 | kurosakana；使用 AI 辅助。此次公开源码保留现有权限。 |
| Recast / Detour 及 recast-navigation-js | [运行端 NOTICE](Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRecast-NOTICE.txt)、[依赖许可全文](Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRecastData/THIRD-PARTY-LICENSES.txt)、[离线许可](offline-navigation/RECAST-LICENSE.txt)。修改过的 Detour 调度代码已在 NOTICE 中标出。 |
| fflate | [FFLATE-LICENSE.txt](Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/FFLATE-LICENSE.txt)。 |
| UE4SS 适配器使用的公开接口 | [UE4SS-LICENSE.txt](Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/UE4SS-LICENSE.txt)。导航自有适配器源码位于 `native/`，不分发 UE4SS 本体。 |
| PbzModConfig 客户端 SDK | [来源与文件列表](Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/PbzModConfig-SDK.txt)，只含客户端，不包含设置菜单 Mod 本体。 |
| 旧小黑盒衍生规划点及实验 | [归档说明](archive/heybox-20261115/README.md)和[原有 NOTICE](archive/heybox-20261115/Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteMapData/NOTICE.txt)。不参与当前构建或运行；原始模型、纹理、解码二进制和密钥不在当前跟踪树中。 |
| 游戏碰撞 / 场景放置衍生导航数据 | 由本机游戏数据经离线工具生成，保留游戏内容原有权利；生成或仓库公开不等于维护者可以统一授权。 |
| Map Collectible Tracker / Map Tracker Plus | PiPiFanDev 的独立 Mod。参考目录已从当前跟踪树移除，列入 `.gitignore`，测试时自行下载；导航安装包不包含收集 Mod 文件。 |

离线工具通过 `offline-navigation/package-lock.json` 固定依赖，安装时各包许可证仍适用。保留已有许可全文及来源标记。

`.gitignore` 与移出跟踪只影响当前及后续提交，**不会清除旧提交中的文件**。本次整理保留 Git 历史；历史中曾提交的第三方参考副本或依赖也不会因此获得新许可。

English: source publication grants no new repository-wide open-source license. Original mod content, game-derived data, archived experiments and third-party components retain existing ownership and permissions. Follow the linked notices; attribution is not a substitute for permission. Removed reference files may remain in Git history, which this preparation does not rewrite.
