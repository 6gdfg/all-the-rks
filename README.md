# 学科实力 RKS 系统

一个可部署到 Vercel 的 Next.js 应用，使用 PostgreSQL 存储老师、班级、学生、考试、成绩和展示设置。

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

## Vercel 部署

Vercel 已将原生 Vercel Postgres 替换为 Marketplace Postgres 集成。部署时在 Vercel Marketplace 中添加 Neon、Prisma Postgres、Supabase 等 PostgreSQL 服务，并保证项目环境变量里存在 `DATABASE_URL` 即可。

## RKS 规则

单次考试 RKS：

```text
(得分 / 总分) * 考试定数
```

学生总 RKS：

```text
(最佳 14 次考试 RKS 之和 + 班级第一加成 RKS) / 15
```

班级第一加成取该学生所有班级第一考试中 RKS 最高的一次；如果从未拿过班级第一，该项按 0 计入，但仍然除以 15。
