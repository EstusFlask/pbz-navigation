# Detour 装块分帧研究与真实图块对照

日期：2026-11-16，America/Tijuana。范围仅为离线研究；本研究未修改生产运行端、六世界烘焙输出、游戏目录、存档或发行包。现场结论仍以[5号复盘](FIELD-REVIEW-ROUTE005-20261116.md)为准。

## 结论

**现有 `recast-navigation@0.44.0` 的 raw 绑定已经足以实现保持原 Detour 链接结果的合作式装块，不必先重烘焙六世界或更换寻路器。** 私有原型先在副本中清除 external-neighbor 标记，用原 `addTile` 建内部链接；全部装入后恢复标记，再依原算法及原事件顺序分帧重放 external links。寻路、漏斗、投影仍由原 Detour 执行。

真实血色森林密集9块、庞镇20,790多边形块、真实多高度层、条件变体和空slot的对照中，**每个图块的完整内存字节、link free-list及路径结果都与原同步 `addTile` 相同**。这比仅比较路线端点更强：覆盖poly refs、链接分配顺序、链表顺序、portal量化及恢复后的neighbor字段。结果是离线可行性证明，不是实机性能或5号全程正确性的验收。

暂不需要重新编译C++才能修复最重外链步骤。已另外取得上游CI同版本的离线Emsdk 4.0.10，若其余同步内部装块在游戏仍触发保护，可继续把这些循环拆成C++ staged API，再离线转成普通JS。没有编译或分发新导航DLL/EXE，没有让游戏运行WASM。

## 已锁定的源码与API

- npm锁定0.44.0；对应wrapper tag commit为 `8a2ece9f8b4947fcb328e17c7ac76c41744021b3`。[构建脚本](https://github.com/isaac-mason/recast-navigation-js/blob/8a2ece9f8b4947fcb328e17c7ac76c41744021b3/packages/recast-navigation-wasm/build.sh)固定的是 **isaac-mason fork的 `599fd0f023181c0a484df2a18cf1d75a3553852e`**。本仓库早期碰撞提取研究另有 `9f4ce644…` 源码，不能据此替代运行核心的准确来源。
- wrapper只暴露同步 `NavMesh.addTile`。raw IDL同时暴露可写的 `dtPoly.firstLink/neis`、`dtMeshTile.linksFreeList/links`，以及 `dtLink.ref/next/edge/side/bmin/bmax`；因此可以调用已有binding恢复原外链。[IDL：poly/link/tile](https://github.com/isaac-mason/recast-navigation-js/blob/8a2ece9f8b4947fcb328e17c7ac76c41744021b3/packages/recast-navigation-wasm/recast-navigation.idl#L49)、[IDL：NavMesh](https://github.com/isaac-mason/recast-navigation-js/blob/8a2ece9f8b4947fcb328e17c7ac76c41744021b3/packages/recast-navigation-wasm/recast-navigation.idl#L377)。未发现现成sliced admission；sliced path query即使存在也不能拆开装块。
- C++外链辅助函数为private。`connectExtLinks`对每个源portal调用 `findConnectingPolys`，后者扫描目标poly；因此仅在tile之间yield仍会保留大同步峰值。[头文件](https://github.com/isaac-mason/recastnavigation/blob/599fd0f023181c0a484df2a18cf1d75a3553852e/Detour/Include/DetourNavMesh.h#L611)、[目标扫描](https://github.com/isaac-mason/recastnavigation/blob/599fd0f023181c0a484df2a18cf1d75a3553852e/Detour/Source/DetourNavMesh.cpp#L300)。原事件次序见[addTile](https://github.com/isaac-mason/recastnavigation/blob/599fd0f023181c0a484df2a18cf1d75a3553852e/Detour/Source/DetourNavMesh.cpp#L908)，链接写入与量化见[connectExtLinks](https://github.com/isaac-mason/recastnavigation/blob/599fd0f023181c0a484df2a18cf1d75a3553852e/Detour/Source/DetourNavMesh.cpp#L387)。

本次使用现有已转译核心：源WASM SHA256 `00bafffb2048740b76ca3ec865f49338af65335f6e55b968f8d98b92e8ec92dc`；Binaryen `132.0.0`，参数 `--all-features --emscripten --deterministic -O2`；普通JS转换文件SHA256 `85a50be852f2ea7981cfa17dc947c67f2417866e198cd27ad31e9812fd5f69a6`。转换工具的定位见[Binaryen README](https://github.com/WebAssembly/binaryen/blob/version_132/README.md)。VM同时禁止WASM及字符串代码生成。

## 私有原型接口及精确性条件

文件均在 `build/detour-admission-research-20261116/`，不进入分发包。

| 文件 | 用途 |
| --- | --- |
| `cooperative-admission.mjs` | 纯平台无关helper；无Node、文件、WASM或动态代码依赖 |
| `build-proof.mjs` / `bundle-entry.mjs` | 为测试暴露现有Raw的普通JS核心构建入口 |
| `proof.mjs` | 原始密集9块的完整字节/查询/不同插入顺序对照 |
| `matrix-proof.mjs` | 庞镇密集高引用、多层、条件、空slot、取消和拒绝控制 |
| `proof-*.json` / `matrix-*.json` | 输入hash、每阶段步骤时间、字节hash及查询结果 |

可复用API：

```js
const row = yield* prepare(originalBytes, originalSlot);
// 此时原字节未改；row.copy仅有external neis被置0。
// 调原addTile(row.copy)，flags=0，保留拥有heap字节的UnsignedCharArray。
row.raw = navMesh.raw.getTileByRef(tileRef);
row.base = tileRef >>> 0;
// 所有图块装入后：
for (const row of rows) yield* restore(row);
for (const [source, target, side] of events(rows))
  yield* connect(source, target, side);
// 全部完成后才允许查询/发布这个新窗口。
```

`prepare`每16KiB复制、每32poly建索引yield；`restore`每32portal yield；`connect`每64个候选/源边工作单位yield。索引仅跳过不可能匹配side的边，保留目标poly、edge原顺序；同一poly首次匹配后跳过其余边，并保留原算法前4个匹配。比较与量化使用每个源C++ float表达式对应的 `Math.fround`，没有引入几何容差变化。

事件重放必须保留原插入顺序：每次插入先同XY已插入层（链表中新层在前），再side 0至7的邻格；每对先new→old，再old→new。不能按最终空间排序统一连边。真实slot也不能压缩：null tile虽然不装入，后续ref仍按原slot计算。大于等于2³¹的raw返回ref可能表现为有符号数；比较时应 `>>>0`。测试特别覆盖这一点。

原型明确拒绝 `offMeshConCount > 0`、非ground poly、非0/2/4/6外边方向和超过原邻层上限的输入，且在对应tile调用stock add之前拒绝。当前对照中真实烘焙块全部符合这些限制。未来特殊动作不得静默跳过：应补完整off-mesh分帧流程或明确让该请求失败；也不能回退为无预算的慢装块。

**事务边界是整个新窗口。** `restore`/`connect`期间图还不完整；不要把它挂为权威图，也不要并发查询。任何读取损坏、取消或unsupported输入均销毁新窗口并保留原权威图。仅对已经公开的live mesh做原地清标记/重放不满足这一条件。原型helper本身不管理宿主事务，接入层必须补上这一契约。

## 实际对照与时间

以下是Node 20.10.0实测的单步骤最大值，单位ms。`--jitless`只是解释执行压力控制，**不证明游戏采用同一V8开关**。原同步baseline单独计时，其超50ms是要复现的失败，不得混作新路径的保护失败。

| 控制 | stock addTile | 清外链后的stock addTile | 合作式外链重放 | 字节/free-list/查询 |
| --- | ---: | ---: | ---: | --- |
| 原密集9块，normal | 16.28 | 0.482 | 0.941 | 全相同 |
| 原密集9块，jitless | 138.28 | 10.61 | 0.757 | 全相同 |
| 原密集9块，jitless反序 | 120.61 | 10.83 | 0.421 | 全相同 |
| 原密集9块，jitless打乱 | 229.00 | 13.35 | 0.465 | 全相同 |
| 庞镇20,790poly及12邻块/层，normal | 18.69 | 1.286 | 0.035 | 全相同 |
| 同上，jitless | 407.20 | 28.06 | 0.527 | 全相同 |

原密集9块为血色森林 `x=-18..-16,y=-62..-60`，最大8,675poly（其中已定位慢块8,648poly）、631portal、40次定向连接事件。每个插入顺序各验证18条普通控制查询及32条已知跨块link的完整查询。其条件列表实际均为空，所以unknown/closed/open在这9块选择相同blob，不能把它们伪记成三个不同几何控制。

额外矩阵使用：

- 血色森林 `(-38,-49)`及邻格：10个真实已装层，18个空slot，真实sameXY多层，24条完整跨块查询。
- 血色森林 `(6,-61)`及邻格：unknown/closed/open分别选择实际条件blob，14块、多层、18空slot；每种24条完整跨块查询，所有字节与原同步基线相同。unknown选择关闭变体；没有永久修改actor状态。
- 庞镇 `(-74,2)`及邻格：13块、17空slot、20,790poly真实密集块；128×32,768容量、salt512高引用（超过2³¹）、打乱插入顺序、24条完整跨块查询，全相同。
- 零tile/纯null序列；准备到一半取消不改原字节；已有实际外链分配后取消并销毁新图不改权威图；伪造offmesh计数/不支持方向在入图前拒绝。normal和jitless两个矩阵均 `allPassed:true`。这些是离线对象生命周期控制，尚未覆盖主程序生成器取消接线。
- 单独的 `first-four-proof.mjs` 构造一个源portal对六个同时匹配目标poly的**合成控制**；原同步和分帧结果完整字节相同，最终external refs精确为目标poly 3、2、1、0（只取前4，按prepend逆序）。normal/jitless都通过。该输入故意修改了几何，只用于验证最大4匹配与链表顺序，绝不进入烘焙数据或物理验收。

时间仍有边界：**清外链后的stock addTile仍包含同步free-list、内部链接和扫描循环，尚非所有输入下的硬时限证明。** 密集庞镇压力控制目前约28ms，重复试验曾31.57ms；游戏更慢时仍可能超过50ms。原型未覆盖整个六世界的所有窗口。另有base64解码/读盘问题须单独拆分，不能以此表宣称全部顿卡已修复。50ms与30秒保护均不应提高。

### 可选内部链接也重放的实验

`cooperative-admission-all-links.mjs`在准备时保存全部neighbor字段到 `Uint16Array`，stock add时内外neighbor全为0；恢复字段后，先按poly递增/edge递减重放内部链接，设置原ref、side255和零portal bounds，再执行相同外链事件。新增 `replayInternal(row)`，每32poly yield。未修改稳定的external-only helper。

`all-links-proof.mjs`和 `all-links-matrix-proof.mjs`在normal/jitless均通过相同完整字节/free-list/查询控制，包括20,790poly高ref、多层、条件、空slot与取消。但压力下同步峰值只从密集9块10.61降到8.23ms、庞镇28.06降到24.13ms；9块增加约122ms累计内部重放时间及约31ms字段恢复时间。原因是原addTile仍会为每个邻格扫描零neighbor的poly。**这个变体保持精确性，但收益不足以单凭它宣称同步峰值已降至10ms以内；external-only版本目前更省总工作量。** 四个 `all-links-*.json`保留结果，生产是否采用由接入测试决定。

## 离线C++ staged API的可行后备

未在PATH找到emcc/clang/cmake；本研究按[wrapper CI](https://github.com/isaac-mason/recast-navigation-js/blob/8a2ece9f8b4947fcb328e17c7ac76c41744021b3/ci/install-emsdk.sh)取得**官方Emsdk 4.0.10**，而非改装系统编译器。Emsdk checkout `708dcbcc9ee23bc7d2dad44fc90db377e38b771c`，SDK release hash `8103ffedfb0c42d231c6af6859a5a1a832260b43`，`emcc --version`确认4.0.10。全部下载与activation配置位于私有研究目录；未写永久PATH。官方安装方法见[Emscripten downloads](https://emscripten.org/docs/getting_started/downloads.html)。

路径：`build/detour-admission-research-20261116/emsdk/upstream/emscripten/emcc.py`。调用 `py -3.12 <上述路径> --version`可复核。完整wrapper源码及其准确fork源码也已下载于同目录。尚未编译patched wrapper；本次成功原型复用原二进制/普通JS核心。

若进一步实测证明内部同步阶段仍过重，建议增加 `beginAddTile/stepAddTile/cancelAddTile`，其state置于C++不透明job中，原 `addTile`保留。拟议阶段为：参数与slot准备→分段link freelist→按poly内部链接→分段offmesh起点与终点→按原事件次序外链→完成。source poly/edge及target poly/edge均有cursor；不能只把一次 `connectExtLinks`当作一个step。每次resume保持固定预算工作量，完整保存前4匹配与原float计算，禁止在中间查询。取消时丢弃整个staged mesh，避免对权威图做复杂回滚。

绑定增加job构造/step/status/result/destroy，不更改tile数据格式或refs编码。由相同0.44.0源码离线编为WASM后，沿现有Binaryen132 wasm2js流程生成普通JS，并重跑本报告全部完整字节/高ref/条件/多层/取消/禁代码生成控制。这样分发仍只有JS与原导航数据。此为后备设计，不能写成已实现或已编译通过。

## 复核命令

```powershell
node build/detour-admission-research-20261116/build-proof.mjs
node build/detour-admission-research-20261116/proof.mjs
node --jitless build/detour-admission-research-20261116/proof.mjs
node --jitless build/detour-admission-research-20261116/proof.mjs reverse
node --jitless build/detour-admission-research-20261116/proof.mjs shuffle
node build/detour-admission-research-20261116/matrix-proof.mjs
node --jitless build/detour-admission-research-20261116/matrix-proof.mjs
node build/detour-admission-research-20261116/first-four-proof.mjs
node --jitless build/detour-admission-research-20261116/first-four-proof.mjs
node build/detour-admission-research-20261116/all-links-proof.mjs
node --jitless build/detour-admission-research-20261116/all-links-proof.mjs
node build/detour-admission-research-20261116/all-links-matrix-proof.mjs
node --jitless build/detour-admission-research-20261116/all-links-matrix-proof.mjs
```

下一步是把上述事务与生成器接入现有Planner/WorldWindow，拆解packet解码，重放现场请求，保持离线、mock和实际游戏验收分别记账。本研究不证明消除装块峰值后5号路线就自然完整，也不解决剩余五世界碰撞解析缺口。
