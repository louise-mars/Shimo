# 拾墨工程经验总结

> 本文档记录开发过程中踩过的坑、反思和形成的原则。  
> 目标：避免重复犯错，为未来开发提供可复用的检查清单。

---

## 一、异步状态管理

### 教训：IndexedDB 加载与 persist 的竞态

**问题**：Mobile store 的 persist `useEffect` 在 IndexedDB 数据加载完成前就触发，用空的 `notes: []` 覆盖了已保存的数据。用户下次打开 app 时笔记全部丢失。

**根因**：`useReducer` 初始化为空状态 → 第一次 render 触发 persist effect → 空数据写入 IndexedDB → 异步 load 完成后 dispatch LOAD_STATE → 但如果 app 在 load 和下一次 persist 之间崩溃，数据就丢了。

**原则**：
```
任何从异步存储加载数据的 store，必须有一个 `loaded` 守卫：
1. 初始 loaded = false
2. 异步加载完成后 loaded = true
3. persist effect 必须检查 if (!loaded) return
4. 可选：在 loaded 之前渲染 loading 占位符，阻止用户交互
```

**代码模式**：
```tsx
const [loaded, setLoaded] = useState(false)

// Load
useEffect(() => {
  loadFromDB().then(data => {
    if (data) dispatch({ type: 'LOAD_STATE', state: data })
    setLoaded(true)
  })
}, [])

// Persist — 必须在 loaded 之后
useEffect(() => {
  if (!loaded) return
  const timer = setTimeout(() => saveToDb(state), 1000)
  return () => clearTimeout(timer)
}, [state, loaded])
```

---

### 教训：LOAD_STATE 全量替换导致数据丢失

**问题**：Widget deep link 在数据加载前触发 `CREATE_NOTE`，新笔记被后续的 `LOAD_STATE`（全量替换）覆盖。

**原则**：
```
LOAD_STATE 应该是 merge 而非 replace：
- 如果加载前已有本地操作（如 CREATE_NOTE），这些操作的结果不应被覆盖
- 或者：在 loaded 之前禁止任何写操作（用 loading 屏蔽 UI）
```

---

## 二、视图状态与数据状态同步

### 教训：单向同步导致"幽灵视图"

**问题**：`activeNoteId` 变化时切换到编辑器视图，但 `activeNoteId` 变为 null 时没有切回列表。用户删除笔记后，编辑器显示"加载中…"永远不恢复。

**原则**：
```
视图状态和数据状态之间的同步必须是双向的：
- 数据 → 视图：activeNoteId 有值 → 显示编辑器 ✓
- 数据 → 视图：activeNoteId 为 null → 退出编辑器 ✓（之前缺失）

更好的做法：用显式状态机定义所有合法的视图转换。
```

**代码模式**：
```tsx
useEffect(() => {
  if (state.activeNoteId) {
    setView('editor')
  } else if (view === 'editor') {
    setView('list') // 关键：反向同步
  }
}, [state.activeNoteId])
```

---

### 教训：组件的 null 状态必须有退出路径

**问题**：NoteEditor 在 `note` 为 null 时显示"加载中…"，但没有任何机制退出这个状态。

**原则**：
```
任何组件的"异常/空"状态都必须有明确的退出路径：
- 超时后自动返回
- 提供手动返回按钮
- 或者：从架构上保证这个状态不可能持续（如 loading 屏蔽）

永远不要写一个没有退出条件的等待状态。
```

---

## 三、平台一致性

### 教训：Desktop 和 Mobile 的防护不对称

**问题**：Desktop store 有 `loading` 状态 + 加载屏蔽渲染，Mobile 没有。两个平台分别开发时，防护模式没有同步。

**原则**：
```
多平台项目的核心逻辑（store、sync、auth）应该：
1. 尽可能共享代码（放到 shared 包）
2. 如果不能共享，至少共享"模式"——用文档或模板确保两端实现相同的防护
3. 每次修改一端时，检查另一端是否需要同步修改

检查清单：
□ Desktop 有 loading 守卫？Mobile 也要有
□ Desktop 有 auto-cleanup？Mobile 也要有
□ Desktop 有 error boundary？Mobile 也要有
```

---

### 教训：同一功能的多个实现

**问题**：Mobile 有两个编辑器组件（`MobileEditor.tsx` 和 `NoteEditor.tsx`），只有一个被使用，另一个是历史遗留。维护时容易改错文件。

**原则**：
```
一个功能只能有一个实现。发现冗余文件时立即删除或合并。
冗余代码的危害：
- 修 bug 时改了 A 忘了 B
- 新人不知道该看哪个
- 增加构建体积
```

---

## 四、useEffect 时序与依赖

### 教训：Realtime 订阅在每次数据变化时重建

**问题**：`useSync` 的 realtime subscription effect 依赖 `[user, notes, folders]`，每次笔记内容变化都会取消旧订阅、创建新订阅。这导致：
- 频繁的 WebSocket 断开/重连
- 潜在的内存泄漏
- 丢失实时消息

**原则**：
```
长生命周期的副作用（WebSocket、EventSource、定时器）不应依赖频繁变化的值。
用 ref 访问最新数据，effect 只依赖真正决定"是否需要重建"的值。
```

**代码模式**：
```tsx
const notesRef = useRef(notes)
notesRef.current = notes

useEffect(() => {
  if (!user) return
  const unsub = subscribe(user, (remoteNote) => {
    // 用 ref 访问最新数据，不触发 effect 重建
    const current = notesRef.current
    onMergeRef.current(mergeNote(current, remoteNote))
  })
  return unsub
}, [user]) // 只在 user 变化时重建
```

---

### 教训：多个 useEffect 之间的隐式时序

**问题**：Mount 时有 3 个 effect 并行执行（load、persist、widget deep link），它们之间没有显式的执行顺序保证。

**原则**：
```
如果多个 effect 之间有时序依赖，必须用状态变量显式表达：
- loaded 标志控制 persist 的启动
- loaded 标志控制 widget deep link 的处理

不要依赖 useEffect 的声明顺序——React 不保证执行顺序与声明顺序一致。
```

---

## 五、防御性编程

### 教训：PIN 明文存储

**问题**：早期实现中 PIN 码直接存储在 localStorage，任何人打开 DevTools 就能看到。

**原则**：
```
敏感数据永远不要明文存储：
- PIN/密码 → SHA-256 哈希
- API Key → 至少不要在 console.log 中输出
- 用户数据 → 考虑是否需要加密存储
```

---

### 教训：confirm() 在移动端不可靠

**问题**：使用 `confirm('确定删除？')` 在某些 WebView 中不弹出或样式丑陋。

**原则**：
```
移动端永远不要用 window.confirm/alert/prompt：
- 用自定义 Modal/ActionSheet 替代
- 保证视觉一致性
- 保证在所有 WebView 中都能正常工作
```

---

## 六、性能

### 教训：大笔记的保存抖动

**问题**：每次按键都触发 300ms debounce 保存，对于 3000+ 字的笔记，JSON.stringify + IndexedDB 写入造成卡顿。

**原则**：
```
保存 debounce 应该根据内容大小自适应：
- 短笔记（<3000字）：300ms
- 长笔记（>3000字）：1000ms
- 超长笔记（>10000字）：考虑增量保存或 Web Worker
```

---

### 教训：Store 变化触发全量重渲染

**问题**：`useReducer` 的 state 是一个大对象，任何字段变化都会触发所有 `useStore()` 消费者重渲染。

**原则**：
```
大型 store 应该考虑：
1. 拆分 context（如 NotesContext + UIContext）
2. 使用 selector 模式（useSyncExternalStore + selector）
3. 或者用 zustand/jotai 等支持细粒度订阅的库

当前项目规模下 useReducer 够用，但如果笔记数量超过 500 条，需要重构。
```

---

## 七、代码审查检查清单

每次提交前，对照以下清单：

### 状态管理
- [ ] 异步加载的 store 是否有 `loaded` 守卫？
- [ ] persist effect 是否在 loaded 之后才执行？
- [ ] LOAD_STATE 是否会覆盖加载前的本地操作？
- [ ] 视图状态和数据状态是否双向同步？

### useEffect
- [ ] 长生命周期副作用（WebSocket、定时器）是否避免了频繁重建？
- [ ] 多个 effect 之间是否有隐式时序依赖？如果有，是否用状态变量显式表达？
- [ ] cleanup 函数是否正确清理了所有资源？

### 平台一致性
- [ ] 修改了 Desktop 的核心逻辑？Mobile 是否需要同步？
- [ ] 修改了 Mobile 的核心逻辑？Desktop 是否需要同步？
- [ ] 两端的错误处理、loading 状态、边界情况是否一致？

### 用户体验
- [ ] 所有"等待"状态是否有退出路径（超时/手动返回）？
- [ ] 删除操作是否有二次确认？
- [ ] 移动端是否避免了 window.confirm/alert？
- [ ] 空状态是否有友好提示和操作引导？

### 安全
- [ ] 敏感数据是否加密/哈希存储？
- [ ] CSP 是否允许了必要的外部连接？
- [ ] 用户输入是否经过验证？

---

## 八、架构决策记录

| 决策 | 理由 | 风险 |
|------|------|------|
| IndexedDB 替代 localStorage | 无 5MB 限制，支持大量笔记 | 隐私模式下可能不可用，需要 fallback |
| 图片独立存储（shimo-images DB） | 避免大 base64 撑爆主数据 | 笔记删除时需要清理孤立图片 |
| 1s debounce 持久化 | 平衡性能和数据安全 | 崩溃时最多丢失 1s 的编辑 |
| Pull-before-push 同步 | 避免覆盖远程更新 | 冲突检测依赖 updatedAt 精度 |
| MERGE_SYNC 字段级合并 | 内容取 updatedAt 较新方；元数据（pinned/favorited）在远程内容更新时保留本地值，避免用户本地操作被覆盖；本地独有笔记追加保留 | 元数据字段始终取本地值可能导致远程有意的 unpin 被忽略 |
| Realtime 订阅用 ref | 避免频繁重建 WebSocket | ref 模式让代码可读性略降 |
| 沉浸模式 15s 触发 | 避免误触发，给用户足够的"停下来思考"时间 | 用户可能觉得太慢 |

---

## 九、已知技术债

| 项目 | 优先级 | 状态 | 说明 |
|------|--------|------|------|
| MobileEditor.tsx 冗余 | P1 | ✅ 已修复 | 已删除，统一使用 NoteEditor.tsx |
| useSync triggerSync 闭包 | P1 | ✅ 已修复 | 改为 ref 模式，triggerSync 只依赖 user |
| Store 未共享 | P2 | ✅ 已修复 | 抽取到 Shared/src/lib/store.ts |
| MERGE_SYNC 覆盖编辑中内容 | P1 | ✅ 已修复 | 升级为字段级合并：内容取 updatedAt 较新方，元数据（pinned/favorited）在远程内容更新时保留本地值，本地独有笔记追加保留 |
| 视图状态机 | P1 | ✅ 已修复 | Mobile App.tsx 双向同步 + 显式状态函数 |
| 图片孤立清理 | P2 | 待做 | 删除笔记时未清理 shimo-images 中的图片 |
| 主 chunk 834KB | P2 | 待做 | 应进一步 code-split（TipTap 是大头） |
| 无集成测试 | P2 | 待做 | 缺少异步场景的自动化测试 |

---

*最后更新：2026-05-08*


---

## 十、最终审查发现

### 教训：编辑器扩展必须与格式栏按钮对齐

**问题**：Mobile NoteEditor 注册了 `StarterKit` 但没有单独注册 `TaskList`/`TaskItem` 扩展。FormatBar 的 ☑ 按钮调用 `toggleTaskList()` 静默失败。模板创建的待办列表笔记无法正确渲染。

**根因**：Desktop 和 Mobile 的编辑器扩展列表不同步。Desktop 有 `TaskList` + `TaskItem`，Mobile 漏掉了。

**原则**：
```
编辑器扩展列表 = 格式栏按钮 + Slash 菜单命令 + 模板内容类型 的并集。
每次添加格式按钮或模板时，必须验证对应的 TipTap 扩展已注册。

检查清单：
□ FormatBar 的每个按钮对应的扩展是否已注册？
□ SlashMenu 的每个命令对应的扩展是否已注册？
□ TemplatePicker 创建的内容节点类型是否都有对应扩展？
□ Desktop 和 Mobile 的扩展列表是否一致？
```

*发现时间：2026-05-08 最终审查*
