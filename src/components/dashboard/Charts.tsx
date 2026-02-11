"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Theme colours matching globals.css
const COLORS = {
  income: "#10B981",
  expenses: "#EF4444",
  savings: "#3B82F6",
  loans: "#8B5CF6",
  net: "#60A5FA",
  muted: "#94A3B8",
  grid: "#334155",
  surface: "#1E293B",
  text: "#94A3B8",
  background: "#0F172A",
};

const PIE_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#A855F7",
  "#06B6D4", "#84CC16",
];

// Custom tooltip
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-surface-hover rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: ${entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ─── Income vs Expenses Area Chart ───
interface MonthlyData {
  month: string;
  label: string;
  income: number;
  expenses: number;
  savings: number;
  loans: number;
  net: number;
}

export function IncomeExpenseChart({ data }: { data: MonthlyData[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
        <defs>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.income} stopOpacity={0.3} />
            <stop offset="95%" stopColor={COLORS.income} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.expenses} stopOpacity={0.3} />
            <stop offset="95%" stopColor={COLORS.expenses} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: COLORS.text, fontSize: 11 }}
          axisLine={{ stroke: COLORS.grid }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: COLORS.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: COLORS.text }}
          iconType="circle"
          iconSize={8}
        />
        <Area
          type="monotone"
          dataKey="income"
          name="Income"
          stroke={COLORS.income}
          fill="url(#incomeGrad)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          name="Expenses"
          stroke={COLORS.expenses}
          fill="url(#expenseGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Weekly Spending Bar Chart ───
interface WeeklyData {
  label: string;
  amount: number;
}

export function WeeklySpendChart({ data }: { data: WeeklyData[] }) {
  const avg = data.length > 0 ? data.reduce((s, d) => s + d.amount, 0) / data.length : 0;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: COLORS.text, fontSize: 10 }}
          axisLine={{ stroke: COLORS.grid }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: COLORS.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${v.toLocaleString()}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="amount" name="Spent" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.amount > avg * 1.3 ? COLORS.expenses : COLORS.savings}
              opacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Category Spending Donut Chart ───
interface CategoryData {
  name: string;
  amount: number;
  colour: string;
  icon: string;
  percentage: number;
  count: number;
}

export function CategoryDonutChart({ data }: { data: CategoryData[] }) {
  const top8 = data.slice(0, 8);
  const otherTotal = data.slice(8).reduce((s, d) => s + d.amount, 0);
  const chartData = otherTotal > 0
    ? [...top8, { name: "Other", amount: otherTotal, colour: "#6B7280", icon: "·", percentage: 0, count: 0 }]
    : top8;

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="amount"
            stroke={COLORS.background}
            strokeWidth={2}
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.colour || PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as CategoryData;
              return (
                <div className="bg-surface border border-surface-hover rounded-lg px-3 py-2 shadow-lg">
                  <p className="text-sm text-foreground">{d.icon} {d.name}</p>
                  <p className="text-xs text-text-muted">${d.amount.toLocaleString()} ({d.percentage}%)</p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 min-w-0">
        {chartData.slice(0, 6).map((cat, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: cat.colour || PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="text-xs text-foreground truncate flex-1">{cat.name}</span>
            <span className="text-xs text-text-muted font-mono">${cat.amount.toLocaleString()}</span>
          </div>
        ))}
        {chartData.length > 6 && (
          <p className="text-xs text-text-muted pl-4">+{chartData.length - 6} more</p>
        )}
      </div>
    </div>
  );
}

// ─── Cumulative Daily Spending Line Chart ───
interface DailyData {
  date: string;
  label: string;
  amount: number;
  cumulative: number;
}

export function DailySpendChart({ data }: { data: DailyData[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
        <defs>
          <linearGradient id="cumulativeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.expenses} stopOpacity={0.2} />
            <stop offset="95%" stopColor={COLORS.expenses} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: COLORS.text, fontSize: 10 }}
          axisLine={{ stroke: COLORS.grid }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: COLORS.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${v.toLocaleString()}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="cumulative"
          name="Total Spent"
          stroke={COLORS.expenses}
          fill="url(#cumulativeGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Performance Score Line Chart ───
interface ScoreData {
  month: string;
  score: number;
}

export function PerformanceChart({ data }: { data: ScoreData[] }) {
  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.month + "-01").toLocaleDateString("en-AU", { month: "short" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: COLORS.text, fontSize: 11 }}
          axisLine={{ stroke: COLORS.grid }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: COLORS.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="score"
          name="Score"
          stroke={COLORS.net}
          strokeWidth={2.5}
          dot={{ fill: COLORS.net, r: 4 }}
          activeDot={{ r: 6, fill: COLORS.net }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Score Ring Component ───
export function ScoreRing({
  score,
  label,
  size = 100,
  strokeWidth = 8,
}: {
  score: number;
  label: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color = score >= 80 ? COLORS.income : score >= 60 ? COLORS.net : score >= 40 ? "#F59E0B" : COLORS.expenses;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={COLORS.grid}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <p className="text-xs text-text-muted mt-1">{label}</p>
    </div>
  );
}
