import { useState, useEffect } from "react";

interface AnalyticsData {
  totalAnswers: number;
  totalEvaluations: number;
  overallAvgScore: number;
  overallPassRate: number;
  avgQualityScore: number;
  verdictDistribution: {
    pass: number;
    warning: number;
    fail: number;
  };
  judgeStats: Array<{
    name: string;
    total: number;
    pass: number;
    fail: number;
    warning: number;
    avgScore: number;
    passRate: number;
  }>;
  timeSeries: Array<{
    date: string;
    passRate: number;
    avgScore: number;
    count: number;
  }>;
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch("/api/answers/analytics/summary");
      const analyticsData = await response.json();
      console.log("[Analytics] Received data:", analyticsData);
      console.log("[Analytics] Time series data:", analyticsData.timeSeries);
      setData(analyticsData);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  // Animated progress bar component
  const AnimatedProgressBar = ({
    percentage,
    color,
    label,
    value,
  }: {
    percentage: number;
    color: string;
    label: string;
    value: string;
  }) => {
    const [animated, setAnimated] = useState(false);

    useEffect(() => {
      // Trigger animation after component mounts
      const timer = setTimeout(() => setAnimated(true), 100);
      return () => clearTimeout(timer);
    }, []);

    return (
      <div style={{ marginBottom: "24px" }}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-mono font-semibold">{label}</span>
          <span className="text-sm font-mono font-bold">{value}</span>
        </div>
        <div className="meter">
          <span
            style={{
              transform: animated
                ? `scaleX(${Math.max(0, Math.min(100, percentage)) / 100})`
                : "scaleX(0)",
              backgroundColor: color,
            }}
          />
        </div>
      </div>
    );
  };

  // Animated bar chart component
  const AnimatedBarChart = ({
    data,
    label,
    maxValue,
  }: {
    data: Array<{ name: string; value: number; color: string }>;
    label: string;
    maxValue: number;
  }) => {
    const [animated, setAnimated] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => setAnimated(true), 200);
      return () => clearTimeout(timer);
    }, []);

    return (
      <div
        className="btn-modern"
        style={{
          width: "100%",
          padding: "24px",
          background: "#FFFFFF",
          color: "#000000",
          boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div className="text-xs font-semibold text-black mb-4 uppercase tracking-wide font-mono">
          {label}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {data.map((item, index) => (
            <div key={item.name}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-mono">{item.name}</span>
                <span className="text-sm font-mono font-bold">
                  {item.value}
                </span>
              </div>
              <div className="meter">
                <span
                  style={{
                    transform: animated
                      ? `scaleX(${Math.min(1, item.value / maxValue)})`
                      : "scaleX(0)",
                    transformOrigin: "left center",
                    backgroundColor: item.color,
                    transitionDelay: `${index * 0.08}s`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Line chart for time series
  const AnimatedLineChart = ({
    data,
    label,
  }: {
    data: Array<{ date: string; passRate: number; avgScore: number }>;
    label: string;
  }) => {
    const [animated, setAnimated] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => setAnimated(true), 400);
      return () => clearTimeout(timer);
    }, []);

    if (data.length === 0) {
      return (
        <div
          className="btn-modern"
          style={{
            width: "100%",
            padding: "24px",
            background: "#FFFFFF",
            color: "#000000",
            boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div className="text-xs font-semibold text-black mb-4 uppercase tracking-wide font-mono">
            {label}
          </div>
          <div className="text-sm text-gray-500 text-center py-8">
            No time series data available
          </div>
        </div>
      );
    }

    const chartWidth = 600;
    const chartHeight = 250;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;

    // Add offset so first point is not on y-axis
    const startOffset = 20; // Move first point 20px to the right
    const adjustedPlotWidth = plotWidth - startOffset;

    // Calculate min/max for scaling
    const allValues = data.flatMap((d) => [d.passRate, d.avgScore]);
    const minValue = Math.min(0, ...allValues);
    const maxValue = Math.max(100, ...allValues);
    const valueRange = maxValue - minValue || 1;

    // Scale functions - add startOffset to move first point away from y-axis
    const scaleX = (index: number) =>
      (index / (data.length - 1 || 1)) * adjustedPlotWidth +
      padding.left +
      startOffset;
    const scaleY = (value: number) =>
      plotHeight - ((value - minValue) / valueRange) * plotHeight + padding.top;

    // Helper function to create smooth bezier curve path
    const createSmoothPath = (values: number[]) => {
      if (values.length === 0) return "";
      if (values.length === 1) {
        const x = scaleX(0);
        const y = scaleY(values[0]);
        return `M ${padding.left} ${y} L ${x} ${y}`;
      }

      // Start from y-axis
      const firstY = scaleY(values[0]);
      let path = `M ${padding.left} ${firstY}`;

      // Line to first point
      const firstX = scaleX(0);
      path += ` L ${firstX} ${firstY}`;

      // Create smooth bezier curves between points
      for (let i = 0; i < values.length - 1; i++) {
        const x0 = scaleX(i);
        const y0 = scaleY(values[i]);
        const x1 = scaleX(i + 1);
        const y1 = scaleY(values[i + 1]);

        // Calculate control points for smooth curve
        const dx = x1 - x0;
        const dy = y1 - y0;

        // Get previous and next points for smoother curves
        const prevY = i > 0 ? scaleY(values[i - 1]) : y0;
        const nextY = i < values.length - 2 ? scaleY(values[i + 2]) : y1;

        // Calculate slope/direction
        const slope = (y1 - y0) / (x1 - x0);
        const prevSlope = i > 0 ? (y0 - prevY) / dx : slope;
        const nextSlope = i < values.length - 2 ? (nextY - y1) / dx : slope;

        // Average slopes for smooth transition
        const avgSlope = (prevSlope + nextSlope) / 2;

        // Control points for cubic bezier (C command)
        // Control points are positioned to create smooth curves
        const cp1x = x0 + dx * 0.4;
        const cp1y = y0 + (cp1x - x0) * slope;

        const cp2x = x1 - dx * 0.4;
        const cp2y = y1 - (x1 - cp2x) * slope;

        // Use cubic bezier curve
        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x1} ${y1}`;
      }

      return path;
    };

    // Generate smooth curved paths
    const passRatePath = createSmoothPath(data.map((d) => d.passRate));
    const avgScorePath = createSmoothPath(data.map((d) => d.avgScore));

    // Format dates for display
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    };

    return (
      <div
        className="btn-modern"
        style={{
          width: "100%",
          padding: "24px",
          background: "#FFFFFF",
          color: "#000000",
          boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div className="text-xs font-semibold text-black mb-4 uppercase tracking-wide font-mono">
          {label}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <svg
            width="100%"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            style={{
              overflow: "visible",
              flex: "1 1 auto",
              minWidth: 0,
              maxWidth: chartWidth,
              height: "auto",
            }}
          >
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((value) => {
              const y = scaleY(value);
              return (
                <g key={value}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="#2a2a2e"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="#9a9aa2"
                    fontFamily="Inter, sans-serif"
                  >
                    {value}%
                  </text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {data.map((d, i) => {
              const x = scaleX(i);
              const showLabel =
                i === 0 ||
                i === data.length - 1 ||
                (data.length > 5 && i % Math.ceil(data.length / 5) === 0);
              return showLabel ? (
                <text
                  key={i}
                  x={x}
                  y={chartHeight - padding.bottom + 20}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#9a9aa2"
                  fontFamily="Inter, sans-serif"
                >
                  {formatDate(d.date)}
                </text>
              ) : null;
            })}

            {/* Pass Rate line */}
            <path
              d={passRatePath}
              fill="none"
              stroke="#3dd68c"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                opacity: animated ? 1 : 0,
                transition: "opacity 0.5s ease",
              }}
            />
            {/* Pass Rate points */}
            {data.map((d, i) => (
              <circle
                key={`pass-${i}`}
                cx={scaleX(i)}
                cy={scaleY(d.passRate)}
                r="4"
                fill="#3dd68c"
                style={{
                  opacity: animated ? 1 : 0,
                  transition: `opacity 0.5s ease ${i * 0.1}s`,
                }}
              />
            ))}

            {/* Average Score line */}
            <path
              d={avgScorePath}
              fill="none"
              stroke="#f2f2f2"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                opacity: animated ? 1 : 0,
                transition: "opacity 0.5s ease 0.2s",
              }}
            />
            {/* Average Score points */}
            {data.map((d, i) => (
              <circle
                key={`score-${i}`}
                cx={scaleX(i)}
                cy={scaleY(d.avgScore)}
                r="4"
                fill="#f2f2f2"
                style={{
                  opacity: animated ? 1 : 0,
                  transition: `opacity 0.5s ease ${0.2 + i * 0.1}s`,
                }}
              />
            ))}

            {/* Y-axis */}
            <line
              x1={padding.left}
              y1={padding.top}
              x2={padding.left}
              y2={chartHeight - padding.bottom}
              stroke="#3a3a40"
              strokeWidth="1"
            />
            {/* X-axis */}
            <line
              x1={padding.left}
              y1={chartHeight - padding.bottom}
              x2={chartWidth - padding.right}
              y2={chartHeight - padding.bottom}
              stroke="#3a3a40"
              strokeWidth="1"
            />
          </svg>
        </div>
        {/* Legend */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "24px",
            marginTop: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "16px",
                height: "3px",
                backgroundColor: "#3dd68c",
              }}
            />
            <span className="text-xs font-mono">Pass Rate</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "16px",
                height: "3px",
                backgroundColor: "#f2f2f2",
              }}
            />
            <span className="text-xs font-mono">Average Score</span>
          </div>
        </div>
      </div>
    );
  };

  // Pie chart using CSS
  const AnimatedPieChart = ({
    data,
    label,
  }: {
    data: Array<{ name: string; value: number; color: string }>;
    label: string;
  }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const [animated, setAnimated] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => setAnimated(true), 300);
      return () => clearTimeout(timer);
    }, []);

    let currentAngle = 0;
    const segments = data.map((item) => {
      const percentage = total > 0 ? (item.value / total) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;

      return {
        ...item,
        percentage,
        startAngle,
        angle,
      };
    });

    return (
      <div
        className="btn-modern"
        style={{
          width: "100%",
          padding: "24px",
          background: "#FFFFFF",
          color: "#000000",
          boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div className="text-xs font-semibold text-black mb-4 uppercase tracking-wide font-mono">
          {label}
        </div>
        <div style={{ position: "relative", width: "280px", height: "280px" }}>
          <svg width="280" height="280" viewBox="0 0 200 200">
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="#2a2a2e"
              strokeWidth="40"
            />
            {segments.map((segment, index) => {
              if (segment.percentage === 0) return null;
              const largeArcFlag = segment.angle > 180 ? 1 : 0;
              const startX =
                100 +
                80 * Math.cos((segment.startAngle - 90) * (Math.PI / 180));
              const startY =
                100 +
                80 * Math.sin((segment.startAngle - 90) * (Math.PI / 180));
              const endX =
                100 +
                80 *
                  Math.cos(
                    (segment.startAngle + segment.angle - 90) * (Math.PI / 180)
                  );
              const endY =
                100 +
                80 *
                  Math.sin(
                    (segment.startAngle + segment.angle - 90) * (Math.PI / 180)
                  );

              return (
                <path
                  key={segment.name}
                  d={`M 100 100 L ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} Z`}
                  fill={segment.color}
                  style={{
                    opacity: animated ? 1 : 0,
                    transition: `opacity 0.5s ease ${index * 0.2}s`,
                  }}
                />
              );
            })}
          </svg>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
            }}
          >
            <div className="text-2xl font-bold font-mono">{total}</div>
            <div className="text-xs font-mono">Total</div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="spinner"></div>
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!data || data.totalAnswers === 0) {
    return (
      <div
        className="flex gap-6 px-6 pt-8 overflow-hidden"
        style={{
          paddingBottom: "24px",
          height: "100%",
          marginBottom: "0",
        }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-xl text-gray-600 mb-2">No analytics data yet</p>
            <p className="text-gray-500">
              Generate some answers first to see compliance metrics
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="toolbar">
          <div>
            <h1 className="text-3xl font-bold text-black">Analytics</h1>
            <p className="text-sm" style={{ color: "var(--muted)", marginTop: "4px" }}>
              Compliance metrics and pass rates
            </p>
          </div>
        </div>

        {/* Overview Stats */}
        <div
          className="stat-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "24px",
            paddingLeft: "24px",
            paddingRight: "24px",
            marginBottom: "32px",
          }}
        >
          <div
            className="btn-modern"
            style={{
              padding: "20px",
              background: "#D0D0D0",
              color: "#000000",
              boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide font-mono">
              Total Answers
            </div>
            <div className="text-3xl font-bold font-mono">
              {data.totalAnswers}
            </div>
          </div>
          <div
            className="btn-modern"
            style={{
              padding: "20px",
              background: "#D0D0D0",
              color: "#000000",
              boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide font-mono">
              Total Evaluations
            </div>
            <div className="text-3xl font-bold font-mono">
              {data.totalEvaluations}
            </div>
          </div>
          <div
            className="btn-modern"
            style={{
              padding: "20px",
              background: "#D0D0D0",
              color: "#000000",
              boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide font-mono">
              Avg Quality Score
            </div>
            <div className="text-3xl font-bold font-mono">
              {data.avgQualityScore.toFixed(1)}
            </div>
          </div>
          <div
            className="btn-modern"
            style={{
              padding: "20px",
              background: "#D0D0D0",
              color: "#000000",
              boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide font-mono">
              Overall Pass Rate
            </div>
            <div className="text-3xl font-bold font-mono">
              {data.overallPassRate.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div
          className="card-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "24px",
            paddingLeft: "24px",
            paddingRight: "24px",
            marginBottom: "32px",
          }}
        >
          {/* Performance Over Time - Line Chart */}
          <AnimatedLineChart
            label="Performance Over Time"
            data={data.timeSeries || []}
          />

          {/* Verdict Distribution - Pie Chart */}
          <AnimatedPieChart
            label="Verdict Distribution"
            data={[
              {
                name: "PASS",
                value: data.verdictDistribution.pass,
                color: "#3dd68c",
              },
              {
                name: "WARNING",
                value: data.verdictDistribution.warning,
                color: "#ffb020",
              },
              {
                name: "FAIL",
                value: data.verdictDistribution.fail,
                color: "#ff4d4d",
              },
            ]}
          />

          {/* Overall Compliance - Left Side (Pass Rate & Average Score) */}
          <div
            className="btn-modern"
            style={{
              padding: "24px",
              background: "#FFFFFF",
              color: "#000000",
              boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
              gridColumn: "1",
            }}
          >
            <div className="text-lg font-bold text-black mb-4 uppercase tracking-wide font-mono">
              Overall Compliance
            </div>
            <AnimatedProgressBar
              percentage={data.overallPassRate}
              color="#3dd68c"
              label="Pass Rate"
              value={`${data.overallPassRate.toFixed(1)}%`}
            />
            <AnimatedProgressBar
              percentage={data.overallAvgScore}
              color="#f2f2f2"
              label="Average Score"
              value={`${data.overallAvgScore.toFixed(1)}/100`}
            />
          </div>

          {/* Verdict Distribution - Right Side (PASS, WARNING, FAIL) */}
          <div
            className="btn-modern"
            style={{
              padding: "24px",
              background: "#FFFFFF",
              color: "#000000",
              boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
              gridColumn: "2",
            }}
          >
            <div className="text-lg font-bold text-black mb-4 uppercase tracking-wide font-mono">
              Verdict Distribution
            </div>
            <AnimatedProgressBar
              percentage={
                data.totalEvaluations > 0
                  ? (data.verdictDistribution.pass / data.totalEvaluations) *
                    100
                  : 0
              }
              color="#3dd68c"
              label="PASS"
              value={`${data.verdictDistribution.pass} (${
                data.totalEvaluations > 0
                  ? (
                      (data.verdictDistribution.pass / data.totalEvaluations) *
                      100
                    ).toFixed(1)
                  : "0.0"
              }%)`}
            />
            <AnimatedProgressBar
              percentage={
                data.totalEvaluations > 0
                  ? (data.verdictDistribution.warning / data.totalEvaluations) *
                    100
                  : 0
              }
              color="#ffb020"
              label="WARNING"
              value={`${data.verdictDistribution.warning} (${
                data.totalEvaluations > 0
                  ? (
                      (data.verdictDistribution.warning /
                        data.totalEvaluations) *
                      100
                    ).toFixed(1)
                  : "0.0"
              }%)`}
            />
            <AnimatedProgressBar
              percentage={
                data.totalEvaluations > 0
                  ? (data.verdictDistribution.fail / data.totalEvaluations) *
                    100
                  : 0
              }
              color="#ff4d4d"
              label="FAIL"
              value={`${data.verdictDistribution.fail} (${
                data.totalEvaluations > 0
                  ? (
                      (data.verdictDistribution.fail / data.totalEvaluations) *
                      100
                    ).toFixed(1)
                  : "0.0"
              }%)`}
            />
          </div>
        </div>

        {/* Judge Performance */}
        <div
          style={{
            paddingLeft: "24px",
            paddingRight: "24px",
            marginBottom: "32px",
          }}
        >
          <h2 className="text-xl font-bold text-black mb-4 font-mono">
            Judge Performance
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
              gap: "24px",
            }}
          >
            {data.judgeStats.map((judge) => {
              const maxValue = Math.max(
                judge.pass,
                judge.warning,
                judge.fail,
                1
              );
              return (
                <AnimatedBarChart
                  key={judge.name}
                  label={`${judge.name} - Pass Rate: ${judge.passRate.toFixed(
                    1
                  )}%`}
                  maxValue={maxValue}
                  data={[
                    {
                      name: "PASS",
                      value: judge.pass,
                      color: "#3dd68c",
                    },
                    {
                      name: "WARNING",
                      value: judge.warning,
                      color: "#ffb020",
                    },
                    {
                      name: "FAIL",
                      value: judge.fail,
                      color: "#ff4d4d",
                    },
                  ]}
                />
              );
            })}
          </div>
        </div>

        {/* Refresh Button */}
        <div style={{ paddingLeft: "24px", paddingRight: "24px" }}>
          <button
            onClick={fetchAnalytics}
            className="btn-modern btn-modern-black"
            style={{
              padding: "12px 24px",
              backgroundColor: "#000000",
              color: "#FFFFFF",
              fontSize: "0.875rem",
            }}
          >
            Refresh analytics
          </button>
        </div>
      </div>
    </div>
  );
}
