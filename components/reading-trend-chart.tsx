import { useId } from 'react';
import { metricLabel, trendChartModel, type TrendMetric, type TrendPointInput } from '@/lib/education/reading-trends';

// One measure per chart: no dual axis, no benchmark, no colour-coded judgement.
// Time is scaled by real dates. A single reading is a marker only, and a line
// appears only when there are at least two readings. Reviewed corrections use a
// diamond marker so the meaning never depends on colour. The surrounding table
// on the page carries every value as the full text alternative.
export function ReadingTrendChart({ points, metric }: { points: readonly TrendPointInput[]; metric: TrendMetric }) {
  const id = useId();
  const model = trendChartModel(points, metric);
  const { plot } = model;
  return <figure className="max-w-xl space-y-1" data-reading-chart={metric}>
    <svg viewBox={'0 0 ' + model.width + ' ' + model.height} role="img" aria-labelledby={id + '-title ' + id + '-desc'} className="h-auto w-full overflow-visible">
      <title id={id + '-title'}>{metricLabel(metric)}</title>
      <desc id={id + '-desc'}>{model.description}</desc>
      {model.yTicks.map(tick => <g key={tick.y + tick.label}>
        <line x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} stroke="var(--border)" strokeWidth={1} />
        <text x={plot.left - 6} y={tick.y + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">{tick.label}</text>
      </g>)}
      <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} stroke="var(--muted-foreground)" strokeWidth={1} />
      {model.xTicks.map(tick => <g key={tick.x + tick.label}>
        <line x1={tick.x} x2={tick.x} y1={plot.bottom} y2={plot.bottom + 4} stroke="var(--muted-foreground)" strokeWidth={1} />
        <text x={tick.x} y={plot.bottom + 17} textAnchor={tick.anchor} fontSize={11} fill="var(--muted-foreground)">{tick.label}</text>
      </g>)}
      {model.path && <path d={model.path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {model.points.map((point, index) => <g key={point.date + ':' + index} data-corrected={point.corrected ? 'true' : 'false'}>
        <title>{point.label}</title>
        {point.corrected
          ? <rect x={point.x - 5} y={point.y - 5} width={10} height={10} transform={'rotate(45 ' + point.x + ' ' + point.y + ')'} fill="var(--card)" stroke="var(--primary)" strokeWidth={2} />
          : <circle cx={point.x} cy={point.y} r={5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />}
      </g>)}
    </svg>
    <figcaption className="text-xs text-muted-foreground">
      {metricLabel(metric)}, by reading date.{model.points.some(point => point.corrected) ? ' Diamond markers use a reviewed correction.' : ''}
    </figcaption>
  </figure>;
}
