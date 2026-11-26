# 更新与发布

当前本地候选为1.12.0，新增保留全部原有功能的 Lite 铃铛路网版，尚未安装或上传。产品类型 `--edition full/lite/all` 与采集类型 `--flavor release/development/all` 独立。每次交付同时构建、验证 Full Release、Full Development、Lite Release、Lite Development 四包；`dist/`只保留这四个当前包。以下历史“两包”要求是每种产品类型各自的发行／开发配对，不限制经本轮用户授权新增的 Lite 产品类型。Development 仍仅限本地。

Lite 从现有烘焙网格提取铃铛有向通路的原始瓦片与全部条件变体，另保留纯步行绕行，不使用玩家轨迹生成路线。`offline-navigation/bell-anchors.mjs`、`tools/build-bell-lite.py` 生成独立、带哈希回执的暂存；`tests/lite_package.py`按清单与哈希限制入包。新版本若沿用完整世界数据，可用 `tools/restage-release-worlds.py` 从本地完整暂存及其回执逐文件核对后转入新版本，不能从下载ZIP伪造暂存或跳过校验。

**Nexus只上传发行版（release）。Development开发版仅供开发者本地使用，不上传Nexus，也不作为可选文件或测试文件公开分发。** 用户要求“N网更新”“上传新版”时，只处理发行版；同时构建两版不代表同时上传两版。两版仍须在本地构建和验证。

历史发布记录：Nexus #994曾发布1.11.4发行版主文件（4717）和Development可选文件（4718），保留1.9.4 Lite（4696），归档1.11.3（4703）。该次开发版上传不符合用户随后明确的上述规则，不作为后续发布依据。原始发布事实、哈希与核对记录保留在[1.11.4发布回执](LOCAL-CANDIDATE-1.11.4.json)。

历史1.11.3标准版覆盖11个重建世界，改善区域地图画线和跳落连接。1.9.4是全图重建前的完整小包，可独立替换使用。历史ZIP、哈希及Nexus发布状态见[1.11.3发布回执](LOCAL-CANDIDATE-1.11.3.json)。

当前1.11.1自定义起终点巡检修复Development已实际安装，5173文件/约3.65GB。424项JS、11项世界管线与完整包/实际安装加载校验通过；47段中4段独立步行碰撞通过、3段仅候选、40段仍缺完整连接，尚无新增游戏验收。详见[逐段巡检](../docs/CUSTOM-ROUTE-AUDIT-1.11.1.md)、[安装回执](INSTALLATION-1.11.1.json)。未启动游戏或上传。

前版1.11.0上下层修复Development安装记录；完整包和备份见[本轮记录](../docs/FIELD-FIX-1.11.0.md)。413项JS/11项世界管线通过，实际游戏验收待用户复测；没有启动游戏或上传。

当前最新候选1.10.1已按用户授权压缩并安装Development。游戏内导航约3.65GB/5,133文件，全部源字节无损保留；未启动游戏或上传。新容器、完整包和安装回执见[压缩安装记录](../docs/COMPRESSION-INSTALL-1.10.1.md)。以下1.10.0说明属于前一候选。

当前本地候选1.10.0扩展11世界首轮重建接线，修复密集图块装载阻塞及计算中断后无提示；尚未安装或上传。动态规则、特殊动作及实机全程接受继续单独记账。见[持久项目状态](../docs/OFFLINE-NAVIGATION-STATE.md)。无EXE，无新增导航DLL。

版本化完整包从`release/NEXUS-FIELDS.json.offlineWorldStage`读取已验证暂存目录，仅包含清单引用的公开导航文件；缺少11世界目录或版本不匹配会拒绝构建。生成顺序为世界/子网格烘焙→分页打包→`tools/stage-offline-world-mod.py`→`tests/build-patch.py`→`tests/verify-package.py`。私有状态、路线与packet校验侧车不进安装包。

1.7.1开发补采通过MCT1.0.14的真实目录/物品提示/选择呈现。JS与Lua都由打包器写入flavor；标准包排除六个开发模块，旧自绘模块不再打包。两个包互相替换，不改收集Mod文件与玩家存档。1.0.9参考及自动恢复已删除，不再维护。

自1.11.4起，每种产品类型必须同时生成标准包和`Development`开发包，并用`tests/verify-package.py --edition all --flavor all`核验。各包共用导航核心、相同安装标识且互相替换。标准包为Nexus发行包，排除开发采集模块；开发包仅供开发者本地使用，禁止上传Nexus或公开分发。`dist/`仅保留当前版本各类型的发行／开发配对，旧版本各包归档并记录SHA256。产品与采集类型的行为边界分别核验。

1. 同步版本号，在本地生成并校验发行版和开发版完整ZIP，再只上传发行版到当前Nexus页面。
   上传成功后到公开页核对页面版本、发行文件的实际显示简介和对应的 changelog。公开文案不提供开发版下载或引导玩家安装开发版。保存发布回执，不持续监控 Nexus 病毒扫描。
2. 普通修复和优化只写changelog；新增按键、设置或不容易发现的用法，才补充description。
3. 文件说明与更新说明面向玩家，简短、中英各一句，说明实际功能和变化。不写“仍需实测”“部分路线仍需测试”等工程性表述；测试数量、验证状态、算法和排错过程留在开发文档。
   同样检查历史版本与累计changelog，移除测试统计、诊断日志、开发预算和发布操作记录，只保留玩家能感知的功能与修复。
4. 不把尚未完成的实测写成“全部修复”。发布后核对版本、文件和changelog，并保存发布记录。

格式：

### Version 1.2.10

- Improved stair and multi-floor navigation.
- 改善楼梯和上下层导航。

详细打包要求见[开发说明](../docs/DEVELOPMENT.md)，历史发布记录见[PUBLISH-NOTES](PUBLISH-NOTES.md)。

## Nexus 正文排版

正文以 `NEXUS-DESCRIPTION.bbcode` 为准：居中标题与下载／源码／Issue 入口，顶部金色标题与引用底色框突出接手招募；正文统一浅蓝色分区标题，采用中英成组短段、功能列表和安装步骤。迁移、配置与排错详情放入折叠区，历史更新留在 changelog，避免在正文重复堆放整套中英文历史记录。招募入口保持直接可见。

修改后在 Nexus 实际页面核对标题、颜色、列表、链接和折叠行为，再保存截图与回执。参考样式：[原导航 #472](https://www.nexusmods.com/phantombladezero/mods/472) 的简短列表、[管理器 #2](https://www.nexusmods.com/phantombladezero/mods/2) 的统一配色和重点框。只借鉴结构，不复制对方素材或功能承诺。

如日后需要从 Markdown 同步，可参考 [BUTR/Converter.MarkdownToBBCode](https://github.com/BUTR/Converter.MarkdownToBBCode) 的 Nexus 输出；当前直接维护 BBCode，没有新增工具依赖。纯页面排版不递增 Mod 版本、不重建或上传安装包。
