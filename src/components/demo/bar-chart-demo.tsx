import { Bar, BarChart, Rectangle, XAxis, YAxis } from 'recharts';

import {
  Chart,
  type ChartConfig,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/bar-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const chartData = [
  { country: 'United States', count: 45000, percentage: 45.0 },
  { country: 'Canada', count: 34000, percentage: 18.0 },
  { country: 'United Kingdom', count: 30000, percentage: 12.0 },
  { country: 'Germany', count: 25000, percentage: 9.0 },
  { country: 'Australia', count: 22000, percentage: 7.5 },
  { country: 'France', count: 18000, percentage: 6.0 },
  { country: 'Japan', count: 15000, percentage: 4.5 },
  { country: 'Brazil', count: 13000, percentage: 5.0 },
  { country: 'Indonesia', count: 10030, percentage: 6.0 },
];

// One series, so one colour for every bar — --viz-1 is this project's
// categorical slot 1, already validated against both surfaces in index.css.
// (The upstream demo referenced --chart-1, which does not exist here.)
const chartConfig = {
  count: {
    label: 'Count',
    color: 'var(--viz-1)',
  },
} satisfies ChartConfig;

// Recharts spreads each data entry onto the shape's props at runtime, but its
// BarRectangleItem type does not know about this dataset's own fields, so the
// row shape is declared here and applied inside the callback.
type BarRow = {
  country: string;
  count: number;
  percentage: number;
  background: { width: number };
};

export default function BarChartDemo() {
  return (
    <Card className="h-full w-full">
      <CardHeader>
        <CardTitle>Traffic by Country</CardTitle>
        <CardDescription>Since Aug 17, 2014</CardDescription>
      </CardHeader>
      <CardContent>
        <Chart config={chartConfig} className="aspect-[15/15] sm:aspect-[17/7]">
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            barSize={30}
            margin={{ left: 0, right: 0 }}
          >
            <YAxis dataKey="country" type="category" hide />
            <XAxis dataKey="count" type="number" hide />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              background={{ radius: 6, fill: 'var(--viz-1)', opacity: 0.14 }}
              // Rounded at the data end, square at the baseline, so the bar
              // reads as growing from zero rather than floating.
              radius={[0, 6, 6, 0]}
              shape={(rawProps) => {
                const props = rawProps as typeof rawProps & BarRow;
                const mid = props.y + props.height / 2 + 4;
                return (
                  <>
                    <Rectangle {...props} />
                    <text x={props.x + 12} y={mid} className="fill-white text-xs">
                      {props.country}
                    </text>
                    <text
                      x={props.background.width - 12}
                      y={mid}
                      textAnchor="end"
                      className="fill-foreground text-xs tabular-nums"
                    >
                      {props.count.toLocaleString()} ({props.percentage.toFixed(1)}%)
                    </text>
                  </>
                );
              }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          </BarChart>
        </Chart>
      </CardContent>
    </Card>
  );
}
