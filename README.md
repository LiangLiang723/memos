# Memos 中文增强版

更适合中国用户的自托管备忘录与碎片记录工具。

本项目基于 [Memos](https://github.com/usememos/memos) 二次开发，保留轻量、Markdown 原生、自托管和数据自主等特点，并针对中文使用场景进行了调整：

- 中文界面与本地化体验
- 更接近朋友圈的时间线浏览体验
- 列表与瀑布流（Masonry）布局切换
- 可选的高德地图定位、逆地理编码和附近地点识别
- 标签、附件、评论、表情反应、RSS 等常用能力
- 支持 Docker 部署，以及 SQLite、MySQL 和 PostgreSQL

> 这是 Memos 的个人增强版本，不是上游官方镜像。上游项目的通用功能、文档和许可证仍请以 [usememos/memos](https://github.com/usememos/memos) 为准；本镜像的功能和标签以本项目为准。

[![Docker Pulls](https://img.shields.io/docker/pulls/benxianyu/memos?style=flat-square&logo=docker)](https://hub.docker.com/r/benxianyu/memos)
[![Docker Image](https://img.shields.io/badge/Docker-benxianyu%2Fmemos-2496ED?style=flat-square&logo=docker&logoColor=white)](https://hub.docker.com/r/benxianyu/memos)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

## 界面预览

<p align="center">
  <img src="docs/images/travel-diary-preview.png" alt="朋友圈式时间线与图片九宫格界面预览" width="360" />
</p>

## 快速开始

### Docker

```bash
docker run -d \
  --name memos \
  --restart unless-stopped \
  -p 5230:5230 \
  -v memos-data:/var/opt/memos \
  benxianyu/memos:stable
```

启动后访问 <http://localhost:5230>。

`/var/opt/memos` 是容器内的数据目录，请务必挂载持久化卷。生产环境建议使用版本号标签，以便固定镜像版本；日常更新可以使用 `stable` 标签：

```bash
docker pull benxianyu/memos:stable
```

### Docker Compose

仓库已经提供了可直接使用的 Compose 配置：

```bash
docker compose -f scripts/compose.yaml up -d
```

也可以使用下面的最小配置：

```yaml
services:
  memos:
    image: benxianyu/memos:stable
    container_name: memos
    restart: unless-stopped
    ports:
      - "5230:5230"
    volumes:
      - memos-data:/var/opt/memos

volumes:
  memos-data:
```

## 高德地图

高德地图为可选功能。配置步骤如下：

1. 在[高德开放平台](https://console.amap.com/)创建 Web 服务 Key。
2. 进入 Memos 的系统设置，打开“地图”设置。
3. 选择高德地图，填写高德 Web 服务 Key；如果控制台启用了安全密钥，同时填写安全密钥。
4. 创建备忘录时即可使用位置功能，并进行地点解析和附近地点识别。

浏览器定位还需要用户授予定位权限；生产环境建议使用 HTTPS。高德服务的调用次数和使用限制以高德开放平台的规则为准。

## 数据与升级

- 默认使用 SQLite，数据和附件保存在 `/var/opt/memos`。
- 升级镜像前请备份 Docker 卷或宿主机数据目录。
- 不要删除数据卷后再重新创建容器，否则会丢失实例数据。
- 如果使用外部数据库或对象存储，请同时备份对应的数据库和存储内容。

## 从源码运行

后端：

```bash
go run ./cmd/memos --port 5230
```

前端开发环境：

```bash
cd web
pnpm install
pnpm dev
```

构建发布版本：

```bash
cd web
pnpm release
```

## 项目链接

- [本项目源码](https://github.com/LiangLiang723/memos)
- [Docker Hub 镜像](https://hub.docker.com/r/benxianyu/memos)
- [Memos 上游项目](https://github.com/usememos/memos)
- [Memos 官方文档](https://usememos.com/docs)
- [Memos 官方演示](https://demo.usememos.com/)

## 许可证

本项目遵循 [MIT License](LICENSE)。本项目基于 Memos 开源项目构建，感谢上游项目及所有贡献者。
