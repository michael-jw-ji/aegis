import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const SIDEBAR_SLOT_ID = "sidebar-slot";

export default function SidebarSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById(SIDEBAR_SLOT_ID));
  }, []);

  return target ? createPortal(children, target) : null;
}
