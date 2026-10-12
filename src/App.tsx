import { BrowserRouter, Routes, Route, Link, NavLink } from "react-router-dom";
import KnowledgeBase from "./client/pages/KnowledgeBase";
import Questions from "./client/pages/Questions";
import Results from "./client/pages/Results";
import Analytics from "./client/pages/Analytics";
import { SIDEBAR_SLOT_ID } from "./client/components/SidebarSlot";

const navItems = [
  { path: "/", label: "Knowledge Base" },
  { path: "/questions", label: "Questions" },
  { path: "/results", label: "Results" },
  { path: "/analytics", label: "Analytics" },
];

function SideNav() {
  return (
    <aside className="sidenav">
      <Link to="/" className="brand">
        <img src="/owl.svg" alt="" className="brand-mark" />
        Aegis
      </Link>
      <nav className="sidenav-links">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div id={SIDEBAR_SLOT_ID} className="sidebar-slot" />
    </aside>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="shell">
        <SideNav />
        <main className="app-main">
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
