import { DatabaseSetup } from "@/components/DatabaseSetup";
import { PublicSearch } from "@/components/PublicSearch";
import { getPublicHomeData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HomeProps = {
  searchParams?: Promise<{
    q?: string;
    subject?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = (await searchParams) ?? {};
  const query = params.q ?? "";
  const selectedSubjects = normalizeSelectedSubjects(params.subject);
  const data = await getPublicHomeData(query, selectedSubjects, {
    includeLeaderboards: false
  });

  return (
    <main>
      <section className="page-hero">
        <div className="hero-copy">
          <p className="eyebrow">All The RKS</p>
          <h1>输入姓名，查看你的 RKS(Ranking Score)。</h1>
          <p>
            rks仅供娱乐。
          </p>
        </div>
        <div className="stat-band" aria-label="RKS 计算规则">
          <div className="stat-item">
            <span className="stat-value">14</span>
            <span className="muted">最佳考试计入</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">+1</span>
            <span className="muted">默认 p1 冠军位</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">/15</span>
            <span className="muted">默认平均分母</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">0.1</span>
            <span className="muted">考试定数精度</span>
          </div>
        </div>
      </section>

      {!data.databaseReady ? <DatabaseSetup /> : null}

      <PublicSearch
        initialData={data}
        initialQuery={query}
        initialSubjects={selectedSubjects}
      />
    </main>
  );
}

function normalizeSelectedSubjects(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  const subjects: string[] = [];

  for (const item of values) {
    const subject = item.trim().slice(0, 40);

    if (!subject || seen.has(subject)) {
      continue;
    }

    seen.add(subject);
    subjects.push(subject);
  }

  return subjects;
}
