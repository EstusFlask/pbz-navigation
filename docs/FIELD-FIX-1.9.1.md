# 1.9.1：首区域导航启动等待

后续实测：1.9.1仍失败，游戏明确禁止WASM代码生成。当前运行端已转纯JS，见[1.9.2修复记录](FIELD-FIX-1.9.2.md)和[持久项目状态](OFFLINE-NAVIGATION-STATE.md)。下文保留首次交付时的诊断过程。

用户反馈日期：2026-11-15（America/Tijuana）。一号路线及黄家宅邸前路口均未产生路线。当前版本为修复候选，尚未在游戏中复验。

## 现场事实

已确认安装的1.9.0-dev关键模块、WASM核心和区域索引与原发行ZIP一致。完整loader.log有启动成功和两次选择，没有`recast ready`、`recast query`或Recast错误。后续区域外请求仍能进入旧求解器。

原日志冻结在`build/field-recast-190-no-route/`；精简且不含存档/密钥的输入与日志hash保存在`tests/fixtures/recast-190-selections-20261115.json`。原滚动route log不足以保留整个启动过程，因此也检查了完整loader.log。

这些信号说明新核心没有交付可用结果，但**1.9.0没有阶段日志，不能仅凭日志确定游戏内部停在哪一步**。

## 可复现的问题与修复

默认上游加载器依赖异步`WebAssembly.instantiate`。隔离宿主保留普通JS microtask和标准同步WASM API，只让异步WASM任务排队不执行，就能复现核心永不就绪、两个覆盖区域目标一直等待的症状。

原发行核心的对照测试失败：

```powershell
$env:PBZ_TEST_RECAST_BUNDLE='D:/coding/git_rep/pbz-navigation/build/field-recast-190-no-route/PBZRecastRuntime-original.js'
node --test --test-name-pattern='captured route-one' tests/recast-integration.test.cjs
Remove-Item Env:/PBZ_TEST_RECAST_BUNDLE
```

当前核心的同一重放通过：

```powershell
node --test --test-name-pattern='captured route-one' tests/recast-integration.test.cjs
```

重放使用现场起点与两个实际目标；门的开放条件由测试明确提供，未声称捕获了游戏当时的门状态。

`runtime.mjs`现在通过Emscripten支持的`instantiateWasm`钩子调用标准`WebAssembly.Module/Instance`，消除异步WASM任务队列依赖。普通JS microtask仍须宿主驱动。原上游WASM二进制未变：340,097字节，SHA256 `00bafffb2048740b76ca3ec865f49338af65335f6e55b968f8d98b92e8ec92dc`。碰撞、图块、Recast/Detour算法均未改动。

另补上三项实际缺口：

- 记录index/core/initialize/data/tiles各阶段，显示数据加载进度；每帧按小批次处理图块。
- 初始化10秒仍未完成时返回明确失败及所在阶段，避免无限等待。
- 同步编译失败直接传出错误；部分WASM替代接口仍会明确停用，避免伪装为正常可用。

原来的Node成功测试没有覆盖嵌入式宿主的异步WASM任务调度，这一覆盖缺口已补测试。**隔离复现支持这一修复方向；它不是对游戏宿主内部行为的直接测量，也不是新版本实机已恢复的结论。**

## 验证与交付范围

- 372项JS测试通过、无跳过，包含两个现场目标、异步WASM停滞、初始化超时、编译错误、门状态变化与世界切换。
- 9项真实WASM/Recast控制场景通过；原Lua/真实文件桥接回归通过。
- 现有兼容适配DLL仅同步版本号并重新编译；没有增加导航DLL或EXE。
- 包内容与版本检查、包hash见`release/LOCAL-CANDIDATE-1.9.1.json`。

尚未安装、启动游戏或上传；未写存档。新版本需替换后重启，不能在同一游戏进程热切换旧模块。若仍失败，新日志应明确停在何阶段；下一步先核对`recast load`、`recast ready`和`recast query`，再检查端点与现场碰撞拒绝。

## 持久化

完整世界重建仍是最终目标。根目录`AGENTS.md`要求后续导航工作先读取并更新[持久项目状态](OFFLINE-NAVIGATION-STATE.md)。其中保存用户约束、当前失败证据、首区域与全图的区别，以及全世界分块、规则覆盖和特殊动作的后续顺序。
