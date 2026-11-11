# 发布交接

当前只准备材料。用户已明确表示尚未取得原作者许可，先准备发布材料。Nexus #994 保持 **Unpublished**，不提交公开发布，不声称已获授权。

已保存 General（版本、署名、中英文正文及 AI 声明）、Media（自制封面/缩略图）与 Requirements（必需的 PBZModLoader 1.0.0；其他可选依赖在正文解释）。Files 未上传，Permissions 尚待授权范围确定。draft-general.jpg 与 draft-media.jpg 为实际草稿截图。

名称：Quest and Exploration Navigation - Fork。首版：0.8.6-fork.1，表示以 0.8.5-beta 为基础的下一版实验性 Fork 首次发布。后续修补可用 0.8.6-fork.2。Fork 比 Continued 更适合这里，不暗示原作者认可或长期维护承诺。

## 原作者授权

[原作权限栏](https://www.nexusmods.com/phantombladezero/mods/472?tab=description)要求修改和资产使用先取得许可；停止维护声明没有更改这些权限。保留完整授权原文/链接及日期后，再更新 NEXUS-FIELDS.json 的 permissionEvidence。未获得授权时，不上传原导航资产或完整包作公开分发。

以下是待用户自行审阅/发送的请求，**没有代为发送**：

> 你好，我在自用中对 Quest and Exploration Navigation 0.8.5-beta 做了一些路线校验、红绳和 Map Tracker Plus UE4SS 1.0.9 目标联动修补。想征求你是否允许在 Nexus 新建“Quest and Exploration Navigation - Fork”页面，发布含修改脚本、原路网/行走表面数据及原包资产的完整包，并继续修补。会保留你的署名、原作链接和原资产归属，明确是独立分支，不代表你背书，也不会包含收集 Mod 文件。是否同意修改并重新发布这些内容？如有署名、分发、后续修改或其他条件，请告诉我，我会按你的许可范围准备。

授权范围应能覆盖修改及 Nexus 完整包重新发布，包括原路网和资产。如果作者仅允许补丁分发，需要调整交付形式后再发布。

## 就绪材料

- NEXUS-FIELDS.json：名称、版本、简介、署名、依赖/可选搭配与文件字段。
- NEXUS-DESCRIPTION.bbcode：中英文完整正文，含待授权提示。取得授权后以事实说明替换顶部提示。
- CHANGELOG.md：首版中英文更新记录。
- cover.svg / cover.png：自制示意标题卡，不使用原作截图或原资产，非游戏实测证明。
- 完整 ZIP 与校验值见 dist，包内含双语说明、更新日志、导航自有桥接，不含收集文件或加载器。
- VALIDATION.txt：此候选的本地验证结果，不等同游戏内验证。

## 授权后仍需处理

1. 将授权证据和具体条件写入记录，按条件设置新页面 Permissions，不能把原作者资产擅自设为开放许可。
2. 将 README、双语说明、正文和更新记录中的“待授权/候选未发布”状态改为真实状态，重新打包及校验。不得静默删掉尚未解决的游戏内验证限制。
3. 使用 0.8.6-fork.1 进行游戏内复测，尤其残偶谷底齿轮、三楼、目标切换/取消与场景线。若未测，继续作为实验版并保留披露。
4. 上传完整 ZIP，填写文件名、版本及描述；授权允许时再上传原作者内容。封面为示意图，后续可补实际游戏截图。
5. 核对 General、Media、Files、Requirements、Permissions、AI 声明及最终预览，再执行发布。若 Nexus 最后一步要求新接受法律协议，应交由用户确认。

本轮不修改实际游戏安装或管理器状态，不向原作者发送消息，不启用收益或擅自开放原资产许可。
