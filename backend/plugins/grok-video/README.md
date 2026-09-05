# Grok 视频插件

这个插件通过 iToo Sub2API 的 Grok 媒体接口生成视频：

- 提交：`POST /v1/videos/generations`
- 查询：`GET /v1/videos/{request_id}`
- 文生视频：`grok-imagine-video`
- 图生视频：`grok-imagine-video-1.5`

在「设置 → 插件」中填写 Grok-Heavy 分组 API Key，API 地址保持为
`https://api.itoo.me`，然后在「视频工作台」选择「Grok 视频」。

插件只读取完成响应中的真实 `video_url` / `video.url` 等地址，不把
`/v1/videos/{id}/content` 作为备用视频地址，因为该路径不是 Sub2API 保证提供的
公共下载代理。

图生视频需要让上游能够访问插件素材地址。生产部署应设置
`NOVA_PUBLIC_BASE_URL=https://img.itoo.me`，并确认该地址可被上游访问。
