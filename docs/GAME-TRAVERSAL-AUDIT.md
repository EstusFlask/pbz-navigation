# 游戏通行数据审计：1.1.0

1.1.0新增487个机关实例与86条需实景检查的路书三维候选，并扩展走壁/蹬跳/翻越/立柱/登船适配。原两条轨迹参考保留；全图还剩52条连接未完成，完整水上航线及专用剧情追逐未完成。详见 [移动支持与缺口](MOVEMENT-COVERAGE.md)。

1.0.2 修复动作间地面连接、下滑入口及沿绳落点；保留原坡度、地面、胶囊和门锁规则，尚无本版实际游戏通过记录。

## 1.0.2 动作连接修补

- 原动作连接器只尝试8.5米内直走、原生导航和45米内局部搜索。原生导航缺失/不完整时，即使已有60米地面路网，两次攀爬仍无法串联。现在补试原有路网的纯行走边，排除梯子/攀爬/下降及其他动作边，再逐段做地面、身体碰撞、楼层和锁检查。连接最长120米，单次路网查找最多750毫秒墙钟或512次生成器推进，且不超过当前动作搜索的截止时间；超时关闭生成器，不认证未完成前缀。
- 下滑原先以 EdgeSpline 中点作为入口，中点可能已在悬空崖外。已加载实例提供 TopCollision 时，从这个真实触发区开始，保留后续崖缘和出口样条；不生成返程。
- 沿绳下降保留 RopeSpline 曲线，并追加无参数只读接口 GetRappellingLandTargetWorldTransform 的 Translation。反射签名见既有 build/traversal-native-signatures.json；缺失/无效时保留旧样条端点，不猜落点。
- 新增失败回归：60米原图地面连接两次攀爬、悬空下滑样条接入顶部触发区、绳尾之后的原生落地位置。另检查墙、锁、错层、混入动作边和搜索超时均不能成为普通步行连接。机关仍由玩家操作；物理/反射为模拟，不代表所有实景摆放均已适配。

日期：2026-11-12。调查目标是用游戏实际数据判断高度、动作和阻挡条件，并撤回 0.11.0 的玩家通路记忆方案。本版不采样、保存或读取玩家通路文件；已有旧文件不参与规划。

0.13.0 补充：实际游戏脚本使用 K2_GetComponentsByClass，旧版仅调用 GetComponentsByClass 导致攀爬继承组件为空。本版改用 K2_ 优先，红→绿回归覆盖真实反射调用形式。固定三维参考路线、安装核验及游民资源校准限制见 [MANUAL-ROUTES.md](MANUAL-ROUTES.md)；历史轨迹仅用于离线作者数据，不恢复运行时学习。

## 数据来源与能证明的范围

只读检查本机安装的 `ProjectPBZ/Content/Paks`、脚本、配置、AssetRegistry、IoStore 包及 `platform/steam/PBZ.exe` 的反射元数据。安装和 Mod Manager 未修改。Pak/IoStore 提取、split 容器整理和 legacy 转换均在工作区 `build/` 中进行。密钥、工具、游戏解包内容不进入分发包。

- 读取到 328207 条 IoStore 项；相关包索引中命中 69 个 BP 包路径，另对 76 个相关蓝图、能力、枚举、曲线与动画资产提取了名称表。两个集合不同，不能相加当作机关数量，附录分别保留索引。
- 脚本来源包括 `Library/MapLockTracking.js`、`FlowNode/PushDoorShortItems.js`、`Level/Actor/Switch/Lift.js`、`Level/Actor/Block/SlenderDoor.js`、`Level/Actor/Switch/FogDoor.js` 和 `UI/Widget/Map.js`。配置来源是 `Config/DefaultEngine.ini`。
- 蓝图字段、组件名和 native 参数说明“存在什么、接口如何调用”。只有游戏内驻留实例、实际碰撞和当前状态才能说明“这个地点现在能否通过”。名称表不证明某类在两条路线中有实例。
- 没有重建完整世界的碰撞、World Partition 放置和流送状态。原始 11 世界图保留 XYZ，但不是完整的游戏碰撞与动作数据库；未加载区域仍可能缺地面或机关连接。

本地复核证据位于 `build/traversal-packages.txt`、`build/traversal-blueprint-names.json`、`build/traversal-native-signatures.json`、`build/game-registry-names.txt`。这些构建资料不随包分发。

## 找到的类型与本版处理

“已接入”表示有读取和规划代码及本地回归，不表示已经在游戏内通过完整路线。

| 类型 | 找到的实际数据 | 本版处理与剩余限制 |
| --- | --- | --- |
| 普通地面、坡道、台阶 | CharacterMovement 的 `CurrentFloor`、`IsWalkable(hit)`、`K2_GetWalkableFloorZ`、`MaxStepHeight`；组件 `GetWalkableSlopeOverride`、`CanCharacterStepUpOn` | 已接入地面/胶囊步行检查。明确不可走的中心支撑不会被旁侧射线改判；禁止跨步的平坦上坎会拒绝。反射不可用时仍有保守回退。 |
| 强制滑坡 | `SpecialMoveVolume_SlopeSlide`、`BP_SpecialMove_SlopeSlide`、`DA_SlopeSlide_Common`；原生区域和下坡方向查询 | 新增驻留滑坡区域扫描；实际区域内逆下坡方向的上行不能当作普通步行。已核对签名，尚需现场验证原生调用。坡道之外不凭包围盒猜测。 |
| 直上/斜上攀爬 | `SpecialMoveVolume_UpRunning/SkewUpRunning`、对应 BP；`BoxA/Box`、`EdgeSpline` | 修正继承组件的读取，入口和出口用于动作接图；旧 `BP_ASM_UpRunning` 可使用 `EndPositionStatic`。需要已加载实例和入口/落点检查。 |
| 侧向跑墙 | `SpecialMoveVolume_SideRunning`、对应 BP、`BP_ASM_SideRunning`；`LowSpline` | 已有动作提取；增加 native 父类发现。端点接近与方向仍须检查，旧变体不保证全适配。 |
| 翻越/攀缘 | `SpecialMoveVolume_Mantle`、`BP_SpecialMove_Mantle`；`FrontCollision`、`FrontEdgeSpline/BackEdgeSpline`；native Mantle/Vault/Hurdle 能力 | 修正 Mantle 组件提取。Vault/Hurdle 能力已确认存在，但未为所有动态障碍建立独立路径边。 |
| 下滑/跳落 | `SpecialMoveVolume_DownSliding`、对应 BP、`BP_ASM_DownSliding/Sliding`；`EdgeSpline/EndEdgeSpline` | 已识别下降动作与经检查的短跳落，保持单向；没有根据落下轨迹推断反向攀爬。旧 Sliding 变体未全部适配。 |
| 梯子/折梯 | `SpecialMoveVolume_ClimLadder`、`BP_SpecialMove_ClimLadder`、`Bp_TempLadder`；`BottomCollision/TopCollision`、`bFold/bTriggered`、两个 Timeline | 使用真实 `bFold`，不再看到 Timeline 就猜是折梯。未放下、正在放下会阻止认证；解锁变化刷新路线。旧临时梯变体未全部提取。 |
| 抓绳摆荡 | native `SpecialMoveVolume_RopeSwing`、`BP_ASM_RopeSwing` 及 Base；`ASide/BSide` 或 `BoxA/BoxB` | 增加 native 类和对应组件读取，仍需入口/出口与当前可用状态。 |
| 沿绳下降/滑索 | `SpecialMoveVolume_Rappelling/RopeSliding`、对应 BP；`RopeSpline/RopeSplineComponent`；`GetRappellingLandTargetWorldTransform` | 已有样条提取和下降方向检查，新增 native 类发现。落地 Transform 接口已找到，尚未替换所有旧路径；不能保证全部摆放方式。 |
| 钩索跨隙 | `BP_GapBlocker`；`TriggerSphere/TriggerBox`、`GrabPoint`、`LandArea`、`Type/ShachiHook/bHanging`；`BP_GrapplingHook`、HookMotion/Payload、相关 GA/MA | 新增 GapBlocker 单向提取，入口→抓点→落区；用 `GetInteractRequirementMeet(pawn)` 判条件。条件未知时保留待确认，不能凭三个点就认证。`E_GapBlocker_Type` 有 6 个值但语义未确认；没有给它们编造名称。其他 hook 变体尚未全部接图。 |
| 旧穿洞/跨障动作 | `BP_ASM_ThroughHoleFree` 的 `Box/InDir`；`BP_ASM_CrossObstacle` 的 `StartLedge/EndLedge/MoveDirection/bCrossOver`；`BP_ASM_UpRunExecution/UpRunPole_Base` | 发现存在，未完整接入。穿洞尚未确认出口，不能仅用朝向造出穿墙连接。 |
| 舞狮/立柱通行 | `BP_LionDancing_Link/Pole_Base/Pole_Base_Child_01/Pole_Exit/Pole_Fire`、`GA_StandingOnPole` | 发现存在，未实现完整动作链。不会将立柱相近视为可走。 |
| 升降梯/运输装置 | `BP_Lift`、`Elevator/Guardrail/ForIronCage/Simple_Lift` 与测试变体；`Spline/MoveAnchor/TotalDistance`、`GearIsDoing/Positive/RevBool/bTouched`、Lift Timeline、损坏标志 | 保留已识别样条和停靠连接；新增运动中/损坏状态拒绝与刷新。不自动呼梯，不确认所有开关、任务依赖和多站点变体。 |
| 钥匙门/单向门/闸门 | SingleDoor/DoubleDoor/SlenderDoor、Block_Door/Gate/Gate_Snow/ZongciDoor、贫民与小康变体；`BPI_BlockDoor`、`DoorOpen/DoorType/OpenDoorState/bOpenedFromFont`、`GetCheckItems/NeedCheckLockItems` | 地图锁读取真实 `NeedItems` TMap，显示名称、需求数与背包数；碰撞命中门体时读开门/所需物品。保留方向锁状态，不猜门类型枚举。拥有钥匙不等于门已经开启。 |
| 武器/能力障碍 | Chain/Ground/RockGround/StoneWall/ThornyVine、TempFire/TempXueDiZi/TempZhuoBiDun、PhantomBarrier、HangingGift；`bBroken/NeedAbilityContainer`、所需武器及 BrokenTags | 读取地图 `ShaChiWeaponLockObject`、武器 ID/标签及解锁状态；碰撞命中支持接口的实体时显示所需影之武装和交互条件。不会把“能查到武器资料”当作“已持有或已装备”；未打通所有障碍变体。 |
| 可移动物/环境开关 | MoveableStuff_Blocker/CollisionLandscape/door/ground/Shelf/NewSoul/ShaQiTa、SwitchDevice/Cage_Device、KickStone、Rubbish A/b/C、Chest | 已找到类型；可见实体碰撞仍参与步行检查。推移、踢石、开关顺序和联动后的路径变化没有完整建模。Chest/材料缓存是命中的辅助资源，不证明可通行。 |
| 迷雾门/战斗封锁/叙事笼门 | FogDoor 脚本、SwitchDevice_Cage_Device、ForIronCage、地图锁对象 | 保留实际碰撞和可读锁状态；任务、战斗阶段和脚本事件不一定能全部只读推导，未知条件仍可能断路。 |

动作扫描目录由 17 项扩大到 29 项，包含 10 个 native SpecialMoveVolume 类；蓝图和 native 父类扫描按实例名去重。目录项数量不是完整支持类型数：实例还必须提供可确认的端点、地面和条件。

## 接入的只读查询与状态更新

| 接口/字段 | 用途 |
| --- | --- |
| `IsPositionInSlopeArea(Position, TestCharacter)` | 判断角色是否处于该强制滑坡区域 |
| `GetClosestSplineT(WorldPos, CachedT)`、`GetDownhillDirection(T)` | 使用真实样条方向，拒绝逆坡上行；首次 CachedT 传 -1 |
| `GetInteractRequirementMeet(InteractWith)` | 仅用 `NoRequirement/RequirementMeet/RequirementNotMeet` 枚举名，不猜数值 |
| `GetNeedShaChiWeaponID()`、地图 `NeedShaChiWeaponIds/RequiredTags` | 显示武器条件；BrokenTags 的接口存在但未给所有实体建立动作规则 |
| `GetCheckItems(out)`、地图 `NeedItems.GetKey(i)/Get(key)` | 读取门锁物品及数量，不调用可能改状态的 `CheckLockItems` |
| `GetItemNumInfo(id, owned, max)`、`GetPropData(id)`、`MakeTextByKey(key)` | 背包数量与物品名称 |
| `GetShaqiWeaponTableData(id)`、`FindShaChiWeaponByTag(tag, out id, out snap)` | 武器资料/标签映射，不以查询命中证明拥有 |
| `bUnLocked/bBroken/bFold/bTriggered/GearIsDoing`、Timeline `IsPlaying()` | 锁、障碍、折梯及升降装置的当前状态 |

不调用开门、交互、触发开关、角色移动、机关移动或任务推进函数。

本版移除了玩家轨迹采样、序列化、加载和学习菜单。完成路线后清除前候选遗留的重试；诊断路线、前沿和偏离重试要求平面移动至少 600 厘米或高度变化至少 75 厘米，并等当前搜索结束。同层普通小跳保留搜索；同高跳过实际不可步行缺口仍更换起点。已验证连续坡道沿用原搜索。

全路线重复审计的静止间隔从 1.8 秒改为 10 秒，移动 200 厘米或高差 75 厘米也可触发；近段线形碰撞缓存独立工作。门锁每 1250 毫秒刷新，已发现附近机关每 900 毫秒最多查 64 个；强制滑坡扫描最短间隔 3 秒、最多 256 个驻留实例。没有帧率实测，不宣称具体性能增益。新机关发现、真实门锁/机关状态变化、目标及区域改变仍能触发重新规划。

## 验证与未完成项

161 项本地 JS 回归通过，包括固定参考路线经主规划器和审计的接入、方向、高度、阻挡及末端补接。针对重算、角色坡面/跨步、继承组件、GapBlocker 条件拒绝→满足后开放、门物品、折梯、运动升降梯和滑坡区域查询有回归。接口和物理为测试替身，真实路网另有审计；这不等于真实地图已经走通。

大廊桥→小张藏身处、乱葬岗→墨玑子衣冠冢均未在 0.13.0-fork.1 完成游戏内复测。首次直接选目标即可测试，无需先走一遍来学习。未知机关、未加载实例、地面查询与角色实际碰撞不一致、原图断连仍可能造成失败。临时碰撞排除有有效期，开锁后的旧排除可能短暂保留。完整的放置数据/碰撞重建和上述未适配动作仍是后续工作。

## 来源文件指纹

相对本地提取的 `ProjectPBZ/`，SHA256 用于区别游戏版本；不分发其文件内容。

| 文件 | SHA256 |
| --- | --- |
| `Config/DefaultEngine.ini` | `76d17d7b848142358c7afa1876278bd3e2a0d4202e9673a0da8aa732e04f5154` |
| `Content/JavaScript/UI/Widget/Map.js` | `44e6a10741403af0cc5dee63ec816dd2096a71d08668ec8f864994ceb945dc70` |
| `Content/JavaScript/Library/MapLockTracking.js` | `c54f9654075b8d5f2ee79c57d9000f822b329965f382a5baedc3a9fe9466d18a` |
| `Content/JavaScript/FlowNode/PushDoorShortItems.js` | `b85e6bfa57091de8b1ebf7b91fb16c5ff1249b9b03befa79866893a49600b17e` |
| `Content/JavaScript/Level/Actor/Switch/Lift.js` | `b63cf7ed4c8800f40d7eaa4b021652e9d59ec439425f50ac306e81d8f2cd6058` |
| `Content/JavaScript/Level/Actor/Block/SlenderDoor.js` | `1cd2346b603cc0c3a8887839fc91a73286f8b7e744b9398067041bdc7c86ce1b` |
| `Content/JavaScript/Level/Actor/Switch/FogDoor.js` | `d90237aac0da5a1996c2b2fbd72b77571623a81de1ed18fa71ee97e93647e813` |

## 附录：本次相关资源索引

以下为本次搜索命中的索引，包含辅助资源与未使用变体；不宣称穷尽游戏全部机关。

69 个 BP 包路径：

```text
/Game/PBZContent/Blueprint/Item/Block/Base/BP_BlockBase
/Game/PBZContent/Blueprint/Item/Block/Base/BP_BlockBase_Normal
/Game/PBZContent/Blueprint/Item/Block/Base/BP_DoubleDoor_Base
/Game/PBZContent/Blueprint/Item/Block/Base/BP_SingleDoor_Base
/Game/PBZContent/Blueprint/Item/Block/Base/BP_SlenderDoor
/Game/PBZContent/Blueprint/Item/Block/BP_Block_Door
/Game/PBZContent/Blueprint/Item/Block/BP_Block_Gate
/Game/PBZContent/Blueprint/Item/Block/BP_Block_Gate_Snow
/Game/PBZContent/Blueprint/Item/Block/DoubleDoor/BP_DoubleDoor_G
/Game/PBZContent/Blueprint/Item/Block/DoubleDoor/BP_DoubleDoor_XiaoKang
/Game/PBZContent/Blueprint/Item/Block/New/BP_Block_ZongciDoor
/Game/PBZContent/Blueprint/Item/Block/SingleDoor/BP_SingleDoor_Poverty
/Game/PBZContent/Blueprint/Item/Device/BP_Chest
/Game/PBZContent/Blueprint/Item/Device/BP_ChestSwipeMaterialCache
/Game/PBZContent/Blueprint/Item/Device/BP_KickStone
/Game/PBZContent/Blueprint/Item/Device/BP_Lift
/Game/PBZContent/Blueprint/Item/Device/BP_Lift_Elevator
/Game/PBZContent/Blueprint/Item/Device/BP_Lift_Elevator_Guardrail
/Game/PBZContent/Blueprint/Item/Device/BP_Lift_ForIronCage
/Game/PBZContent/Blueprint/Item/Device/BP_Lift_Simple_Lift
/Game/PBZContent/Blueprint/Item/Device/BP_MoveableStuff_Blocker
/Game/PBZContent/Blueprint/Item/Device/BP_MoveableStuff_CollisionLandscape
/Game/PBZContent/Blueprint/Item/Device/BP_MoveableStuff_CollisionLandscape_door
/Game/PBZContent/Blueprint/Item/Device/BP_MoveableStuff_CollisionLandscape_ground
/Game/PBZContent/Blueprint/Item/Device/BP_MoveableStuff_NewSoul
/Game/PBZContent/Blueprint/Item/Device/BP_MoveableStuff_ShaQiTa
/Game/PBZContent/Blueprint/Item/Device/BP_MoveableStuff_Shelf
/Game/PBZContent/Blueprint/Item/Device/BP_Rubbish
/Game/PBZContent/Blueprint/Item/Device/BP_Rubbish_A
/Game/PBZContent/Blueprint/Item/Device/BP_Rubbish_b
/Game/PBZContent/Blueprint/Item/Device/BP_Rubbish_C
/Game/PBZContent/Blueprint/Item/Device/BP_SwitchDevice
/Game/PBZContent/Blueprint/Item/Device/BP_SwitchDevice_Cage_Device
/Game/RenewalContent/Actors/GameplayBlocker/BP_ChainBlocker
/Game/RenewalContent/Actors/GameplayBlocker/BP_GapBlocker
/Game/RenewalContent/Actors/GameplayBlocker/BP_GroundBlocker
/Game/RenewalContent/Actors/GameplayBlocker/BP_HangingGift
/Game/RenewalContent/Actors/GameplayBlocker/BP_PhantomBarrier_Blocker
/Game/RenewalContent/Actors/GameplayBlocker/BP_RockGroundBlocker
/Game/RenewalContent/Actors/GameplayBlocker/BP_StoneWall
/Game/RenewalContent/Actors/GameplayBlocker/BP_TempFireBlocker
/Game/RenewalContent/Actors/GameplayBlocker/BP_TempXueDiZiBlocker
/Game/RenewalContent/Actors/GameplayBlocker/BP_TempZhuoBiDunBlocker
/Game/RenewalContent/Actors/GameplayBlocker/BP_ThornyVine
/Game/RenewalContent/Actors/GameplayBlocker/Data/BP_Hook_Payload
/Game/RenewalContent/Actors/GameplayBlocker/Data/BP_SpecialMove_HookMotion_Shot_Hight
/Game/RenewalContent/Actors/SpecialMove/BP_ASM_CrossObstacle
/Game/RenewalContent/Actors/SpecialMove/BP_ASM_DownSliding
/Game/RenewalContent/Actors/SpecialMove/BP_ASM_RopeSwing
/Game/RenewalContent/Actors/SpecialMove/BP_ASM_SideRunning
/Game/RenewalContent/Actors/SpecialMove/BP_ASM_Sliding
/Game/RenewalContent/Actors/SpecialMove/BP_ASM_ThroughHoleFree
/Game/RenewalContent/Actors/SpecialMove/BP_ASM_UpRunExecution
/Game/RenewalContent/Actors/SpecialMove/BP_ASM_UpRunning
/Game/RenewalContent/Actors/SpecialMove/Bp_TempLadder
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_LionDancing_Link
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_LionDancing_Pole_Base
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_LionDancing_Pole_Base_Child_01
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_LionDancing_Pole_Exit
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_LionDancing_Pole_Fire
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_ClimLadder
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_DownSliding
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_Mantle
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_Rappelling
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_RopeSliding
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SkewUpRunning
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SlopeSlide
/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_UpRunning
```

76 个相关资产名称索引：

```text
BPI_XueDiZi_Switch
BP_ASM_CrossObstacle
BP_ASM_CrossObstacle_Base
BP_ASM_DownSliding
BP_ASM_DownSliding_Base
BP_ASM_RopeSwing
BP_ASM_RopeSwing_Base
BP_ASM_SideRunning
BP_ASM_SideRunning_Base
BP_ASM_Sliding
BP_ASM_Sliding_Base
BP_ASM_SpVolumeBase
BP_ASM_ThroughHoleFree
BP_ASM_ThroughHoleFree_Base
BP_ASM_UpRunExecution
BP_ASM_UpRunning
BP_ASM_UpRunning_Base
BP_ASM_UpRunPole_Base
BP_BlockBase
BP_BlockBase_Normal
BP_BulletEvent_DurationEffect_ForYouLongHeadBlocker
BP_ChainBlocker
BP_DoubleDoor_Base
BP_DoubleDoor_G
BP_GameplayBlocker_Base
BP_GapBlocker
BP_GrapplingHook
BP_GroundBlocker
BP_HangingGift
BP_Hook_Payload
BP_Lift
BP_LionDancing_Link
BP_LionDancing_Pole_Base
BP_LionDancing_Pole_Base_Child_01
BP_LionDancing_Pole_Exit
BP_LionDancing_Pole_Fire
BP_PhantomBarrier_Blocker
BP_RockGroundBlocker
BP_SingleDoor_Base
BP_SlenderDoor
BP_SpecialMove_ClimLadder
BP_SpecialMove_DownSliding
BP_SpecialMove_HookMotion_Shot_Hight
BP_SpecialMove_Mantle
BP_SpecialMove_Rappelling
BP_SpecialMove_RopeSliding
BP_SpecialMove_SideRunning
BP_SpecialMove_SkewUpRunning
BP_SpecialMove_SlopeSlide
BP_SpecialMove_UpRunning
BP_StoneWall
BP_TempFireBlocker
Bp_TempLadder_Base
BP_TempXueDiZiBlocker
BP_TempZhuoBiDunBlocker
BP_ThornyVine
CV_HookInterp
E_GapBlocker_Type
GA_BreakChain
GA_BreakFireBlocker
GA_BreakGround
GA_BreakHangingGift
GA_BreakHangingGift_FeiDao
GA_BreakHangingGift_HuoChong
GA_BreakHangingGift_YouLongCha
GA_BreakStoneWall
GA_BreakXueDiZiBlocker
GA_Break_PhantomBarrier_Blocker
GA_BurnVine
GA_GrapplingHook_Old
GA_ZhuoBiDunBlocker
GE_CabbageRegen
MA_GrapplingHook
MA_GrapplingHookSwing
MA_GrapplingHook_Drag
MA_ShaChi_BrutalAxe_BreakChain_New
```
