import { useState, useEffect } from "react";
import type { KBEntry, KBVersion } from "../../types";

const API_BASE = "/api/knowledge-base";

export default function KnowledgeBase() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    id: "",
    category: "",
    question: "",
    answer: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistory, setVersionHistory] = useState<KBVersion[]>([]);
  const [versionHistoryEntryId, setVersionHistoryEntryId] = useState<
    string | null
  >(null);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const response = await fetch(API_BASE);
      const data = await response.json();
      setEntries(data);
    } catch (error) {
      console.error("Error fetching entries:", error);
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

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: response.statusText }));
        alert(`❌ Upload failed: ${errorData.error || response.statusText}`);
        console.error("Upload error:", errorData);
        return;
      }

      const result = await response.json();
      if (result.success) {
        alert(
          `✅ Uploaded ${result.uploaded} entries. ${result.failed} failed.`
        );
        fetchEntries();
      } else {
        alert(`❌ Upload failed: ${result.error || "Unknown error"}`);
      }
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        alert("❌ Error: Invalid JSON file format");
      } else {
        alert(`❌ Error uploading file: ${error?.message || "Unknown error"}`);
      }
      console.error("Upload error:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await fetch(`${API_BASE}/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      } else {
        await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ id: "", category: "", question: "", answer: "" });
      fetchEntries();
    } catch (error) {
      console.error("Error saving entry:", error);
      alert("❌ Error saving entry");
    }
  };

  const handleEdit = (entry: KBEntry) => {
    setFormData({
      id: entry.id,
      category: entry.category,
      question: entry.question,
      answer: entry.answer,
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("⚠️ Are you sure you want to delete this entry?")) return;

    try {
      await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
      fetchEntries();
    } catch (error) {
      console.error("Error deleting entry:", error);
      alert("❌ Error deleting entry");
    }
  };

  const handleDeleteAll = async () => {
    if (
      !confirm(
        "⚠️ Are you sure you want to delete ALL KB entries? This cannot be undone!"
      )
    )
      return;

    try {
      const response = await fetch(API_BASE, { method: "DELETE" });
      if (response.ok) {
        fetchEntries();
        alert("✅ All KB entries deleted successfully");
      } else {
        alert("❌ Error deleting all entries");
      }
    } catch (error) {
      console.error("Error deleting all entries:", error);
      alert("❌ Error deleting all entries");
    }
  };

  const handleViewHistory = async (entryId: string) => {
    try {
      const response = await fetch(`${API_BASE}/${entryId}/versions`);
      if (response.ok) {
        const versions = await response.json();
        setVersionHistory(versions);
        setVersionHistoryEntryId(entryId);
        setShowVersionHistory(true);
      } else if (response.status === 404) {
        // If no versions exist yet, show current entry as version 1
        const entry = entries.find((e) => e.id === entryId);
        if (entry) {
          const currentVersion: KBVersion = {
            id: `current_${entryId}`,
            entry_id: entryId,
            version_number: 1,
            category: entry.category,
            question: entry.question,
            answer: entry.answer,
            change_reason: "Initial version",
            created_at: entry.created_at || new Date().toISOString(),
          };
          setVersionHistory([currentVersion]);
          setVersionHistoryEntryId(entryId);
          setShowVersionHistory(true);
        } else {
          alert("❌ Entry not found");
        }
      } else {
        alert("❌ Error fetching version history");
      }
    } catch (error) {
      console.error("Error fetching version history:", error);
      alert("❌ Error fetching version history");
    }
  };

  const handleRestoreVersion = async (
    entryId: string,
    versionNumber: number
  ) => {
    if (
      !confirm(
        `⚠️ Restore this entry to version ${versionNumber}? This will create a new version.`
      )
    )
      return;

    try {
      const response = await fetch(
        `${API_BASE}/${entryId}/restore/${versionNumber}`,
        {
          method: "POST",
        }
      );
      if (response.ok) {
        const result = await response.json();
        alert(`✅ ${result.message}`);
        fetchEntries();
        // Refresh version history
        if (versionHistoryEntryId === entryId) {
          const versionsResponse = await fetch(
            `${API_BASE}/${entryId}/versions`
          );
          if (versionsResponse.ok) {
            const versions = await versionsResponse.json();
            setVersionHistory(versions);
          }
        }
      } else {
        alert("❌ Error restoring version");
      }
    } catch (error) {
      console.error("Error restoring version:", error);
      alert("❌ Error restoring version");
    }
  };

  const categories = Array.from(new Set(entries.map((e) => e.category)));

  const filteredEntries = entries.filter((entry) => {
    const matchesCategory =
      !selectedCategory || entry.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      entry.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading knowledge base...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex gap-6 px-6 pt-8 overflow-hidden"
      style={{
        paddingBottom: "0",
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
          minHeight: "100%",
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
            📁 Filter by Category
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
            📊 Statistics
          </div>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex justify-between text-black">
              <span>Total Entries:</span>
              <span className="font-semibold">{entries.length}</span>
            </div>
            <div className="flex justify-between text-black">
              <span>Filtered:</span>
              <span className="font-semibold">{filteredEntries.length}</span>
            </div>
            <div className="flex justify-between text-black">
              <span>Categories:</span>
              <span className="font-semibold">{categories.length}</span>
            </div>
          </div>
        </div>

        {/* Delete All Button */}
        {entries.length > 0 && (
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
            🗑️ Delete All Entries
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 overflow-y-auto pr-4"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          paddingBottom: "0",
        }}
      >
        {/* Header with Action Buttons */}
        <div className="flex items-center justify-between mb-6">
          <div style={{ marginTop: "12px", marginLeft: "24px" }}>
            <h1 className="text-3xl font-bold text-black mb-1">
              Knowledge Base
            </h1>
          </div>
          <div className="flex items-center" style={{ paddingRight: "24px" }}>
            {/* Search Bar */}
            <input
              type="text"
              placeholder="🔍 Search by ID, question, answer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="btn-modern-search min-w-[300px] px-4 text-black placeholder-gray-500 focus:outline-none text-sm"
              style={{
                height: "48px",
                border: "1px solid #000000",
                marginRight: "32px",
              }}
            />
            <div className="flex items-center" style={{ gap: "24px" }}>
              <label
                className="btn-modern btn-modern-black cursor-pointer flex items-center justify-center"
                style={{
                  width: "180px",
                  height: "48px",
                  padding: "0",
                  backgroundColor: "#000000",
                  color: "#FFFFFF",
                  fontSize: "0.875rem",
                }}
              >
                Upload JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => {
                  setShowForm(true);
                  setEditingId(null);
                  setFormData({
                    id: "",
                    category: "",
                    question: "",
                    answer: "",
                  });
                }}
                className="btn-modern btn-modern-black cursor-pointer flex items-center justify-center"
                style={{
                  width: "180px",
                  height: "48px",
                  padding: "0",
                  backgroundColor: "#000000",
                  color: "#FFFFFF",
                  fontSize: "0.875rem",
                  marginLeft: "24px",
                }}
              >
                Add Entry
              </button>
            </div>
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
          {filteredEntries.map((entry) => {
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
                key={entry.id}
                className="transition-all cursor-pointer group"
                style={{
                  backgroundColor: "#E5E5E5",
                  border: "none",
                  minHeight: "320px",
                  display: "flex",
                  flexDirection: "column",
                  padding: "28px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#D0D0D0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#E5E5E5";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  // Don't auto-open edit on card click, only use buttons
                }}
              >
                {/* Question (Bold, Large) */}
                <h3 className="text-xl font-bold text-black mb-2 leading-tight">
                  {entry.question}
                </h3>

                {/* Category */}
                <div className="text-base text-black mb-4">
                  {entry.category}
                </div>

                {/* Answer */}
                <p className="text-base text-black leading-relaxed mb-6 flex-grow">
                  {entry.answer || "- - -"}
                </p>

                {/* Footer: Date Created, ID (centered), Date Modified */}
                <div className="flex justify-between items-center text-xs text-black pt-2 border-t border-black/20">
                  <div>Date Created: {formatDate(entry.created_at)}</div>
                  <div className="text-center">ID: {entry.id}</div>
                  <div>Date Modified: {formatDate(entry.updated_at)}</div>
                </div>

                {/* Version info */}
                {entry.current_version && entry.current_version > 1 && (
                  <div className="text-xs text-gray-600 mb-2">
                    Version {entry.current_version}
                  </div>
                )}

                {/* Edit/Delete/History buttons */}
                <div
                  className="flex justify-center"
                  style={{ marginTop: "32px", flexWrap: "wrap", gap: "16px" }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(entry);
                    }}
                    className="btn-modern btn-modern-purple btn-modern-small"
                    style={{
                      flex: "0 0 auto",
                      padding: "8px 16px",
                      fontSize: "0.875rem",
                      margin: "0",
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewHistory(entry.id);
                    }}
                    className="btn-modern btn-modern-purple btn-modern-small"
                    style={{
                      flex: "0 0 auto",
                      padding: "8px 16px",
                      fontSize: "0.875rem",
                      margin: "0",
                    }}
                  >
                    📜 History
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry.id);
                    }}
                    className="btn-modern btn-modern-black btn-modern-small"
                    style={{
                      flex: "0 0 auto",
                      padding: "8px 16px",
                      fontSize: "0.875rem",
                      margin: "0",
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredEntries.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-xl text-gray-600 mb-2">No entries found</p>
            <p className="text-gray-500">
              {searchQuery || selectedCategory
                ? "Try adjusting your filters"
                : "Upload a JSON file or add an entry to get started"}
            </p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100vw",
            height: "100vh",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowForm(false);
              setEditingId(null);
              setFormData({ id: "", category: "", question: "", answer: "" });
            }
          }}
        >
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#FFFFFF",
              padding: "32px",
              maxWidth: "650px",
              width: "calc(100% - 64px)",
              maxHeight: "75vh",
              overflowY: "auto",
              margin: "0 auto",
              clipPath:
                "polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)",
              WebkitClipPath:
                "polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)",
              boxShadow: "8px 8px 0px rgba(0, 0, 0, 0.3)",
              border: "2px solid #000000",
            }}
          >
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormData({
                  id: "",
                  category: "",
                  question: "",
                  answer: "",
                });
              }}
              className="absolute top-4 right-4 text-3xl hover:opacity-70 transition-opacity font-bold w-8 h-8 flex items-center justify-center z-10"
              style={{ color: "#000000", lineHeight: "1" }}
              aria-label="Close"
            >
              ×
            </button>
            <div className="mb-6">
              <h2 className="text-2xl font-bold" style={{ color: "#000000" }}>
                {editingId ? "Edit Entry" : "Add New Entry"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2 font-mono"
                  style={{ color: "#000000" }}
                >
                  ID
                </label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) =>
                    setFormData({ ...formData, id: e.target.value })
                  }
                  required
                  disabled={!!editingId}
                  className="btn-modern-search w-full px-4 text-black focus:outline-none text-sm"
                  style={{
                    height: "48px",
                    border: "1px solid #000000",
                    backgroundColor: "#FFFFFF",
                    opacity: editingId ? 0.5 : 1,
                    cursor: editingId ? "not-allowed" : "text",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 font-mono"
                  style={{ color: "#000000" }}
                >
                  Category
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  required
                  className="btn-modern-search w-full px-4 text-black focus:outline-none text-sm"
                  style={{
                    height: "48px",
                    border: "1px solid #000000",
                    backgroundColor: "#FFFFFF",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 font-mono"
                  style={{ color: "#000000" }}
                >
                  Question
                </label>
                <textarea
                  value={formData.question}
                  onChange={(e) =>
                    setFormData({ ...formData, question: e.target.value })
                  }
                  required
                  rows={3}
                  className="btn-modern-search w-full px-4 py-3 text-black focus:outline-none text-sm"
                  style={{
                    minHeight: "80px",
                    border: "1px solid #000000",
                    backgroundColor: "#FFFFFF",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 font-mono"
                  style={{ color: "#000000" }}
                >
                  Answer
                </label>
                <textarea
                  value={formData.answer}
                  onChange={(e) =>
                    setFormData({ ...formData, answer: e.target.value })
                  }
                  required
                  rows={5}
                  className="btn-modern-search w-full px-4 py-3 text-black focus:outline-none text-sm"
                  style={{
                    minHeight: "120px",
                    border: "1px solid #000000",
                    backgroundColor: "#FFFFFF",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div className="flex gap-3 pt-4" style={{ gap: "16px" }}>
                <button
                  type="submit"
                  className="btn-modern btn-modern-black flex-1"
                  style={{
                    width: "100%",
                    height: "48px",
                    padding: "0",
                    backgroundColor: "#000000",
                    color: "#FFFFFF",
                    fontSize: "0.875rem",
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData({
                      id: "",
                      category: "",
                      question: "",
                      answer: "",
                    });
                  }}
                  className="btn-modern btn-modern-black flex-1"
                  style={{
                    width: "100%",
                    height: "48px",
                    padding: "0",
                    backgroundColor: "#000000",
                    color: "#FFFFFF",
                    fontSize: "0.875rem",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersionHistory && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100vw",
            height: "100vh",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowVersionHistory(false);
              setVersionHistory([]);
              setVersionHistoryEntryId(null);
            }
          }}
        >
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#FFFFFF",
              padding: "32px",
              maxWidth: "800px",
              width: "calc(100% - 64px)",
              maxHeight: "75vh",
              overflowY: "auto",
              margin: "0 auto",
              clipPath:
                "polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)",
              WebkitClipPath:
                "polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)",
              boxShadow: "8px 8px 0px rgba(0, 0, 0, 0.3)",
              border: "2px solid #000000",
            }}
          >
            <button
              onClick={() => {
                setShowVersionHistory(false);
                setVersionHistory([]);
                setVersionHistoryEntryId(null);
              }}
              className="absolute top-4 right-4 text-3xl hover:opacity-70 transition-opacity font-bold w-8 h-8 flex items-center justify-center z-10"
              style={{ color: "#000000", lineHeight: "1" }}
              aria-label="Close"
            >
              ×
            </button>
            <div className="mb-6">
              <h2 className="text-2xl font-bold" style={{ color: "#000000" }}>
                📜 Version History
              </h2>
            </div>

            {versionHistory.length === 0 ? (
              <p className="text-gray-600">No version history available.</p>
            ) : (
              <div className="space-y-4">
                {versionHistory.map((version, index) => {
                  const isCurrent =
                    index === 0 &&
                    version.version_number ===
                      (entries.find((e) => e.id === version.entry_id)
                        ?.current_version || 1);
                  return (
                    <div
                      key={version.id}
                      className="border-2 border-black p-4"
                      style={{
                        backgroundColor: isCurrent ? "#F0F8FF" : "#FFFFFF",
                      }}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="font-bold text-lg">
                            Version {version.version_number}
                          </span>
                          {isCurrent && (
                            <span className="ml-2 text-sm text-green-600 font-semibold">
                              (Current)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">
                          {version.created_at
                            ? new Date(version.created_at).toLocaleString()
                            : "N/A"}
                        </div>
                      </div>

                      {version.change_reason && (
                        <div className="mb-3 text-sm text-gray-700">
                          <strong>Reason:</strong> {version.change_reason}
                        </div>
                      )}

                      <div className="space-y-2 text-sm">
                        <div>
                          <strong>Category:</strong> {version.category}
                        </div>
                        <div>
                          <strong>Question:</strong> {version.question}
                        </div>
                        <div>
                          <strong>Answer:</strong>{" "}
                          <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200">
                            {version.answer}
                          </div>
                        </div>
                      </div>

                      {!isCurrent && (
                        <button
                          onClick={() =>
                            handleRestoreVersion(
                              version.entry_id,
                              version.version_number
                            )
                          }
                          className="mt-3 btn-modern btn-modern-purple btn-modern-small"
                          style={{ width: "100%" }}
                        >
                          🔄 Restore This Version
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
