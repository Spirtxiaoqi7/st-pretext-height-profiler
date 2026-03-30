# Pretext Height Profiler

基于 Pretext 引擎的 SillyTavern 插件  
高精度测量聊天消息的高度，并实时分析性能数据。

![SillyTavern](https://img.shields.io/badge/SillyTavern-插件-blue)
![License](https://img.shields.io/badge/许可证-禁止商用-red)
![Version](https://img.shields.io/badge/版本-1.0.0-green)

## 简介

Pretext Height Profiler 是一个轻量但强大的 SillyTavern UI 扩展。  
它利用下一代文本布局引擎 Pretext，绕过传统 DOM 测量，实现：

- 极快的消息高度计算（单次 layout 低至 0.01ms）
- 精确的行数 / 高度预估（与最终渲染完全一致）
- 实时性能监控（prepare / layout 耗时统计）
- 内置测试工具（可自由输入文本验证 Pretext 效果）

无论你的聊天记录有多长，它都不会造成界面卡顿。

## 技术出处

本插件核心布局引擎来自：

- Pretext - 由前 React 核心成员 Cheng Lou 开发的新一代文本布局工具  
- 采用纯 JavaScript / Canvas 2D 预测量 + 纯算术 layout，完全不触发 DOM 重排  
- 性能可达 120 FPS，适合处理海量文本

本插件仅作为 Pretext 在 SillyTavern 中的落地演示与实用工具。

## 安装方法

### 方法一：通过 SillyTavern 内置扩展管理器（推荐）

1. 打开 SillyTavern，进入扩展（Extensions）面板
2. 点击 Download Extensions & Assets
3. 在弹出的输入框中粘贴本仓库的 GitHub 地址：
   https://github.com/Spirtxiaoqi7/st-pretext-height-profiler
4. 点击 Download，等待安装完成
5. 刷新页面或重启 SillyTavern

### 方法二：手动安装

1. 下载本仓库的所有文件
2. 将整个文件夹放入 SillyTavern 的扩展目录：
   data/<你的用户句柄>/extensions/st-pretext-height-profiler
3. 重启 SillyTavern 或刷新页面

## 如何使用

1. 启动 SillyTavern 后，进入设置 -> 扩展
2. 你会看到 Pretext Height Profiler 面板，默认已启用
3. 插件会自动：
   - 处理现有聊天消息
   - 监听新消息并测量高度
   - 在浏览器控制台（F12 -> Console）输出性能日志
4. 面板中你可以：
   - 勾选/取消勾选 启用插件
   - 查看累计处理消息数、总 prepare / layout 耗时
   - 点击 重置统计 清空数据
   - 在 测试工具 区域输入任意文本，点击 测量高度 查看 Pretext 的即时性能

提示：打开控制台可以看到每条消息的详细性能数据，例如：  
[Pretext] 消息 "你好..." 高度=96px, 行数=4, prepare=0.023ms, layout=0.008ms

## 许可证 & 使用条款

- 作者：柒君
- 允许传播：你可以自由复制、分享、修改本插件，但必须保留原作者信息和出处
- 禁止商用：严禁将本插件用于任何商业目的（包括但不限于售卖、商业服务、嵌入收费产品等）
- 代码开源：本插件源码公开，欢迎学习、改进和提交 Pull Request

如有商业使用需求，请联系作者单独授权。

## 贡献与反馈

- 如果你遇到 Bug 或有功能建议，请在 GitHub Issues 中提出
- 欢迎提交 PR 优化代码或文档
- 如果你觉得这个插件有用，不妨给它一个 Star

## 致谢

- SillyTavern 社区 - 提供了强大的扩展框架
- Pretext 作者 Cheng Lou - 创造了如此优雅的高性能布局引擎

Enjoy your smooth chatting!  
—— 柒君