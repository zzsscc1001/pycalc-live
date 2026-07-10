# PyCalc Live — 设计方案

## 三种候选风格

### 方案 A：深色 IDE 极简风（Dark IDE Minimal）
类似 VS Code / JupyterLab 的深色专业编辑器风格，代码区与输出区并排，专注于效率与可读性。
概率：0.07

### 方案 B：学术纸质感（Academic Paper）
浅色背景，仿 LaTeX 排版风格，左侧代码带行号，右侧结果以数学公式感呈现。
概率：0.02

### 方案 C：赛博霓虹终端（Cyberpunk Terminal）
黑色背景配霓虹绿/青色高亮，复古 CRT 扫描线效果，强烈的终端感。
概率：0.01

---

## 选定方案：方案 A — 深色 IDE 极简风

### Design Movement
Dark IDE Aesthetic — 借鉴 VS Code、JupyterLab、Zed 编辑器的视觉语言，专注于代码可读性与工具效率感。

### Core Principles
1. **信息密度优先**：每一像素都服务于内容，无装饰性元素
2. **左右对齐即语义**：代码行与结果行的视觉对齐本身就是功能
3. **深色减少眼疲劳**：长时间使用场景下，深色背景降低视觉负担
4. **状态可见性**：执行中、错误、成功等状态通过颜色即时传达

### Color Philosophy
- 背景：`#1e1e2e`（深蓝灰，Catppuccin Mocha 风格）
- 代码区背景：`#181825`（更深，区分编辑区）
- 结果区背景：`#1e1e2e`（与主背景统一）
- 侧边栏背景：`#11111b`（最深层）
- 主强调色：`#89b4fa`（Catppuccin 蓝）
- 成功/数值色：`#a6e3a1`（Catppuccin 绿）
- 错误色：`#f38ba8`（Catppuccin 红）
- 字符串色：`#a6e3a1`
- 注释色：`#6c7086`
- 文字主色：`#cdd6f4`
- 文字次色：`#a6adc8`

### Layout Paradigm
三栏布局：左侧代码编辑器（~55%）+ 右侧结果输出区（~25%）+ 最右侧变量面板（~20%）。
顶部固定工具栏包含运行、重算、清空等操作。
代码区与结果区使用相同行高，实现像素级对齐。

### Signature Elements
1. **行号 + 对齐线**：代码行号与结果行号共享同一视觉基线
2. **变量卡片**：侧边栏每个变量显示为小卡片，含类型徽章和值预览
3. **执行状态指示器**：顶部细线进度条，运行时流动动画

### Interaction Philosophy
- 代码修改后不自动执行（避免频繁重算），需手动触发（Shift+Enter 或按钮）
- 支持 Ctrl+Enter 运行全部代码
- 错误行在代码区高亮显示红色下划线

### Animation
- 结果出现：从右侧 `translateX(8px) opacity(0)` 淡入，150ms ease-out
- 变量更新：值变化时背景短暂高亮（200ms），提示用户注意
- 执行进度条：顶部 2px 细线，流动动画
- 所有动画 < 250ms，键盘触发的执行无动画延迟

### Typography System
- 代码字体：`JetBrains Mono`（等宽，优秀的代码可读性）
- UI 字体：`Inter`（仅用于工具栏、标签等非代码区域）
- 代码字号：14px，行高 22px（与结果区严格一致）
- 变量面板字号：12px

### Brand Essence
PyCalc Live — 为工程师和科学家打造的即时 Python 计算本，无需启动，所见即所得。
个性形容词：精准、高效、沉浸

### Brand Voice
- 标题示例："在浏览器里运行 Python，结果逐行呈现"
- CTA 示例："按 Shift+Enter 立即运行"
- 禁用：通用填充语如"欢迎使用"、"开始吧"

### Wordmark & Logo
终端光标符号 `>_` 配合 `PyCalc` 文字，使用等宽字体渲染，强调代码工具属性。

### Signature Brand Color
`#89b4fa` — Catppuccin 蓝，清冷、精准、科技感。

## Style Decisions
- 使用 Pyodide WebAssembly 在浏览器内执行 Python，无需后端
- 代码编辑器使用 CodeMirror 6，配置 Python 语法高亮
- 行高统一为 22px，确保代码行与结果行像素级对齐
