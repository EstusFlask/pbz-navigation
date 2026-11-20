# 戏梦山庄高空巨型碰撞层：独立网格与保守mask研究

2026-11-16，离线私有研究。没有修改生产代码、世界提取数据、游戏或发行包；没有把原生碰撞当作误读删除。

## 可实施的最小方案

普通几何继续10cm体素。将Z约3,000,000cm、真实垂直隔离的完整几何簇放入独立Recast/Detour子网格：水平cell=1,000cm（10m）、高度cell=5cm、tile=256cell（2.56km）。真实碰撞三角形全部保留；仅允许21个巨箱的真实凸顶面提供粗网格地面，另外296个同簇来源继续阻挡，并对其XY AABB相交的**整cell/整高度列**禁走。不能只对障碍中心或只对AABB中心下方的span操作。

巨箱边缘也不以cell中心采样：一个水平cell必须**完整落入至少一个真实凸顶面**，才可保留其walkable spans。宁可在两个顶面接缝保守少留cell，也不把“分别有几个角受支撑”当作整个cell受支撑。每个顶面为CCW凸四边形，逐半平面求整个cell上的最小cross即可精确判断矩形包含关系；没有用轨迹补路、扩面或简化真实碰撞。

该方案会保守拒绝高层岩石顶面、细节附近及窄缝。它保留所有阻挡并有意收缩候选地面，**不是高层所有细节的可通行完备证明**。未来需要这些细节时可另加10cm局部子网格；跨子网格交接必须显式验证，不能凭XY重叠自动连通。

## 全source隔离对账

证据：`build/ximeng-subgrid-research-20261116/range-proof.json`、`high-cluster.json`、`cluster-summary.json`。扫描完整2669包、259,464条真实source范围，以500cm隔离安全带合并Z区间，选中高层：

| 项目 | 结果 |
| --- | --- |
| 高层完整source数 / 三角形 | 317 / 88,000 |
| 巨型箱来源 / 其他来源 | 21 / 296 |
| 高层Z范围cm | 2,997,216.9387–3,007,444.9843 |
| 最近下方来源最高Z | 144,568.8765cm |
| 下方净间隔 | 2,852,648.0622cm |
| 最近上方来源最低Z | 3,502,916.9704cm |
| 上方净间隔 | 495,471.9861cm |
| 选中 / 其他 / 跨界未归类source | 317 / 259,147 / **0** |

初次仅检查巨箱高度±1000cm会发现204个其他来源；完整区间簇实际有296个其他来源，不能只处理初次204个而漏掉其余。同簇全为FastGeo来源。来源范围守恒，不存在被该分离切口截断的source。安全证明针对当前静态提取数据；不代表运行时可移动物体/特殊动作已建模。

现有25.6m tile下，单个最大顶面的AABB就覆盖70,213,842个候选格，不能解除oversized保护硬铺。2.56km子网格下，21顶面加50m边界的AABB候选并集为10,353tile；这是候选数上界，尚未全量烘焙。

## 已完成的真实私有proof

目录 `build/ximeng-subgrid-research-20261116/`：

- `prepare.py`：从真实source三角形范围提取47,784顶点/88,000三角形；写入私有 `high-cluster.pbzmesh`。21个顶面均由真实顶点构成凸四边形，296个其他来源保留真实bounds；输入mesh hash在 `mask-input.json`。
- `mask.mjs`：平台无关的 `containsConvexCell`、`allowedCell` 和 `maskCompactHeightfield`。在 `buildCompactHeightfield`成功之后、侵蚀之前，直接把拒绝cell的全部area设为NULL。可供生产worker复用，但本研究未接入生产。
- `proof.mjs` / `proof.json`：用同一Recast/Detour 0.44.0和全部真实高层三角形烘焙三块；没有只给烘焙器一张替代平面。

| tile | 有效poly | mask拒绝cell / 原walkable span | 输出detail三角形 | 完整Detour查询长度 |
| --- | ---: | ---: | ---: | ---: |
| 内部(0,0) | 1 | 0 / 0 | 2 | 1poly |
| 旋转边缘(-47,14) | 157 | 2873 / 46 | 161 | 34poly |
| 含细节障碍(-1,-1) | 585 | 3134 / 2254 | 828 | 147poly |

10,752组真实顶面的完整cell判断与独立四角半平面判断一致。合成10cm洞（夹在两个大支持面之间）、不在cell中心的小障碍均被拒绝。三块全部991个输出detail三角形，逐**完整三角形**验证：在某个真实凸顶面内保留45cm物理半径余量，且与296个障碍AABB膨胀45cm后均不相交；失败0。该验证使用凸性和三角形/矩形分离轴，不是仅检查路径采样点。最大地面高度量化误差3.0391cm。

## 量化不能隐瞒

物理胶囊仍为半径45cm、高192cm、台阶50cm；水平粗化只应用于这个隔离子网格。沿用现有轮廓与半cell对角线余量：

```text
walkableRadius = ceil(45/1000 + 0.25 + sqrt(1/2)) = 2 cells
effective erosion = 2000cm = 20m
contour reserve = 250cm
half-cell-diagonal reserve = 707.1068cm
```

不能误写为1cell/10m侵蚀。所有真实顶点经“cm双精度→m float32→cm”最大往返误差为0.69495cm；包含与障碍判定另加2cm安全余量。5cm高度cell保持不变。粗网格因量化少走的区域与近障碍拒绝必须作为覆盖限制记录，不得称为原始45cm胶囊的精确等价导航。

## 目录与查询契约

上层world仍为同一个游戏世界，目录下列出独立subgrid id、分辨率、origin、垂直范围、source ledger、保守策略和独立分页index。每个subgrid单独创建PagedWorld/Detour窗口，**不把不同extent的tile装进同一NavMesh**。

端点按严格垂直投影容差及实际nav覆盖选择子网格。只有起终点属于同一子网格，才在该网格查询；一端无覆盖则返回缺覆盖，两端属于不同子网格则明确拒绝/需要已验连接。不能对世界总体bounds择“最近高度”、不能增加垂直投影范围把低层吸附到高空，也不能从巨箱覆盖整个XY推导其连接地面。

未来如果存在真实升降/传送/特殊动作，应按实际actor状态和双端胶囊检查登记跨网格动作；当前没有这些证据，所以该高层与普通地面保持断开。跨网格拒绝本身不意味着几何被删掉。

## 一手依据与接入注意

Recast允许 `cs`与`ch`独立配置；agent高度/台阶/radius采用体素计数，轮廓误差同样随水平cell放大。[官方rcConfig](https://recastnav.com/structrcConfig.html)。本项目锁定wrapper的构建顺序在compact heightfield之后执行侵蚀、区域与轮廓生成，因此mask放在compact成功后、侵蚀前；其raw绑定开放compact cell/span/area访问。[固定版本generator源码](https://github.com/isaac-mason/recast-navigation-js/blob/8a2ece9f8b4947fcb328e17c7ac76c41744021b3/packages/recast-navigation-generators/src/generators/generate-tiled-nav-mesh.ts)、[固定版本IDL](https://github.com/isaac-mason/recast-navigation-js/blob/8a2ece9f8b4947fcb328e17c7ac76c41744021b3/packages/recast-navigation-wasm/recast-navigation.idl)。

Recast的侵蚀根据NULL area边界工作；必须在侵蚀前完成整cell禁走，不能等生成polygon后只打标记。[锁定C++ RecastArea](https://github.com/isaac-mason/recastnavigation/blob/599fd0f023181c0a484df2a18cf1d75a3553852e/Recast/Source/RecastArea.cpp)。Detour的网格参数只有一组tileWidth/tileHeight，邻接也按一个tile坐标系处理，独立extent需要独立网格。[Detour网格参数与装块](https://github.com/isaac-mason/recastnavigation/blob/599fd0f023181c0a484df2a18cf1d75a3553852e/Detour/Include/DetourNavMesh.h)。

当前WorldWindow要求originUE全0；最小接入可以保留全0，已测高空float32误差小于1cm。若另用局部origin，必须同时改metadata选择、tile坐标和Planner转换，不能只改烘焙坐标。原有 `maxEdgeLen=floor(1200/cellCm)`在10m cell下为1，真实边缘proof产生较多小poly；它是性能调优点，不能未验证就放宽几何误差。

复核：

```powershell
py -3.12 build/ximeng-subgrid-research-20261116/audit.py
py -3.12 build/ximeng-subgrid-research-20261116/prepare.py
node build/ximeng-subgrid-research-20261116/proof.mjs
```

这是三块离线原型与静态source分离证据；尚未完成10,353候选块的完整构建、生产子网格目录接线、全高层身体检查或游戏验收。
