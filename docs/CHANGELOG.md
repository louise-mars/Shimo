# 拾墨 — 版本变更日志

> 完整的功能变更、修复和改进记录

---

## v1.2.0 — 2026年6月12日「吸引力升级」

### 概述

本次更新聚焦于让拾墨从「可用」变为「令人印象深刻」。新增 10 项功能，涵盖知识管理、写作体验、视觉个性化和生产力工具，并修复了 4 个影响用户体验的 Bug。

---

### 新增功能

#### 1. 命令面板 (Command Palette)
- **触发方式：** `Ctrl+K`（编辑器外）
- **功能：** 统一搜索入口，可搜索笔记（标题/内容/标签）、标签、操作
- **亮点：** 拼音模糊匹配、键盘导航（↑↓ Enter Esc）、最近笔记快速访问
- **文件：** `src/components/CommandPalette/CommandPalette.tsx`

#### 2. 双向链接 (Bi-directional Links)
- **语法：** `[[笔记标题]]` 创建内联链接
- **功能：** 
  - 输入 `[[` 触发自动补全弹窗（拼音匹配 + 键盘选择）
  - 链接渲染为可点击的高亮标记，点击跳转到目标笔记
  - 编辑器底部自动显示「被引用」面板（反向链接）
- **文件：** `src/components/Editor/WikiLink.ts`, `WikiLinkSuggestion.tsx`, `BacklinksPanel.tsx`

#### 3. 笔记嵌入 (Note Embedding / Transclusion)
- **语法：** `![[笔记标题]]` 插入块级嵌入
- **功能：**
  - 输入 `![[` 触发嵌入选择弹窗
  - 嵌入卡片展示：标题、内容预览（200字，带渐变遮罩）、字数、标签
  - 左侧朱砂色竖线标记，点击导航到源笔记
  - 目标笔记不存在时显示友好占位符
- **文件：** `src/components/Editor/NoteEmbed.tsx`, `NoteEmbedSuggestion.tsx`

#### 4. 专注模式 (Focus Mode)
- **触发方式：** `Ctrl+Shift+F`（需要有笔记打开）
- **功能：** 全屏无干扰写作环境
  - 隐藏所有 UI chrome
  - 宋体 18px、行高 2x、最大宽度 720px 居中
  - 标题栏 60% 透明度，鼠标悬停显示
  - 实时字数 + 保存状态
  - Esc 退出，退出时自动保存（修复了数据丢失问题）
- **文件：** `src/components/FocusMode.tsx`

#### 5. 配色方案 (Theme Palettes)
- **触发方式：** 命令面板 → "配色方案"
- **预设方案：**
  - 宣纸（默认）— 墨与朱砂
  - 青瓷 — 温润如玉的青绿
  - 竹青 — 自然清新的翠绿
  - 石青 — 沉静的矿石蓝
  - 素月 — 柔和温暖的月光
- **特性：** 实时预览色板、持久化到 localStorage、仅浅色模式生效、切换到深色模式后回到浅色自动恢复
- **文件：** `src/components/ThemePicker.tsx`

#### 6. 智能每日提示 (Smart Daily Prompt)
- **位置：** 左侧边栏底部
- **逻辑（纯本地，无 AI）：**
  1. 昨天有未完成任务 → "还有 X 项未完成，继续？"
  2. 一周前写过笔记 → "一周前你写了…想法有变化吗？"
  3. 本周最活跃标签 → "这周你在 #X 上记了 N 条"
  4. 昨天有记录 → "昨天记录了 N 条，今天从哪开始？"
  5. 通用问候 → 根据时间段变化（早安/午后/夜晚）
- **交互：** "开始写"创建新笔记 + 当日不再显示；"稍后"关闭
- **文件：** `src/components/DailyPrompt.tsx`

#### 7. 任务看板 (Kanban View)
- **触发方式：** 命令面板 → "任务看板"
- **三列布局：**
  - 待办 (○) — 所有 task 未勾选
  - 进行中 (◐) — 部分 task 已勾选
  - 已完成 (●) — 所有 task 已勾选
- **功能：** 自动从所有含 taskList 的笔记提取、进度条、标签筛选、点击打开笔记
- **文件：** `src/components/KanbanView.tsx`

#### 8. 精美 HTML 导出 (Styled Export)
- **触发方式：** 编辑器工具栏下载按钮（↓ 图标，PDF 旁边）
- **输出：** 独立 HTML 文件，完整 山水 美学：
  - 宣纸色背景、Noto Serif SC 字体、朱砂红强调色
  - 居中排版（680px）、优雅的标题/日期/标签头部
  - 完整渲染：标题、列表、任务列表、引用、代码块、表格、图片、标记
  - "由 拾墨 Shimo 导出" 页脚
- **API：** `downloadStyledHTML(note)` + `copyStyledHTML(note)`（富文本复制到剪贴板）
- **文件：** `src/lib/exportStyled.ts`

#### 9. 面板动画与空状态美术
- **面板动画：** 侧边栏和笔记列表出现时 200ms `slideInLeft` 动画（交错 50ms）
- **笔记卡片微交互：** 悬停时 2px 右移 + 阴影浮起
- **空状态插画：** 山水水墨 SVG（远山、月亮、飞鸟）+ "拾墨" 字标 + 快捷键提示
- **展开按钮动画：** fadeIn 200ms
- **文件：** `src/styles/desktop.css`, `src/styles/theme.css`

#### 10. 命令面板全覆盖
所有新功能均可通过命令面板（`Ctrl+K`）访问：
- 专注模式、配色方案、任务看板、切换主题、切换侧边栏/列表
- 笔记搜索、标签跳转、新建笔记/模板、导入、设置、图谱、报告、AI

---

### Bug 修复

| # | 问题 | 严重程度 | 修复方式 |
|---|------|----------|----------|
| 1 | 专注模式退出时丢失最后 600ms 内的编辑 | 高 | 退出时 flush 未保存的内容到 store |
| 2 | Esc 键无法关闭专注模式/配色/看板（stale closure） | 中 | 添加 `showFocusMode`/`showThemePicker`/`showKanban` 到 useEffect 依赖数组 |
| 3 | 反向链接搜索在长笔记中有边界问题 | 低 | 简化为单一 case-insensitive 原始内容搜索 |
| 4 | NoteEmbed 配置了无效的 `onNavigate` 回调 | 低 | 移除死代码，使用普通注册 |

---

### 新增文件清单

```
Desktop/src/components/
├── CommandPalette/
│   ├── CommandPalette.tsx    # 命令面板主组件
│   └── index.ts             # barrel export
├── Editor/
│   ├── WikiLink.ts          # [[链接]] ProseMirror 扩展
│   ├── WikiLinkSuggestion.tsx  # [[ 自动补全弹窗
│   ├── BacklinksPanel.tsx   # 反向链接面板
│   ├── NoteEmbed.tsx        # ![[嵌入]] TipTap Node 扩展
│   └── NoteEmbedSuggestion.tsx  # ![[ 自动补全弹窗
├── FocusMode.tsx            # 专注模式全屏覆盖层
├── ThemePicker.tsx          # 配色方案选择器
├── DailyPrompt.tsx          # 智能每日提示
└── KanbanView.tsx           # 任务看板

Desktop/src/lib/
└── exportStyled.ts          # 精美 HTML 导出

Desktop/src/styles/
├── desktop.css              # (修改) 新增 slideInLeft/slideInRight 动画、note-embed 样式、wiki-link 样式
└── theme.css                # (修改) 新增 wiki-link 样式、动画 keyframes
```

---

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/App.tsx` | 新增 CommandPalette/FocusMode/ThemePicker/KanbanView 状态管理与渲染、快捷键注册、palette 初始化 |
| `src/components/NoteEditor.tsx` | 新增 WikiLink/NoteEmbed 扩展注册、`[[`/`![[` 触发检测、BacklinksPanel 渲染、styled HTML 导出按钮 |
| `src/components/LeftSidebar.tsx` | 集成 DailyPrompt 组件 |
| `src/styles/desktop.css` | 面板动画、note-embed/wiki-link CSS、卡片悬停效果 |
| `src/styles/theme.css` | slideInLeft/slideInRight keyframes、wiki-link CSS |

---

### 快捷键新增

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+K` | 命令面板（编辑器外） |
| `Ctrl+Shift+F` | 专注模式（需打开笔记） |
| `[[` | 插入笔记链接（编辑器内） |
| `![[` | 嵌入笔记（编辑器内） |

---

### 技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| WikiLink 实现 | ProseMirror Decoration（非 Mark） | 不修改文档结构，纯视觉高亮 + 点击交互 |
| NoteEmbed 实现 | TipTap Node + ReactNodeViewRenderer | 块级元素需要自定义渲染，React 组件可访问 Zustand store |
| 命令面板搜索 | 内存过滤 + pinyinMatch | 笔记数量 < 10000 时无需索引，毫秒级响应 |
| 配色方案 | CSS custom properties 动态覆盖 | 零成本切换，不需要重新渲染组件树 |
| 每日提示 | 纯本地规则引擎 | 不依赖 AI API，零延迟，离线可用 |
| Styled Export | 内联 CSS + 自渲染 HTML | 完全独立，任何浏览器可打开，不依赖外部资源 |

---

### 已知限制

- 配色方案仅在浅色模式下生效（深色模式有固定配色）
- 笔记嵌入不支持嵌套（A 嵌入 B，B 嵌入 C，不会展开 C）
- 双向链接依赖精确标题匹配（大小写不敏感，但需要完整标题）
- 精美 HTML 导出不包含嵌入笔记的内容（只显示嵌入块占位符）
- 看板视图不支持拖拽移动卡片（只读展示）

---

## v1.1.0 — 2026年5月8日「稳定性 + 编辑器全面升级」

（详见 dev-log.md 阶段 16-18）

- 架构重构：Shared Store 核心 + useSync 重构
- 编辑器格式能力补齐：完整格式工具栏 + 浮动格式栏 + Slash 菜单
- 性能优化：16 项修复
- 移动端补齐：模板/导入导出/ASR/表格/图片
- 同步引擎增强：冲突 UI + 指数退避 + 字段级合并

---

## v1.0.1 — 2026年4月「体验打磨」

（详见 dev-log.md 阶段 15）

- P0: 首次使用引导、回收站、确认弹窗、PIN 安全加固
- P1: 设计系统、保存状态、搜索高亮、同步错误、笔记排序、PIN 恢复、置顶标记、深色模式过渡、ARIA、下拉刷新、冲突检测
- P2: 笔记列表三行、模板、复制 Markdown、移动版图片、标签重命名、平板适配、列表宽度拖拽、今日回顾

---

## v1.0.0 — 2026年3月「初始发布」

- 核心编辑器（TipTap）
- 标签系统
- 云同步（Supabase）
- 深色/浅色主题
- AI 助手（5 提供商）
- 知识图谱（D3）
- 每日回顾 + 周报
- App 锁（PIN）
- 导入/导出
- 语音输入
- 拖拽排序
