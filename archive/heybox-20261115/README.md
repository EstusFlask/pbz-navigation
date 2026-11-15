# 小黑盒素材与实验归档

归档日期：2026-11-15（America/Tijuana）；来源：main `84145afc`／1.8.2。用户要求保留素材供以后使用，并从当前 Mod 撤下小黑盒相关实现。当前主线为 1.8.3。

这个目录不属于 Mod 根目录，构建器不读取它，运行时也没有指向它的接线。实验分支 `codex/heybox-navigation` 保留作历史参考，不会自动合并或运行。

## 内容

| 路径 | 保存的内容 |
| --- | --- |
| `Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteMapData/` | 原来随包分发的全部编译候选点、分块索引、清单及署名 |
| 同级 `PBZRouteMapHints.js` | 分块读取、候选查询与预热模块 |
| `tools/` | 只读源包读取器、生成器、性能测量脚本 |
| `tests/` | 小黑盒格式／加载／冷读调度的历史测试 |
| `authoring/heybox-map-audit.json` | 输入、章节覆盖、坐标转换和过滤审计 |
| `docs/` | 接入方法与实验分支说明的原始版本 |
| `integration-before-removal/` | 移除前七个导航模块与三个构建／验证脚本的快照 |
| `local/source-packs/` | 本机原始 WKPACK 与解码器副本；SHA256 在清单中 |
| `local/build/` | 解包观察、生成缓存、依赖与历史运行记录 |
| [manifest.json](manifest.json) | 每项原位置、现位置、文件数、字节数，以及原包副本摘要 |

`local/` 被本目录的 `.gitignore` 排除，不提交源包、第三方二进制或解包材料，也不进入安装包。小黑盒安装目录中的原包保持原位；这里另存副本以便以后离线使用。当前包原有的署名随编译数据一起保留。

## 以后如何继续

这些是冻结的原始路径快照，不是可直接运行的新工程。归档脚本中的仓库根目录推导和相对路径仍按原位置编写。若以后恢复实验，应从保留的实验分支或单独工作区开始，按 `manifest.json` 的 `originalPath` 恢复所需文件，并明确选择数据来源、重建与测试；不要在当前主线自动恢复。

`integration-before-removal/` 只保存接线相关文件，完整历史可从提交 `84145afc` 查到。1.8.2 的完整标准／开发包移至 `build/release-archive/pre-1.8.3-20261115/`，摘要记在 `release/DIST-ARCHIVE-20261115.json`。

归档数据只提供候选位置，不包含完整三角墙体、可靠连通、角色净空或游戏状态，不能当成“已经完整烘焙并验证的导航网格”。当前恢复范围见 [恢复说明](../../docs/HEYBOX-ARCHIVE.md)。
