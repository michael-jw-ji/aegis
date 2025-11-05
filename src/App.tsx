import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import KnowledgeBase from "./client/pages/KnowledgeBase";
import Questions from "./client/pages/Questions";
import Results from "./client/pages/Results";
import Analytics from "./client/pages/Analytics";

function Navigation() {
  const navItems = [
    { path: "/", label: "Knowledge Base", icon: "📚" },
    { path: "/questions", label: "Questions", icon: "❓" },
    { path: "/results", label: "Results", icon: "✨" },
    { path: "/analytics", label: "Analytics", icon: "📊" },
  ];

  return (
    <nav
      className="glass sticky top-0 z-50 border-b border-gray-800/50"
      style={{ minHeight: "100px", display: "flex", alignItems: "center" }}
    >
      <div
        className="w-full"
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          minHeight: "inherit",
        }}
      >
        <div className="flex items-center justify-between w-full px-6">
          <Link
            to="/"
            className="flex items-center gap-3 group no-underline"
            style={{
              color: "white",
              textDecoration: "none",
              paddingLeft: "24px",
            }}
          >
            <div
              className="font-bold"
              style={{
                color: "white",
                fontSize: "2.5rem",
                fontFamily:
                  "'Space Mono', 'Roboto Mono', 'Courier New', monospace",
                fontWeight: "700",
              }}
            >
              Sentri AI
            </div>
          </Link>
          <div
            className="flex items-center"
            style={{ gap: "32px", paddingRight: "24px" }}
          >
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="btn-modern btn-modern-white no-underline flex items-center justify-center"
                style={{
                  color: "#000000",
                  backgroundColor: "#FFFFFF",
                  textDecoration: "none",
                  padding: "8px 16px",
                  fontSize: "0.75rem",
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div
        style={{
          margin: 0,
          padding: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Navigation />
        <main style={{ margin: 0, padding: 0, flex: 1, overflow: "hidden" }}>
          <Routes>
            <Route path="/" element={<KnowledgeBase />} />
            <Route path="/questions" element={<Questions />} />
            <Route path="/results" element={<Results />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
