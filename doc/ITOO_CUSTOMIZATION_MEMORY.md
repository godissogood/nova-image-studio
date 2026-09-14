# itoo.me 二开记忆

最后更新：2026-09-14

## 项目身份

- 官方上游：`https://github.com/tianjiangqiji/nova-image-studio.git`
- itoo fork：`https://github.com/godissogood/nova-image-studio.git`
- 生产域名：`https://img.itoo.me`
- API 中转：`https://api.itoo.me`
- OVH 项目目录：`/opt/nova-image-studio`
- OVH 容器：`nova-image-studio`
- 持久数据：`/opt/nova-image-studio/data`

Git 约定：`origin` 指向 itoo fork，`upstream` 指向官方仓库。生产服务器只跟踪 `origin/main`。

## 已完成

### 2026-09-14：本轮会话故障定位、图片取回修复与视频插件整理

1. Grok 图片结果处理已改为服务端托管。
   - Grok 文生图和图生图优先请求 `response_format: b64_json`，避免把临时跨域地址直接交给浏览器。
   - 仍返回 URL 时，原始来源写入 SQLite `task_image_sources`，客户端只收到本站 `/api/nova/images/{taskId}/{index}`。
   - 服务端下载限制来源域名/路径、DNS 私网、重定向、MIME、文件签名、32 MB、60 秒和并发数；不转发用户 API Key。
   - 下载失败不改变已完成任务，图片路由可在保留期内再次取回；旧任务读取时会迁移为本站地址。
   - `NOVA_GROK_MEDIA_BASE_URL` 只作为服务器显式配置的媒体来源，默认留空；已确认 `bya.re/v1/media/images/...` 当前不可直接取回，不能假定可用。

2. Agent 图片下载失败可恢复。
   - 任务 ID、完成状态和取回错误持久化到 IndexedDB。
   - “重新取回”只查询原任务并下载，不重新创建生图任务、不重复扣费。
   - 部分图片成功时按任务图片序号去重；刷新页面后仍可恢复；任务过期后清理取回入口。

3. 文本推理强度和超时已分层调整。
   - Agent：Medium；SSE 改为空闲 180 秒超时，只有连续无活动才中止，避免 45 秒墙钟误杀。
   - 提示词整理、图片描述、画布提示词：Low；切图 AI：Medium；复杂网页重建继续 High。
   - 已补充流超时、部分输出不重复重试和 Chat `reasoning_effort` 透传测试。

4. 视频插件显示名改为“视频插件”。
   - 仅修改 `backend/plugins/grok-video/manifest.json` 的显示名。
   - 插件 ID `grok-video`、模型、接口、历史任务和配置均保持不变。
   - 当前插件工作台没有通用的“提示词优化”按钮；可通过 Agent 整理后复制，或后续单独接入视频专用优化模板。
   - `grok-imagine-video-1.5` 的参考图仍按后端能力规则必填；无图时 Sub2API 会改写为 `grok-imagine-video`。账号池中只有部分账号支持 1.5，不能只放宽前端校验。

5. 本轮生产故障结论。
   - `No eligible Grok media accounts` 是 Sub2API 账号池没有可执行视频请求的路由错误，发生在生成前，不是提示词、播放或下载错误。
   - 生产 `Grok-Heavy` 组账号状态曾显示 active/schedulable，但账号模型映射不同；请求模型必须与实际账号能力匹配。
   - Agent 中显示长时间“正在识别图片描述”时，通常是生图已完成后额外的视觉描述请求等待；中转站生图使用记录不包含这一步。

6. 本轮提交与部署。
   - `0bcb3a2`：Grok 图片同源托管、任务重取、推理强度调整。
   - `d6f0bf0`：视频插件显示名改为“视频插件”。
   - OVH 当前镜像：`godissogood/nova-image-studio:d6f0bf0`；容器 `healthy`；公网首页和配置 API 返回 `200`；Sub2API 未重启。
   - 测试：前端 442 项、后端 48 项通过；构建通过；本轮按用户要求跳过浏览器验收。

### 2026-07-16：品牌文案与关于页精简

1. 用户可见的 `Nova Image` 品牌文案统一改为 `iToo Image`。
   - 覆盖页面标题、桌面与移动端工作区标题、PWA 清单、备份元数据、部署包描述和服务启动提示。
   - Logo 图片保持不变。
   - `nova-*` 存储键、API 路由、函数名、仓库名和容器名等技术标识保持不变，避免破坏兼容性。

2. 设置页的“关于”只保留两个折叠区块。
   - `使用方法`：说明分别创建 GPT 推理与生图专用 API，完整配置图片和文本模型，再指定工作流默认模型。
   - `隐私条款`：保留原隐私说明。
   - 删除项目地址、数据来源、参考项目及关于页中的全部外部链接。

3. `frontend/src/lib/__tests__/itoo-customizations.test.ts` 增加品牌和关于页结构回归测试，防止上游升级重新引入旧品牌、额外区块或外链。

### 2026-07-15：itoo 专用模型配置

1. 保存模型配置后立即生效，不再要求刷新浏览器。
   - 共享 Hook：`frontend/src/hooks/useApiKeyStatus.ts`
   - 同页保存事件：`nova-model-registry-updated`
   - 跨标签页事件：`storage`

2. 所有模型的 Base URL 固定为 `https://api.itoo.me`。
   - 前端常量：`frontend/src/lib/itoo-config.ts`
   - 设置页 Base URL 只读。
   - 读取和保存模型注册表时均覆盖被篡改的 Base URL。
   - 后端任务、文本代理、模型检查三个入口忽略客户端 Base URL，只使用服务端 `NOVA_API_BASE_URL`。

3. 新增模型默认值：
   - 图片模型 ID：`gpt-image-2`
   - 文本模型 ID：`gpt-5.5`

4. 增加回归测试：
   - `frontend/src/hooks/__tests__/useApiKeyStatus.test.ts`
   - `frontend/src/lib/__tests__/itoo-customizations.test.ts`

### 2026-07-15：配置模型强制生效与内部中转

1. 删除所有运行时 `gemini-3-pro-image-preview` 默认值。
   - Agent、统一生图工作台、旧文生图/图生图表单、历史任务、重试任务和画布都必须经过 `normalizeModel()`。
   - 文生图使用 `defaults.textToImage`，图生图使用 `defaults.imageToImage`。
   - 旧缓存或 IndexedDB 中的模型已删除/未配置完整时，回退到对应任务默认模型，再回退到第一个完整图片模型。
   - 没有完整图片模型时返回空值并阻止提交，不再使用内置模型兜底。

2. Agent 模型选择约束。
   - Agent 会校验 IndexedDB 恢复值和提案中的模型 ID，只允许使用当前注册表中的完整图片模型。
   - 配置模型被删除或替换后，Agent 自动纠正并覆盖旧持久化值。
   - 最终创建任务前再次按文生图/图生图类型校验，避免旧页面状态绕过。

3. 配置热更新覆盖实际工作区。
   - 新增 `frontend/src/hooks/useModelRegistryRevision.ts`。
   - 同页 `nova-model-registry-updated` 和跨标签页 `storage` 都会刷新动态模型列表并重新校验当前模型。
   - 保存后 Agent 和生图工作台立即使用配置模型，不需要刷新浏览器。

4. Nova 与 Sub2API 改为服务器内部通信。
   - 共享 Docker 网络：`itoo-internal`。
   - Nova 服务端上游：`http://sub2api:8080`。
   - 浏览器设置页仍显示只读公网地址 `https://api.itoo.me`。
   - Sub2API 同时保留原 `sub2api-network`，PostgreSQL 和 Redis 不加入共享网络。

5. 生产入口加固。
   - Caddy 已删除 `http://15.204.115.6` 裸 IP 站点。
   - UFW 已启用：默认拒绝入站、允许出站、允许 `22/tcp`，仅允许 Cloudflare 官方 IPv4/IPv6 网段访问 TCP `80/443`。
   - `3000`、`8080` 只绑定 `127.0.0.1`；PostgreSQL `5432` 和 Redis `6379` 没有宿主机端口映射。
   - 公网实测源站 IP 仅 `22` 可达，`80/443/3000/8080/5432/6379` 均被阻断。

6. 验收结果。
   - `npm run test:run`：7 个测试文件、44 个测试全部通过。
   - `npm run build`：Next.js 生产构建和 TypeScript 检查通过。
   - Playwright 线上验证：保存设置后未刷新，Agent 和生图工作台均立即显示配置图片模型；新增 ID 默认值为 `gpt-image-2` / `gpt-5.5`。
   - 控制台只有 Chromium 的 password-field verbose 提示，没有应用错误。

## 安全不变量

以下约束在合并任何官方更新时都不能丢失：

1. “输入框只读”只是界面约束，不是安全边界。
2. `backend/server.js` 必须继续通过 `resolveConfiguredUpstreamBaseUrl()` 生成真实上游地址。
3. 客户端提交的 `baseUrl` 不得用于 `fetch()` 目标，否则会重新引入 SSRF 和用户 Key 外送风险。
4. 导入旧备份或手动修改 `localStorage` 后，`loadRegistry()` 和 `saveRegistry()` 必须继续强制 `ITOO_API_BASE_URL`。
5. API Key 只保存在用户浏览器并随请求提交，不得写入 Git、镜像或服务端配置文件。
6. Agent、工作台、重试和画布不得重新引入硬编码图片模型兜底；所有任务提交前必须校验模型仍在完整注册表中。
7. 生产 `NOVA_API_BASE_URL` 必须保持 `http://sub2api:8080`，公网 `https://api.itoo.me` 只用于用户和外部 API 客户端。
8. `itoo-internal` 只连接 Nova 与 Sub2API，不得把 PostgreSQL 或 Redis 加入该共享网络或暴露到公网。
9. 更新 Cloudflare 官方 IP 段时必须先保留 SSH 规则，并在新 SSH 会话和两个公网域名都验证成功后结束维护。

## 待完成

- 当前无本轮功能待办。
- 上游当前 lint 基线不干净：前端存在 7 个错误和 10 个警告，后端存在 1 个未使用函数错误。应在独立维护分支处理，避免与功能升级混在一起。
- Docker 构建时前端依赖审计报告 12 个漏洞（含 1 个 critical）。升级依赖需要单独评估兼容性，不执行 `npm audit fix --force` 式破坏性更新。
- 每次上线后继续补记生产提交号、镜像标签和验收结果。

## 官方升级合并流程

不要直接在生产 `main` 上盲目执行合并。按以下流程操作：

```bash
git fetch origin
git fetch upstream
git switch main
git pull --ff-only origin main
git switch -c sync/upstream-YYYYMMDD
git merge --no-commit --no-ff upstream/main
```

冲突处理和审查重点：

1. 先阅读官方变更日志和 `git diff main...upstream/main`。
2. 重点检查本文件“安全不变量”列出的代码位置。
3. 保留官方的功能修复，同时重新套用 itoo 常量、后端上游强制策略和配置事件同步。
4. 运行 `npm run test:run`、`npm run lint`、`npm run build`。
5. 本地浏览器验证设置保存、新增模型默认值、Base URL 只读和实际请求地址。
6. 合并临时分支到 `main`，推送 `origin/main`，再部署 OVH。

建议使用以下命令确认定制没有被覆盖：

```bash
rg "ITOO_API_BASE_URL|resolveConfiguredUpstreamBaseUrl|nova-model-registry-updated" frontend backend
```

## OVH 部署流程

部署文件位于 `deploy/ovh/`。生产 `.env` 不提交 Git，只保留 `.env.example`。

部署前确认共享网络存在，并且 Sub2API 已加入该网络：

```bash
sudo docker network inspect itoo-internal
sudo docker inspect sub2api --format '{{json .NetworkSettings.Networks}}'
```

```bash
cd /opt/nova-image-studio
git pull --ff-only origin main
git rev-parse --short HEAD
sudo docker compose --env-file deploy/ovh/.env -f deploy/ovh/docker-compose.yml build
sudo docker compose --env-file deploy/ovh/.env -f deploy/ovh/docker-compose.yml up -d
```

上线验收：

```bash
sudo docker inspect nova-image-studio --format '{{.State.Health.Status}}'
curl -I https://img.itoo.me/
curl -i https://img.itoo.me/api/nova/config
```

还需要用真实浏览器确认页面渲染、设置交互和控制台错误。部署生图站时不得修改或重启 `sub2api`。

## 部署记录

| 日期 | Git 提交 | 镜像标签 | 结果 |
| --- | --- | --- | --- |
| 2026-07-15 | `9760aaf` | `godissogood/nova-image-studio:9760aaf` | OVH `healthy`；公网/API `200`；固定上游伪造测试通过；Playwright 页面、默认值、只读属性和控制台验收通过 |
| 2026-07-15 | `da93aae` | `godissogood/nova-image-studio:da93aae` | OVH `healthy`；模型配置即时生效；Agent/工作台使用配置模型；Nova 内部直连 Sub2API；Cloudflare-only 防火墙验收通过 |
| 2026-07-16 | `b9011a2` | `godissogood/nova-image-studio:b9011a2` | OVH `healthy`；公网首页与配置 API `200`；品牌改为 `iToo Image`；关于页只保留使用方法和隐私条款；桌面/手机与线上 Playwright 验收通过；控制台 0 错误、0 警告 |
| 2026-07-23 | `71877c7` | `godissogood/nova-image-studio:71877c7` | OVH `healthy`；公网首页 `200`；GPT Image 2 工作台隐藏风格参数；旧客户端的 `style` 在 Nova 入队和 JSON/multipart 请求构造中均被移除；烟囱请求已到达上游但因 `503 No eligible Grok media accounts` 失败，未再出现 `tools[0].style`；Playwright 参数面板验收通过 |
| 2026-09-14 | `d6f0bf0` | `godissogood/nova-image-studio:d6f0bf0` | OVH `healthy`；视频插件显示名改为“视频插件”，插件 ID 与接口保持不变；公网首页 `200`；Sub2API 未重启 |
| 2026-09-14 | `0bcb3a2` | `godissogood/nova-image-studio:0bcb3a2` | OVH `healthy`；公网首页与配置 API `200`；Grok 图片优先请求 `b64_json`，URL 结果改为本站同源地址并通过受限服务端下载；新增任务图片来源持久化和失败后重取；Agent 下载失败保留原任务并提供“重新取回”；Agent 流改为空闲超时，简单提示词整理/图片描述 Low，Agent Medium；前端 442 项、后端 48 项测试通过；按用户要求跳过浏览器验收；未重启 Sub2API |

本次服务器回滚备份：

- Nova Compose 与 `.env`：`/root/nova-backups/pre-internal-routing-20260715-2308/`
- 本次品牌更新前 `.env`：`/root/nova-backups/nova-env-pre-b9011a2-20260716`
- Sub2API Compose：`/opt/sub2api/docker-compose.yml.bak.pre-internal-routing-20260715-2308`
- Caddy：`/etc/caddy/Caddyfile.bak.pre-cloudflare-only-20260715-2322`
- UFW：`/etc/ufw/user.rules.bak.pre-cloudflare-only-20260715-2325`、`/etc/ufw/user6.rules.bak.pre-cloudflare-only-20260715-2325`
