# itoo.me 二开记忆

## Nova 最新版推送与生产上线（2026-10-26）

本地 `main` 与 GitHub `origin/main` 已推进至 `e5c2eb99723a27bd4b9085dfa750a219bdde48fc`。线上 `https://img.itoo.me` 运行镜像 `godissogood/nova-image-studio:release-20261026-e5c2eb9`，image ID `sha256:9d26d6a63c34f67e6e66d49d763265b764daaab43ee52428af2a65d617614266`，源码 revision 精确匹配，Node `v22.23.4`、healthy、0重启。公网首页/config API为200；MCP检查设置弹窗和视频插件面板通过，控制台无 error/warn；未调用真实模型。

本地 lint、前端76文件/708项、TypeScript、后端126项、插件校验、生产构建和 diff check 通过；固定 Node 的服务器候选后端126/126、插件、SQLite和隔离启动均通过。发布前队列0，切换后队列0、生产 SQLite `quick_check=ok`；其他容器及Caddy未变化，原数据挂载、回环端口、`itoo-internal`和内部上游保持，Compose 日志轮转20m×5生效。服务器 `.env` 与Compose、SQLite一致性副本及媒体目录备份位于 `/root/nova-backups/pre-nova-e5c2eb9-20261026/`；回滚脚本 `/opt/nova-releases/nova-20261026-e5c2eb9/rollback.py`。服务器原 Git 工作树及Compose修改予以保留，部署镜像由GitHub精确提交归档构建。过程与证据见 `doc/LOCAL_DEVELOPMENT_AND_RELEASE.md` 及工作区 `output/nova-release-2026-10-26/`。Mem0 交接已保存至 `project:itoo-relay`，事件 `nova-release-20261026-e5c2eb9`；独立 GET 内容一致，MCP 检索命中。

## 设置保存提示与视频插件凭据保护（2026-10-26，本地预览）

设置弹窗底部原先以左侧文字提示保存结果，现改用顶部居中的 Toast，显示5秒并可手动关闭；错误提示带 `role="alert"` 与 assertive live region，成功/普通提示使用 status/polite。设置保存成功、配置不完整、浏览器存储失败和模型“保存并检查”结果均复用该 Toast。

MCP 在 `http://127.0.0.1:3000/` 以临时未完成的图片模型触发保存校验失败。屏幕截图确认红色提示覆盖在设置弹窗上方；DOM 显示提示位于视口顶部、`z-index:10000`，ARIA role 为 `alert`。删除临时模型后恢复到本次打开设置时的空配置，没有保存临时或空配置。成功提示复用相同组件及其无条件可见样式；为避免写入覆盖测试空配置，本轮未实际触发成功保存。

视频插件设置的 API Key 与 Base URL 字段调整为左侧只读固定 `https://api.itoo.me`、右侧 API Key 和较小说明，并增加“保存并检查”。前端保存逻辑固定该地址；后端 `grok-video` 执行器忽略客户端传入的 `baseUrl`，强制使用 iToo 中转入口。插件目录路径从设置页、空状态页面及插件注册表 API 摘要中隐藏。

验证通过：`npm run lint`、前端 `npm run test:run`（76文件/708项）、前端 `npx tsc --noEmit`、后端 `npm test`（126项）、`git diff --check`。Vitest仍有测试环境 `jsx` 非布尔属性提示及 jsdom 相对 `/api/nova/plugins` URL 解析错误日志，但测试退出码为0。MCP 当前页未捕获浏览器控制台 error/warn。3000本地预览保持打开；未提交、推送或上线。

## 模型配置备注命名和字段层级（2026-10-25，本地预览）

按用户要求直接在主项目 `nova-image-studio` 设置弹窗调整图片模型与文本推理模型：原“显示名称”改为“配置备注”，并与“内置模板”交换表单位置；新增模型分别按类型递增命名为“图片模型1、图片模型2…”和“文本模型1、文本模型2…”。切换图片/文本内置模板会更新协议、模型 ID、固定 Base URL 及能力参数，不再用模板名称覆盖配置备注。字段主标签“模型 ID”“API Key”使用14px，辅助说明“要调用的模型”“网站里创建的 API”使用12px。已有保存数据不会因本次改动被批量重命名。

MCP 在 `http://127.0.0.1:3000/` 核对图片模型1/2、文本模型1与字段层级；图片模型切换内置模板后“图片模型1”备注保持。测试新建的模型均未保存，并通过“丢弃更改”清除。`frontend/src/components/SettingsModal.tsx` 定向 ESLint、TypeScript 和 `git diff --check` 通过；未跑全量测试/构建，未提交、推送或上线。独立 `nova-ui-preview` 与线上均未改动。

## Ccode H3 前端继续隐藏（2026-10-25）

用户再次确认不需要在前端显示 Ccode H3，继续隐藏。`frontend/src/lib/plugin-registry-client.ts` 的 `HIDDEN_PLUGIN_IDS` 过滤保持不变，后端插件仍保留；MCP 核对设置→插件和视频工作台均未显示 Ccode H3，Grok 视频插件仍可见。没有填写密钥或提交任务；目标文件 ESLint 通过。检查期间曾见到指向 `frontend/src/app/layout.tsx` 主题初始化脚本的 Next.js 开发错误面板，本次未处理，也不把它归因于插件过滤。

## Nova 官方功能差异与 Electron 打包状态（2026-10-25，只读核查）

官方在线 `upstream/main` 为 `b8cd44cc083a0429f8df6a7c9fc5b935b7ae0731`（3.4.0）；本地已提交 `main` / `origin/main` 为 `1b65dcbb1f878a94e530cb7455b1bfbfc1564c58`，包含该官方提交且未发现整块缺失的官方文件。注意分清提交版和工作树：已提交版仍有供应商设置面板；当前未提交工作树已按用户决定移除它及模型目录导入客户端/测试。工作树仍保留 `provider-registry.ts`、模型迁移/关联、每模型 API Key 与协议配置；保存的 provider 数据不会因此整体删除。宽屏模式按钮和偏好已由响应式布局替代。官方 Ccode H3 插件代码仍在后端，但本地前端按既有决定隐藏。

Electron 主进程、`electron-builder.yml`、`electron:dist*` 命令与 `.github/workflows/desktop-release.yml` 在本地仍存在，且与官方配置一致。源码目标为 Windows NSIS、macOS arm64 ZIP、Linux AppImage；CI 只跑 Windows/macOS。GitHub API 于核查日显示官方及本站 fork 均为0个 Releases、官方桌面 workflow 为0次运行，本地没有 `release/` 目录或已构建产物。因此打包能力存在，但没有证据表明已有可下载的正式安装包。配置实际未声明 DMG，尽管 workflow 注释提到 `.dmg`；macOS 目前构建 ZIP。桌面安装产品名仍是 `Nova Image Studio`。

逐项证据与文件路径见 `G:/Codex_x/中转站/output/nova-feature-gap-audit-2026-10-25/对照报告.md`。Mem0 `project:itoo-relay` 精确交接 `nova-feature-audit-20261025-b8cd44cc` 已通过独立 GET、通用列表和 MCP 定向检索回读；普通 `mem0_add` 未返回新增片段，后按项目既有 `/v1/handoffs` 流程写入。本轮只读盘点，没有恢复供应商功能或改应用代码。

## Nova 设置弹窗文字层级与工作流默认模型区（2026-10-25，本地完成）

按用户要求将“按功能单独指定（可选）”从常用默认模型区拆开，作为模型配置页底部独立折叠区；九项工作流选择及模型检查保留在展开内容内。供应商管理入口继续移除。

设置弹窗统一文字层级：区块标题18px/600、次级标题16px/600、字段标签14px/500、正文和注释14px/24px行距。图片模型、文本推理模型、视频插件、备份和关于页面共用 `SettingsSectionHeading`，模型字段与插件凭据标签同步加强。

MCP在1719×811和390×844检查模型、插件、备份、关于四页；区块标题和正文层级可区分，窄屏插件字段转为单列，弹窗 `scrollWidth` 未超过可视宽度。最终将视口恢复默认，模型配置页保持打开。

前端 lint 和 TypeScript 通过，完整前端测试75个文件/705项通过，`git diff --check`通过。Vitest仍输出现有测试中的 `jsx` 属性与 jsdom 相对 `/api/nova/plugins` URL错误日志，但退出码为0。

MCP控制台留有14:42:23 UTC开发热更新阶段的hydration mismatch，以及 `ModelConfigurationPanel` / `advancedRef` 未定义错误。当前源码搜索不到这两个旧标识；当前设置弹窗能够正常渲染，后续页签检查未新增日志。该次热更新日志尚未单独复现或明确归因，不宣称本轮控制台全程零错误。3000本地预览仍监听；本地实施，未提交、未推送或上线。

## Nova 模型配置弹窗顺序调整，已在本地完成（2026-10-25）

按用户最新决定，设置弹窗顶部依次为“图片模型配置”“文本推理模型配置”，其后为“常用默认模型”。新增图片模型和新增文本推理模型是两个直接入口；不再提供“连接并添加模型”、读取模型目录、供应商页签或手动/高级配置折叠入口。模型模板、协议、ID、独立 API Key、默认用途、可选模型检查和统一保存逻辑保留。无模型时分别提示先添加图片模型或文本推理模型。

已移除无引用的`frontend/src/lib/provider-models-client.ts`及其专属测试；服务端目录代理未修改。MCP 在1604×889本地视口确认弹窗1024×858、标题顺序正确、目录/供应商入口不显示、控制台error/warn为0；点测两个新增入口均打开对应编辑表单并显示模板、模型 ID 与独立 API Key 字段，删除未保存草稿后回到空配置。`npm run lint`、`npm run test:run`（75文件/705测试）、`npx tsc --noEmit`、`git diff --check`通过。设置弹窗及模型配置均仅本地；未提交、推送或上线。

本节下方2026-10-24的“连接 Key→读取目录→批量添加”方案记录是先前版本，已由本次用户决定取代，不代表当前界面行为。

## Nova 工作区自适应与视口底部修复，已在本地完成（2026-10-25）

工作区以桌面布局为基调，根据视口宽度自动适配窄屏；宽屏切换按钮、旧 `nova-wide-mode` 偏好和画布/UI设计的宽屏门槛提示已移除。根工作区使用 `min-h-dvh` 并允许页面纵向滚动，画布随视口分配高度；修复 Dialog 关闭后的 body 滚动锁残留。窄屏下 Agent 会话栏使用抽屉，导航会将选中项滚入可视区域。

MCP 桌面检查视口为1604×889：无宽屏按钮，Agent 输入框及工具栏完整显示，documentElement高度889且滚动高度889，body高度存在1px浏览器取整差异，控制台error/warn为0。390×844及1024×768窄屏/中等宽度检查通过。`npm run lint`、`npm run test:run`（78文件/718测试）、`npx tsc --noEmit`、`git diff --check`通过。3000服务保留给用户本地预览；本次未提交、未推送、未上线。

Mem0：本次 `mem0_search` 与 `mem0_add` 均报工具错误，未获得有效写入或回读；本地已保存、Mem0 未完成。

页头光标：标题和描述是普通 `h2`/`p`，并非可编辑控件；浏览器默认将可选文字显示为 I 形鼠标指针。`.itoo-page-hero` 设置 `cursor: default` 后显示普通箭头，保留文字选择能力。MCP 已确认页头计算值为 `default`，真实 textarea/input 仍为 `text`。摘要已保存至 `project:itoo-relay` 并经定向搜索回读命中。

## 模型配置新手界面优化，已在本地完成（2026-10-24）

设置模型配置首屏改为“连接 Key → 选择模型 → 保存”的短路径。常用图片模型、常用文本模型直接可选；九项工作流默认模型放入“按功能单独指定”折叠区；管理 Key、已添加模型、手动添加与高级设置默认折叠。API地址固定展示`https://api.itoo.me`，模型目录读取后支持搜索、勾选、批量添加并在完成后自动收起。模板、自定义模型ID、协议、图片参数、备注、独立Key和原有独立功能模型选择均保留，常用模型选择不会覆盖独立功能配置。

涉及文件：`frontend/src/components/settings/CommonModelSettings.tsx`、`frontend/src/lib/model-defaults.ts`、`frontend/src/components/ModelConfigurationPanel.tsx`、`frontend/src/components/SettingsModal.tsx`及对应测试。前端717项测试、ESLint、TypeScript、生产构建和diff检查通过；桌面浅色/深色与390px窄屏设置回归通过，控制台错误/警告为0。证据：`G:/Codex_x/中转站/output/playwright/nova-model-onboarding-2026-10-24/`。本轮只改本地工作区，未提交、未推送、未上线，未发真实模型请求。

## 统一模型配置入口本地完成，未发布（2026-10-23）

设置中的“供应商”页签已合入“模型配置”。默认通过本站 Key 读取目录、搜索分页勾选后显式添加，统一保存；多 Key 配置可切换/备注/确认删除。原模板、自定义模型 ID/协议/参数、默认模型和独立 Key 保留在高级编辑，固定 API 地址和 registry 格式不变。已添加模型不重复导入；目录不自动保存；视频/音频提示转插件。换 Key/连接会取消旧请求。保存后再次编辑显示未保存，不完整模型会阻止保存。

前端709/709、零警告lint、TypeScript和生产构建通过；独立Edge模拟目录37条交互通过，包含旧配置迁移、模板/独立Key/默认关联、保存刷新3次、手机/深色/低高度，最终pageerror0。既有Agent测试改为等待effect后断言，不改业务。开发HMR探索曾出现insertBefore异常，干净刷新正常，根因未追查；没有真实模型/付费调用或生产镜像验收。

本轮只本地修改，HEAD仍1b65dcb，未提交/推送/上线；此前未提交开发入口和Compose日志改动保留。3000开发服务已保留运行，用户可刷新http://127.0.0.1:3000/后打开设置体验，实时状态需重核。下方11:46关闭服务为历史阶段，已被12:29重新启动覆盖。报告G:/Codex_x/中转站/output/playwright/nova-unified-models-2026-10-23/本地验收报告.md。

## 本地开发入口已修复，未发布

本次本地开发入口完善（2026-10-23 11:46:58）：backend/server.js开发分支改为handle(req,res)，修复Next.js解析URL导致首页500；package.json新增npm run dev:local，前后端同入口127.0.0.1:3000并支持前端热更新。实际脚本启动和三个HTTP入口200，后端lint及124/124测试通过，检查后服务已关闭。开发修复/命令/文档尚未提交或部署，保留之前5行Compose logging改动。线上仍d27f6cb/3.4.0；已提交本地/远端/生产HEAD1b65dcb一致。网站没有push自动部署，现有Actions仅桌面版；操作指引doc/LOCAL_DEVELOPMENT_AND_RELEASE.md，证据工作区output/nova-dev-workflow-2026-10-23/。

最后更新：2026-10-22

## 项目身份

- 官方上游：`https://github.com/tianjiangqiji/nova-image-studio.git`
- itoo fork：`https://github.com/godissogood/nova-image-studio.git`
- 生产域名：`https://img.itoo.me`
- API 中转：`https://api.itoo.me`
- OVH 项目目录：`/opt/nova-image-studio`
- OVH 容器：`nova-image-studio`
- 持久数据：`/opt/nova-image-studio/data`

Git 约定：`origin` 指向 itoo fork，`upstream` 指向官方仓库。生产服务器只跟踪 `origin/main`。

## 当前发布快照（2026-10-22 23:23，Nova 3.4.0 已上线）

- 用户明确授权推送上线，`main`已快进并推送业务合并提交 `d27f6cbe21ef8435d74679c6a6fd2af16e314fd6`；服务器从该提交构建，运行版本3.4.0。北京时间23:22:54–23:23:02仅切换Nova，镜像 `godissogood/nova-image-studio:upgrade-d27f6cb-20261022`，image `sha256:ec6a8cf65e5197de235a6349930c09a8c5630cc72e1d04cc9575a0198ed4cf78`，OCI revision为业务提交，Node22.23.4。后续文档提交不改变运行镜像revision。
- 本地升级前端699/699、最终零警告lint/TypeScript/生产构建；本次精确提交镜像后端124/124、插件、SQLite和无外网隔离启动通过。正式healthy/0重启，Nova首页/config/queue、Sub2API health200、SQLite quick_check=ok；CDP关闭且接口404。
- iToo模板/主题、原模型模板与默认配置/独立Key、固定地址/内部转发、Grok视频/图片托管和原任务重取定制保留。供应商管理、Agent多会话等新功能上线；Electron未打包发布。
- 公网Edge13条最终回归通过：全部9个Next.js脚本指纹与镜像一致；旧配置迁移/原2.5模板/独立Key、保存后刷新3次无#418、供应商读取失败重试/增删确认与丢弃、Agent增改切换/活动会话刷新、原工作台及Grok/H3隐藏、手机390设置/抽屉/关于和1440×600低高度纵向导航、无Key禁用。pageerror0、非预期console error0；模型列表模拟502有1条预期console error。未发真实模型或付费请求，未改生产模式/密码，配置只在独立浏览器内保存。
- 其它8容器ID/镜像/启动/重启/状态、Caddy PID3451512前后未变；固定内部转发、挂载、回环端口、共享网络保持。备份 `/root/nova-backups/pre-upgrade-340-20261022/`仅服务器保存，目录700/归档600；旧lint安全镜像保留，回滚 `sudo python3 /opt/nova-upgrade-release-20261022/rollback.py`未触发或演练，不覆盖上线后新数据。
- 本机23:16杀软命中的 `release.cpython-313.pyc` 为本地发布源码导入缓存，源码/哈希/签名核对未发现下载木马执行逻辑，更符合启发式误报；未确认厂商规则，也未关闭防护或加白。核查和发布报告 `G:/Codex_x/中转站/output/nova-upgrade-release-2026-10-22/`。

## 本地升级候选（2026-10-22 23:03历史阶段，后已推送上线）

以下未推送上线仅指候选阶段，已由上方23:23正式发布覆盖。

- 按用户授权从本站 `6edaf34` 开始，先提交 React #418 修复 `9910f03`，再在 `sync/upstream-20261022` 完整合并官方3.4.0固定 `b8cd44cc083a0429f8df6a7c9fc5b935b7ae0731`，包含此前11个上游提交。17个冲突按本站定制适配，不能再把该分支描述为尚未升级。最终提交见工作区报告/Git证据。
- 新增供应商管理/模型读取与用途、Agent多会话/后台任务、备份及协议/插件增强。保留原模型编辑器和模板、配置ID/备注/默认模型、`gpt-image-2.5`/Grok2.0与模型独立Key；供应商与模型编辑双向桥接，单模型修改Key不覆盖其它模型，同modelId不同配置不合并丢失，视频/音频/未启用条目保留。
- 前端 `https://api.itoo.me` 仍只读，迁移、保存与备份导入也固定地址；后端目标继续只由服务端 `NOVA_API_BASE_URL`决定。保留同页/跨标签Key热更新。#418通过 `useSyncExternalStore` 稳定服务端快照修复，保存刷新与hydration回归通过；生产旧版尚未包含它。
- iToo品牌、浅深色布局、手机/低高度导航保留；新增供应商表格不撑宽390px设置弹窗，各页签可横向滚动。Grok视频、前端隐藏H3、Grok图片同源托管与b64优先保留；Grok edits适配新`images`数组格式。
- Agent保留180秒空闲超时/keepalive/输出后不自动重发。重新取回只查询原任务和下载，前后台并发去重，部分图片按任务图片序号唯一，下载失败和刷新仍可恢复，过期/终态失败正确清理。
- 备份补齐活动会话/会话列表/CDP设置、动态 `nova-agent-db-${sessionId}` 与旧schema回退；完整备份恢复媒体，只有配置的备份保留会话文字并跳过媒体字节。全新上下文实测新旧会话与PNG/视频逐字节恢复通过。
- Electron入口与打包源码合入，但本轮没有打包或发布桌面应用；CDP仍关闭。Node三阶段继续固定22.23.4及原官方digest，生产Compose/网络/回环端口/挂载约定保留。
- 验证：前端699/699、最终ESLint零警告、TypeScript/生产构建、最终Node22.23.4候选后端124/124、插件及SQLite全部通过。原生产SQLite只读副本tasks8/items1一致，候选写入和事务回滚通过。浏览器25条最终通过，桌面/手机/恢复上下文pageerror均空，未发真实Key或付费请求。
- 候选image `sha256:c888ed1bde6183cf8cd2f203d8ad1e71cb82972287df4583807151a2e7338ecc`。本轮未推送、未发布；正式容器仍为下方21:05的lint版本、healthy，所有生产容器前后未变。豆包/百炼等属于协议/mock测试通过，不宣称生产全模型兼容。
- 报告 `G:/Codex_x/中转站/output/nova-upgrade-2026-10-22/升级验收报告.md`；最终浏览器结果和原始探索证据同目录。下方#418待修等结论保留为历史生产快照，不代表本地候选仍有该问题。

## 历史发布快照（2026-10-22 21:05）

- 已按用户要求提交、推送并上线：Node安全补丁 `2be5b95`，前端源码 `fcfe8bcc86203cfbbc0968aa114b7b8c70f36e7f`；镜像 `godissogood/nova-image-studio:lint-fcfe8bc-20261022`，image ID `sha256:eb914164af67bad3cc96798d9ae648b9e46e855fecd164022d571f0fdefbd958`，OCI revision为上述前端提交。后续仅文档提交不改变运行镜像源码revision。
- 北京时间21:05:47–21:05:56仅替换Nova；Node仍为安全版 `v22.23.4`，Compose持久镜像标签一致。Nova healthy/0重启，首页/config/queue与Sub2API health200，SQLite `quick_check=ok`；其它8容器和主Caddy PID未变，固定上游、挂载、回环端口和共享网络保持。
- 前端ESLint零错误/零警告、39文件443项、TypeScript和生产构建通过。候选镜像后端48项、插件9 fixtures、SQLite和无网络隔离启动通过；本地和公网各11组Edge交互均通过，详情见下方回归记录。公网所有 `_next`脚本指纹与运行镜像一致。
- 独立浏览器使用虚构Key和测试素材；提示词库模式/密码验证及画布AI响应仅浏览器模拟，没有真实上游或付费生成，未改生产开关/密码。保存配置刷新时存在React hydration #418，旧线上与本地在上线前已复现，尚未修复，不能称控制台零错误。
- 旧Node22.23.4安全镜像保留；备份 `/root/nova-backups/pre-lint-20261022/`，回滚 `sudo python3 /opt/nova-lint-release-20261022/rollback.py`，未触发/演练；不以旧Node漏洞镜像作为本轮回滚目标，不覆盖上线后数据。
- 报告 `G:/Codex_x/中转站/output/nova-lint-release-2026-10-22/发布验收报告.md`。生产原Dockerfile补丁已保留于服务器Git stash，本地、GitHub和生产仓库已同步业务提交，后续文档提交单独同步，无需再重建。

## 历史发布快照（2026-10-22 18:56）

以下未提交/未部署等描述仅指当时阶段，已由上方21:05发布覆盖。

- 北京时间18:56，仅替换Nova，Node `v22.23.2` → `v22.23.4`，处理 `CVE-2026-111497`；19:05复查 `healthy`、重启计数0，源站首页/config/queue均200，SQLite `quick_check=ok`。
- 生产镜像 `godissogood/nova-image-studio:node-22.23.4-20261022`，image ID `sha256:9e41e8e3ab1dc568e2164b0f6e27073288cffcebbd19251ee2ae05556da381c0`；生产 `.env` 持久镜像标签与Compose解析一致。
- 业务源码仍为 `e3c5a620a699f0711e7ea4a3fecb1b56abac801b`。本地及服务器Dockerfile安全补丁尚未commit/push，未合并上游或更新业务依赖；GitHub实时状态未在本轮确认。
- 三阶段基础镜像统一固定 `node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d`，digest已核实为官方OCI index。未来更新应保持明确版本并重新核对官方digest。
- 本地前端443项和生产构建、后端48项/后端lint/插件校验通过；候选镜像隔离复跑后端48项、插件9 fixtures及SQLite写读通过。前端lint当时为8错误/15警告，已于同日稍后在本地修复并通过零警告检查；该源码修复未部署，Node安全镜像不包含它。浏览器公网首页、设置和主要工作台可打开，Base URL只读，控制台0错误/0警告；未做真实Key或付费生成回归。
- 其它8容器ID/镜像/StartedAt/RestartCount/状态和主Caddy PID均与修复前一致；固定内部上游、共享网络、端口和数据挂载未变。没有重启Sub2API、PostgreSQL、Redis或重载主Caddy。
- 原有本定制文档未提交内容保留。私有配置与停服后数据备份在 `/root/nova-backups/pre-node-CVE-2026-111497-20261022/`，回滚脚本 `/opt/nova-node-fix-20261022/rollback.py`；旧镜像保留，自动回滚未触发，未演练回滚。
- 详细报告 `G:/Codex_x/中转站/output/nova-node-fix-2026-10-22/修复验收报告.md`。服务器urllib访问Cloudflare公网域名返回403，浏览器公网验证正常；报告分别记录此探测限制。

## 2026-10-22 前端 lint 修复（本地实施阶段，后已上线）

- 按用户要求修复原先9个文件中的8个ESLint错误和15个警告；涉及草稿导入、设置模型草稿、标注图片加载/重绘、提示词库模式同步、视频历史预览空值保护、缺失的回调依赖、静态导入，以及未使用代码清理。
- 最终验收：`npm run lint -- --max-warnings 0`零错误/零警告；`npm run test:run`为39个文件443项通过；`npx tsc --noEmit`与`npm run build`通过。测试输出中两条CanvasEditor用例有模拟相对URL解析stderr，但均通过。
- 本地实施阶段未做针对交互的浏览器手工回归，也未部署、commit或push；这些工作已在21:05发布阶段完成，结果见当前快照。实施阶段报告 `G:/Codex_x/中转站/output/nova-lint-fix-2026-10-22/修复验收报告.md`保留当时证据。

## 历史发布快照（2026-09-18 核验）

- 已发布提交：`e3c5a620a699f0711e7ea4a3fecb1b56abac801b`（短号 `e3c5a62`），`fix: sync Agent API key status`。
- 本地 `main`、GitHub `origin/main` 和 OVH `/opt/nova-image-studio` 的 HEAD 一致。
- 生产镜像：`godissogood/nova-image-studio:e3c5a62`，Nova 容器为 `running / healthy`；`https://img.itoo.me/` 和 `/api/nova/config` 均为 `200`。
- 2026-09-16 发布时只替换 Nova；Sub2API、PostgreSQL、Redis 未重启。下方 `fe73f27`、`d6f0bf0`、`0bcb3a2` 均为历史版本。
- 发布阶段通过前端 443 项测试、ESLint、TypeScript、生产构建和线上浏览器回归。2026-09-18 只重新核验 Git/容器/HTTP 状态，未重新运行测试或付费生图。
- 当前工作树只有本记忆文档存在未提交修改，其中同时包含 2026-09-15 和本轮记录；后续必须保留，不能回退。

## 已完成

### 2026-09-16 至 09-18：Agent Key 状态同步修复与生图上游诊断

1. Agent Key 状态根因与修复。
   - `frontend/src/hooks/useAgentChat.ts` 原来只在首次挂载时读取一次 `hasAnyApiKey()`；设置页后续保存 Key 时，Agent 保留旧状态并在前端误报“请先配置 API 密钥”。
   - `useAgentChat()` 现改用 `useApiKeyStatus()`，复用既有的同页 `nova-model-registry-updated` 与跨标签页存储监听，保存配置后无需刷新。
   - `frontend/src/hooks/__tests__/useAgentChat.retrieval.test.ts` 增加回归用例，覆盖 Agent 挂载后再保存 Key 的状态更新。

2. 发布与验收。
   - 提交 `e3c5a62` 已推送 GitHub `main` 并部署至 OVH；镜像 `godissogood/nova-image-studio:e3c5a62`。
   - 前端 443 项测试、ESLint、TypeScript 和生产构建通过。
   - 线上浏览器使用本地测试配置复现“先挂载 Agent、后保存配置”，素材入口立即可用，控制台 0 错误、0 警告；没有使用真实 Key 或发起付费生图。
   - 回滚用环境文件：`/root/nova-backups/nova-env-pre-e3c5a62-20260916-1647`。

3. 同期生图故障与 Agent Bug 是两条独立链路。
   - 用户 `woodkang0408@gmail.com`（生产用户 ID 263）的两次 `gpt-image-2.5` 请求已通过 Nova 和 Sub2API，路由到账号 2275 后由上游返回 `no available image quota`。
   - 两次请求均为 0 图、0 成本、0 扣费；这属于上游图片额度不可用，不是 Agent Key 状态 Bug。
   - 当时账号 2275 的名称为 `https://img.baofu.eu.cc/`，账号 2294 才是“生图 xkj”。用户随后表示已调整账号，但调整后的生产状态尚未复验。

4. 接续注意。
   - 若 Agent 再提示缺少 Key，先检查 `useApiKeyStatus()` 事件链和浏览器实际模型配置。
   - 若工作台与 Agent 都能发出请求但返回 `no available image quota`，应检查 Sub2API 上游账号额度与调度，不能继续归因于前端状态。

### 2026-09-14 至 09-15：工作台界面调整、发布与上下文整理

1. 用户需求与交互偏好。
   - 工作台原来区域分隔弱、导航紧凑且不够醒目；用户明确要求更舒适的视觉和自适应。
   - 后续反馈宽屏左侧导航底部不可见、单个按钮撑开布局；这两项是以后改样式和同步官方版本时的重点回归场景。
   - 用户已明确“继续直接修复”，并反馈处理时间过长；应及时反馈、直接完成已授权的局部修复，避免重复确认。

2. 最终实现与文件边界。
   - `frontend/src/app/globals.css`：增加 iToo 浅色/深色主题、背景、卡片边框与阴影、导航选中态、间距及移动端和减少动画偏好适配；工作台样式以 `itoo-*` 类为主，主题变量仍是全局变量。
   - `frontend/src/components/workspace/WorkspaceHeader.tsx`：工作区标题和工具区增加样式挂点，手机端保留品牌标题并调整字号/宽度。
   - `frontend/src/components/workspace/WorkspaceModeTabs.tsx`：给横向和纵向导航分别加样式类；手机横向滚动，宽屏纵向排列。
   - `frontend/src/components/workspace/WorkspaceShell.tsx`：左导航使用 `min-h-0`、`top-0`、`overflow-y-auto`；纵向 TabsList 使用 `height: fit-content` / `flex: 0 0 auto`，按钮用 `flex: 0 0 auto` / `height: auto !important`，控制高度与拉伸。
   - 发布只含以上 4 个界面文件和本记忆文档，共 5 个文件。`fe73f27` 是界面调整和同步记录提交，不能误记为本次又执行了一次官方版本合并；实际官方合并关系见下文 2026-09-05 记录。

3. 已完成的发布验证。
   - 前端生产构建成功；前端 39 个测试文件、442 项测试通过；后端 48 项测试通过；`git diff --check` 通过。
   - 用户明确要求部署线上并推送 GitHub，两项均已完成。`git ls-remote origin refs/heads/main` 验证远端为 `fe73f2763f5f542e38b8b074621324861453807f`。
   - 线上浏览器已打开 `https://img.itoo.me/`，页面标题为 `iToo Image - AI 图像生成器`。这些证据不等于完整生图请求或全部屏幕尺寸视觉验收，不扩大测试结论。

4. 下次本地预览与界面回归。
   - 本地 Git 根目录是 `G:\Codex_x\中转站\nova-image-studio`；上层工作区存在空 `.git` 目录，但不是可用仓库，不能在那里执行发布 Git 命令。
   - 本轮使用的预览地址为 `http://127.0.0.1:3000/`，后续先确认端口/进程是否仍在运行。项目根目录 `npm run dev` 会先构建前端，再由后端以 production 模式提供站点，因此不是 HMR；修改后需重新构建。快速前端迭代可用 `npm run dev:frontend`，完整 API 联调按项目 README 配置后端。
   - 再改导航时重点检查宽屏低高度窗口的底部入口、单个按钮高度、手机导航横向滚动、标题工具区换行、浅色/深色；不要仅凭构建成功判断视觉问题已解决。

### 2026-09-15：Grok 图片 4K 能力核查（只读）

- 当日核对 xAI 官方图像生成文档，`resolution` 公开支持 `1k`（默认）和 `2k`，未开放 `4k`。文档：`https://docs.x.ai/developers/model-capabilities/images/generation#resolution`。这是当日公开 API 的结论，后续模型更新需重新核对。
- 本站 `frontend/src/lib/nova-models.ts`：旧 `grok-imagine-image` 预设上限为 `1K`；`grok-imagine-image-2.0` 与 `grok-imagine-image-quality` 为 `2K`。旧预设限制属于本站配置，不能反推官方所有旧模型只能 1K。
- `frontend/src/lib/model-capabilities.ts` 的 Grok 选项和有效性校验限制 1K/2K；即使自定义模型最大档位填 4K，内置 Grok 预设仍截到 1K/2K。`backend/server.js` 的 `getGrokResolution()` 仅识别 1K/2K，其他值省略 `resolution`；因此只增加前端 4K 按钮不能得到真实 4K。
- Sub2API `backend/internal/service/grok_media.go` 清理 Grok 图片请求时删除 `size`、保留 `resolution`；该转发行为和计费档位兼容逻辑都不是上游支持 4K 的证据。
- 用户仅询问原因；本轮没有修改模型选项、提交付费生图请求或新增超分能力。可选方案是先生成 2K 再接 AI 超分，或使用直接支持 4K 的其他模型；这不是已实施任务。
- 站内画布已有的“放大”使用浏览器 Canvas 插值，最长边可到 4096，不是 AI 超分，也不是 Grok 原生 4K；不要把现有缩放功能描述成已接入 AI 超分。

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
   - 该阶段部署镜像：`godissogood/nova-image-studio:d6f0bf0`；容器 `healthy`；公网首页和配置 API 返回 `200`；Sub2API 未重启。后续已由 `fe73f27` 替代。
   - 测试：前端 442 项、后端 48 项通过；构建通过；本轮按用户要求跳过浏览器验收。

### 2026-09-05：首次完整同步原作者 3.3.0 版本

本次同步的提交关系如下，后续追溯冲突时以这些提交为准：

```text
backup/itoo-before-upstream-20260905  (本地定制基线 644864e)
                 + upstream/main 808175e
                 -> e5c3845  merge upstream/main into sync/upstream-20260905
                 -> ad2ef2c  恢复 iToo relay policy
                 -> 44a4934  隐藏当前不可用的 Ccode H3 插件
```

官方这次是一次大功能合并（从本地基线 `644864e` 到官方 `808175e` 共 251 个文件，新增 37,836 行、删除 1,810 行）。主要变化：

1. **插件化视频运行时**：新增 `backend/plugin-runtime/` 的 schema、请求执行、状态归一化、媒体上传、校验和 fixture 验证；新增 `ccode-h3` 插件、插件设置、插件工作台、任务历史、并发生成、分屏预览和计费展示。
2. **画布视频/音频能力**：无限画布接入 schema 驱动的视频节点、音频/视频素材节点、视频生成预览、同款参数控件、媒体 IndexedDB 存储和真实进度展示。
3. **生图和工作区体验**：生图卡片工具栏、历史列表布局、插件价格与配置跳转、并发子任务轮询，以及一批 UI 细节调整。
4. **切图和网页复刻工作区**：新增 Slice 编辑器、切图/修复/矢量化/重建流程、素材与历史存储、AI 客户端和大量回归测试。
5. **Agent 和基础设施**：新增 Agent 协议流、SSE 可靠性处理、Web Agent 工具与虚拟文件系统、备份和媒体处理能力；同步了 `README.zh-CN.md`、`docs/plugins/` 和示例图片。
6. **官方品牌和版本**：官方把显示名统一为 `Nova Studio`，版本升到 `3.3.0`。这一项在 iToo 分支必须恢复为 `iToo Image`，不能直接接受官方品牌提交 `76beb64`。

同步后保留的 iToo 定制不是官方版本的一部分，主要包括：固定 `https://api.itoo.me` 的客户端 Base URL、服务端固定 `http://sub2api:8080`、模型注册表完整性和即时刷新、iToo 品牌、Grok 视频插件、Grok 图片同源托管与失败重取、不可用 Ccode H3 的界面隐藏，以及对应测试和 OVH 部署文件。官方合并时曾覆盖或删除 `deploy/ovh/`、本文件、`frontend/src/lib/itoo-config.ts`、模型热更新 Hook 和 iToo 回归测试，因此不能把 `upstream/main` 直接快进到生产分支。

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

## 2026-10-22 lint 修复本地与公网浏览器回归

- 用户已明确授权提交、推送、上线与针对性交互浏览器回归。
- 本地和公网分别通过11组真实Edge交互检查：设置保存重开与未保存草稿丢弃、默认模型与固定Base URL只读；画笔/方框、撤销清空与取消关闭；标注合成转为参考草稿、模式切换不重复；错误图片恢复、无可编辑模型提示；视频空历史、缺URL记录、单屏/分屏与下载禁用恢复；提示词广场常驻/关闭/私密与密码错误重试；390×844手机设置及工作台，无横向溢出；反推模型同步；画布编辑和AI回调按最新原文A/B构造请求、取消保留原文。
- 使用独立浏览器和虚构Key、图片及本地生成视频；提示词广场模式/密码验证及画布SSE响应由浏览器拦截模拟，未改生产配置，未发真实上游或付费生成。证据 `G:/Codex_x/中转站/output/nova-lint-release-2026-10-22/browser/`中的 `local-results.json`与 `public-results.json`，回归清单在同级目录。
- 带已保存配置重复刷新时出现React #418；本地与上线前旧生产构建均复现，发布后仍存在，保留 `reload-comparison.json`，不能宣称控制台完全无错。本次交互未因此失败，根因及修复另待处理。

## 待完成

- 本轮lint修复与提交、推送、上线、交互回归已完成；既有保存配置后刷新React #418仍待定位和修复。
- 2026-10-22修复前前端lint8错误/15警告已处理，ESLint零错误/零警告、443项测试、TypeScript和生产构建通过，并已随 `fcfe8bc`上线。旧记录7错误/10警告及后端错误不再作当前数字；依赖审计仍需另行复核。发布验收见 `G:/Codex_x/中转站/output/nova-lint-release-2026-10-22/发布验收报告.md`。
- 历史Docker构建曾报告前端依赖12个漏洞（含1个critical）；2026-10-22未重新完整审计或升级业务依赖，此旧数字不作当前事实。升级依赖需单独评估兼容性，不执行 `npm audit fix --force`。
- 每次上线后继续补记生产提交号、镜像标签和验收结果。

## 官方升级合并流程

下次更新的最快安全路径是只做一次官方合并，然后集中重套一组可检查的 iToo 约束。不要在生产 `main` 上直接快进，也不要把当前界面微调和官方同步放在同一个提交里。开始前必须先提交或暂存本地改动，工作树保持干净。

```bash
git fetch origin
git fetch upstream
git switch main
git pull --ff-only origin main
git switch -c sync/upstream-YYYYMMDD
git merge --no-commit --no-ff upstream/main
```

合并后按以下顺序处理，可以减少反复返工：

1. 先看范围：`git log --oneline main..upstream/main`、`git diff --stat main...upstream/main`，确认官方新增的是功能还是品牌/部署文件。
2. 先解决结构冲突：优先保留官方插件、画布和工作区实现；对品牌、Base URL、模型注册表、部署文件和本文件，按“安全不变量”重新套用 iToo 版本。
3. 用搜索做定向复核，而不是手工通读全部 diff：

   ```bash
   rg "Nova Studio|api\\.openai\\.com|resolveNovaApiBaseUrl|request\\.baseUrl|AGENT_DEFAULT_IMAGE_MODEL|ITOO_API_BASE_URL|resolveConfiguredUpstreamBaseUrl|nova-model-registry-updated|sub2api:8080" frontend backend deploy
   ```

4. 先跑自动检查：`npm run test:run`、`npm run lint`、`npm run build`；再运行后端插件 fixture（`cd backend && npm run plugins:verify`）。
5. 用浏览器验收设置保存即时生效、Base URL 只读、图片/视频/画布主流程、宽窄屏导航和控制台错误；后端确认客户端传入的 Base URL 没有成为真实 `fetch` 目标。
6. 只在临时分支所有检查通过后提交，再合并到 `main`、推送 `origin/main`。部署时只更新 Nova 容器，不修改或重启 Sub2API。

每次官方更新都应保留一份可回滚点，并把“官方合并提交、定制修复提交、生产镜像标签”写入下方部署记录。对于重复出现的同一冲突，可以在确认文件边界稳定后启用 `git rerere`，但不能用自动记忆替代安全不变量检查：

```bash
git config rerere.enabled true
git tag backup/itoo-before-upstream-YYYYMMDD
```

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
| 2026-10-22 21:05 | `2be5b95`、`fcfe8bc` | `godissogood/nova-image-studio:lint-fcfe8bc-20261022` | 已提交推送上线，Node仍22.23.4；ESLint零错误/警告、443项、TypeScript与构建通过；候选后端48项/插件/SQLite通过，本地和公网各11组交互通过；Nova healthy/0重启，其它容器和Caddy未变；既有刷新React #418仍待修，未真实付费生成 |
| 2026-10-22 | `e3c5a62` + 未提交Dockerfile补丁 | `godissogood/nova-image-studio:node-22.23.4-20261022` | Node22.23.4安全升级，三阶段固定官方版本/digest；前端443项与构建、后端48项及候选插件/SQLite通过；healthy/0重启、SQLite完整；浏览器设置/主页面正常；仅替换Nova，其它容器与Caddy未变；lint当时8错误/15警告，后续已本地修复但未纳入镜像；未付费生图，未commit/push |
| 2026-09-16 | `e3c5a62` | `godissogood/nova-image-studio:e3c5a62` | Agent 改用实时 Key 状态 Hook；前端 443 项、ESLint、TypeScript、构建通过；线上“先挂载、后保存配置”回归通过；Nova `healthy`，首页和配置 API `200`；GitHub、本地、OVH HEAD 一致；Sub2API、PostgreSQL、Redis 未重启；2026-09-18 重新核验运行状态 |
| 2026-09-14 | `fe73f27` | `godissogood/nova-image-studio:fe73f27` | 本地/GitHub main/OVH HEAD 一致；Nova `healthy`；首页和配置 API `200`；iToo 工作台视觉、自适应及宽屏导航高度修复；前端 39 文件/442 项、后端 48 项测试与构建通过；线上页面标题确认；Sub2API、PostgreSQL、Redis 未重启；2026-09-15 补记 |
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
