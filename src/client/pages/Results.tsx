import { useState, useEffect } from "react";
import type { GeneratedAnswer, JudgeEvaluation } from "../../types";

const API_BASE = "/api/answers";

export default function Results() {
  const [answers, setAnswers] = useState<GeneratedAnswer[]>([]);
  const [filteredAnswers, setFilteredAnswers] = useState<GeneratedAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [openEvaluations, setOpenEvaluations] = useState<
    Record<string, JudgeEvaluation[] | undefined>
  >({});

  useEffect(() => {
    fetchAnswers();
  }, []);

  useEffect(() => {
    let filtered = answers;

    // Multi-select category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((a) => {
        const category = a.category || "Uncategorized";
        return selectedCategories.includes(category);
      });
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (a) =>
          a.question_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.answer.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredAnswers(filtered);
  }, [selectedCategories, answers, searchQuery]);

  const fetchAnswers = async () => {
    try {
      const response = await fetch(API_BASE);
      const data = await response.json();
      setAnswers(data);
      setFilteredAnswers(data);
    } catch (error) {
      console.error("Error fetching answers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("⚠️ Are you sure you want to delete this answer?")) return;

    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
      if (response.ok) {
        fetchAnswers();
      } else {
        alert("❌ Error deleting answer");
      }
    } catch (error) {
      console.error("Error deleting answer:", error);
      alert("❌ Error deleting answer");
    }
  };

  const handleDeleteAll = async () => {
    if (
      !confirm(
        "⚠️ Are you sure you want to delete ALL answers? This cannot be undone!"
      )
    )
      return;

    try {
      const response = await fetch(API_BASE, { method: "DELETE" });
      if (response.ok) {
        fetchAnswers();
        alert("✅ All answers deleted successfully");
      } else {
        alert("❌ Error deleting all answers");
      }
    } catch (error) {
      console.error("Error deleting all answers:", error);
      alert("❌ Error deleting all answers");
    }
  };

  // Get all unique categories, including "Uncategorized" for items without category
  const allCategories = Array.from(
    new Set(answers.map((a) => a.category || "Uncategorized"))
  ).sort();

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleEvaluations = async (answerId: string) => {
    if (openEvaluations[answerId]) {
      // close panel
      setOpenEvaluations((prev) => ({ ...prev, [answerId]: undefined }));
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/${answerId}/evaluations`);
      const data = await res.json();
      setOpenEvaluations((prev) => ({ ...prev, [answerId]: data }));
    } catch (e) {
      console.error("Failed to load evaluations", e);
    }
  };

  // Helper function to get color based on score and verdict
  const getVerdictColor = (
    score: number | null | undefined,
    verdict: string | null | undefined
  ) => {
    const scoreValue = score ?? 0;
    const verdictUpper = (verdict || "").toUpperCase();

    // If verdict is explicitly FAIL, use red
    if (verdictUpper === "FAIL") {
      // Darker red for lower scores (0 = darkest)
      const intensity = Math.max(0, Math.min(1, scoreValue / 50)); // 0-50 maps to 0-1
      const red = Math.round(139 + 116 * (1 - intensity)); // 139 (dark red) to 255 (lighter red)
      const green = Math.round(0 + 69 * (1 - intensity)); // 0 to 69
      const blue = Math.round(0 + 19 * (1 - intensity)); // 0 to 19
      return {
        backgroundColor: `rgb(${red}, ${green}, ${blue})`,
        color: "#ffffff",
      };
    }

    // If verdict is WARNING, use orange/yellow
    if (verdictUpper === "WARNING") {
      // Orange to yellow based on score
      const intensity = Math.max(0, Math.min(1, scoreValue / 70)); // 0-70 maps to 0-1
      const red = 255;
      const green = Math.round(140 + 115 * intensity); // 140 (orange) to 255 (yellow)
      const blue = 0;
      return {
        backgroundColor: `rgb(${red}, ${green}, ${blue})`,
        color: "#000000",
      };
    }

    // If verdict is PASS or anything else, use green (darker = better)
    // Score 0-40: Light green to medium green
    // Score 41-70: Medium green
    // Score 71-100: Medium green to dark green (darker = better)
    let red, green, blue;
    if (scoreValue <= 40) {
      // Light green to medium green (worse scores = lighter)
      const intensity = scoreValue / 40;
      red = Math.round(144 + 111 * intensity); // 144 to 255
      green = Math.round(238 + 17 * intensity); // 238 to 255
      blue = Math.round(144 + 111 * intensity); // 144 to 255
    } else if (scoreValue <= 70) {
      // Medium green (consistent)
      red = 34;
      green = 197;
      blue = 94;
    } else {
      // Medium green to dark green (better scores = darker)
      const intensity = (scoreValue - 70) / 30; // 0-1 for scores 70-100
      red = Math.round(34 - 34 * intensity); // 34 to 0 (darker)
      green = Math.round(197 - 97 * intensity); // 197 to 100 (darker)
      blue = Math.round(94 - 94 * intensity); // 94 to 0 (darker)
    }

    return {
      backgroundColor: `rgb(${red}, ${green}, ${blue})`,
      color: scoreValue >= 70 ? "#ffffff" : "#000000", // White text for darker greens
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading results...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex gap-6 px-6 pt-8 overflow-hidden"
      style={{
        paddingBottom: "24px",
        height: "100%",
        marginBottom: "0",
      }}
    >
      {/* Left Sidebar - Category Filter and Statistics */}
      <div
        className="flex-shrink-0 flex flex-col gap-4"
        style={{
          backgroundColor: "#E5E5E5",
          padding: "16px",
          paddingBottom: "24px",
          height: "100%",
          width: "320px",
        }}
      >
        {/* Category Filter - Multi-select */}
        <div
          className="btn-modern"
          style={{
            width: "100%",
            padding: "16px",
            background: "#E5E5E5",
            color: "#000000",
            boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
            minHeight: "200px",
            maxHeight: "400px",
            overflowY: "auto",
          }}
        >
          <div className="text-xs font-semibold text-black mb-3 uppercase tracking-wide font-mono">
            📁 Filter by Category (Multi-select)
          </div>
          <div className="space-y-2 mt-2">
            {allCategories.map((cat) => (
              <label
                key={cat}
                className="flex items-center cursor-pointer"
                style={{ padding: "8px 0" }}
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat)}
                  onChange={() => handleCategoryToggle(cat)}
                  className="mr-3 w-4 h-4 accent-black"
                  style={{ cursor: "pointer" }}
                />
                <span className="text-sm text-black font-mono">{cat}</span>
              </label>
            ))}
            {allCategories.length === 0 && (
              <p className="text-sm text-gray-500 italic">
                No categories available
              </p>
            )}
          </div>
          {selectedCategories.length > 0 && (
            <button
              onClick={() => setSelectedCategories([])}
              className="mt-3 text-xs text-black underline hover:no-underline font-mono"
            >
              Clear all ({selectedCategories.length})
            </button>
          )}
        </div>

        {/* Statistics */}
        <div
          className="btn-modern"
          style={{
            width: "100%",
            padding: "16px",
            background: "#E5E5E5",
            color: "#000000",
            boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.3)",
            minHeight: "130px",
          }}
        >
          <div className="text-xs font-semibold text-black mb-3 uppercase tracking-wide font-mono">
            📊 Statistics
          </div>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex justify-between text-black">
              <span>Total Answers:</span>
              <span className="font-semibold">{answers.length}</span>
            </div>
            <div className="flex justify-between text-black">
              <span>Filtered:</span>
              <span className="font-semibold">{filteredAnswers.length}</span>
            </div>
            <div className="flex justify-between text-black">
              <span>Categories:</span>
              <span className="font-semibold">{allCategories.length}</span>
            </div>
            <div className="flex justify-between text-black">
              <span>Selected:</span>
              <span className="font-semibold">
                {selectedCategories.length || "All"}
              </span>
            </div>
          </div>
        </div>

        {/* Delete All Button */}
        {answers.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="btn-modern btn-modern-black w-full"
            style={{
              padding: "16px",
              backgroundColor: "#000000",
              color: "#FFFFFF",
              fontSize: "0.875rem",
              fontWeight: "semibold",
              marginTop: "auto",
              marginBottom: "24px",
            }}
          >
            🗑️ Delete All Answers
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 overflow-y-auto pr-4"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          paddingBottom: "24px",
        }}
      >
        {/* Header with Action Buttons */}
        <div className="flex items-center justify-between mb-6">
          <div style={{ marginTop: "12px", marginLeft: "24px" }}>
            <h1 className="text-3xl font-bold text-black mb-1">Results</h1>
          </div>
          <div className="flex items-center" style={{ paddingRight: "24px" }}>
            {/* Search Bar */}
            <input
              type="text"
              placeholder="🔍 Search by question, answer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="btn-modern-search min-w-[300px] px-4 text-black placeholder-gray-500 focus:outline-none text-sm"
              style={{
                height: "48px",
                border: "1px solid #000000",
                marginRight: "32px",
              }}
            />
          </div>
        </div>

        {/* Grid - 2 columns with spacing */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "24px",
            paddingLeft: "24px",
            paddingRight: "24px",
          }}
        >
          {filteredAnswers.map((answer) => {
            // Format dates as YYYY-MM-DD
            const formatDate = (dateStr?: string) => {
              if (!dateStr) return "N/A";
              try {
                const date = new Date(dateStr);
                return date.toISOString().split("T")[0];
              } catch {
                return "N/A";
              }
            };

            return (
              <div
                key={answer.id}
                className="transition-all cursor-pointer group"
                style={{
                  backgroundColor: "#E5E5E5",
                  border: "none",
                  minHeight: "320px",
                  display: "flex",
                  flexDirection: "column",
                  padding: "28px",
                }}
              >
                {/* Question ID */}
                <div className="text-xs text-black mb-2">
                  ID: {answer.question_id}
                </div>

                {/* Question Text (Bold, Large) */}
                <h3 className="text-xl font-bold text-black mb-2 leading-tight">
                  {answer.question_text}
                </h3>

                {/* Category */}
                <div className="text-base text-black mb-4">
                  {answer.category || "Uncategorized"}
                </div>

                {/* Answer */}
                <p className="text-base text-black leading-relaxed mb-6 flex-grow">
                  {answer.answer || "- - -"}
                </p>

                {/* Footer: Date Created and Quality */}
                <div className="flex justify-between items-center text-xs text-black pt-2 border-t border-black/20">
                  <div>Date Created: {formatDate(answer.created_at)}</div>
                  <div>
                    Quality:{" "}
                    {typeof answer.quality_score === "number"
                      ? `${answer.quality_score.toFixed(1)}`
                      : "—"}
                  </div>
                </div>

                {/* Delete button */}
                <div
                  className="flex gap-2 overflow-hidden"
                  style={{ marginTop: "16px" }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(answer.id);
                    }}
                    className="btn-modern btn-modern-black btn-modern-small w-full"
                  >
                    🗑️ Delete
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleEvaluations(answer.id);
                    }}
                    className="btn-modern btn-modern-small w-full"
                  >
                    🧑‍⚖️ Judges
                  </button>
                </div>

                {/* Evaluations Panel */}
                {openEvaluations[answer.id] && (
                  <div style={{ marginTop: "24px" }}>
                    {(openEvaluations[answer.id] || []).length === 0 ? (
                      <div
                        className="text-sm text-black rounded-sm"
                        style={{
                          paddingTop: "16px",
                          paddingBottom: "16px",
                          paddingLeft: "16px",
                          paddingRight: "16px",
                          backgroundColor: "#D0D0D0",
                        }}
                      >
                        No evaluations yet.
                      </div>
                    ) : (
                      (openEvaluations[answer.id] || []).map(
                        (ev, index, array) => {
                          const verdictColor = getVerdictColor(
                            ev.score,
                            ev.verdict
                          );
                          const verdictText = ev.verdict || "-";
                          const isLast = index === array.length - 1;
                          return (
                            <div
                              key={ev.id}
                              className="text-sm text-black rounded-sm"
                              style={{
                                paddingTop: "16px",
                                paddingBottom: "16px",
                                paddingLeft: "16px",
                                paddingRight: "16px",
                                marginBottom: isLast ? "0px" : "24px",
                                backgroundColor: "#D0D0D0",
                              }}
                            >
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-mono">
                                  Judge: {ev.judge_id}
                                </span>
                                <div className="flex items-center">
                                  <span>Score: {ev.score ?? 0}</span>
                                  <span
                                    style={{
                                      ...verdictColor,
                                      padding: "6px 12px",
                                      borderRadius: "4px",
                                      fontWeight: "600",
                                      fontSize: "0.75rem",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.5px",
                                      display: "inline-block",
                                      marginLeft: "16px",
                                    }}
                                  >
                                    {verdictText}
                                  </span>
                                </div>
                              </div>
                              <div className="text-xs opacity-80">
                                {ev.reasoning}
                              </div>
                            </div>
                          );
                        }
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredAnswers.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">✨</div>
            <p className="text-xl text-gray-600 mb-2">No answers found</p>
            <p className="text-gray-500">
              {searchQuery || selectedCategories.length > 0
                ? "Try adjusting your filters"
                : "Generate answers from the Questions page to see results here"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
