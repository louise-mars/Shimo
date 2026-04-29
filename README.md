# NotePro 项目

NotePro 是一个跨平台的笔记应用，支持桌面版和移动版。

## 项目结构

```
NotePro/
├── Desktop/     # 桌面版 (Tauri + React)
├── Mobile/      # 移动版 (Capacitor + React)  
└── Shared/      # 共享代码库
```

## 开发指南

### 1. 安装依赖

```bash
# 共享库
cd Shared
npm install

# 桌面版
cd ../Desktop  
npm install

# 移动版
cd ../Mobile
npm install
```

### 2. 开发模式

```bash
# 桌面版
cd Desktop
npm run dev

# 移动版
cd Mobile
npm run dev
```

### 3. 构建

```bash
# 共享库 (需要先构建)
cd Shared
npm run build

# 桌面版
cd ../Desktop
npm run build

# 移动版
cd ../Mobile
npm run build
```

## 共享代码库

`Shared` 包含以下共享模块：

- **types**: 数据类型定义 (Note, Folder等)
- **lib/supabase**: Supabase客户端配置
- **lib/syncEngine**: 数据同步引擎
- **utils/markdown**: Markdown导入导出工具

## 平台特性

### 桌面版 (Desktop)
- 基于 Tauri 的原生桌面应用
- 完整的编辑器功能
- 文件系统集成
- 系统托盘支持

### 移动版 (Mobile)  
- 基于 Capacitor 的混合移动应用
- 触摸优化的界面
- 移动端特有功能 (相机、分享等)
- iOS 和 Android 支持

## 下一步

1. 删除原始的 `NotePro` 目录（在kiro文件夹下）
2. 根据需要调整各平台的UI组件
3. 添加平台特定的功能
4. 配置CI/CD流水线