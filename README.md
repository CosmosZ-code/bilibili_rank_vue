# bilibili_rank_vue

> B站实时在线观看人数排行榜 — Nuxt

部署地址：[bilibili.zhyv.net](https://bilibili.zhyv.net/)

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

## 环境变量

| 变量 | 默认值 | 必需 | 说明 |
|------|--------|------|------|
| `NUXT_ENCRYPT_KEY` | `dev-encrypt-key-change-in-production` | ✅ 生产必需 | B站 Cookie AES-256-GCM 加密密钥，生成方式：`openssl rand -hex 32` |
| `NUXT_API_GUARD_ALLOWED_ORIGINS` | `https://bilibili.zhyv.net` | ✅ 生产必需 | API 跨域白名单，设为你的部署域名（逗号分隔） |
| `NUXT_DB_PATH` | `./data/bilibili_rank.db` | 可选 | SQLite 数据库文件路径 |
| `NUXT_CACHE_WARMER_REFRESH_INTERVAL_MS` | `300000`（5 分钟） | 可选 | 排行榜缓存刷新间隔（毫秒） |
| `GITHUB_TOKEN` | — | 可选 | GitHub 个人访问令牌，提升 Banner 同步 API 限流（60→5000 req/h） |

## 部署

### Docker（推荐）

镜像同时发布到 Docker Hub 与 GHCR：

- Docker Hub：[codmosz/bilibili-rank](https://hub.docker.com/r/codmosz/bilibili-rank)
- GHCR：`ghcr.io/cosmosz-code/bilibili-rank`

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

**数据持久化**：`/app/data` 目录包含 SQLite 数据库和 Banner 数据。挂载到宿主机后，容器删除重建也不丢失。镜像内置 entrypoint 脚本会自动修正挂载目录的权限（宿主机目录属主需为 UID 1001），并在 Banner 目录为空时从内置素材初始化。

**健康检查**：镜像内置 `HEALTHCHECK`，每 30 秒探活 `/api/health`：

```bash
# 查看健康状态
docker inspect bilibili-rank --status='{{.State.Health.Status}}'

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

> 生产环境需要配置 `NUXT_ENCRYPT_KEY` 等环境变量，见[环境变量](#环境变量)。

## 测试

```bash
# 运行所有测试
npm test

# 单元测试（纯逻辑，不依赖 Nuxt 运行时）
npm run test:unit

# 需要完整 Nuxt 上下文的测试
npm run test:nuxt

# E2E 测试（真实服务器）
npm run test:e2e

# 单次运行
npm run test:run
```

## 技术栈

- **框架**: Nuxt 4（Vue 3 Composition API + Nitro 服务端引擎）
- **样式**: UnoCSS（原子化 CSS，快捷方式 `btn` / `btn-active` / `btn-hover`）+ CSS Variables（B站色系）
- **状态管理**: Composables — `useVideoList` / `useAuth` / `useBanner` / `useFavorites` / `useHistory` / `useScrollToTop` / `useToast` / `useTouchDevice` / `useTouchDropdown`
- **数据库**: SQLite（sql.js WASM + Drizzle ORM），存储用户会话、加密 Cookie 与偏好
- **服务端**: Nitro — `server/api/` 代理 B站 API（WBI 签名 + buvid 设备指纹防风控）
- **测试**: Vitest（unit / nuxt / e2e 三个 project）+ @nuxt/test-utils

## 项目结构

```
├── app/                       # Nuxt 前端
│   ├── pages/                 # 页面（index.vue 单页 + 404）
│   ├── components/            # Vue 组件
│   │   ├── auth/              # 扫码登录
│   │   ├── banner/            # Banner 视差动画
│   │   ├── ranking/           # 视频/直播网格、控制栏、骨架屏
│   │   ├── nav/               # 导航/下拉菜单
│   │   └── common/            # BackToTop、SearchBox、Toast
│   ├── composables/           # 组合式函数（9 个，见技术栈）
│   ├── layouts/               # 布局
│   ├── assets/css/            # 样式
│   ├── data/                  # Banner 兜底数据
│   ├── types/                 # TypeScript 类型
│   └── utils/                 # 客户端工具（缓存、日期）
├── server/                    # Nitro 服务端
│   ├── api/                   # API 路由（ranking、live-rooms、auth、user…）
│   ├── db/                    # SQLite 数据库层（schema + init）
│   ├── middleware/            # api-guard（跨域白名单）、auth（登录校验）
│   ├── plugins/               # cache-warmer、banner-warmer、db-init
│   ├── routes/                # sitemap.xml
│   └── utils/                 # bilibili 客户端、banner 同步、加解密、mock 数据…
├── public/                    # 静态资源（favicon、logo、robots.txt）
├── test/                      # 测试
│   ├── unit/                  # 纯逻辑单元测试（无 Nuxt、无 DOM）
│   └── e2e/                   # 端到端测试（真实服务器）
├── .github/workflows/         # CI/CD（镜像构建）
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
| `/api/ranking` | GET | 实时在线观看人数排行榜（分页 / sortBy / search / purifyPercent，由 cache-warmer 定时刷新） |
| `/api/ranking/timestamp` | GET | 排行缓存毫秒时间戳（判断数据是否有更新） |
| `/api/ranking/personalized` | GET | 登录用户个性化增量视频（5 分钟缓存） |
| `/api/ranking/personalized-refresh` | POST | 强制刷新个性化缓存，返回增量视频列表 |
| `/api/banners` | GET | Banner 数据集（由 banner-warmer 预热，每 7 天从 GitHub 同步新数据） |
| `/api/history` | GET | 用户观看历史（需登录，max / view_at 分页） |
| `/api/favorites` | GET | 用户收藏夹（需登录，media_id / pn） |
| `/api/live-rooms` | GET | 直播排行（按在线热度排序，分页 / search / areaId 过滤） |
| `/api/live-areas` | GET | 直播一级分区列表（1 小时缓存） |
| `/api/live-rooms/timestamp` | GET | 直播缓存时间戳（支持 areaId） |
| `/api/auth/qr` | GET | 获取扫码登录二维码 |
| `/api/auth/qr-check` | GET | 轮询扫码状态，成功后建用户 / 存 Cookie / 建 session |
| `/api/auth/user` | GET | 当前登录用户信息 |
| `/api/auth/logout` | POST | 退出登录 |
| `/api/user/preferences` | GET / PUT | 用户净化阈值偏好（purifyPercent 0–100） |

## 核心机制

- **WBI 签名 + 设备指纹**：大部分 B站接口需要 WBI 签名（混排表 + MD5）；启动时预取 `bili_ticket` / `buvid` 设备指纹，降低风控概率
- **缓存预热**：`cache-warmer` 启动即预取设备指纹 → 预热排行榜缓存，之后按 `NUXT_CACHE_WARMER_REFRESH_INTERVAL_MS`（默认 5 分钟）定时刷新；排行榜与热门数据独立退避（30s→60s→120s→240s→480s），单 rid 逐分区重试
- **风控保护**：在线人数轮询每轮 ≤500 请求，失败视频 / 元数据 30 秒后单独重试
- **数据瘦身**：在线人数 <200 的视频从缓存剔除，避免低热度数据堆积
- **优雅降级**：B站不可达时返回 mock 数据（`MOCK_RANKING`）；页面路由 `'/'` 使用 SWR 缓存 600 秒

## Banner 数据

Banner 素材来自 [palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner) 仓库。`banner-warmer` 插件启动时扫描本地目录写入缓存（取最新 5 套），之后每 7 天自动从 GitHub 拉取新 Banner。

首次部署时，镜像内置的 Banner 素材会由 entrypoint 脚本自动写入数据目录，确保服务立即可用。

## 参考项目

- [bilibili-banner](https://github.com/palxiao/bilibili-banner) — Banner 素材数据源
- [bilibili-online-ranking](https://github.com/nbt0/bilibili-online-ranking) — 在线人数排行思路参考
