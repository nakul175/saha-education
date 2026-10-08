import assert from 'node:assert/strict';
import {
  summariseSeries,
  trendChartModel,
  formatReadingDate,
  dayNumber,
  metricLabel,
} from '../../lib/education/reading-trends.ts';

let passed = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  passed++;
}
const point = (readingDate, wcpm, accuracy = 90, revision = 0, id = readingDate) => ({
  checkId: id,
  revision,
  readingDate,
  wcpm,
  accuracy,
  wordsCorrect: wcpm,
  wordsAttempted: 100,
});

// Date helpers are literal UTC calendar days, never local-time conversions.
check(formatReadingDate('2026-10-05'), '5 Oct 2026', 'Date renders without a timezone shift');
check(formatReadingDate('2026-10-05', false), '5 Oct', 'Year can be omitted for interior labels');
check(formatReadingDate('not-a-date'), 'not-a-date', 'Unexpected stored text is shown rather than invented');
check(dayNumber('2026-10-06') - dayNumber('2026-10-05'), 1, 'Adjacent days differ by one');
check(Number.isNaN(dayNumber('2026-1-5')), true, 'Malformed dates are not scaled');
check(metricLabel('wcpm'), 'Correct words per minute', 'Metric label is descriptive');

// Zero readings: honest empty state, no chart geometry or change.
let summary = summariseSeries([]);
check(
  [summary.kind, summary.count, summary.change, summary.firstDate],
  ['none', 0, null, null],
  'Zero readings produce no change or dates',
);
check(summary.statement, 'No readings are recorded for this exact task.', 'Zero-reading text is explicit');
let chart = trendChartModel([], 'wcpm');
check([chart.points, chart.path, chart.xTicks], [[], null, []], 'Zero readings draw nothing');
check(chart.description, 'Correct words per minute: no readings.', 'Zero-reading text alternative exists');

// One reading: a marker and a statement that no trend exists; never a line.
summary = summariseSeries([point('2026-10-01', 48)]);
check(
  [summary.kind, summary.change, summary.spacing],
  ['single', null, 'not-applicable'],
  'One reading has no change',
);
assert.match(summary.statement, /One reading cannot show a trend/);
passed++;
assert.doesNotMatch(summary.statement, /increase|improv|decline|progress|growth/i);
passed++;
chart = trendChartModel([point('2026-10-01', 48)], 'wcpm');
check(
  [chart.points.length, chart.path, chart.xTicks.length],
  [1, null, 1],
  'One reading draws one marker and no line',
);
check(
  chart.points[0].x,
  (chart.plot.left + chart.plot.right) / 2,
  'One marker is centred, not placed at an invented edge',
);

// Two readings: a difference, explicitly not a trend.
summary = summariseSeries([point('2026-10-08', 52, 94), point('2026-10-01', 48, 90)]);
check(
  [summary.kind, summary.firstDate, summary.lastDate, summary.spanDays],
  ['pair', '2026-10-01', '2026-10-08', 7],
  'Input order does not matter',
);
check(summary.change, { wcpm: 4, accuracy: 4 }, 'Change is latest minus earliest by date');
assert.match(summary.statement, /not a trend/);
passed++;
check(
  trendChartModel([point('2026-10-01', 48), point('2026-10-08', 52)], 'wcpm').path !== null,
  true,
  'Two readings may be joined by one segment',
);

// Three or four readings: described as too few for a pattern.
summary = summariseSeries([point('2026-10-01', 48), point('2026-10-02', 40), point('2026-10-03', 55)]);
check(summary.kind, 'short', 'Three readings are short');
assert.match(summary.statement, /too few readings to describe a pattern/);
passed++;
check(
  summary.change,
  { wcpm: 7, accuracy: 0 },
  'Change ignores the dip between first and last and is labelled descriptive',
);
assert.match(summary.statement, /describes these readings only/);
passed++;

// Uneven spacing is stated and the x scale uses real dates.
const uneven = [
  point('2026-09-01', 30),
  point('2026-09-03', 35),
  point('2026-09-05', 33),
  point('2026-09-07', 38),
  point('2026-10-30', 50),
];
summary = summariseSeries(uneven);
check(
  [summary.kind, summary.spacing, summary.gapDays],
  ['series', 'uneven', [2, 2, 2, 53]],
  'Unequal gaps are detected',
);
assert.match(summary.statement, /unevenly spaced, from 2 days to 53 days apart/);
passed++;
chart = trendChartModel(uneven, 'wcpm');
const gapsPx = chart.points.slice(1).map((value, index) => value.x - chart.points[index].x);
assert.ok(gapsPx[3] > gapsPx[0] * 20, 'Horizontal position is proportional to elapsed days');
passed++;
check(
  [chart.points[0].x, chart.points[4].x],
  [chart.plot.left, chart.plot.right],
  'First and last readings sit at the plot edges',
);
check(
  summariseSeries([point('2026-09-01', 30), point('2026-09-08', 35), point('2026-09-15', 33)]).spacing,
  'even',
  'Weekly readings are evenly spaced',
);

// Same-day readings: order within a day is not claimed, and a single date has no change.
summary = summariseSeries([point('2026-10-01', 40, 90, 0, 'b'), point('2026-10-01', 44, 91, 0, 'a')]);
check(
  [summary.repeatedDates, summary.change, summary.spanDays],
  [true, null, 0],
  'Same-date pair has no change',
);
assert.match(summary.statement, /order within that date is not recorded/);
passed++;
chart = trendChartModel([point('2026-10-01', 40, 90, 0, 'b'), point('2026-10-01', 44, 91, 0, 'a')], 'wcpm');
check(chart.xTicks.length, 1, 'One shared date has one label');

// Corrections are marked and counted.
summary = summariseSeries([point('2026-10-01', 40), point('2026-10-08', 44, 90, 2)]);
check(summary.correctedCount, 1, 'Corrected readings are counted');
assert.match(summary.statement, /1 value uses a reviewed correction/);
passed++;
chart = trendChartModel([point('2026-10-01', 40), point('2026-10-08', 44, 90, 2)], 'wcpm');
check(
  chart.points.map((value) => value.corrected),
  [false, true],
  'Corrected marker is flagged for a non-color cue',
);
assert.match(chart.points[1].label, /reviewed correction/);
passed++;

// Axis honesty: rate and accuracy start at zero; accuracy is capped at 100; no norm lines.
chart = trendChartModel([point('2026-10-01', 61), point('2026-10-08', 66)], 'wcpm');
check(chart.yTicks[0].label, '0', 'Rate axis starts at zero');
assert.ok(chart.yMax >= 66);
passed++;
check(
  chart.points.every((value) => value.y >= chart.plot.top && value.y <= chart.plot.bottom),
  true,
  'Points stay inside the plot',
);
chart = trendChartModel([point('2026-10-01', 61, 55), point('2026-10-08', 66, 60)], 'accuracy');
check(
  [chart.yMax, chart.yTicks.map((tick) => tick.label)],
  [100, ['0', '25', '50', '75', '100']],
  'Accuracy axis is zero to 100',
);
check(JSON.stringify(chart).includes('benchmark'), false, 'No benchmark or norm element exists');
// Dense series never emit overlapping interior labels.
const dense = Array.from({ length: 30 }, (_, index) =>
  point('2026-09-' + String(index + 1).padStart(2, '0'), 40 + index),
);
chart = trendChartModel(dense, 'wcpm');
for (let index = 1; index < chart.xTicks.length; index++)
  assert.ok(chart.xTicks[index].x - chart.xTicks[index - 1].x >= 62, 'Labels keep clear spacing');
passed++;
check(
  [chart.xTicks[0].anchor, chart.xTicks.at(-1).anchor],
  ['start', 'end'],
  'Edge labels stay inside the plot',
);
// Zero wcpm still yields finite geometry.
chart = trendChartModel([point('2026-10-01', 0, 0)], 'wcpm');
check(
  Number.isFinite(chart.points[0].y) && Number.isFinite(chart.yMax),
  true,
  'All-zero rates keep finite geometry',
);

console.log(
  JSON.stringify({
    passed,
    failed: 0,
    skipped: 0,
    scope: 'Pure descriptive reading series/chart helpers; no norms, ranking, averaging or diagnosis.',
  }),
);
