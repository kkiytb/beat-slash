# Contributing to Beat Slash

感谢你考虑为 Beat Slash 贡献代码！🎵

## 开发环境

本项目为纯前端项目，**无需构建工具**，使用 ES Modules 直接在浏览器中运行。

```bash
# 克隆仓库
git clone https://github.com/<your-username>/beat-slash.git
cd beat-slash

# 启动本地静态服务器
npx serve .
```

### 开发建议

- 使用 Live Server / `npx serve` / `python -m http.server` 均可
- 修改后直接刷新浏览器即可生效
- 建议开启浏览器 DevTools 的 "Preserve log" 以便观察错误

## 代码规范

### 通用

- 使用 2 空格缩进
- 文件使用 LF 换行
- 提交信息使用中文，格式：`type: 描述`（如 `feat: 新增主题系统`）
- 优先复用现有模块，避免在 `main.js` 中堆砌业务逻辑

### JavaScript

- 使用 ES Modules（`import` / `export`）
- 导出函数使用命名导出，避免默认导出
- **所有魔法数必须提取为 `js/modules/core/constants.js` 中的命名常量**
- 错误处理禁止 `void e;` 吞掉异常，统一使用 `console.warn('[BeatSlash]', e);`
- DOM 元素访问前必须做空值检查，或使用 `safeStorage` / `dispatchError` 等安全包装

### CSS

- 在 `css/style.css` 中按模块分区注释
- 避免重复定义同一选择器，后定义会覆盖先定义
- 主题变量放在 `:root` 中，通过 `[data-theme="..."]` 覆盖

### 提交前检查

```bash
# 静态检查：文件加载 + HTML 元素引用 + ES 模块语法
node test/smoke.js
```

## 目录结构

```
js/
├── main.js              # 入口：UI 绑定、文件加载、流程控制
├── game_new.js          # 游戏循环、初始化、输入调度
├── chartloader.js       # Beat Saber zip / Info.dat 解析
├── dancers.js           # 舞蹈小人模型
├── vendor/              # 第三方库（three.js、fflate）
└── modules/
    ├── core/            # 状态、常量、工具
    ├── renderer/        # Three.js 场景、后处理
    ├── gameplay/        # 判定、输入、回放、自动谱面
    ├── audio/           # 音频分析、音效
    ├── input/           # 键盘 / 鼠标绑定
    ├── ui/              # HUD、菜单
    └── effects/         # 环境光效、粒子
```

## Issue 模板

提交 Issue 时请包含：

- **浏览器版本**（Chrome / Edge / Firefox）
- **操作系统**（Windows / macOS / Linux）
- **复现步骤**
- **期望行为** 与 **实际行为**
- **控制台错误截图**（如有）

## Pull Request 流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'feat: add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 打开 Pull Request

PR 合并标准：
- [ ] `node test/smoke.js` 通过
- [ ] 代码符合上述规范
- [ ] 已补充/更新相关注释（如有必要）
- [ ] 无敏感信息 / 硬编码密钥

## 行为准则

- 保持友好和尊重
- 接受建设性批评
- 关注对社区最有利的事情

## 许可证

[MIT](LICENSE)
