import { formatCurrency } from '@/lib/utils/formatting';

type TooltipEntry = {
  name: string;
  value: number;
  stroke?: string;
  payload?: {
    revenue: number;
    margin: number;
  };
};

type ChartTooltipProps = Readonly<{
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}>;

export const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label }) => {
  // Only render if tooltip is active and payload exists
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-200 bg-background p-3 shadow-md">
      <p className="font-medium text-sm mb-2">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.stroke }} />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-medium tabular-nums">{formatCurrency(entry.value)}</span>
          </div>
        ))}

        {payload[0]?.payload && (
          <div className="mt-2 pt-2 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Margin %</span>
              <span className="font-medium tabular-nums">
                {payload[0].payload.revenue > 0
                  ? ((payload[0].payload.margin / payload[0].payload.revenue) * 100).toFixed(1)
                  : '0.0'}
                %
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
