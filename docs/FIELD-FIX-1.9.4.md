# 1.9.4：重攻击标记的行走中断线

日期：2026-11-15（America/Tijuana）。用户明确要求：修复刚才重攻击标记的中途消线，然后创建新对话执行全图重建。

## 报告与现场事实

读取引擎实际Saved目录中的两个报告：`20261116T030445274Z-001`和`-002`。本机路径是`C:/Users/x-ray/AppData/Local/ProjectPBZ/Saved/`，不能仅查Steam安装目录下的Saved。原件与完整日志冻结于`build/field-recast-193-disappearing/`；精简证据/hash在`tests/fixtures/recast-193-disappearing-20261115.json`。

关键安装模块与1.9.3-dev ZIP一致。两个报告的WorldThread均开启，DisplayMode均为Always，角色在Walking模式；记录时仍有路线、前方安全终点和缓存绘制几何。最近各128条绳子碰撞探测都没有命中。旧采集没有原生可见性/网格段数，不能仅凭缓存的on=true就断言GPU实际上显示。

完整日志同时显示窄接缝附近反复触发“ledge exceeds step height”和“blocked body clearance”，多个重新生成且通过规划校验的路线很快再次被后续校验截断。

## 确定性失败回归与修复

```powershell
node --test --test-name-pattern='physically accepted seam|cached ribbon visibility|native mesh sections' tests/terrain-regression.test.cjs tests/navigation.test.cjs
```

旧版已观察到三项失败，新版通过：

1. 规划使用`Ground.step`时能够借助相对两侧的胶囊支撑跨过窄缝；后续Auditor在同一个中间点重新调用`floorAt`，却落到低60厘米的缝底，再把回到上方路面误判为过高台阶。`floorAt`现在也传入期望脚点高度，复用与step相同的成对支撑判断。宽坑、单侧岸、真落差、不可走表面和身体阻挡仍受原检查约束。
2. 私有绳子的可见性缓存可能仍为on，但实际actor/mesh被隐藏；旧版直接跳过设置。现在以250ms间隔核对可用原生标记，按需恢复，并以较低频率重新确认状态。仍受相同的场景碰撞和安全前缀约束。
3. 原生ProceduralMesh网格段被清空但几何tag未变时，旧版会继续跳过重建。现在发现原生段数为0会使缓存失效并重建该段。失效actor也不再被缓存tag永久跳过。

私有网格在可用接口上关闭父特效边界继承和距离裁剪；显示距离仍由既有、经过碰撞检查的绘制前缀限制，未关闭真实墙体检查。这里的原生可见性/网格清空是补齐的可复现缓存缺陷；旧报告未采这些原生字段，不能声称已直接证明现场一定发生过这两种漂移。

开发采集新增最后隐藏原因、最后绘制时刻、原生隐藏/可见标记、段数、边界/距离裁剪标记及恢复计数。这样后续能区分校验主动隐藏、原生状态变化和其他显示问题，不再只保留“打算显示”的缓存信息。

## 验证与交接

391项JS回归、原Lua/文件桥接回归、9项Recast/WASM控制场景通过。普通JS运行核心和区域数据未变；无EXE/新增导航DLL。新包未安装或在游戏实测，未写存档、未上传；实际效果仍待确认。

本轮交付完成后，按用户明确授权创建独立的本地项目对话，实际推进完整世界重建：先流式/可续跑地构建完整旁镇，再推广其他世界。该工作不以用户再次启动游戏为开工条件；本轮修复的现场确认单独保持待验证。

继续入口为[持久项目状态](OFFLINE-NAVIGATION-STATE.md)。保留当前`codex/recast-routing-193`工作目录及未提交的1.9.3/1.9.4改动，不能切回旧main后误判资料丢失。新对话应优先写可续跑的分区/图块构建和覆盖账本，而非一次性把全游戏几何或图块放进内存。
