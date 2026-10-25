# iToo Image / Nova 本地开发与线上发布

更新于2026-10-26，Asia/Shanghai。开发仓库：`G:\Codex_x\中转站\nova-image-studio`；正式入口：`https://img.itoo.me`。

## 当前代码与线上版本

- 本地 `main` 与 GitHub `origin/main` 当前提交为 `e5c2eb99723a27bd4b9085dfa750a219bdde48fc`。线上镜像 `godissogood/nova-image-studio:release-20261026-e5c2eb9` 的 revision 精确匹配该提交，image ID 为 `sha256:9d26d6a63c34f67e6e66d49d763265b764daaab43ee52428af2a65d617614266`。
- 线上容器使用 Node `v22.23.4`，healthy、0重启。数据仍挂载于 `/opt/nova-image-studio/data`，端口仅绑定 `127.0.0.1:3000`，网络为 `itoo-internal`，内部上游为 `http://sub2api:8080`。服务器容器日志轮转 `20m × 5` 已生效。
- 服务器 Git 工作树 `/opt/nova-image-studio` 保留其原有 `deploy/ovh/docker-compose.yml` 修改，未强行切换工作树；本次镜像由 GitHub 精确提交归档构建。运行容器记录的 Compose 文件为 `/opt/nova-releases/nova-20261026-e5c2eb9/source/deploy/ovh/docker-compose.yml`，项目目录仍设为 `/opt/nova-image-studio/deploy/ovh`，所以数据路径没有变化。
- 本轮发布前官方 `upstream/main` 曾核对为 `b8cd44cc083a0429f8df6a7c9fc5b935b7ae0731` 并已合入；这是2026-10-25历史核对值，不代表本轮再次查询官方远端。

## 日常开发：一个入口同时运行前端与后端

本机依赖已经安装；使用 PowerShell：

```powershell
Set-Location 'G:\Codex_x\中转站\nova-image-studio'
npm run dev:local
```

浏览器打开 `http://127.0.0.1:3000`。这个命令显式设置 `NODE_ENV=development`、`HOSTNAME=127.0.0.1`，通过后端的 Next.js 开发集成同时提供页面、`/api/nova/*` 和 WebSocket。前端修改支持热更新；后端代码修改后在终端按 Ctrl+C，再重新运行命令。

`backend/.env` 保存本地配置。当前已有该文件，不要从生产复制或覆盖；在新机器上才从 `backend/.env.example` 建立。默认端口为3000，另有进程占用时先核对进程，或在当前终端执行 `$env:PORT='3002'` 后启动，并访问对应端口。

`npm run dev` 沿用原有行为：先构建，再以 production 模式运行，修改前端后需要重新构建。`npm run dev:frontend` 只提供 Next.js 前端开发服务；完整业务联调推荐使用上面的 `dev:local`。

本次修复了开发模式把 URL 字符串当作 Next.js 已解析 URL 对象传入的问题，改由 Next.js 从请求解析路径，避免首页 `Invalid URL` / HTTP500。修复不改变 production 静态站点的路由分支。

## 本地数据与模型连接

本地 SQLite、生成文件属于本地环境；生产数据仍在服务器 `/opt/nova-image-studio/data`。浏览器的配置、Agent会话、画布及部分素材按 origin 保存在 localStorage/IndexedDB，本地页面和正式域名的浏览器数据彼此独立。需要已有模板时，通过产品备份导入功能迁移所需配置；含 Key 的备份只在用户本机妥善保存。

本地后端的模型请求由服务端 `NOVA_API_BASE_URL` 决定，缺省为 `https://api.itoo.me`；线上保持 `http://sub2api:8080`。客户端仍显示固定的 `https://api.itoo.me`。界面、交互和协议排查可以使用模拟接口；真实生成使用用户自己的测试 Key，经正式中转按正常规则计费。

视频插件如果要求上游通过 URL 拉取参考图片/视频，本地 `127.0.0.1` 无法被上游访问。此类真实生成需要单独可公网访问的测试素材入口和匹配的 `NOVA_PUBLIC_BASE_URL`；本地页面和普通 API 调试无需开放公网入口。

## 验收与发布

本机 Node 是 `v24.15.0`，当前生产镜像固定 `v22.23.4`。本机已验证 SQLite原生模块可用。发布时仍要在目标 Linux/Node 镜像内测试和构建；不要把 Windows 的 `node_modules` 复制到生产。

本地按改动范围验证；完整发布基线为：

```powershell
Set-Location 'G:\Codex_x\中转站\nova-image-studio'
npm run lint
npm run test:run
npm --prefix backend test
npm --prefix backend run plugins:verify
$env:NODE_ENV='production'
npm run build
npm start
```

发布前在本地生产预览检查实际改动涉及的设置、图片、视频、Agent、画布、素材、手机/深浅色和刷新状态。上面命令中的 `npm start` 会占用当前终端，按 Ctrl+C 停止。重新进入热更新模式用 `npm run dev:local`。

现有发布方式是**提交推送后，再执行部署**。仓库目前只有 `desktop-release.yml`：它用于 Electron 安装包，不会自动发布 `img.itoo.me`。`git push` 本身不会更新线上网站。

一次网站发布按以下顺序执行：

1. 检查本地与服务器工作树，保留已配置的日志轮转等运维改动；将本次要发布的源码纳入明确提交，推送我们的 `origin/main`。
2. 服务器取同一个提交，在固定 Node 基础上构建独立版本标签的镜像；完成后端测试、插件、SQLite兼容和候选启动验证。
3. 备份服务器配置和必要数据，保留旧安全镜像和回退入口。核对 Nova 队列及在途任务后选择切换时机。
4. 更新持久 Compose 镜像标签，只重建 `nova-image-studio`，保留数据挂载、回环端口和 `itoo-internal`。正常发布 Nova 无需重建正式 Sub2API、数据库、Redis或Caddy。
5. 检查容器健康、实际源码revision、内网上游和公网资源，执行本次修改的浏览器交互回归；失败时切回旧镜像，避免用旧数据覆盖新任务。

历史发布脚本 `output/nova-upgrade-release-2026-10-22/release.py` 固定了旧提交、标签和发布前状态，只能作为流程参考。本轮生成了独立发布流程 `output/nova-release-2026-10-26/release.py` 与对应阶段脚本，没有重跑旧脚本。

## 2026-10-23 开发入口验证

本次使用独立本地数据库/媒体目录、关闭模型目标，只检查开发模式启动、页面与API。修复后首页、配置接口和插件接口均200；后端lint通过、现有124项测试通过。未发真实模型调用，未修改生产数据，未部署本次修复。本地测试服务在检查后关闭。

证据见工作区 `output/nova-dev-workflow-2026-10-23/`。该启动检查不代表全部界面交互或付费模型已验收。

## 2026-10-26 发布验收

本地验证：`npm run lint`、`npm run test:run`（76文件/708项）、`npx tsc --noEmit`、`npm --prefix backend test`（126项）、`npm --prefix backend run plugins:verify`、`npm run build` 与 `git diff --check` 均通过。Vitest 保留已知的 JSX 非布尔属性提示和 jsdom 相对插件API URL错误日志，测试退出码为0。

服务器候选验证基于固定 Node `v22.23.4` 镜像：后端126/126、插件校验、better-sqlite3 原生模块和隔离候选容器首页/config API 通过。公网 `https://img.itoo.me/` 与 `/api/nova/config` 均200。MCP 在1604×889浏览器检查设置弹窗和视频插件页，Base URL 为只读、API Key 为密码框、“保存并检查”可见；控制台 error/warn 为空，未提交配置或调用真实模型。

切换前任务队列计数均为0。切换后 Nova healthy/0重启、源码 revision 与目标提交一致、Node仍为 `v22.23.4`，首页/config API为200，SQLite `quick_check=ok`、队列仍为0；其他容器ID和 Caddy PID 未变化，数据挂载、回环端口、`itoo-internal` 与内部上游保持，日志轮转 `20m × 5` 生效。服务器 `.env`、Compose、SQLite在线一致性副本与媒体目录备份：`/root/nova-backups/pre-nova-e5c2eb9-20261026/`。旧镜像 `godissogood/nova-image-studio:upgrade-d27f6cb-20261022` 保留；回滚入口：`sudo python3 /opt/nova-releases/nova-20261026-e5c2eb9/rollback.py`。

浏览器及服务器证据见工作区 `output/nova-release-2026-10-26/`，包括 `before.json`、`candidate.json`、`deploy.json`、`after.json` 和构建日志。发布未发送真实模型请求。
