// main.tsx — Scripts Launcher (CEP panel client)
// Drives the panel UI: listing, launching, drag-and-drop reordering, shy toggles, theme.
// Author: Bruno Quintin
// Version: 1.2
//
// This extension is "Vibe Coded" and provided without warranty; the user
// therefore assumes full responsibility for its implementation.

import { useEffect, useRef, useState } from "react";
import { csi, evalTS } from "../lib/utils/bolt";
import "./main.scss";

import shyIcon from "./assets/shy.svg";
import hideShyIcon from "./assets/hideshy.svg";
import resetIcon from "./assets/reset.svg";

type ScriptType = "panel" | "script";

interface ScriptEntry {
  id: string;
  file: string;
  fullPath: string;
  type: ScriptType;
  displayName: string;
  hidden: boolean;
}

type FilterType = "panel" | "script" | "all";

const detectLightMode = (): boolean => {
  try {
    const bg = csi.getHostEnvironment().appSkinInfo.panelBackgroundColor
      .color;
    const luminance = 0.299 * bg.red + 0.587 * bg.green + 0.114 * bg.blue;
    return luminance >= 128;
  } catch (e) {
    console.error("Theme detection error:", e);
    return false;
  }
};

export const App = () => {
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [filterType, setFilterType] = useState<FilterType>(
    (localStorage.getItem("filterType") as FilterType) || "panel"
  );
  const [isShyMasterActive, setShyMasterActive] = useState(
    localStorage.getItem("shyMasterActive") === "true"
  );
  const [isLightMode, setLightMode] = useState(detectLightMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});
  const dragState = useRef<{
    srcId: string;
    srcIndex: number;
    insertIndex: number;
    offsetY: number;
    ghostEl: HTMLDivElement | null;
    lastClientY: number;
    autoScrollFrame: number | null;
  } | null>(null);

  const loadLauncher = () => {
    evalTS("getOrderedScriptsList").then(setScripts);
  };

  useEffect(() => {
    loadLauncher();
    const onThemeChanged = () => setLightMode(detectLightMode());
    csi.addEventListener(
      "com.adobe.csxs.events.ThemeColorChanged",
      onThemeChanged
    );
    return () => {
      csi.removeEventListener(
        "com.adobe.csxs.events.ThemeColorChanged",
        onThemeChanged
      );
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("light-mode", isLightMode);
  }, [isLightMode]);

  const toggleShyMaster = () => {
    const next = !isShyMasterActive;
    setShyMasterActive(next);
    localStorage.setItem("shyMasterActive", String(next));
  };

  const applyFilter = (val: FilterType) => {
    setFilterType(val);
    localStorage.setItem("filterType", val);
  };

  const toggleIndividualShy = (id: string) => {
    setScripts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s))
    );
    const target = scripts.find((s) => s.id === id);
    evalTS("setScriptHidden", id, !(target ? target.hidden : false));
  };

  const runScriptEntry = (s: ScriptEntry) => {
    if (s.type === "panel") {
      evalTS("runAETask", s.file);
    } else {
      evalTS("runScript", s.fullPath);
    }
  };

  const resetPreferences = () => {
    localStorage.removeItem("shyMasterActive");
    localStorage.removeItem("filterType");
    setFilterType("panel");
    setShyMasterActive(false);
    setLightMode(detectLightMode());
    evalTS("resetAllPreferences").then(loadLauncher);
  };

  // --- Drag & drop reorder ---

  // Zone near the top/bottom edge of the scroll area that triggers auto-scroll, and
  // the fastest scroll speed (px/frame) reached right at the edge.
  const AUTO_SCROLL_EDGE = 40;
  const AUTO_SCROLL_MAX_SPEED = 14;

  const handleDragMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    scriptId: string
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const container = containerRef.current;
    const srcEl = rowRefs.current[scriptId];
    if (!container || !srcEl) return;

    const rect = srcEl.getBoundingClientRect();
    const rows = Array.from(
      container.querySelectorAll<HTMLDivElement>(".script-row")
    );
    const srcIndex = rows.indexOf(srcEl);

    const ghostEl = srcEl.cloneNode(true) as HTMLDivElement;
    ghostEl.style.transition = "none";
    ghostEl.style.position = "fixed";
    ghostEl.style.width = rect.width + "px";
    ghostEl.style.left = rect.left + "px";
    ghostEl.style.top = rect.top + "px";
    ghostEl.style.opacity = "0.8";
    ghostEl.style.pointerEvents = "none";
    ghostEl.style.zIndex = "9999";
    ghostEl.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
    document.body.appendChild(ghostEl);

    srcEl.classList.add("dragging");

    dragState.current = {
      srcId: scriptId,
      srcIndex,
      insertIndex: srcIndex,
      offsetY: e.clientY - rect.top,
      ghostEl,
      lastClientY: e.clientY,
      autoScrollFrame: null,
    };

    document.addEventListener("mousemove", handleDragMouseMove);
    document.addEventListener("mouseup", handleDragMouseUp);

    dragState.current.autoScrollFrame = requestAnimationFrame(runAutoScroll);
  };

  // Recomputes the ghost position and the insertion index/row shifts for a given
  // cursor Y. Called both on real mousemove and after each auto-scroll tick, since
  // scrolling moves rows under a cursor that may not have moved itself.
  const updateDragPosition = (clientY: number) => {
    const state = dragState.current;
    const container = containerRef.current;
    const srcEl = state && rowRefs.current[state.srcId];
    if (!state || !container || !srcEl || !state.ghostEl) return;

    state.ghostEl.style.top = clientY - state.offsetY + "px";

    const rows = Array.from(
      container.querySelectorAll<HTMLDivElement>(".script-row")
    );
    const rowH = srcEl.offsetHeight + 2;

    let newInsertIndex = rows.length;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] === srcEl) continue;
      const mid = rows[i].getBoundingClientRect();
      if (clientY < mid.top + mid.height / 2) {
        newInsertIndex = i;
        break;
      }
    }

    if (newInsertIndex === state.insertIndex) return;
    state.insertIndex = newInsertIndex;

    rows.forEach((row, i) => {
      if (row === srcEl) return;
      let shift = 0;
      if (state.srcIndex < state.insertIndex) {
        if (i > state.srcIndex && i < state.insertIndex) shift = -rowH;
      } else if (state.srcIndex > state.insertIndex) {
        if (i >= state.insertIndex && i < state.srcIndex) shift = rowH;
      }
      row.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  };

  const handleDragMouseMove = (e: MouseEvent) => {
    const state = dragState.current;
    if (!state) return;
    state.lastClientY = e.clientY;
    updateDragPosition(e.clientY);
  };

  // Auto-scrolls the scroll area while the cursor sits in the top/bottom edge zone,
  // so a row can be dragged past what's currently visible. Runs every frame for as
  // long as the drag is active, independent of mousemove events.
  const runAutoScroll = () => {
    const state = dragState.current;
    const scrollArea = scrollAreaRef.current;
    if (!state || !scrollArea) return;

    const rect = scrollArea.getBoundingClientRect();
    const y = state.lastClientY;
    let delta = 0;

    if (y < rect.top + AUTO_SCROLL_EDGE) {
      const depth = Math.min(AUTO_SCROLL_EDGE, rect.top + AUTO_SCROLL_EDGE - y);
      delta = -Math.ceil((depth / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_SPEED);
    } else if (y > rect.bottom - AUTO_SCROLL_EDGE) {
      const depth = Math.min(AUTO_SCROLL_EDGE, y - (rect.bottom - AUTO_SCROLL_EDGE));
      delta = Math.ceil((depth / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_SPEED);
    }

    if (delta !== 0) {
      scrollArea.scrollTop += delta;
      updateDragPosition(y);
    }

    state.autoScrollFrame = requestAnimationFrame(runAutoScroll);
  };

  const handleDragMouseUp = () => {
    document.removeEventListener("mousemove", handleDragMouseMove);
    document.removeEventListener("mouseup", handleDragMouseUp);

    const state = dragState.current;
    const container = containerRef.current;
    if (!state || !container) return;

    if (state.autoScrollFrame !== null) {
      cancelAnimationFrame(state.autoScrollFrame);
    }

    if (state.ghostEl && state.ghostEl.parentNode) {
      state.ghostEl.parentNode.removeChild(state.ghostEl);
    }

    const srcEl = rowRefs.current[state.srcId];
    if (srcEl) srcEl.classList.remove("dragging");

    const rows = Array.from(
      container.querySelectorAll<HTMLDivElement>(".script-row")
    );
    rows.forEach((r) => {
      r.style.transition = "none";
      r.style.transform = "";
    });
    requestAnimationFrame(() => {
      rows.forEach((r) => {
        r.style.transition = "";
      });
    });

    dragState.current = null;

    if (state.insertIndex === state.srcIndex) return;

    setScripts((prev) => {
      const next = prev.slice();
      const from = next.findIndex((s) => s.id === state.srcId);
      const [moved] = next.splice(from, 1);
      const to =
        state.insertIndex > state.srcIndex
          ? state.insertIndex - 1
          : state.insertIndex;
      next.splice(to, 0, moved);
      evalTS(
        "updateFullOrder",
        next.map((s) => s.id)
      );
      return next;
    });
  };

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          <button
            id="btn-shy-master"
            className={"shy-master" + (isShyMasterActive ? " active" : "")}
            title={isShyMasterActive ? "Show all scripts" : "Hide shy scripts"}
            onClick={toggleShyMaster}
          >
            <img
              className="btn-icon-shy"
              src={isShyMasterActive ? hideShyIcon : shyIcon}
              alt={isShyMasterActive ? "Hide shy scripts" : "Show all scripts"}
            />
          </button>
        </div>
        <select
          className="filter-select"
          value={filterType}
          onChange={(e) => applyFilter(e.target.value as FilterType)}
        >
          <option value="panel">ScriptUI</option>
          <option value="script">Scripts</option>
          <option value="all">Both</option>
        </select>
        <button className="btn-reset" title="Reset" onClick={resetPreferences}>
          <img className="btn-icon" src={resetIcon} alt="Reset" />
        </button>
      </div>

      <div className="scroll-area" ref={scrollAreaRef}>
        <div
          id="launcher-view"
          ref={containerRef}
          className={
            (isShyMasterActive ? "hide-shy-rows " : "") +
            (filterType === "panel"
              ? "show-panels-only"
              : filterType === "script"
              ? "show-scripts-only"
              : "")
          }
        >
          {scripts.map((s) => (
            <div
              key={s.id}
              ref={(el) => {
                rowRefs.current[s.id] = el;
              }}
              className={
                "script-row" +
                (s.hidden ? " is-shy-active" : "") +
                (s.type === "script" ? " script-row-nonui" : "")
              }
              data-id={s.id}
              onClick={() => runScriptEntry(s)}
            >
              <div
                className="drag-handle"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleDragMouseDown(e, s.id);
                }}
              >
                ⋮⋮
              </div>
              <button
                className={
                  "btn-shy-individual" + (s.hidden ? " is-shy" : "")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  toggleIndividualShy(s.id);
                }}
              >
                <img
                  className="btn-icon-shy"
                  src={s.hidden ? hideShyIcon : shyIcon}
                  alt={s.hidden ? "Hidden" : "Visible"}
                />
              </button>
              <button className="btn-main">{s.displayName}</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
