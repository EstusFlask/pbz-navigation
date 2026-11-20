# 5号路线：原作移动条件与独立坠落研究

日期：2026-11-16。范围：只读本机原作 cooked 包、原生反射元数据和加载器 SDK；不改生产代码，不安装、不启动游戏、不访问存档。私有探针、源包指纹及类型化解码在 `build/movement-caps-research-20261116/`，不进分发包。本页是离线证据，不是当前场景的动作/碰撞验收。

## 可用于实现的结论

1. **不能把 UpRunning 反向改成下降机关。** 原生类型单独提供 `SpecialMoveVolume_UpRunning` 和 `SpecialMoveVolume_DownSliding`，前者的高度、warp 参数和数据结构都属于上行；后者另有 `Depth`、`DistanceToLedge`、`EdgeSplineComponent`、`EndEdgeSplineComponent` 和 `CalculateDownSlidingWarpTarget`。不存在本次已找到的“反向 UpRunning”字段或 API。[原生类型](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/AdvancedSpecialMove.d.ts#L808)、[UpRunning 类型](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/AdvancedSpecialMove.d.ts#L976)、[原生 PE 表](../build/movement-caps-research-20261116/native-tables.json)
2. **原作确实支持普通坠落，并有真实玩家伤害/致死高度数据。** `BP_Player_Base` cooked 默认值为 `DamageDepth=1200.0`、`DeadDepth=2000.0`（UE 厘米）。不是从角色轨迹或这两道墙推算的阈值。完整 Kismet 证明伤害按真实坠落开始位置到当前位置的 Z 差计算，低于伤害起点时跳过该扣血分支。旧 `BP_Player_Soul/Hero_Hun` 和实际 Renewal 模板链 `BP_RenewalPlayer/BP_Renewal_Hun` 的 cooked CDO 均未覆盖这两个继承字段；RenewalPlayer 的覆写事件明确先调用基础类原事件。[默认值解码](../build/movement-caps-research-20261116/player-defaults-prefix.json)、[Renewal 继承字段头](../build/movement-caps-research-20261116/renewal-inheritance-headers.json)、[基础脚本](../build/movement-caps-research-20261116/player-kismet.json)、[Renewal 脚本](../build/movement-caps-research-20261116/interaction-kismet.json)
3. 因此约 553/596cm 的高差可以成为**独立、待几何检查的 fall 候选**，无需把 310cm 扩成猜测的通用常数。但“低于伤害阈值”只证明这一项原作生命规则，不能证明墙外出口、下降轨迹、落脚胶囊、地面支撑、当前门/层/机关状态。候选必须按真实地形另验；不能把上行路径反转后直接认证为可落下。运行时优先读取当前 pawn 的有限正数 `DamageDepth/DeadDepth`，而不是把某个 CDO 当所有人物/状态永恒不变的属性。已经在 Falling 的角色还会累计 `BeforeFallingLocation` 高差，不能仅看当前脚点到终点。
4. **当前四个 UpRunning 的 authoring.path 不是原生计算出的 warp 路径。** 现有提取器取 `BoxA/Box/SceneComponent` 与 `EdgeSpline` 弧长中点；该四实例没有保存独立 BoxA 覆盖，所以实际用了根 `SceneComponent`。有些实例还有 `BoxTransform` 的本地偏移。原生还使用分型 warp offsets；完整精确起终点应由当前实例的 `GetCollisionComponent(pawn)` 和 `CalculateUpRunningWarpTarget(...)`／`GetUpRunningData()` 获取后核对。[现有提取器](../tools/decode-placed-movements.py)、[实例字段](../build/movement-caps-research-20261116/uprunning-values.json)、[组件字段](../build/movement-caps-research-20261116/component-values.json)
5. **关键钩索 1708767337 的静态 facts 丢失了真实 TriggerBox。** facts.path 首点是与 GrabPoint 同心的 TriggerSphere 中心；实际 TriggerBox 在另一侧低处。已加载提取应保留 1.4.1 的 TriggerBox 优先语义，空中抓点不能被当作步行入口。[独立变换核对](../build/movement-caps-research-20261116/hook-world-verified.json)、[原包组件值](../build/movement-caps-research-20261116/component-values.json)

## 玩家普通坠落规则的直接证据

读取的第一方包为 `/Game/PBZContent/Blueprint/Character/Player/BP_Player_Base`，以及继承链上的 `BP_Player_Soul`、`BP_Player_Hero_Hun`。源包 chunk、SHA256、导出索引在 [fetched-index.json](../build/movement-caps-research-20261116/fetched-index.json)。FProperty 描述从各 cooked `BlueprintGeneratedClass` 的原生序列化尾中恢复，不靠浮点模式定位值；`BP_Player_Base_C` 唯一成功表位于 class payload offset 5460，共 57 字段，`DeadDepth/DamageDepth` 为 slot31/32 的 DoubleProperty。CDO `Default__BP_Player_Base_C` export4 顺序消费前置 `DS_Player`、`DS_HitReaction`，得到这两个值。解析失败会停下，不跳过未知前缀。[属性描述](../build/movement-caps-research-20261116/class-properties.json)、[探针](../build/movement-caps-research-20261116/probe.py)

`ExecuteUbergraph_BP_Player_Base`（export23）磁盘脚本 **18,105/18,105 字节**全部消费；按 FName、FPackageIndex、FFieldPath 的内存表示计算出的 **12,449 字节**与 cooked 声明完全相等。两个事件 wrapper `K2_OnMovementModeChanged`、`OnLanded` 也均完整消费、内存长度相等。下列偏移为原作字节码内存偏移，完整表达式同时保存磁盘偏移：[完整解码](../build/movement-caps-research-20261116/player-kismet.json)、[私有 Kismet 解析器](../build/movement-caps-research-20261116/kismet_probe.py)

- `K2_OnMovementModeChanged` 跳入 offset9708，`NewMovementMode==3` 时记录 `BeforeFallingLocation=K2_GetActorLocation()`；离开 `PrevMovementMode==3` 时进入后续落地计算。3 对应引擎 Falling 枚举。
- offset9902 起计算 `BeforeFallingLocation - K2_GetActorLocation()` 并取 Z；offset9994 起执行 `MapRangeClamped(Z, DamageDepth, DeadDepth, 0.0, -1.0)`。
- offset10067 比较映射结果 `<0`；不成立则在 offset10105 退出这一执行流。之后检查 `CharacterState.Immunity.Fall`，有该标签也退出。
- 伤害路径读取 `Health_Max`、把同一映射比例相乘，并通过 `ModifyCharacterAttributeValue` 修改 `Health`（offset10724）。这是生命值损失曲线，不是导航胶囊许可 API。
- 另一坠落检查在 offset11017 比较真实累计 Z 差 `>=DeadDepth`；同样检查 Fall immunity 后，以 `BP_ApplyGameplayEffectToSelf` 施加 `/Game/PBZContent/Blueprint/Ability/GameplayEffects/GE_Kill`（offset11236）。

`DamageDepth=1200` 的默认值与上述源码路径一起，才支持“本机这条人物继承链的普通坠落伤害起点为12米”。未运行游戏读取当前 pawn；未验证其他角色、状态修改、特殊区域触发器或 fall 是否因碰撞先落在更高物体。`AIScript_GroundCheck.FallSafetyDistance` 是 AI 地面恢复/远距回收脚本字段，不能用作玩家阈值；`BP_FallingBody.FallingHeight` 是测试骨骼物件，也不是玩家规则。[SDK 玩家字段](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/blueprints.d.ts#L10886)、[AI 字段](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/blueprints.d.ts#L223059)

格式读取参照直接维护解析器的上游源代码：[UStruct](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UStruct.cs)、[FProperty/UnrealType](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealType.cs)、[KismetExpression](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Kismet/KismetExpression.cs)、[FKismetArchive](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Assets/Readers/FKismetArchive.cs)、[FFieldPath](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FFieldPath.cs)。这些仅解释二进制格式；高度数值及行为结论来自本机原作包，不来自这些解析库。

## 四个 UpRunning 实例

共同类为 `/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_UpRunning.BP_SpecialMove_UpRunning_C`。表内位置为现有提取器的真实 component-derived 候选，保留两位小数；不是原生计算器返回的落脚保证。[原作导出头与指纹](../build/movement-caps-research-20261116/exports.json)、[类型化值](../build/movement-caps-research-20261116/uprunning-values.json)

| Actor GUID 末尾 | 根 SceneComponent | EdgeSpline 弧长中点 | 原生 UpRunningTargetHeight |
| --- | --- | --- | --- |
| 1299255807 | (-54045.33,138831.04,2724.33) | (-54055.99,138544.72,3320.27) | 595.9402465820312 |
| 1248506806 | (-54419.50,139346.04,2192.66) | (-54468.09,139063.67,2745.83) | 553.1737670898438 |
| 1353230808 | (-51719.45,141863.75,1249.81) | (-51543.63,142091.03,1650.94) | 401.1258850097656 |
| 1453692831 | (-50833.69,142249.55,1660.20) | (-50570.41,142165.94,2173.27) | 513.0675048828125 |

两道约5.5/6米落差在同一 cooked cell `CUQW4VZBWIZPR65ZFJ05FN0V1`，原包 SHA256 `4ee8faacfa040270edd61b02bd2a1540d831ac382696ee24b519862bd109ab84`，export9/10。上行两道分别为 `2YCYVUA03400AMW2943NU5V67` 的 export16（包 SHA `cd5b365fadb19d9b9b4da641eeac05fe8128b49877830d863567e88fb09e6c18`）与 `5EEA5EN3RYGI4VYXAAH77WZQO` 的 export61（SHA `758f51c07338406c42912fb3ee44de86844bd19a4039eef1da58848490a5b325`）。

四实例 `BoxExtent` 均为约 `(400,277.002595,90)`。1453692831 和1299255807 另保存 `BoxTransform.Translation=(-6.546717,-6.953500,11.710913)`；后者还有几乎单位四元数。其余两者没有该本地 override。BoxA 本身来自 native CDO，实例保存的组件只有根与 EdgeSpline；因此静态根位置不能等同当前实际 BoxA center。未执行原生构造函数，不能凭这三个值补造精确 trigger 世界位置。[组件解码](../build/movement-caps-research-20261116/component-values.json)

真实 `BP_SpecialMove_UpRunning` CDO 中的 `UpRunningWarpTargetData`：

| 分型 | WrapStartTargetOffset | WrapEndTargetOffset | PoseSearchWrapTargetOffset | PoseSearchEndWrapTargetOffset | ValidInteractDistance |
| --- | --- | --- | --- | --- | --- |
| LowWall | (0,0,100) | (0,0,-100) | zero | (0,-60,50) | 1000 |
| MiddleWall | (0,0,200) | (0,0,-100) | (0,-10,0) | (0,-100,50) | 1000 |
| HighWall | (0,0,200) | (0,0,-100) | (0,-50,0) | (0,-100,50) | 500 |

这些是实际字段值；**没有**据此声称现有 endpoint 在世界坐标上固定错100cm，因为 offset 的使用基准、分型选择、当前角色和 trace 仍由 native 计算器决定。可以读取的接口/结果为：

```text
CalculateUpRunningWarpTarget(InCharacter, BaseLocation, OutData, bTraceForward)
GetUpRunningTargetHeight()
SpecialMove_UpRunningData:
  EdgeTargetPointTransform / WarpStartTargetPoint / WarpEndTargetPoint /
  PoseSearchWarpTargetPoint
SpecialMoveAbility_PoseSearchUpRunning.GetUpRunningData()
```

签名来自本机加载器反射生成 SDK；未逐一游戏调用测试，`Calculate...` 的原生内部 trace/状态副作用未逆向到函数体，不能把声明存在当作无副作用已经实证。[SDK 数据结构](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/AdvancedSpecialMove.d.ts#L1373)

对该蓝图的完整小函数解码还证明：`GetNeedShaChiWeaponID()` 返回 `None`，`GetInteractRequirementMeet(pawn)` 返回枚举0=`NoRequirement`；`IsValidInteract` 转交 native `HandleIsValidInteract`，`GetCollisionComponent` 转交 `HandleGetCollisionComponent`。所以“没有武器需求”不等于任意朝向/距离都能触发；应继续使用当前实例的 native valid/trigger 查询。[交互脚本完整解码](../build/movement-caps-research-20261116/interaction-kismet.json)、[枚举](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/ProjectPBZ.d.ts#L2158)

## 钩索 1708767337

源 cell `AOBWGBYCD9NLFWHSCM4CUM7XO`，chunk `7f76cf9f011328ee00000001`，包 SHA256 `007f1cbe26344cd0ca323f07ce30cb5cfa4671a6ec6bac89d37840a42d1e89d4`，Actor export3。使用当前 collision 解码器和纯数学父变换重新计算，和旧 hooks 原始记录一致：[核对结果](../build/movement-caps-research-20261116/hook-world-verified.json)

| 部件 | cooked 世界位置 | 角色 |
| --- | --- | --- |
| TriggerBox | (-50501.456162,141883.955110,2281.259129) | 真实交互进入区域；还需投影到区内有效支撑 |
| GrabPoint | (-51544.936912,140929.965823,2973.940828) | 空中抓点，保留在动作路径内 |
| TriggerSphere | 与 GrabPoint 同心 | 距离/瞄准检测中心，不能当必须步行到的脚点 |
| LandArea | (-52255.505720,140637.613428,2126.728891) | 原作落区，仍需当前落地/身体检查 |

实际实例 TriggerBox 保存局部 scale `(10.07685863,5.25,11.25)`；GrabPoint 类默认 scale `(0.3,0.3,0.3)`；TriggerSphere 类默认 radius8000 且 attach 到 GrabPoint。区间大小有继承与变换，不能从中心点距离推断“够近即可通行”。[组件值](../build/movement-caps-research-20261116/component-values.json)

`BP_GapBlocker.GetNeedShaChiWeaponID` 的完整 Kismet 返回 **`ShachiHook`**。`IsValidInteract` 先检查玩家和 TriggerSphere 的3D距离平方是否不大于真实 scaled radius²，再调用其父 `IsValidInteract`。这是必需的钩索武器/当前交互链，不能只保留两坐标。Type/bHanging 在本实例未保存 override，本次没有把枚举底层值编造为可用的动作语义。父类还可能有当前条件；必须读取当前已加载实例，未知/不满足不得自动开放。[完整函数解码](../build/movement-caps-research-20261116/interaction-kismet.json)

## 是否漏了附近 DownSliding

`all-placed-index.json` 中血色森林没有名字匹配 DownSliding 或旧 ASM Sliding 的实例；既有 `placed-actions.json` 的血色森林成功项为 ascent49、mantle4、wallrun4、rappel2、swing1、lift1。新全世界 root 的54,312,044字节名称表也没有 DownSliding/ASM_Sliding，导出名没有相关项；该世界完成包总账中没有 native SpecialMove/Sliding 类。因而本次没有找到两段附近可以直接接入的真实 DownSliding，不能替这两道 UpRunning 凭空配一个下降机关。[世界原始 root](../build/offline-navigation/worlds/pbz_fujizhilin_wp/world-root.bin)、[完整世界总账](../build/offline-navigation/worlds/pbz_fujizhilin_wp/coverage.json)、[旧真实放置索引](../build/roadbook-11/all-placed-index.json)

这是对已提取命名/原生类的否定结果，不是穷尽所有蓝图祖先或运行时构造的证明；世界组件审计明确 `blueprintClassAncestryExhaustivelyAudited:false`、`constructionScriptsExecuted:false`。本次不为此重跑全图，不用行走轨迹补建动作。向下修复可先从真实碰撞地面发现独立 fall 候选，用当前玩家坠落规则与完整几何检查筛选；如发现明确 DownSliding 才按其自己的入口/出口建单向边。[世界覆盖限制](../build/offline-navigation/worlds/pbz_fujizhilin_wp/component-coverage.json)

## 验证边界与续做

- 已完成：第一方 cooked 数据/元数据读取、字段顺序和包指纹、四个上行原生高度、Hook 三个关键世界位置独立复算、玩家完整脚本消费及内存长度相等、小交互函数完整解码。
- 未完成：当前 pawn 的字段读值、native warp calculator 实际返回与是否合适调用、当前加载/关闭/未知条件、独立 fall 的连续胶囊与落地检查、全程游戏验收。没有把这些离线结论记作“向下路线已可走”。
- 建议接线：Recast 负责动作间步行；已加载 game-placement actor 提供动作身份/真实 trigger；fall 以普通运动语义独立验证。不要把 SceneComponent/样条中点或 TriggerSphere 中心直接当作认证后的真实脚点，不把 1200cm 伤害线混成几何可通过阈值。

## 补充：当前角色链与移动参数（2026-11-16）

**当前 Renewal 原型链是 `BP_Renewal_Hun → BP_RenewalPlayer → BP_Player_Base`，与旧 `BP_Player_Hero_Hun → BP_Player_Soul → BP_Player_Base` 分开。** 不能把旧 Soul 模板的 JumpZVelocity1000、GravityScale3 套给 Renewal 玩家。源路径与指纹已加入 [fetched-index.json](../build/movement-caps-research-20261116/fetched-index.json)。RenewalPlayer own86个字段、Renewal_Hun own59个字段；两个 CDO 均无 `DeadDepth/DamageDepth` override。[类型字段](../build/movement-caps-research-20261116/class-properties.json)、[继承核对](../build/movement-caps-research-20261116/renewal-inheritance-headers.json)

RenewalPlayer 的 `ExecuteUbergraph_BP_RenewalPlayer` **16,259/16,259 磁盘字节**完整消费，内存 **11,767/11,767** 对齐声明；`K2_OnMovementModeChanged` wrapper 进入内存offset8315，第一条就是调用 `/Game/PBZContent/Blueprint/Character/Player/BP_Player_Base.K2_OnMovementModeChanged`（publicHash8599051283446556047，JSON探针保持Python精确整数；JS显示可能舍入），四个 mode 参数原样传入。因此前述1200/2000规则并未因 Renewal 事件覆写而被绕开。[Renewal 完整脚本](../build/movement-caps-research-20261116/interaction-kismet.json)

各模板的 `CharMoveComp` 实际类型都是 **`PBZCharacterMovementComponent → CharacterLocomotionComponent → CharacterMovementComponent`**。UHT 表恢复出23个 PBZ 自有序列化字段、40个 Locomotion 字段；基础 CharacterMovement 的 GravityScale/JumpZVelocity 分别位于总slot64/66。逐前缀消费了 Renewal 的软碰撞采样点、GameplayTagRequirements/Query 等，未靠搜索浮点数跳过。[原生表](../build/movement-caps-research-20261116/movement-native-tables.json)、[解码值](../build/movement-caps-research-20261116/movement-component-values.json)、[字段头](../build/movement-caps-research-20261116/movement-component-headers.json)

| 参数 | 当前 Renewal 链 cooked 证据 | 当前查询优先项 |
| --- | --- | --- |
| GravityScale | Base=2.2000000477；RenewalPlayer/Hun无覆盖 | `movement.GetGravityZ()`，不要硬编码世界重力或只乘该Scale |
| JumpZVelocity | Base/RenewalPlayer/Hun均未保存覆盖；补查本机 native CMC 构造写420cm/s，两个派生构造未直接重写该成员 | 当前 `movement.JumpZVelocity`；结合 `pawn.CanJump()`、剩余跳次数、实际输入/能力许可 |
| MaxWalkSpeed | 当前3层均无保存覆盖；native CMC 构造写600cm/s，但locomotion属性/状态会更新当前速度 | 当前 `movement.GetMaxSpeed()`；静态MaxWalkSpeed不足以代表冲刺 |
| bCanWalkOffLedges | 当前3层均无保存覆盖；native CMC构造的对应bit为true | 当前 `movement.bCanWalkOffLedges`，并核对额外ledge protection |
| bCanWalkOffLedgesWhenCrouching | Base明确保存true，Renewal两层无覆盖 | 当前反射值及实际姿态 |
| AirControl | RenewalPlayer/Hun未覆盖；native默认本次 **unknown** | 当前 `AirControl`、BoostMultiplier/Threshold、FallingLateralFriction |
| AirControlBoostMultiplier / Threshold | RenewalPlayer保存6 / 100，Hun无覆盖 | 当前值；不能把横向速度当完全可任意瞬变 |
| WalkableFloorAngle/Z | Renewal_Hun保存55° / 0.5735764503 | 当前floor/body检查 |

旧 Soul 的 JumpZ1000、Gravity3，以及旧 Hero_Hun 的AirControl0.5/MaxAcceleration800，已保留在私有证据中，但明确不用于当前 Renewal 路线。

### GetGravityZ/GetMaxSpeed是否动态分派

SDK 只在 `MovementComponent` 上声明这两个反射函数，PBZ 和 Locomotion 派生声明里没有重新登记同名 UFUNCTION；**这不能证明没有 C++ virtual override**。进一步只读反汇编了本机 PE 的原生注册表/无参数exec thunk：

- `GetGravityZ` exec thunk `0x143d80650`：从当前对象取vtable，`call [rax+0x4f0]`，把xmm0存为float返回。
- `GetMaxSpeed` exec thunk `0x143d810d0`：同样动态调用 `vtable+0x4f8`。
- `GetMaxJumpHeight` exec thunk `0x143d30060`：动态调用 `vtable+0x778`。

因此通过当前真实 `CharMoveComp` 调这三个反射函数，会分派到它实际的派生虚方法。后续又按native构造调用链及UHT成员偏移核对了三个primary vtable：PBZ `0x14c027710`、Locomotion `0x14bcd7e78`、CMC `0x14b10d268`，上述三个slot在三张表中完全相同，分别指向 `0x143d0ac40/0x143d0b560/0x143d0b4c0`。这证明本机这两层派生没有再覆写这三个虚方法；蓝图/driver仍可修改其读取的运行字段。Gravity getter的函数体直接读取 `GravityScale`（this+0x1a8）乘基础世界/volume重力。[vtable对照](../build/movement-caps-research-20261116/movement-vtable-comparison.json)、[指令证据](../build/movement-caps-research-20261116/movement-getter-thunks.json)、[探针](../build/movement-caps-research-20261116/movement_probe.py)、[SDK MovementComponent](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/Engine.d.ts#L25652)

PBZ 派生另有 `LedgePredictOffset/RadiusScale`、`LedgeFanLaneDistance`、`LedgeProtectionHeight/Angle`、`SafeDistanceThreshold`、`bForceDisableLedgeProtection`、`bForceEnableLedgeProtection`。所以引擎bCanWalkOffLedges单一true不能充分证明当前角色允许走下该处悬崖；导航不应调用SetForce...改变这些条件。[实际PBZ类型](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/ProjectPBZ.d.ts#L8060)

### 步行/慢跑/冲刺速度的真实来源

`BP_Renewal_Hun` CDO slot85（自身59+父ActorConfig26）实际引用 `/PBZCombatAsset/ActorData/Players/Hun/ActorConfig_Hun`，已顺序解析前置字段核对。[直接引用](../build/movement-caps-research-20261116/renewal-hun-actor-config-reference.json)。该资产 `Attribute Data` 类型化前缀中明确保存 **WalkSpeed130、JogSpeed600 cm/s**；没有保存SprintSpeed覆盖。继续顺序解析PDA_ActorConfig CDO后，确认其继承默认 **SprintSpeed750cm/s**，因此本机当前Hun配置模板的冲刺属性源为750，而非凭缺失字段猜测。[属性值](../build/movement-caps-research-20261116/actorconfig-hun-attributes.json)、[配置与CDO继承前缀](../build/movement-caps-research-20261116/actorconfig-movement-parameters.json)

可用查询链也有原作函数体证明：

```text
pawn.GetLocomotionDriverActorConfig()
  → 当前 BP_RenewalPlayer 的 “Actor Config” 属性转接口
config.GetWalkParameters()   → “Walk Parameters”
config.GetJogParameters()    → “Normal Parameters”
config.GetSprintParameters() → “Sprint Parameters”
```

后三者返回 `CharacterMovementParameters`，含 `WalkSpeedAttribute` 与 `ExplicitWalkSpeed`，以及加速、摩擦、减速、blend等设置；`BasicAttributeSet`另有 `WalkSpeed/JogSpeed/SprintSpeed/FinalWalkSpeed` 当前属性。`SGameAttributes` 的 `GetCharacterAttributeValue(Character, GameplayAttribute)` 可读取某返回参数指向的当前属性。具体使用哪组参数/当前Sprint能否进入仍应取真实角色状态，不能仅凭Getter存在认证长跳。[完整小函数解码](../build/movement-caps-research-20261116/interaction-kismet.json)、[Locomotion 参数/接口](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/SGameLocomotionDriver.d.ts#L95)、[属性读取签名](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/SGameAttributes.d.ts#L110)

12米的纯XY断口不因“高度下降450cm”就自动可走或可跳。普通jump候选至少要有当前有效的竖直初速、真实有符号重力与方向、可实现的水平速度/起跳状态、跳跃许可和整条胶囊轨迹检查；当前没有读到这些实时数值，不能给该断口可达结论。`CanJump`/JumpZ属性存在也不单独证明当前输入或能力开放。本次没有新增跳跃边。

## 补充：四条真实 EdgeSpline 的完整范围与7点样本

给拓扑排查的可机器读取数据为 [critical-ledges-world-samples.json](../build/movement-caps-research-20261116/critical-ledges-world-samples.json)，每条含原包SHA、actor/root/spline export、原始本地3个Hermite控制点及切线、完整世界端点、长度、7个等距样点。**只读原作cooked样条，没有把玩家轨迹作为输入。** [重建探针](../build/movement-caps-research-20261116/ledge_samples.py)

样点按原作保存的distance→inputKey reparam表等距取样，再按原始Hermite和组件父变换求世界位置；这是原作样条位置，不是已认证的脚点/warp路径。4096段独立数值弧长与cooked长度差均小于0.00004cm。

| GUID末尾 | cooked长度cm | 世界起点 | 世界终点 |
| --- | --- | --- | --- |
| 1453692831 | 519.756470 | (-50798.197,142041.156,2173.272) | (-50321.492,142239.570,2173.272) |
| 1353230808 | 555.913208 | (-51473.272,141822.786,1650.940) | (-51523.575,142367.844,1650.940) |
| 1299255807 | 547.254028 | (-54239.571,138747.626,3320.271) | (-53872.418,138341.811,3320.271) |
| 1248506806 | 547.254028 | (-54623.095,139289.159,2745.831) | (-54313.087,138838.181,2745.831) |

1453692831 的源曲线范围并不包含诊断所给 `(-50789,142356,2189)` 脚点；该脚点可指出“原中点不足”，但不能被解释为恰好是本条EdgeSpline的另一个点，更不能替代源曲线造路。多个原样条点可以分别作为候选，仍需当前真实落区/地面和胶囊审核。

BoxA约束：真实类CDO有BoxA（export2），其挂接是CDO根SceneComponent（export35）；本地没有保存位置/rotation/scale覆盖。本次四个实例未保存BoxA组件覆盖，实际触发体由native构造/实例 `BoxTransform` 和 `BoxExtent` 形成；1453与1299的BoxTransform约有 `(-6.546717,-6.953500,11.710913)` 本地平移，四实例BoxExtent约 `(400,277.002595,90)`。这些字段保留原义，未把该Extent解释成世界可站矩形，也未执行构造来伪造精确BoxA世界体；实时 `GetCollisionComponent(pawn)` 是应核对的真实触发来源。[原包组件](../build/movement-caps-research-20261116/component-values.json)、[实例字段](../build/movement-caps-research-20261116/uprunning-values.json)

## 补充：冲刺当前属性的只读解析与悬崖保护

### 无需把属性名称手动映射为数值

已从 `PDA_ActorConfig` 的 cooked CDO（export36）顺序解析 Character Name、Attribute Data、真实3个DoubleProperty的StanceAngerCostData，再读五组 `CharacterMovementParameters`。`ActorConfig_Hun` 同样顺序消费到五组参数末尾，没有扫描常数或用轨迹推断。源模板关系为：[类型化参数](../build/movement-caps-research-20261116/actorconfig-movement-parameters.json)、[解码器](../build/movement-caps-research-20261116/config_speeds.py)

| 参数组 | 实际WalkSpeedAttribute | ExplicitWalkSpeed | Hun实例是否覆写这两字段 |
| --- | --- | --- | --- |
| Normal/Jog | `/Script/CharacterBasics.BasicAttributeSet.JogSpeed` | -1 | 否 |
| Walk | `/Script/CharacterBasics.BasicAttributeSet.WalkSpeed` | -1 | 否 |
| Sprint | `/Script/CharacterBasics.BasicAttributeSet.SprintSpeed` | -1 | 否 |

因此当前冲刺上限的可用只读链是：

```javascript
// 示意调用，须按宿主puerts约定建立$Ref；没有触发动作或改状态。
const config = pawn.GetLocomotionDriverActorConfig();
const params = config.GetSprintParameters();
const attribute = params.WalkSpeedAttribute; // 原生FGameplayAttribute，直接传递
const asc = UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent(pawn);
const found = $ref(false);
const sprintAttribute = asc.GetGameplayAttributeValue(attribute, found);
// 只在found==true且值有限、>0时使用；还要确认当前状态允许冲刺。
```

等价的反射入口为 `UE.AbilitySystemBlueprintLibrary.GetFloatAttribute(pawn, attribute, found)` 或 `GetFloatAttributeFromAbilitySystemComponent(asc, attribute, found)`。`FGameplayAttribute` 自带 `AttributeName/Attribute(FFieldPath)/AttributeOwner`，可只读用于诊断；不需要把字符串 `"SprintSpeed"` 拼成属性地址，更不需要修改属性。原作自己的 `UE.AttributeUtils.GetCharacterAttributeValue(pawn, attribute)` 也存在并已在坠落原作字节码中用于读 `Health_Max`，但它没有found输出，不宜把返回0等同“真实属性是0”。[本机SDK精确签名](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/GameplayAbilities.d.ts#L160)、[ASC方法](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/GameplayAbilities.d.ts#L300)、[GameplayAttribute结构](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/GameplayAbilities.d.ts#L2118)、[AttributeUtils](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/SGameAttributes.d.ts#L103)

Epic官方把 `UAbilitySystemComponent.GetGameplayAttributeValue` 声明为 `BlueprintPure`、`const`，并说明其返回当前最终属性值；本机SDK确认同一签名确实存在。这里应读当前值，不能用GetFloatAttributeBase替代带效果修正的当前值。[Epic API](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/GameplayAbilities/UAbilitySystemComponent/GetGameplayAttributeValue?application_version=5.8)、[Epic ASC概览](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/GameplayAbilities/UAbilitySystemComponent?lang=en-US)

当前 `movement.GetMaxSpeed()` 是当前MovementMode/locomotion运行字段的上限；上面的Sprint属性是该人物当前冲刺属性，不等于已经进入冲刺，也不保证足够助跑或空中横向速度。源模板750只是离线核对值，运行时按found回执读取，不向750回退掩盖未知。

### native构造补齐普通移动默认

本机 `CharacterMovementComponent` 构造 `0x143cf4610` 明确写：GravityScale1、JumpZVelocity420、MaxWalkSpeed600；Locomotion与PBZ构造中没有对这几个成员的直接重写，当前Renewal的cooked覆盖再把GravityScale改为2.2。`bCanWalkOffLedges` 的UHT bitsetter为 `or byte[this+0x2f9],0x40`；CMC构造对该字节 `and0x0f; or0x70; ...`，所以该bit为true。crouching对应0x80，native构造清除它，Base CDO另外保存true。[CMC构造](../build/movement-caps-research-20261116/character-movement-native-constructor.json)、[派生构造](../build/movement-caps-research-20261116/derived-movement-native-constructors.json)、[bitsetter](../build/movement-caps-research-20261116/ledge-bool-bitsetters.json)

这些是本机源默认，不证明当前角色的运行JumpZ仍为420，更不证明玩家可触发一个普通jump。已给出的3次旧采样均为Falling模式的诊断事实没有参与任何参数计算或道路生成。

### LedgeProtection不是另一个伤害高度阈值

从PBZ构造 `0x1467e49c0` 与匹配UHT成员偏移恢复的源默认：

| 字段 | native默认 | 备注 |
| --- | --- | --- |
| LedgePredictOffset | 80cm | this+0x1588 |
| LedgePredictRadiusScale | 0 | this+0x158c；不据该名字推断最终trace半径为0 |
| LedgeFanLaneDistance | 40cm | this+0x1590 |
| LedgeProtectionHeight | 2000cm | this+0x1594 |
| LedgeProtectionAngle | 20° | this+0x1598 |
| SafeDistanceThreshold | 200cm | this+0x159c |
| bForceDisableLedgeProtection | **int32计数=1** | this+0x15a0；Base CDO明确覆盖为0，Renewal链无再覆盖 |
| bForceEnableLedgeProtection | **int32计数=0** | this+0x15a4 |

两项名字以b开头，实际UHT类型都是IntProperty，不能当作互斥开关。已解出的 `SetForceEnableLedgeProtection(bool)` core `0x146807160` 用 `max(0, oldCount + (enable?1:-1))` 保存计数；这证实它是可嵌套持有的状态，导航不能调用Set/Reset去方便走下悬崖。[UHT表](../build/movement-caps-research-20261116/movement-native-tables.json)、[PBZ构造](../build/movement-caps-research-20261116/derived-movement-native-constructors.json)、[setter thunk](../build/movement-caps-research-20261116/movement-getter-thunks.json)

对本机native相关代码范围只读反汇编后，已确认这些值参与了实际预测/分支，而不只是存在于SDK：

- `0x1467ffd1e` 检查PredictOffset>0；随后 `0x1467ffd28` 检查Disable计数，非0会跳过该预测保护段。另一个相邻路径也先检查Disable计数。
- `0x1467fff90`、`0x146800b0b` 检查Enable计数，对默认/全局开关路径有明确分支影响。不能仅凭“Disable==0”推断整个保护已启用，也不能自行决定两个计数同时非0的全部优先级。
- 保护辅助代码读取Angle后调用数学函数，再乘Height；另一范围在构建查询界限时从Z量减去Height（`0x14680d471`），并与SafeDistanceThreshold比较。Height参与前方/向下预测的几何范围，**不能直接把Height2000解释成“任何小于20米的落差都允许走出边”**。

相关长native例程有chained unwind代码范围，报告没有把片段误当完整公开API；尚未完整恢复所有输入速度、方向、floor hit与保护回退的组合。SDK没有找到 `CanWalkOffThisLedge(pawn,point)` 之类只读反射许可函数。当前可只读采集上述计数/几何参数与bCanWalkOffLedges，实际是否被此处边缘保护截停仍是独立约束；胶囊clear与低于DamageDepth不单独证明输入会让角色走出去。[字段引用代码范围](../build/movement-caps-research-20261116/ledge-field-references.json)

## 补充：UpRunning 原生计算器有真实状态写入，禁止作为只读导航查询（2026-11-16）

**`CalculateUpRunningWarpTarget` 不是只写 `OutData` 的几何查询，不能在导航计算中调用。** 本节更新前文第4项与“native内部副作用未恢复”的边界：声明存在只说明可反射访问，不能据此接线。静态审计发现两条独立、直接的状态写入链；`bTraceForward=false` 也不会跳过它们。本次仍未启动游戏、调用游戏方法或修改生产代码。[审计结论与地址证据](../build/movement-caps-research-20261116/warp-readonly-audit.json)、[完整指令及chained-unwind范围](../build/movement-caps-research-20261116/warp-readonly-disassembly.json)、[可复现私有脚本](../build/movement-caps-research-20261116/warp_readonly_audit.py)

源 `PBZ.exe` SHA256 为 `4415933ce33476f14c837abb61a1b60af8b78cd81783896501913a7aac69e423`。本机exec thunk `0x146003bd0` 在 `0x146003df6` 经 `vtable+0x7f8` 调用；对应native函数 `0x1460083b0–0x1460095cf`（末址不含），完整951条指令。它的入口把 `this/RCX → r14`、`InCharacter/RDX → rdi`、`BaseLocation/R8 → rbx`、`OutData/R9 → rsi`；第五参数 `bTraceForward` 起初进入 `r12b`。因此下列非栈写入的归属可以从参数一路追踪，不能解释成局部临时trace。[exec证据](../build/movement-caps-research-20261116/warp-thunks.json)、[native证据](../build/movement-caps-research-20261116/warp-readonly-disassembly.json)

第一条是 **Volume自身的native状态缓冲**。`0x146009244 lea rax,[r14+0x590]` 取Actor自身目标地址；`0x146009270–0x1460092c1` 循环3次，每次复制0x80字节，把 `OutData` 的四个Transform共 **0x180/384字节**写入 `this+0x590…this+0x70f`。当前UHT表没有提供该native缓冲的反射字段名，所以不擅自命名为某个公开属性；`r14` 明确来自 `this` 已足以确认它属于Actor状态。主函数在此前所有计算分支汇合后执行此复制，`bTraceForward` 没有绕过该段的分支。[逐地址与寄存器别名](../build/movement-caps-research-20261116/warp-readonly-audit.json)

第二条是 **当前角色关联的MotionWarpingComponent**。`0x1460092c3 mov rcx,rdi` 后调用 `0x145fecdf0`；注册名 `GetMotionWarpingComponentByActor` 的exec `0x145fc4bf0` 在 `0x145fc4c5d` 也调用同一core，来源是传入的角色。返回组件非空时，主函数调用5次 `0x144856090`，target名来自原PE字符串，分别是：

| Target | 主函数调用地址 |
| --- | --- |
| `UpRunStart` | `0x146009333` |
| `UpRunStartFar` | `0x146009394` |
| `UpRunEnd` | `0x1460093ef` |
| `PoseSearchUpRunTarget` | `0x146009448` |
| `PoseSearchUpRunEndTarget` | `0x1460094a3` |

此callee名称由原生注册闭合：`AddOrUpdateWarpTargetFromTransform` → exec `0x144864bd0` → `0x144864d09 call 0x144856090`；后者在 `0x144856166` 调用 `AddOrUpdateWarpTarget` core `0x144855d60`。原生UHT中 `WarpTargets` 数组的成员偏移为 **0xf0**，与core的 `lea rbx,[rcx+0xf0]` 一致。它按名字查找0xe0字节条目；若已有，`0x144855f76…0x144855fdb` 覆写组件数组内条目；若没有，`0x144855df3` 增加真实数组Num，随后把新条目写入组件数组。新增分支还可能经 `vtable+0x2e0` 对关联对象派发回调，未穷尽回调副作用。因此“先算完再恢复缓存”也不能当作只读方案。[本机注册/字段/完整core](../build/movement-caps-research-20261116/warp-readonly-disassembly.json)、[SDK接口](../build/offline-navigation/size-research-20261116/loader-source/sdk/types/generated/MotionWarping.d.ts#L174)

该结论已由第一方本机可执行文件的真实store和call链决定，不依赖方法名、缺少Pure/Const flags或猜测。没有继续把其他trace/debug/数学callee全部标成“无副作用”；也没有把静态代码推断冒充实机观测。导航必须保留只读字段/组件变换和独立几何验证路径；`GetUpRunningData()` 属于动作Ability的运行数据读取，不能替代通用放置点计算，更不能使 `Calculate...` 变成只读API。先前提取的 `nativeWarpEndTargetOffset=-100` 仍不允许无依据转换成世界Z平移；当前调查只否决有副作用的调用，不宣称已经恢复其完整几何算法或当前动作许可。


### CalculateUpRunningWarpTarget 的写入审计（2026-11-16）

该函数不能作为导航只读查询：flags含Native/BlueprintCallable但不含BlueprintPure/Const；实现会把OutData复制到UpRunning Actor缓存，并调用MotionWarping AddOrUpdateWarpTargetFromTransform五次，修改角色的WarpTargets数组及关联回调。运行端禁止调用它，改用真实触发盒、EdgeSpline和当前胶囊落脚检查。证据：`build/movement-caps-research-20261116/warp-readonly-audit.json`、`warp-readonly-disassembly.json`。
