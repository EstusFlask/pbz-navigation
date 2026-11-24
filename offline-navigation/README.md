# 离线碰撞 → Recast / Detour

当前发布线为 **1.11.5**，已接入11世界／12网格的碰撞重建、普通JS运行端和压缩数据；完整游戏路线、动态规则和现场性能仍未全部验收。当前实装及故障以[持久状态](../docs/OFFLINE-NAVIGATION-STATE.md)为准。新接手者先读[贡献指南](../CONTRIBUTING.md)准备本地依赖、游戏输入及全图暂存；这些输入不随源码克隆。离线候选、独立碰撞、宿主模拟和真实游戏验收分别记账。

原始实验分支：`codex/offline-recast-navigation`；新贡献从最新 `main` 开始。下面的 `route-001` 命令是最初首区域流程示例，不能代替完整世界构建；最初范围见[实现记录](../docs/OFFLINE-RECAST-IMPLEMENTATION-20261115.md)。

用户约束：不分发 EXE。离线烘焙使用锁定的 `recast-navigation@0.44.0`，游戏运行端用 `binaryen@132.0.0` 的 wasm2js 将同一核心转译成普通JavaScript，保留Detour接口与图块格式。游戏宿主已明确禁止WASM代码生成，因此发行运行端不依赖WASM。没有新增导航DLL；打包器与包验证器拒绝EXE/COM/SCR/MSI。

## 当前结构

- `cli.mjs`：WASM 分块烘焙、Detour 查询、走廊/标准拐点、连通分量与实测脚点对照。
- `build-variants.mjs`、`nav-set.mjs`：正式 Recast 图块的条件组合、标准MSET容器；没有重写寻路算法。
- `query.mjs`、`build-runtime.mjs`、`package-data.mjs`：可移植查询层、JS/WASM核心与有界JS数据模块。
- `runtime.mjs`：Puerts入口，用Emscripten的`instantiateWasm`钩子接普通JS转译产物；不会调用宿主WASM编译器。`build-runtime.mjs`缓存带原二进制hash、Binaryen版本和参数的转译结果。普通JS microtask仍需宿主驱动。
- `../tools/pbz_zen.py`：现代 Zen 包、名称、导入/模板与内联 bulk 数据定位。
- `../tools/pbz_body_setup.py`、`pbz_chaos.py`：简单形状、凸体、复杂三角碰撞及高度场。
- `../tools/pbz_dynamic_mesh.py`：已序列化 DynamicMesh 的真实几何；无构造脚本执行。
- `../tools/pbz_fastgeo.py`：本游戏 FastGeo 布局，包含严格边界检查、实例矩阵与物理 gate。
- `../tools/pbz_offline_components.py`、`pbz_offline_assets.py`：反射属性前缀、模板、碰撞 profile、组件放置。
- `../tools/pbz_landscape.py`、`pbz_instances.py`：地形与普通实例组件的原生缓冲区。
- `../tools/extract-offline-region.py`、`build-offline-collision.py`：区域分块索引与带来源的碰撞场景。
- `../tools/partition-offline-collision.py`：保留完整三角形的分块输入与边界余量，不简化/补造道路。
- `viewer.html`、`../tools/build-offline-viewer.py`：本地交互几何检查，生成物位于忽略提交的 `build/`。

## 使用

在本目录运行 `npm ci --ignore-scripts`。Python 使用3.12，开发依赖见`requirements.txt`，可从仓库根执行 `py -3.12 -m pip install --target build/offline-deps -r offline-navigation/requirements.txt`。读取已安装游戏的现有索引、密钥与Oodle开发依赖沿用仓库`build/`配置；不要复制到Mod。只读存档诊断另需`pycryptodome`，本机隔离于`build/tools/crypto`；公开数据构建不读取存档。

从仓库根目录依次运行：

```powershell
py -3.12 tools/extract-offline-region.py
py -3.12 tools/build-offline-collision.py --scenario base
py -3.12 tools/partition-offline-collision.py
node offline-navigation/build-variants.mjs build/offline-navigation/route-001/collision.tiles.json build/offline-navigation/route-001/variants
node offline-navigation/build-runtime.mjs
node offline-navigation/package-data.mjs build/offline-navigation/route-001/variants Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRecastData/route-001
Copy-Item build/offline-navigation/runtime/PBZRecastRuntime.js Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRecastRuntime.js
Copy-Item build/offline-navigation/runtime/THIRD-PARTY-LICENSES.txt Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRecastData/THIRD-PARTY-LICENSES.txt
py -3.12 tests/offline-recast.test.py
py -3.12 tests/offline-body.test.py
node --test tests/offline-runtime.test.cjs tests/recast-integration.test.cjs
```

本地真实案例另执行`prepare-offline-reference.py`、`validate-region.mjs`与`validate-offline-body.py`。`validate-region.mjs`要求忽略提交的`saved-navigation-state.json`，仅保留认证存档中本世界相关的布尔状态；可由`pbz_save_state.Save.navigation_snapshot`只读生成，绝不进入发行目录。探索场景会显式读取`authoring/offline-route-001-exploration-state.json`的假设，不能称为当前实机门状态。

`validated-input` 只是工具协议标记，不授予“全场景完整”的认证。构建输出始终明确记录 `completeCollisionClaim:false`，直到相关解析、状态和独立验证全部有结论。

`cli.mjs bake/query/coverage/components/inspect`仍可用于静态或合成场景诊断。发行的条件图块编译则强制`base`场景、零已记录解析错误和输入SHA一致，拒绝把某个用户的当前存档场景固化进公共数据。

`node offline-navigation/build-terminal-movement-field.mjs DATA_ROOT OUTPUT WORLD AUTHORED_BELL_ID CAPABILITIES_JSON` 从铺好网格的指定世界补查能够落入铃铛步行分区的单向跳落。`OUTPUT` 使用 `build/` 下的新目录。补扫结果需先由 `py -3.12 tools/build-custom-route-action-oracle.py OUTPUT --routes 1` 独立核验，再通过移动页合并器的 `--action-proof` 筛选后进入世界移动数据。游戏按现有规则使用这些候选，仍会检查当前能力与碰撞。

## 验证边界

完整世界入口为 `tools/build-offline-world.py` 和 `tools/build-offline-world-tiles.py index/bake/finalize`，使用逐包流式几何、hash receipt、SQLite空间索引和有界稀疏图块窗口。旁镇32,819包与58,867空间图块是早期首轮记录，见[完整旁镇记录](../docs/OFFLINE-WORLD-BUILD-20261115.md)；后续11世界已接入发行线。包清单覆盖仍不等于碰撞语义完整或实机通过。

输入仅来自游戏碰撞和关卡放置，不读取小黑盒、原 Mod 的面/路网、固定路线或实走轨迹来造路。`prepare-offline-reference.py` 的实测位置只供结果对照，构建器不读取它。

“Detour 返回完整路径”“离线碰撞模型完整”“游戏中实际通过”分别记账。未解码对象、动态机关、数据层、门和游戏规则不能静默忽略。当前原生格式和 UHT 顺序绑定本机记录的游戏二进制/资产版本，游戏升级必须重新核对。

格式依据、真实资产与来源见 [碰撞格式研究](../docs/OFFLINE-COLLISION-FORMAT-NOTES.md)。
