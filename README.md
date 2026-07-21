# bilibili_rank_vue

> B站实时在线观看人数排行榜 — Nuxt 重构版

原项目：[bilibili_rank_html](https://github.com/CosmosZ-code/bilibili_rank_html)  
部署地址：[bilibili.zhyv.net](https://bilibili.zhyv.net/)

## 技术栈

- **框架**: Nuxt 4（Vue 3 Composition API + Nitro 服务端引擎）
- **样式**: UnoCSS（原子化 CSS）+ CSS Variables（B站色系）
- **状态管理**: Composables（useRanking / useBanner / useHistory / useFavorites）
- **服务端**: Nitro — `server/api/` 代理 B站 API
- **测试**: Vitest + @nuxt/test-utils

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 预览生产构建
npm run preview
```

## 测试

```bash
# 运行所有测试
npm test

# 单元测试（纯逻辑，不依赖 Nuxt 运行时）
npm run test:unit

# E2E 测试
npm run test:e2e

# 单次运行
npm run test:run
```

## 项目结构

```
├── app/
│   ├── components/       # Vue 组件
│   │   ├── banner/       # Banner 视差动画
│   │   ├── ranking/      # 排行榜
│   │   ├── nav/          # 导航/下拉菜单
│   │   └── common/       # 通用组件
│   ├── composables/      # 组合式函数
│   ├── layouts/          # 布局
│   ├── pages/            # 页面路由
│   ├── server/           # Nitro 服务端
│   │   ├── api/          # API 路由
│   │   └── utils/        # 服务端工具
│   └── types/            # TypeScript 类型
├── public/               # 静态资源
│   └── assets/           # Banner 图层图片 + data.json
├── test/                 # 测试
│   ├── unit/             # 纯逻辑单元测试
│   └── e2e/              # 端到端测试
└── nuxt.config.ts        # Nuxt 配置
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ranking` | GET | 实时在线观看人数排行榜（5分钟缓存） |
| `/api/banners` | GET | Banner 数据集列表 |
| `/api/history` | GET | 用户观看历史（需 Cookie） |
| `/api/favorites` | GET | 用户收藏夹（需 Cookie） |
| `/api/cookie` | POST | 保存 B站 Cookie |

## 部署

### Node.js 服务器

```bash
npm run build
# 输出 .output/，使用 node .output/server/index.mjs 启动
```

### Vercel / Netlify

修改 `nuxt.config.ts` 中的 `nitro.preset` 为对应平台。

## 与旧版本的区别

| 旧版 | 新版 |
|------|------|
| 666 行单文件 HTML | 模块化 12+ Vue 组件 |
| 静态 data.json | 实时 B站 API + 5min 缓存 |
| innerHTML 渲染 | Vue 响应式渲染（自动 DOM diff） |
| 全局变量 | Composables + 响应式状态 |
| 无测试 | 130+ 单元/E2E 测试 |

## License

ISC
