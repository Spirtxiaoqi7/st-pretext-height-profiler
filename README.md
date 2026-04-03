# Pretext Height Profiler

基于 [Pretext](https://github.com/chenglou/pretext) 引擎的 SillyTavern 插件，提供虚拟滚动性能优化与 AB 性能对比，**不影响原生界面和按钮交互**。

## 功能特性

- **真实高度虚拟滚动**：基于消息真实渲染高度布局，滚动条精准，杜绝空白或遮盖。
- **AB 性能对比**：分别统计原生渲染模式与虚拟滚动模式的滚动帧耗时，直观展现优化效果。
- **无损集成**：采用内部轨道布局，不修改外部 DOM 结构，所有聊天按钮、侧边栏等功能完全保留。
- **Pretext 统计**：展示 Pretext 测量耗时（prepare/layout），作为性能参考。
- **一键重置**：清空所有统计数据，方便反复测试。

## 安装方法

### 方法一：通过 SillyTavern 内置扩展管理器（推荐）

1. 打开 SillyTavern，进入 **扩展（Extensions）** 面板。
2. 点击 **Download Extensions & Assets**。
3. 输入以下仓库地址：
https://github.com/Spirtxiaoqi7/st-pretext-height-profiler

text
4. 点击 **Download**，等待安装完成。
5. 刷新页面或重启 SillyTavern。

### 方法二：手动安装

1. 下载本仓库的所有文件。
2. 将整个文件夹放入 SillyTavern 的扩展目录：
data/<你的用户句柄>/extensions/st-pretext-height-profiler

text
3. 重启 SillyTavern 或刷新页面。

## 使用方法

1. 进入 **设置** → **扩展**，找到 **Pretext 高度分析器 + 虚拟滚动** 面板。
2. **启用测量**：默认勾选，自动测量所有消息的高度并显示统计。
3. **启用虚拟滚动**：勾选后聊天列表将切换为虚拟滚动模式，滚动性能大幅提升。
4. **AB 性能对比**：
- 不勾选“启用虚拟滚动”时，正常使用原生渲染，滚动时自动记录原生模式帧耗时。
- 勾选后，滚动时自动记录虚拟滚动模式帧耗时。
- 面板中会显示两种模式的滚动次数和平均帧耗时。
5. **重置统计**：点击按钮清空所有统计数据，重新开始测试。

## 常见问题

- **启用虚拟滚动后聊天按钮无法点击？**  
本版本已修复该问题，所有原生按钮功能完全保留。如仍有异常，请刷新页面重试。
- **滚动条无法滚到底部？**  
虚拟滚动基于真实高度，确保滚动范围准确。若仍有异常，请检查控制台错误或反馈。
- **与其他扩展冲突？**  
插件仅修改 `#chat` 容器内部结构，不改变外部元素，兼容性较高。

## 技术细节

- 虚拟滚动在激活时捕获所有消息节点的真实高度（`getBoundingClientRect().height`），构建高度管理器。
- 使用内部轨道（`<div class="virtual-track">`）进行绝对定位布局，父容器仅保留滚动能力。
- 节点池复用机制，仅渲染可见区域 + 预渲染（overscan）范围内的消息。
- 监听 `MESSAGE_RECEIVED`、`CHAT_CHANGED`、`MESSAGE_EDITED` 事件，自动刷新高度和缓存。

## 许可证

- 作者：柒君
- 许可证：AGPL-3.0
- 允许自由传播、修改，但必须保留原作者信息和许可证。
- 禁止商用。

## 致谢

- [Pretext](https://github.com/chenglou/pretext) 作者 Cheng Lou
- SillyTavern 社区

## 版本历史

详见 [CHANGELOG.md](./CHANGELOG.md)
