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
├── app/                       # Nuxt 前端
│   ├── pages/                 # 页面
│   ├── components/            # Vue 组件
│   │   ├── auth/              # 登录组件
│   │   ├── banner/            # Banner 视差动画
│   │   ├── ranking/           # 排行榜
│   │   ├── nav/               # 导航/下拉菜单
│   │   └── common/            # 通用组件
│   ├── composables/           # 组合式函数
│   ├── layouts/               # 布局
│   ├── assets/css/            # 样式
│   └── types/                 # TypeScript 类型
├── server/                    # Nitro 服务端
│   ├── api/                   # API 路由
│   │   ├── auth/              # 登录认证
│   │   ├── ranking/           # 排行榜
│   │   └── user/              # 用户偏好
│   ├── db/                    # 数据库层
│   ├── middleware/             # 服务端中间件
│   ├── plugins/               # 服务端插件
│   ├── routes/                # 自定义路由
│   ├── tasks/                 # 定时任务
│   └── utils/                 # 工具函数
├── public/                    # 静态资源
├── scripts/                   # 工具脚本
├── test/                      # 测试
│   ├── unit/                  # 纯逻辑单元测试
│   ├── nuxt/                  # Nuxt 运行时测试
│   └── e2e/                   # 端到端测试
├── .github/workflows/         # CI/CD
├── Dockerfile                 # Docker 构建
├── docker-entrypoint.sh       # 容器入口脚本
├── nuxt.config.ts             # Nuxt 配置
├── uno.config.ts              # UnoCSS 配置
└── vitest.config.ts           # 测试配置
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查（Docker HEALTHCHECK） |
| `/api/ranking` | GET | 实时在线观看人数排行榜（5 分钟缓存） |
| `/api/ranking/personalized` | GET | 个性化排行推荐 |
| `/api/ranking/timestamp` | GET | 排行数据时间戳 |
| `/api/banners` | GET | Banner 数据集列表 |
| `/api/history` | GET | 用户观看历史（需 Cookie） |
| `/api/favorites` | GET | 用户收藏夹（需 Cookie） |
| `/api/auth/qr` | GET | 获取登录二维码 |
| `/api/auth/qr-check` | GET | 检查扫码状态 |
| `/api/auth/user` | GET | 当前登录用户信息 |
| `/api/auth/logout` | POST | 退出登录 |
| `/api/user/preferences` | GET / PUT | 用户偏好设置 |

## 环境变量

| 变量 | 默认值 | 必需 | 说明 |
|------|--------|------|------|
| `NUXT_ENCRYPT_KEY` | `dev-encrypt-key-change-in-production` | ✅ 生产必需 | B站 Cookie AES-256-GCM 加密密钥，生成方式：`openssl rand -hex 32` |
| `NUXT_API_GUARD_ALLOWED_ORIGINS` | `https://bilibili.zhyv.net` | ✅ 生产必需 | API 跨域白名单，设为你的部署域名（逗号分隔） |
| `NUXT_DB_PATH` | `./data/bilibili_rank.db` | 可选 | SQLite 数据库文件路径 |
| `NUXT_CACHE_WARMER_REFRESH_INTERVAL_MS` | `240000`（4 分钟） | 可选 | 排行榜缓存刷新间隔（毫秒） |

## 部署

### Docker（推荐）

镜像地址：[codmosz/bilibili-rank](https://hub.docker.com/r/codmosz/bilibili-rank)

```bash
# 生成加密密钥
ENCRYPT_KEY=$(openssl rand -hex 32)

# 创建数据目录并设置权限（容器内 nuxt 用户 UID 为 1001）
mkdir -p /home/bilibili-data && chown 1001:1001 /home/bilibili-data

# 启动容器
docker run -d \
  -p 23135:3000 \
  -v /home/bilibili-data:/app/data \
  -e NUXT_ENCRYPT_KEY="$ENCRYPT_KEY" \
  -e NUXT_API_GUARD_ALLOWED_ORIGINS="https://your-domain.com" \
  --restart unless-stopped \
  --name bilibili-rank \
  codmosz/bilibili-rank
```

**数据持久化**：SQLite 数据库位于容器内 `/app/data/bilibili_rank.db`，通过 `-v` 挂载到宿主机目录。镜像内置 entrypoint 脚本会自动修正挂载目录的权限（宿主机目录属主需为 UID 1001）。

**健康检查**：镜像内置 `HEALTHCHECK`，每 30 秒探活 `/api/health`：

```bash
# 查看健康状态
docker inspect bilibili-rank --format='{{.State.Health.Status}}'

# 手动测试
curl http://localhost:23135/api/health
```

### 本地构建

```bash
docker build -t bilibili-rank .
```

### Node.js 直接运行

```bash
npm run build
node .output/server/index.mjs
```
