# 学科实力 RKS 系统

一个可部署到 Vercel 或自托管服务器的 Next.js 应用，使用 PostgreSQL 存储老师、班级、学生、考试、成绩和展示设置。

## 本地运行

1. 安装依赖：

```bash
npm install
```

2. 复制环境变量示例并填入 PostgreSQL 连接串：

```bash
cp .env.example .env.local
```

3. 启动开发服务器：

```bash
npm run dev
```

首次访问时应用会自动创建所需数据表。老师从 `/teacher/register` 注册后即可进入控制台。

## 字体

项目使用根目录 `cmdysj.ttf` 生成的 `public/fonts/cmdysj.woff2` 作为站点字体。

重新生成压缩字体：

```bash
npm run font:convert
```

字体文件仍然接近 4 MiB，已使用 `display: swap` 和非预加载策略降低首屏阻塞。公开宣传或开源前，请确认该字体具备网页分发授权；如无授权，请替换为可公开使用的字体。

## Vercel 部署

Vercel 已将原生 Vercel Postgres 替换为 Marketplace Postgres 集成。部署时在 Vercel Marketplace 中添加 Neon、Prisma Postgres、Supabase 等 PostgreSQL 服务，并保证项目环境变量里存在 `DATABASE_URL` 即可。

建议步骤：

1. 将代码推送到 GitHub。
2. 在 Vercel 导入项目，框架选择 `Next.js`。
3. 在 Vercel Marketplace 添加 PostgreSQL 服务。
4. 在项目环境变量中设置 `DATABASE_URL`。
5. 部署或重新部署项目。

面向中国大陆用户时，Vercel 访问质量会受网络环境影响。字体、首屏资源和数据库区域都会影响体验；如果用户集中在大陆，建议评估香港、新加坡、日本或大陆云服务器的自托管方案。

## Docker Compose 部署

适合在云服务器、NAS、测试机或支持 Docker 的 PaaS 上部署：

```bash
docker compose up -d --build
```

默认会启动：

- `app`：Next.js 应用，端口 `3000`
- `postgres`：PostgreSQL 16，端口 `5432`

生产环境请修改 `docker-compose.yml` 里的数据库密码，并用外部安全网络或托管 PostgreSQL。

## Docker 镜像部署

构建镜像：

```bash
docker build -t alltherks .
```

运行：

```bash
docker run -d \
  --name alltherks \
  -p 3000:3000 \
  -e DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require" \
  alltherks
```

如果连接的是同机或内网 PostgreSQL 且不使用 SSL，可以用 `?sslmode=disable`。

## 普通 Node 部署

适合 PM2、宝塔、1Panel、Systemd、Render/Railway/Zeabur 的 Node 运行时：

```bash
npm ci
npm run build
npm run start
```

必须提供 `DATABASE_URL` 环境变量。

## RKS 规则

单次考试 RKS：

```text
(得分 / 总分) * 考试定数
```

学生总 RKS 默认规则：

```text
(最佳 14 次考试 RKS 之和 + p1 RKS) / 15
```

老师可在班级设置中自定义 p 和 b 的数量，例如 `p3 + b27` 会按 `/30` 计算。

p 项从该学生所有班级第一考试中按单次 RKS 从高到低选取；b 项从全部考试成绩中按单次 RKS 从高到低选取。p 和 b 互不影响，同一次考试可以同时计入 p 和 b。未取得足够 p 项时缺位按 0 计入，但分母仍然是 `p + b`。
