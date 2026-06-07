import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

import "./globals.css";

export const metadata: Metadata = {
  title: "学科实力 RKS",
  description: "面向班级考试的学科实力 RKS 计算与查询系统"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="app-shell">
          <nav className="topbar" aria-label="主导航">
            <Link className="brand" href="/">
              <span className="brand-mark">
                <BarChart3 aria-hidden="true" size={18} />
              </span>
              <span>All The RKS</span>
            </Link>
            <div className="topbar-actions">
              <Link className="link-button" href="/teacher/login">
                老师登录
              </Link>
              <Link className="primary-button" href="/teacher/register">
                注册老师账号
              </Link>
            </div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
