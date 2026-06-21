# All The RKS

一个可部署到 Vercel 或自托管服务器的 Next.js 应用，使用 PostgreSQL 存储老师、班级、学生、考试、成绩和展示设置。

## 画廊
![alt text](image.png)
![alt text](image-1.png)
![alt text](image-2.png)

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

## VPS 部署

如果主要用户在中国大陆，自托管到大陆云服务器通常会比 Vercel 更稳定、更低延迟。使用中国大陆地域服务器和域名公开访问时，一般需要先完成 ICP 备案；如果暂时不想备案，可以先选择中国香港、日本或新加坡等区域，但大陆访问速度仍取决于线路质量。

### 方案 A：Docker Compose（推荐）

1. 在服务器安装 Docker 和 Docker Compose。
2. 拉取代码并进入项目目录：

```bash
git clone <你的仓库地址> alltherks
cd alltherks
```

3. 修改 `docker-compose.yml`：

- 把 `POSTGRES_PASSWORD` 改成强密码。
- 同步修改 `DATABASE_URL` 里的密码。
- 生产环境建议不要把 PostgreSQL 的 `5432` 暴露到公网，可以删除 `ports: - "5432:5432"`。

4. 启动：

```bash
docker compose up -d --build
```

5. 查看运行状态：

```bash
docker compose ps
docker compose logs -f app
```

### 方案 B：Node + PM2 + PostgreSQL

1. 安装 Node.js 22、PostgreSQL、Nginx、PM2。
2. 创建数据库和用户：

```sql
CREATE USER alltherks WITH PASSWORD '请换成强密码';
CREATE DATABASE alltherks OWNER alltherks;
```

3. 拉取代码并构建：

```bash
git clone <你的仓库地址> alltherks
cd alltherks
npm ci
DATABASE_URL="postgres://alltherks:请换成强密码@127.0.0.1:5432/alltherks?sslmode=disable" npm run build
```

4. 启动 standalone 服务：

```bash
cd .next/standalone
DATABASE_URL="postgres://alltherks:请换成强密码@127.0.0.1:5432/alltherks?sslmode=disable" \
PORT=3000 \
NODE_ENV=production \
pm2 start server.js --name alltherks
pm2 save
pm2 startup
```

5. 用 Nginx 反向代理到本机 `3000` 端口：

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

6. 配置 HTTPS 后，把域名解析到服务器公网 IP。

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
