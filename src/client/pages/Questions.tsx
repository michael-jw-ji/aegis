import { useState, useEffect } from "react";
import type { SecurityQuestion } from "../../types";
import SidebarSlot from "../components/SidebarSlot";

const API_BASE = "/api/questions";

export default function Questions() {
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<
    SecurityQuestion[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ text: "", category: "" });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  useEffect(() => {
    let filtered = questions;
    if (selectedCategory) {
      filtered = filtered.filter((q) => q.category === selectedCategory);
    }
    if (searchQuery) {
      filtered = filtered.filter(
        (q) =>
          q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredQuestions(filtered);
  }, [selectedCategory, questions, searchQuery]);

  const fetchQuestions = async () => {
    try {
      const response = await fetch(API_BASE);
      const data = await response.json();
      setQuestions(data);
      setFilteredQuestions(data);
    } catch (error) {
      console.error("Error fetching questions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);

      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonData),
      });

      const result = await response.json();
      if (result.success) {
        alert(
          `✅ Uploaded ${result.uploaded} questions. ${result.failed} failed.`
        );
        fetchQuestions();
      } else {
        alert("❌ Upload failed");
      }
    } catch (error) {
      alert("❌ Error parsing JSON file");
      console.error(error);
    }
  };

  const handleGenerateAll = async () => {
    if (!confirm("🚀 This will generate answers for all questions. Continue?"))
      return;

    setGenerating(true);
    try {
      const response = await fetch("/api/answers/generate-all", {
        method: "POST",
      });

      if (response.ok) {
        alert("✅ Answers generated successfully!");
        window.location.href = "/results";
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.error || "Failed to generate answers"}`);
      }
    } catch (error) {
      console.error("Error generating answers:", error);
      alert("❌ Error generating answers");
    } finally {
      setGenerating(false);
    }
  };

  const handleEdit = (question: SecurityQuestion) => {
    setFormData({
      text: question.text,
      category: question.category || "",
    });
    setEditingId(question.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("⚠️ Are you sure you want to delete this question?")) return;

    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
      if (response.ok) {
        fetchQuestions();
      } else {
        alert("❌ Error deleting question");
      }
    } catch (error) {
      console.error("Error deleting question:", error);
      alert("❌ Error deleting question");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    try {
      const response = await fetch(`${API_BASE}/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowForm(false);
        setEditingId(null);
        setFormData({ text: "", category: "" });
        fetchQuestions();
      } else {
        alert("❌ Error updating question");
      }
    } catch (error) {
      console.error("Error updating question:", error);
      alert("❌ Error updating question");
    }
  };

  const handleDeleteAll = async () => {
    if (
      !confirm(
        "⚠️ Are you sure you want to delete ALL questions? This cannot be undone!"
      )
    )
      return;

    try {
      // Delete all questions one by one (or we could add a bulk delete endpoint)
      const deletePromises = questions.map((q) =>
        fetch(`${API_BASE}/${q.id}`, { method: "DELETE" })
      );

      await Promise.all(deletePromises);
      fetchQuestions();
      alert("✅ All questions deleted successfully");
    } catch (error) {
      console.error("Error deleting all questions:", error);
      alert("❌ Error deleting questions");
    }
  };

  const categories = Array.from(
    new Set(questions.map((q) => q.category).filter(Boolean))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="spinner"></div>
          <p className="text-gray-400">Loading questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="text-3xl font-bold text-black">Questions</h1>
        <div className="toolbar-tools">
          <input
            type="text"
            placeholder="Search by ID, question..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="btn-modern-search px-4 text-black placeholder-gray-500 focus:outline-none text-sm"
            style={{
              height: "44px",
              width: "280px",
            }}
          />
          <div className="actions">
            <label className="btn-modern btn-modern-black cursor-pointer flex items-center justify-center">
              Upload JSON
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            {questions.length > 0 && (
              <button
                onClick={handleGenerateAll}
                disabled={generating}
                className="btn-modern btn-modern-black cursor-pointer flex items-center justify-center"
                style={{
                  opacity: generating ? 0.5 : 1,
                  cursor: generating ? "not-allowed" : "pointer",
                }}
              >
                {generating ? "Generating..." : "Generate answers"}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="page-body">
      <SidebarSlot>
      {/* Left Sidebar - Category Filter and Statistics */}
      <div
        className="rail flex-shrink-0 flex flex-col gap-4"
        style={{
          backgroundColor: "#E5E5E5",
          padding: "16px",
          paddingBottom: "24px",
          height: "100%",
          width: "320px",
        }}
      >
        {/* Category Filter */}
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
            Filter by category
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="btn-modern-search w-full px-4 text-black focus:outline-none text-sm"
            style={{
              height: "48px",
              border: "1px solid #000000",
              marginTop: "8px",
            }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
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
            Overview
          </div>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex justify-between text-black">
              <span>Total Questions:</span>
              <span className="font-semibold">{questions.length}</span>
            </div>
            <div className="flex justify-between text-black">
              <span>Filtered:</span>
              <span className="font-semibold">{filteredQuestions.length}</span>
            </div>
            <div className="flex justify-between text-black">
              <span>Categories:</span>
              <span className="font-semibold">{categories.length}</span>
            </div>
          </div>
        </div>

        {/* Delete All Button */}
        {questions.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="btn-modern btn-danger w-full"
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
            Delete all questions
          </button>
        )}
      </div>
      </SidebarSlot>

      {/* Main Content Area */}
      <div
        className="flex-1 overflow-y-auto pr-4"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          paddingBottom: "24px",
        }}
      >
        {/* Grid - 2 columns with spacing */}
        <div
          className="card-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "24px",
            paddingLeft: "24px",
            paddingRight: "24px",
          }}
        >
          {filteredQuestions.map((question) => {
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
                key={question.id}
                className="entry-card"
                style={{
                  backgroundColor: "#E5E5E5",
                  border: "none",
                  minHeight: "200px",
                  display: "flex",
                  flexDirection: "column",
                  padding: "20px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#D0D0D0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#E5E5E5";
                }}
              >
                {/* Question ID */}
                <div className="text-xs text-black mb-2">ID: {question.id}</div>

                {/* Question Text (Bold, Large) */}
                <h3 className="text-xl font-bold text-black mb-2 leading-relaxed flex-grow">
                  {question.text}
                </h3>

                {/* Category */}
                {question.category && (
                  <div className="pill mb-2">{question.category}</div>
                )}

                {/* Footer: Date Created */}
                <div className="flex justify-between items-center text-xs text-black pt-2 border-t border-black/20 mt-auto">
                  <div>
                    Date Created:{" "}
                    {question.created_at
                      ? formatDate(question.created_at)
                      : "N/A"}
                  </div>
                </div>

                {/* Edit/Delete buttons */}
                <div
                  className="flex gap-2 overflow-hidden"
                  style={{ marginTop: "12px" }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(question);
                    }}
                    className="btn-modern btn-modern-purple btn-modern-small flex-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(question.id);
                    }}
                    className="btn-modern btn-danger btn-modern-small flex-1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredQuestions.length === 0 && (
          <div className="text-center py-16">
            <p className="text-xl text-gray-600 mb-2">No questions found</p>
            <p className="text-gray-500">
              {searchQuery || selectedCategory
                ? "Try adjusting your filters"
                : "Upload a JSON file to get started"}
            </p>
          </div>
        )}
      </div>
      </div>

      {/* Edit Form Modal */}
      {showForm && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowForm(false);
            setEditingId(null);
            setFormData({ text: "", category: "" });
          }}
          style={{
            position: "fixed",
            width: "100vw",
            height: "100vh",
          }}
        >
          <div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#FFFFFF",
              padding: "32px",
              maxWidth: "650px",
              width: "calc(100% - 64px)",
              maxHeight: "75vh",
              overflowY: "auto",
              clipPath:
                "polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)",
              WebkitClipPath:
                "polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)",
              boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.5)",
              position: "relative",
              margin: "auto",
            }}
          >
            <h2
              className="text-2xl font-bold mb-6"
              style={{ color: "#000000" }}
            >
              Edit Question
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2 font-mono"
                  style={{ color: "#000000" }}
                >
                  Question Text
                </label>
                <textarea
                  value={formData.text}
                  onChange={(e) =>
                    setFormData({ ...formData, text: e.target.value })
                  }
                  required
                  rows={4}
                  className="btn-modern-search w-full px-4 py-2 text-black focus:outline-none text-sm"
                  style={{
                    border: "1px solid #000000",
                    backgroundColor: "#FFFFFF",
                    resize: "vertical",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 font-mono"
                  style={{ color: "#000000" }}
                >
                  Category (optional)
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="Leave empty to auto-assign"
                  className="btn-modern-search w-full px-4 text-black focus:outline-none text-sm"
                  style={{
                    height: "48px",
                    border: "1px solid #000000",
                    backgroundColor: "#FFFFFF",
                  }}
                />
              </div>
              <div className="flex gap-4" style={{ marginTop: "32px" }}>
                <button
                  type="submit"
                  className="btn-modern btn-modern-black flex-1"
                  style={{
                    height: "48px",
                    backgroundColor: "#000000",
                    color: "#FFFFFF",
                  }}
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData({ text: "", category: "" });
                  }}
                  className="btn-modern flex-1"
                  style={{
                    height: "48px",
                    backgroundColor: "#E5E5E5",
                    color: "#000000",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
