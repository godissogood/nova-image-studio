# itoo.me 二开记忆

最后更新：2026-07-15

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

## 安全不变量

以下约束在合并任何官方更新时都不能丢失：

1. “输入框只读”只是界面约束，不是安全边界。
2. `backend/server.js` 必须继续通过 `resolveConfiguredUpstreamBaseUrl()` 生成真实上游地址。
3. 客户端提交的 `baseUrl` 不得用于 `fetch()` 目标，否则会重新引入 SSRF 和用户 Key 外送风险。
4. 导入旧备份或手动修改 `localStorage` 后，`loadRegistry()` 和 `saveRegistry()` 必须继续强制 `ITOO_API_BASE_URL`。
5. API Key 只保存在用户浏览器并随请求提交，不得写入 Git、镜像或服务端配置文件。

## 待完成

- 当前无功能待办。
- 每次上线后补记生产提交号、镜像标签和验收结果。

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
| 2026-07-15 | 待本轮提交 | 待本轮部署 | 待验收 |
