# Beat Slash

[![Smoke Test](https://github.com/kkiytb/beat-slash/actions/workflows/smoke.yml/badge.svg)](https://github.com/kkiytb/beat-slash/actions/workflows/smoke.yml)

本地谱面播放器，支持导入 Beat Saber 自定义谱面（zip / Info.dat），在浏览器中直接游玩。

## 功能特性

- 导入标准 Beat Saber zip 谱面包
- 4 键位模式（2 / 4 / 8 向）
- 鼠标 + 键盘双输入
- 自动 / 演示模式
- 音频分析一键生成三档难度谱面
- 本地回放 + 幽灵回放（最佳录像）
- 视频录制（WebM）自动下载
- 多套界面主题（赛道 3D / 经典 / 黑金 / 极简）
- 高画质 / 流畅优先画质切换
- 练习速度调节（×0.50 / ×0.75 / ×1.00）
- 实时判定统计、连击、血量、Acc

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/kkiytb/beat-slash.git
cd beat-slash

# 2. 启动本地静态服务器（需要 Node.js）
npx serve .
# 或
python -m http.server 8080
```

然后用浏览器打开 `http://localhost:8080`（或 `npx serve` 显示的地址）。

### 导入谱面

点击「更换谱面」选择 `.zip` 文件，等待分析完成后点击「开始」即可。

## 技术栈

- 原生 JavaScript（ES Modules）
- Three.js（WebGL 渲染）
- Web Audio API
- Canvas 2D（HUD / Timeline）

无构建步骤、无依赖包，开箱即用。

## 项目结构

```
├── index.html          # 主页面
├── css/
│   └── style.css       # 全局样式
├── js/
│   ├── main.js         # 入口：UI 绑定、文件加载、流程控制
│   ├── game_new.js     # 游戏循环、初始化、输入调度
│   ├── chartloader.js  # Beat Saber zip / Info.dat 解析
│   ├── dancers.js      # 舞蹈小人模型
│   ├── vendor/         # 第三方库（three.js、fflate）
│   └── modules/
│       ├── core/       # 状态、常量、工具
│       ├── renderer/   # Three.js 场景、后处理
│       ├── gameplay/   # 判定、输入、回放、自动谱面
│       ├── audio/      # 音频分析、音效
│       ├── input/      # 键盘 / 鼠标绑定
│       ├── ui/         # HUD、菜单
│       └── effects/    # 环境光效、粒子
└── test/
    └── smoke.js        # 静态 smoke test
```

## 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing`)
5. 打开 Pull Request

请确保：
- 代码通过 `node test/smoke.js` 静态检查
- 保持现有代码风格（ES Modules、2 空格缩进）
- 魔法数提取为 `js/modules/core/constants.js` 中的命名常量

## 开源协议

MIT License —— 详见 [LICENSE](LICENSE) 文件。
