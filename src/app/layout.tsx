import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { BarChart3 } from "lucide-react";
import { LinkButton } from "@cloudflare/kumo/components/button";

import "@cloudflare/kumo/styles/standalone";
import "./globals.css";

const phigrosFont = localFont({
  src: "../../public/fonts/cmdysj.woff2",
  variable: "--font-phigros",
  display: "swap",
  preload: false
});

export const metadata: Metadata = {
  title: "All The RKS",
  description: "面向班级考试的学科实力 RKS 计算与查询系统"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={phigrosFont.variable}>
        <div className="app-shell">
          <nav className="topbar" aria-label="主导航">
            <Link className="brand" href="/">
              <span className="brand-mark">
                <BarChart3 aria-hidden="true" size={18} />
              </span>
              <span>All The RKS</span>
            </Link>
            <div className="topbar-actions">
              <LinkButton variant="secondary" href="/student">
                学生入口
              </LinkButton>
              <LinkButton variant="secondary" href="/teacher/login">
                老师登录
              </LinkButton>
              <LinkButton variant="primary" href="/teacher/register">
                注册老师账号
              </LinkButton>
            </div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
