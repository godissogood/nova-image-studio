# iToo Image / Nova 本地开发与线上发布

2026-10-23，北京时间。开发仓库：`G:\Codex_x\中转站\nova-image-studio`；正式入口：`https://img.itoo.me`。

## 当前代码与线上版本

- 本地和 GitHub `origin/main` 已提交的 HEAD 都是 `1b65dcbb1f878a94e530cb7455b1bfbfc1564c58`，这是发布记录文档提交。
- 线上 Nova 3.4.0 的实际业务提交是 `d27f6cbe21ef8435d74679c6a6fd2af16e314fd6`。本地包含该提交；它到上述 HEAD 之间仅有文档差异。
- 截至本次核查，官方 `upstream/main` 仍是 `b8cd44cc083a0429f8df6a7c9fc5b935b7ae0731`，已完整合入，保留 iToo 的界面、模型配置、媒体和内部转发定制。以后判断是否最新应重新查询远端。
- 本次本地补了开发启动修复、`dev:local` 命令与本文档，尚未提交或部署；此前日志轮转模板的5行修改也保留在工作树。线上仍运行上面的原业务提交。

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

历史发布脚本 `output/nova-upgrade-release-2026-10-22/release.py` 固定了旧提交、标签和发布前状态，应作为已验收流程的参考。新发布应生成对应本次提交的参数/脚本，不能把旧脚本直接重跑当通用部署命令。部署前还需处理服务器现有的5行日志模板修改。

## 本次验证记录

本次使用独立本地数据库/媒体目录、关闭模型目标，只检查开发模式启动、页面与API。修复后首页、配置接口和插件接口均200；后端lint通过、现有124项测试通过。未发真实模型调用，未修改生产数据，未部署本次修复。本地测试服务在检查后关闭。

最新证据与运行时间见工作区 `output/nova-dev-workflow-2026-10-23/`。本次启动检查不代表全部界面交互或付费模型已验收。
