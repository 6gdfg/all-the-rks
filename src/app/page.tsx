import { DatabaseSetup } from "@/components/DatabaseSetup";
import { PublicSearch } from "@/components/PublicSearch";
import { getHomeCopy, getPublicHomeData, type PublicHomeData } from "@/lib/data";
import { hasDatabaseUrl } from "@/lib/db";

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
  const shouldLoadServerData = query.trim().length > 0 || selectedSubjects.length > 0;
  const [data, homeCopy] = await Promise.all([
    shouldLoadServerData
      ? getPublicHomeData(query, selectedSubjects, {
          includeLeaderboards: false
        })
      : Promise.resolve(getFastInitialPublicData()),
    getHomeCopy()
  ]);

  return (
    <main>
      <section className="page-hero">
        <div className="hero-copy">
          {homeCopy.heroEyebrow ? <p className="eyebrow">{homeCopy.heroEyebrow}</p> : null}
          <h1>{homeCopy.heroTitle}</h1>
          {homeCopy.heroSubtitle ? <p>{homeCopy.heroSubtitle}</p> : null}
        </div>
        <div className="stat-band" aria-label="RKS 计算规则">
          {homeCopy.heroStats.map((item, index) => (
            <div className="stat-item" key={`${item.value}-${item.label}-${index}`}>
              <span className="stat-value">{item.value}</span>
              <span className="muted">{item.label}</span>
            </div>
          ))}
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

function getFastInitialPublicData(): PublicHomeData {
  return {
    databaseReady: hasDatabaseUrl(),
    subjectOptions: [],
    leaderboards: [],
    results: []
  };
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
