import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '../context/ThemeContext';

/**
 * Thin wrapper around recharts so every page that needs a time-series
 * (account performance, campaign history, overall dashboard trend) renders
 * with the same axis formatting and brand colors, and adapts to the current
 * theme instead of always drawing a light-mode grid.
 *
 * `data`: array of points. `xKey` picks the x-axis field (defaults to
 * `date`, but Project A's endpoints also use `_id` for grouped-by-day data).
 * `lines`: [{ key, name, color }] - one <Line> per entry.
 */
export default function PerformanceChart({ data, xKey = 'date', lines, height = 300, formatXAxis }) {
  const { theme } = useTheme();
  const gridColor = theme === 'dark' ? '#232e46' : '#eaecf0';
  const textColor = theme === 'dark' ? '#9aa5bd' : '#667085';

  if (!data || data.length === 0) {
    return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No performance data available</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey={xKey}
          fontSize={12}
          stroke={textColor}
          tickFormatter={formatXAxis || ((v) => (xKey === 'date' ? new Date(v).toLocaleDateString() : v))}
        />
        <YAxis fontSize={12} stroke={textColor} />
        <Tooltip
          labelFormatter={formatXAxis || ((v) => (xKey === 'date' ? new Date(v).toLocaleDateString() : v))}
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
        />
        {lines.length > 1 && <Legend />}
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
