# Factory CN

一个非官方的 **Factory Desktop 简体中文运行时汉化补丁**，适用于 macOS。

> 当前版本：**v0.8.0**  
> 已测试：**Factory Desktop 0.185.0 / Electron 42**

Factory Desktop 目前没有完整的简体中文界面。这个项目不会修改 `Factory.app`、`app.asar`、代码签名或 Electron fuses，而是通过仅监听本机回环地址的 Chrome DevTools Protocol，在运行时向 Factory 的 renderer 注入精确文本映射。

## 特性

- 不修改 Factory 安装包、ASAR、签名或完整性校验
- 支持设置页、Billing、Usage、Connectors、Droid Computers、Worktrees、Custom Models 等大量 UI 文案
- React 页面切换后持续生效
- 尽量跳过聊天、代码、终端、Monaco 编辑器、输入框内容等区域
- 自带“未翻译 UI”收集器，方便社区继续补充词典
- 关闭 Factory 后补丁自动失效

## 使用方法

1. 下载源码或 Release，并解压到任意目录。
2. 双击 `Factory 中文.command`。
3. 启动器会退出当前 Factory，然后用以下参数重新启动：

```bash
--remote-debugging-address=127.0.0.1
--remote-debugging-port=9229
```

4. 汉化器会自动等待 Factory renderer 就绪并注入中文词典。

如果 macOS 首次阻止 `.command` 文件运行，可在 **系统设置 → 隐私与安全性** 中允许，或在终端中执行：

```bash
chmod +x "Factory 中文.command" "导出未翻译UI.command"
```

## 收集未翻译 UI

启动 Factory CN 后，把你想补全的页面点一遍，然后双击：

```text
导出未翻译UI.command
```

桌面会生成：

```text
factory-cn-untranslated.txt
```

欢迎提交 Issue / PR 补充词典。

## 安全说明

本项目为了注入 UI 翻译，会在 Factory 运行期间开启 Chromium DevTools 调试端口：

```text
127.0.0.1:9229
```

它只绑定本机回环地址，**不会暴露到局域网**。但本机其他进程理论上可以在 Factory 运行期间访问这个调试端口，因此：

- 不建议在不受信任的本机环境中长期保持该端口；
- 用完后退出 Factory 即会关闭端口；
- 本项目不会读取或上传你的 Factory API Key、Secrets、仓库内容或聊天内容；
- 未翻译扫描器主动跳过常见聊天、代码、编辑器和终端区域，但提交扫描结果前仍建议人工检查一次。

## 工作原理

```text
官方 Factory.app（保持原样）
        ↓
127.0.0.1:9229 本地 DevTools
        ↓
Factory CN injector
        ↓
精确 UI 文本映射 + MutationObserver
        ↓
中文界面
```

Factory Desktop 启用了 `EnableEmbeddedAsarIntegrityValidation` 和 `OnlyLoadAppFromAsar`。本项目因此选择运行时注入，而不是修改或重新签名官方 App。

## 兼容性

目前主要针对：

- macOS
- `/Applications/Factory.app`
- Factory Desktop 0.185.0 附近版本

Factory 更新后，只要 renderer 结构和英文文案没有大幅变化，通常仍可继续使用；若有漏译，可以重新收集未翻译 UI 并提交 Issue。

## 项目文件

- `inject.js`：CDP 连接、启动与未翻译 UI 收集
- `renderer.js`：运行时 DOM 翻译与扫描逻辑
- `translations/*.json`：中文词典，按文件拆分以便社区维护
- `Factory 中文.command`：启动 Factory 并注入汉化
- `导出未翻译UI.command`：导出未翻译 UI 文本

## 免责声明

这是社区非官方项目，与 Factory / The San Francisco AI Factory, Inc. 无隶属关系，也未获得官方背书。Factory、Droid 及相关商标归其各自权利人所有。

## License

MIT
