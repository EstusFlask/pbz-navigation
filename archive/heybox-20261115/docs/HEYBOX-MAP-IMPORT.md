# 小黑盒地图素材接入 · 1.8.2

日期：2026-11-15（America/Tijuana）。用户指定本机素材用于改进导航初次规划；已读到安装版README的“资源使用声明：权利人明确授权，允许使用”。这里只记录读取和实现事实，不把模型导入等同于游戏验收。

1.8.0实机未达到预期：用户近处货币长期无完整路线。1.8.1保留此数据，但将模型索引/页读取移出规划CPU片段，普通已验近路与加载场景搜索优先；模型只在原搜索失败后作有界补充。证据和待验范围见[货币回归修复](FIELD-FIXES-1.8.1.md)。

## 已接入的数据

输入为`%LOCALAPPDATA%/HeyboxDesktop/game-3dmap/packs/pbz`中的`pbz-nav-1.4.0.wkpack`与`pbz-model-1.4.0.wkpack`，生成器固定核对两者SHA256。`authoring/heybox-map-audit.json`记录来源、11个世界的候选数量、过滤和模型覆盖。

本次生成7,505,840个候选：导航显示面2,581,895个，旧实例模型补充709,600个，新版底模补充4,214,345个。18,324个生成模块及索引、审计、署名共约124.3MB；按附近分块读取，不在启动时全部解码。

全部12个章节都有3D模型，存在两套编码：序章（含BE独立世界）、断魂山和断魂崖使用旧实例网格；1—9章使用章节`manifest.json`的`baseModel`和`basemodel/*.bin`。后者的旧`stream-index.json`虽然为空，底模仍完整存在，不能凭旧索引判断模型缺失。导航包也覆盖各章，但经过`super`简化及手动隐藏，原报告写明从2,716,832个源三角面保留538,082个显示面。显示模型没有完整的行走邻接、胶囊净空、存档解锁或机关方向信息，不能替代原始Recast路网。

导航和旧实例网格原本就是Unreal XYZ厘米坐标，直接保留。新版底模已转换为显示用的Y向上、米坐标，先用各块的`origin+uint16*scale`恢复顶点，再按`UE=(x*100,z*100,y*100)`还原；两者不能套同一坐标处理。按真实世界归并地图别名：陆家村/正道大营合并，梅谷湖归庞镇，B09归后街，序章BE保持独立；高位独立场景保留真实Z，不压平到主地图。

导航面及`floor/bridge/stairs/surface/terrain/roof/timber/building`模型三角面按140厘米网格取点，狭小三角面保留重心；70/70/35厘米去重，坡度过滤为55度。隐藏组件、巨型背景实例和退化/陡峭面有明确过滤计数。旧模型读取量化顶点、索引、WKI3实例矩阵及楼层偏移；新版底模还处理16/32位索引、非对齐缓冲区和分类分组。位置只作为搜索建议，面朝向、可站立或支持面分类均不授予通行资格。

模型候选裁剪到该区域声明的导航范围并外扩32米；没有导航范围的纯背景场景不生成行走建议。全部章节的模型仍按实际编码读取和审计，但远景平面不会扩成数千万个无关搜索点。

## 读取方法

`tools/pbz_heybox_pack.py`实现只读的随机访问：WKP2认证头 → 包内密钥封装 → 独立认证数据块 → HB3DPACK成员索引 → gzip/zlib成员。每块认证包含原横幅摘要、块尾信息、包身份与块序号；完整性失败即拒绝读取。成员边界、压缩结果上限、实例长度和模型二进制摘要另行校验。容器允许多个成员引用同一段去重数据。

原装`map-codec.exe`被普通脚本调用时返回`MAP_CODEC_HOST_REJECTED`，插件也没有公开导出命令。离线读取器只读取已安装、SHA256固定的1.4.2解码器文件以取得相应格式材料，不执行或修改它；源码和安装包不提交解码密钥、源模型或小黑盒二进制。升级后的不同解码器需重新检查格式。

```powershell
py -3.12 -m pip install --target build/tools/heybox-reader cryptography
py -3.12 tools/build-heybox-map.py --packs "$env:LOCALAPPDATA/HeyboxDesktop/game-3dmap/packs/pbz" --codec "D:/software/HeyboxDesktop/versions/2.12.12/resources/extensions/internal/ai-desktop.unreal-game-assistant/native/win32-x64/map-codec.exe" --output Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteMapData
py -3.12 tests/heybox-map.test.py
node --test tests/heybox-map.test.cjs tests/walk-hints.test.cjs tests/route-002.test.cjs tests/reverse-search.test.cjs
```

依赖只用于离线生成。模组运行不需要Python、小黑盒进程、源包或联网。

## 首次规划与限制

`PBZRouteMapHints`先读世界索引，再按当前位置/楼层取附近32米分块；垂直方向也分32米高度带，避免独立场景和地面混装。单块最多4096点、单次查询最多冷读8块、解码页缓存最多32块。首次规划即可取得附近候选，不需要先走一遍采样。

1.8.1的普通网格先试，实测候选可辅助原搜索；失败后模型图才使用剩余预算，每次最多384节点/32次物理检查，每请求合计100毫秒模型CPU时间，相同连接本请求不重复算。有限实测图的快速通道不再自动进入模型图。世界索引提前预读，页按需排队在规划器外每帧最多读取一页；等待中的模型连接保留同一目标请求。每条实际使用的有向连接仍经当前游戏的地面、楼层、身体碰撞、锁和落差检查，不跨请求复用物理凭证。

本轮离线数据校验和模拟引擎回归不构成实机通过。显示简化、缺少通行连接、动态物体、窄门或尚未加载的碰撞仍可能造成缺路；现有A/B类测试卡及路线2的现场状态保持原记录。1.8.1完整包另见`release/LOCAL-CANDIDATE-1.8.1.json`；没有自动安装或上传。

1.8.0的364项JavaScript回归、9项Python容器/坐标测试、原生重建与测试、Lua套件曾通过，但未捕捉本次实机问题。全部候选页的SHA256、所在平面分块、高度带和数量继续核对；真实12章节两种模型编码都有覆盖断言。1.8.0时Node v20.10.0首查对照为1.914—17.701ms，重复查询最大平均值0.084ms；这些不能证明Puerts首次出线速度或游戏FPS。1.8.1验证另记在`release/VALIDATION-1.8.1.txt`。
