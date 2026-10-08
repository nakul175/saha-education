// Pure, deterministic helpers that describe an exact-task reading series for
// staff. They never average across learners, rank, apply a norm or label a
// result as good or poor. A series with fewer than three readings is never
// described as a trend, and uneven spacing is stated rather than hidden.

export type TrendMetric = 'wcpm' | 'accuracy';
export type TrendPointInput = {
  checkId: string;
  revision: number;
  readingDate: string;
  wcpm: number;
  accuracy: number;
  wordsCorrect: number;
  wordsAttempted: number;
};
export type TrendKind = 'none' | 'single' | 'pair' | 'short' | 'series';
export type TrendSummary = {
  count: number;
  kind: TrendKind;
  firstDate: string | null;
  lastDate: string | null;
  spanDays: number;
  gapDays: number[];
  spacing: 'even' | 'uneven' | 'not-applicable';
  repeatedDates: boolean;
  correctedCount: number;
  /** Latest minus earliest by reading date; null unless two different dates exist. */
  change: { wcpm: number; accuracy: number } | null;
  statement: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayNumber(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
}
export function formatReadingDate(date: string, withYear = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return date;
  return Number(match[3]) + ' ' + month + (withYear ? ' ' + match[1] : '');
}
function plural(count: number, one: string, many: string): string {
  return count + ' ' + (count === 1 ? one : many);
}
function signed(value: number): string {
  return (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value);
}

export function sortTrendPoints<T extends { readingDate: string; checkId: string }>(
  points: readonly T[],
): T[] {
  return [...points].sort(
    (a, b) => a.readingDate.localeCompare(b.readingDate) || a.checkId.localeCompare(b.checkId),
  );
}

export function summariseSeries(input: readonly TrendPointInput[]): TrendSummary {
  const points = sortTrendPoints(input);
  const count = points.length;
  const empty = {
    firstDate: null,
    lastDate: null,
    spanDays: 0,
    gapDays: [] as number[],
    spacing: 'not-applicable' as const,
    repeatedDates: false,
    correctedCount: 0,
    change: null,
  };
  if (!count)
    return { count, kind: 'none', ...empty, statement: 'No readings are recorded for this exact task.' };
  const firstDate = points[0].readingDate,
    lastDate = points[count - 1].readingDate;
  const days = points.map((point) => dayNumber(point.readingDate));
  const gapDays = days.slice(1).map((day, index) => day - days[index]);
  const spanDays = days[count - 1] - days[0];
  const repeatedDates = gapDays.some((gap) => gap === 0);
  const correctedCount = points.filter((point) => point.revision > 0).length;
  const change =
    firstDate !== lastDate
      ? {
          wcpm: points[count - 1].wcpm - points[0].wcpm,
          accuracy: points[count - 1].accuracy - points[0].accuracy,
        }
      : null;
  const positive = gapDays.filter((gap) => gap > 0);
  const spacing: TrendSummary['spacing'] =
    gapDays.length < 2
      ? 'not-applicable'
      : Math.max(...gapDays) > 2 * Math.max(1, Math.min(...(positive.length ? positive : [1])))
        ? 'uneven'
        : 'even';
  const kind: TrendKind = count === 1 ? 'single' : count === 2 ? 'pair' : count < 5 ? 'short' : 'series';
  const parts: string[] = [];
  if (kind === 'single')
    parts.push('One reading, on ' + formatReadingDate(firstDate) + '. One reading cannot show a trend.');
  else if (kind === 'pair')
    parts.push(
      'Two readings, ' +
        (firstDate === lastDate
          ? 'both on ' + formatReadingDate(firstDate)
          : formatReadingDate(firstDate) +
            ' and ' +
            formatReadingDate(lastDate) +
            ' (' +
            plural(spanDays, 'day', 'days') +
            ' apart)') +
        '. Two readings show a difference between those readings, not a trend.',
    );
  else if (kind === 'short')
    parts.push(
      plural(count, 'reading', 'readings') +
        ' from ' +
        formatReadingDate(firstDate) +
        ' to ' +
        formatReadingDate(lastDate) +
        '. This is too few readings to describe a pattern; compare the individual values.',
    );
  else
    parts.push(
      plural(count, 'reading', 'readings') +
        ' from ' +
        formatReadingDate(firstDate) +
        ' to ' +
        formatReadingDate(lastDate) +
        ' (' +
        plural(spanDays, 'day', 'days') +
        ').',
    );
  if (spacing === 'uneven')
    parts.push(
      'The readings are unevenly spaced, from ' +
        plural(Math.min(...positive), 'day', 'days') +
        ' to ' +
        plural(Math.max(...gapDays), 'day', 'days') +
        ' apart, so the horizontal position shows the real dates.',
    );
  if (repeatedDates) parts.push('Some readings share a date; their order within that date is not recorded.');
  if (correctedCount)
    parts.push(plural(correctedCount, 'value uses', 'values use') + ' a reviewed correction.');
  if (change && kind !== 'single')
    parts.push(
      'Change from the earliest to the latest reading: ' +
        signed(change.wcpm) +
        ' correct words per minute, ' +
        signed(change.accuracy) +
        ' percentage points of accuracy. This describes these readings only.',
    );
  return {
    count,
    kind,
    firstDate,
    lastDate,
    spanDays,
    gapDays,
    spacing,
    repeatedDates,
    correctedCount,
    change,
    statement: parts.join(' '),
  };
}

export type ChartPoint = {
  x: number;
  y: number;
  value: number;
  date: string;
  corrected: boolean;
  label: string;
};
export type ChartModel = {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  /** Straight segments between readings, present only for two or more readings. */
  path: string | null;
  points: ChartPoint[];
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[];
  yMax: number;
  description: string;
};
const METRIC_LABEL: Record<TrendMetric, string> = {
  wcpm: 'Correct words per minute',
  accuracy: 'Accuracy (percent)',
};
export function metricLabel(metric: TrendMetric): string {
  return METRIC_LABEL[metric];
}
function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10])
    if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function trendChartModel(
  input: readonly TrendPointInput[],
  metric: TrendMetric,
  width = 360,
  height = 210,
): ChartModel {
  const points = sortTrendPoints(input);
  const plot = { left: 44, right: width - 14, top: 14, bottom: height - 36 };
  const yMax = metric === 'accuracy' ? 100 : niceMax(Math.max(0, ...points.map((point) => point.wcpm)));
  const yAt = (value: number) => round1(plot.bottom - (value / yMax) * (plot.bottom - plot.top));
  const days = points.map((point) => dayNumber(point.readingDate));
  const first = days[0] ?? 0,
    span = (days[days.length - 1] ?? 0) - first;
  const xAt = (day: number) =>
    round1(
      span === 0
        ? (plot.left + plot.right) / 2
        : plot.left + ((day - first) / span) * (plot.right - plot.left),
    );
  const model: ChartPoint[] = points.map((point, index) => ({
    x: xAt(days[index]),
    y: yAt(point[metric]),
    value: point[metric],
    date: point.readingDate,
    corrected: point.revision > 0,
    label:
      formatReadingDate(point.readingDate) +
      ': ' +
      point[metric] +
      (metric === 'accuracy' ? '%' : ' correct words per minute') +
      (point.revision > 0 ? ' (reviewed correction)' : ''),
  }));
  const yTicks = [0, 1, 2, 3, 4].map((step) => {
    const value = (yMax * step) / 4;
    return { y: yAt(value), label: String(round1(value)) };
  });
  // Label the end dates and any interior date with room, so labels never collide.
  // Positions are time-scaled, so the first and last points sit at the plot edges
  // (or share one centred position when every reading has the same date).
  const keep: number[] = [];
  model.forEach((point, index) => {
    if (index === 0) {
      keep.push(index);
      return;
    }
    if (index === model.length - 1) {
      if (point.x === model[0].x) return;
      while (keep.length > 1 && point.x - model[keep[keep.length - 1]].x < 62) keep.pop();
      keep.push(index);
      return;
    }
    if (point.x - model[keep[keep.length - 1]].x >= 62) keep.push(index);
  });
  const xTicks: ChartModel['xTicks'] = keep.map((index) => {
    const edge = index === 0 || index === model.length - 1;
    return {
      x: model[index].x,
      label: formatReadingDate(model[index].date, edge),
      anchor:
        model.length === 1 || model[0].x === model[model.length - 1].x
          ? 'middle'
          : index === 0
            ? 'start'
            : index === model.length - 1
              ? 'end'
              : 'middle',
    };
  });
  const path =
    model.length >= 2
      ? model.map((point, index) => (index ? 'L' : 'M') + point.x + ' ' + point.y).join(' ')
      : null;
  const description =
    METRIC_LABEL[metric] +
    ': ' +
    (model.length ? model.map((point) => point.label).join('; ') : 'no readings') +
    '.';
  return { width, height, plot, path, points: model, yTicks, xTicks, yMax, description };
}
