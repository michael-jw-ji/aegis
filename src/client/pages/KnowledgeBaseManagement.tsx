import React, { useEffect, useState } from "react";

// Define the type for knowledge base entries
interface KnowledgeBaseEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const KnowledgeBaseManagement = () => {
  // Update the state type
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [newEntry, setNewEntry] = useState({
    question: "",
    answer: "",
    category: "",
  });

  useEffect(() => {
    fetch("/api/knowledge-base")
      .then((res) => res.json())
      .then((data) => setEntries(data))
      .catch((err) => console.error("Error fetching knowledge base:", err));
  }, []);

  const handleAdd = () => {
    fetch("/api/knowledge-base", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEntry),
    })
      .then((res) => res.json())
      .then((entry) => setEntries((prev) => [...prev, entry]))
      .catch((err) => console.error("Error adding entry:", err));
  };

  // Explicitly type the id parameter in handleDelete
  const handleDelete = (id: string) => {
    fetch(`/api/knowledge-base/${id}`, { method: "DELETE" })
      .then(() => setEntries((prev) => prev.filter((entry) => entry.id !== id)))
      .catch((err) => console.error("Error deleting entry:", err));
  };

  return (
    <div className="min-h-screen bg-purple-50 flex flex-col items-center">
      <header className="bg-purple-600 text-white w-full py-6 shadow-md">
        <h1 className="text-center text-4xl font-bold">
          Knowledge Base Management
        </h1>
      </header>
      <main className="flex flex-col items-center mt-8 w-full px-4">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Question"
            value={newEntry.question}
            onChange={(e) =>
              setNewEntry({ ...newEntry, question: e.target.value })
            }
            className="border p-2 mr-2"
          />
          <input
            type="text"
            placeholder="Answer"
            value={newEntry.answer}
            onChange={(e) =>
              setNewEntry({ ...newEntry, answer: e.target.value })
            }
            className="border p-2 mr-2"
          />
          <input
            type="text"
            placeholder="Category"
            value={newEntry.category}
            onChange={(e) =>
              setNewEntry({ ...newEntry, category: e.target.value })
            }
            className="border p-2 mr-2"
          />
          <button
            onClick={handleAdd}
            className="bg-purple-500 text-white px-4 py-2 rounded shadow-md hover:bg-purple-700"
          >
            Add
          </button>
        </div>
        <button className="bg-purple-500 text-white px-6 py-2 rounded shadow-md hover:bg-purple-700 mb-6">
          Add New Entry
        </button>
        {entries.length === 0 ? (
          <p className="text-lg text-gray-700">
            No entries available. Add new ones.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="border border-gray-300 p-6 rounded-lg shadow-md bg-white hover:shadow-lg transition-shadow"
              >
                <p className="font-bold text-purple-700">ID: {entry.id}</p>
                <p className="font-semibold mt-2">Question:</p>
                <p className="text-gray-800">{entry.question}</p>
                <p className="font-semibold mt-2">Answer:</p>
                <p className="text-gray-800">{entry.answer}</p>
                <p className="font-semibold mt-2">Category:</p>
                <p className="text-gray-800">{entry.category}</p>
                <div className="mt-4">
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="bg-red-500 text-white px-4 py-2 rounded shadow-md hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <footer className="bg-purple-600 text-white w-full py-4 mt-auto">
        <p className="text-center">&copy; 2025 Aegis</p>
      </footer>
    </div>
  );
};

export default KnowledgeBaseManagement;
