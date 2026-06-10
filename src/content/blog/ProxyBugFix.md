---
title: 代理不正常关闭时，能打开网页，桌面应用却连不上网络
description: 有次代理打开tun模式后卡住强制关闭了，网页都能正常打开，却打开不了鸣潮这类桌面应用，忙活了一天终于找到解决方案了
category: 网络
pubDate: '2026-06-10'
tags:
  - 代理
draft: false
updatedDate: '2026-06-10'
---
## 问题重现

前几天遇到一个非常诡异的网络问题，折腾了我整整一天才解决：

> 正常使用 VPN 代理时一切正常，某次打开tun模式卡住了，我直接在任务管理器里强制结束了进程。之后发现：所有浏览器都能正常上网，国内网站都没问题微信、QQ等普通桌面应用也都正常鸣潮游戏启动器一直卡在 "正在检查更新"Claude Code 客户端 + deepseek显示 "无法连接到服务器"

我尝试了网上所有能找到的解决方案：

- 重新打开、关闭系统代理
- 清空 DNS 缓存
- 重置 Winsock
- 重置路由表
- 重启电脑 N 次
- 火绒断网问题一键修复 全部无效，问题依然存在。

## 根本原因

代理类型本质主要谁会用典型影响环境变量代理给程序读取的变量Git、npm、pip、curl、Node/Python、部分 Electron/启动器命令行、开发工具、部分启动器WinHTTP 代理Windows 后台服务用的代理配置Windows Update、系统服务、部分安装器/更新器系统服务、后台联网WinINet 代理Windows“系统代理”/浏览器常用配置Edge、Chrome、部分普通桌面软件浏览器、普通 GUI 软件

> 注意到：具体走哪种代理，不是由 Windows 统一决定，而是由软件使用的网络库/组件决定。很多 Clash/V2Ray/sing-box 类客户端会在开启系统代理或 TUN 模式时修改 Windows 的代理、DNS、路由或虚拟网卡配置。如果异常退出，可能导致 WinINet 系统代理、WinHTTP 代理、环境变量代理、DNS 或路由残留。但它们不一定会同时修改三类代理；具体取决于软件、模式和用户配置。

言归正传，异常退出时（强制结束进程、系统崩溃、直接关机），代理软件可能来不及执行退出时的清理逻辑，导致部分代理、DNS、路由或环境变量配置残留。

## 解决方案

### 第一步：清理环境变量代理(这是最容易被忽略的一步，也是解决我问题的关键,感觉遇到的人比较少)

1. 右键 "此电脑"→属性→高级系统设置→环境变量
2. 在 "用户变量" 和 "系统变量" 中，全部删除以下变量（如果存在）：

- HTTP_PROXY
- HTTPS_PROXY
- ALL_PROXY
- NO_PROXY

1. 点击 "确定" 保存所有更改

### 第二步：重置 WinHTTP 代理

管理员 CMD 执行：

```cmd
netsh winhttp reset proxy
```

正确输出应该类似：

```plaintext
当前 WinHTTP 代理设置:
    直接访问(没有代理服务器)。
```

### 第三步：验证修复

不需要重启电脑，只需要：

1. 关闭所有已经打开的 CMD、PowerShell 窗口
2. 完全退出鸣潮、Claude Code
3. 重新打开这些应用测试 不出意外的话，所有应用都能正常直连网络了。

### 第四步：如果还是不行

如果以上步骤都执行完还是有问题，可以尝试：

- 火绒断网一键修复

最后给出一键修复脚本：

```bat
@echo off
title 一键清理 Windows 代理残留

echo ======================================
echo 正在删除用户环境变量代理...
echo ======================================

reg delete "HKCU\Environment" /v HTTP_PROXY /f 2>nul
reg delete "HKCU\Environment" /v HTTPS_PROXY /f 2>nul
reg delete "HKCU\Environment" /v ALL_PROXY /f 2>nul
reg delete "HKCU\Environment" /v NO_PROXY /f 2>nul

echo.
echo ======================================
echo 正在删除系统环境变量代理（需要管理员权限）...
echo 如果不是管理员运行，下面几项可能会失败，可忽略。
echo ======================================

reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v HTTP_PROXY /f 2>nul
reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v HTTPS_PROXY /f 2>nul
reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v ALL_PROXY /f 2>nul
reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v NO_PROXY /f 2>nul

echo.
echo ======================================
echo 正在重置 WinHTTP 代理...
echo ======================================

netsh winhttp reset proxy

echo.
echo ======================================
echo 正在清空 DNS 缓存...
echo ======================================

ipconfig /flushdns

echo.
echo ======================================
echo 清理完成！
echo 请关闭所有 CMD、PowerShell、游戏启动器、Electron 应用后重新打开。
echo 如果仍然异常，建议注销或重启一次系统。
echo ======================================

pause
```
