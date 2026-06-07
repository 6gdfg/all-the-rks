export type ScoreGrade = {
  key: "phi" | "blue-v" | "white-v" | "s" | "a" | "b" | "c" | "f";
  label: string;
  name: string;
};

export function getScorePercent(score: number, totalScore: number) {
  if (totalScore <= 0) {
    return 0;
  }

  return (score / totalScore) * 100;
}

export function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export function getScoreGrade(score: number, totalScore: number): ScoreGrade {
  const percent = getScorePercent(score, totalScore);

  if (percent >= 99.9999) {
    return { key: "phi", label: "φ", name: "Phi" };
  }

  if (percent >= 90) {
    return { key: "blue-v", label: "V", name: "Blue V" };
  }

  if (percent >= 80) {
    return { key: "white-v", label: "V", name: "White V" };
  }

  if (percent >= 70) {
    return { key: "s", label: "S", name: "S" };
  }

  if (percent >= 60) {
    return { key: "a", label: "A", name: "A" };
  }

  if (percent >= 50) {
    return { key: "b", label: "B", name: "B" };
  }

  if (percent >= 40) {
    return { key: "c", label: "C", name: "C" };
  }

  return { key: "f", label: "F", name: "F" };
}
