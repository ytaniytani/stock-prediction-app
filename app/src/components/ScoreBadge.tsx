interface Props {
  upProb: number; // 0-1, NaNなら判定不能
  n: number;
}

export function scoreLabel(upProb: number, n: number): { text: string; className: string } {
  if (n < 30 || Number.isNaN(upProb)) {
    return { text: "サンプル不足", className: "score-neutral" };
  }
  if (upProb >= 0.65) return { text: "優位", className: "score-up" };
  if (upProb >= 0.55) return { text: "やや優位", className: "score-up" };
  if (upProb > 0.45) return { text: "中立", className: "score-neutral" };
  if (upProb > 0.35) return { text: "やや劣位", className: "score-down" };
  return { text: "劣位", className: "score-down" };
}

export function ScoreBadge({ upProb, n }: Props) {
  const { text, className } = scoreLabel(upProb, n);
  return (
    <span className={className} style={{ fontWeight: 700 }}>
      {text}
      {!Number.isNaN(upProb) && n > 0 && ` ${(upProb * 100).toFixed(1)}%`}
    </span>
  );
}
