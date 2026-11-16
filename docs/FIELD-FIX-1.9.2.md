# 1.9.2：游戏禁止WASM生成与提示显示

日期：2026-11-15（America/Tijuana）。用户实测1.9.1：一号路线直到接近终点仍无路线；加载进度和超时提示均不可见。1.9.2是修复候选，尚未在实际游戏复验。

## 本轮有直接证据的根因

完整loader.log记录：

```text
17:21:24 recast load index 0/1
17:21:25 recast load core 0/1
17:21:26 recast load initialize 0/1
17:21:27 recast unavailable initialize: CompileError: WebAssembly.Module(): Wasm code generation disallowed by embedder
```

安装的主模块、区域适配器、核心、提示模块和区域索引均与1.9.1-dev ZIP哈希一致。核心在进入图块加载与寻路前即被宿主拒绝，所以到达终点附近也不会有Recast结果。本次属于立即初始化失败，未触发10秒初始化超时；此前同步化没有消除运行端对WASM生成的依赖。

冻结日志在`build/field-recast-191-no-route/`；精简证据、hash和终点附近坐标在`tests/fixtures/recast-191-codegen-20261115.json`。没有把完整日志中的其他Mod内容或存档信息提交进仓库。

## 纯JavaScript运行端

离线烘焙继续使用锁定的`recast-navigation@0.44.0`。游戏端将其中同一WASM核心通过锁定的`binaryen@132.0.0`转译为普通JS，再通过Emscripten绑定接口调用。wasm2js是Binaryen提供的WASM到JS编译器，也是Emscripten生成替代JS输出的工具。[Binaryen官方说明](https://github.com/WebAssembly/binaryen#wasm2js)

运行端不调用宿主的WASM编译器，不修改游戏引擎开关；没有EXE或新增导航DLL。原Recast/Detour算法、图块格式和几何数据保持原样。源模块SHA256仍为`00bafffb2048740b76ca3ec865f49338af65335f6e55b968f8d98b92e8ec92dc`，构建回执记录源hash、编译器版本、参数与转译结果hash。

生成的核心约3.5MB，使用ArrayBuffer/TypedArray执行。Emscripten加载器的私有兼容对象仅提供错误类型，未改变游戏全局`WebAssembly`。正常JS microtask仍需宿主驱动。

## 已执行的失败回归

```powershell
node --test --test-name-pattern='code generation disabled' tests/offline-runtime.test.cjs
node --test --test-name-pattern='captured selections' tests/recast-integration.test.cjs
```

回归使用V8 `codeGeneration: {strings:false, wasm:false}`，而非仅模拟异步任务停住。原发行1.9.1核心在该环境产生与游戏相同的CompileError；新核心可初始化，并对一号路线、黄家宅邸前路口和本次记录的终点附近起点返回完整候选。远处门关闭也不影响终点附近的局部候选。门状态在测试中显式提供，未伪称捕获了游戏当时全部机关状态。

另外验证了完全缺少WASM API、只有残缺API、API调用主动抛错的环境；新运行端均不会调用这些接口。对相同真实图块，纯JS与原上游WASM的走廊多边形数、拐点数、贴面点数相同，逐坐标差小于0.01厘米。冷查询分步在本机一次测量中最长约21毫秒，此数值不代表游戏帧耗时。

## 提示显示

错误状态经过主规划流程的重放后，状态字符串能保留；原提示载体还存在“相同文字直接返回，外部隐藏后不恢复”的可复现缺陷。现在将文字缓存和可见性分开，保持状态时恢复可见性、透明度和视口挂载。

另为程序生成的Canvas明确设置完整视口尺寸并处理DPI，优先复用实际W_Sense_Quest.DistanceText及其`SetPBZFormatText`本地化接口，保留游戏自带字体，设置较高的非交互显示层级。新增日志`route status UI mounted font=game`可核对载体是否创建。已读取实际资产确认父类是普通UserWidget、RootWidget为Overlay_32，DistanceText是游戏的PBZCommonLocText；没有声称通过自动化测试就已目视确认游戏显示。

## 验证边界

本轮378项JS回归、9项真实WASM/Recast控制场景与原Lua/文件桥接回归通过。完整包、版本、无EXE/私有数据与原图块hash检查见`release/LOCAL-CANDIDATE-1.9.2.json`。

尚未安装、启动游戏或上传，未写存档。新包替换后必须重启；实际路线和提示的显示仍待用户实测确认。后续首先核对`recast backend javascript-wasm2js`、`recast ready`、`recast query`及UI挂载日志，再处理具体现场地面/胶囊/锁拒绝。

全图目标与后续顺序保持在[持久项目状态](OFFLINE-NAVIGATION-STATE.md)；不能再把游戏运行端可生成WASM作为前提。
