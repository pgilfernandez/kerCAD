"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SketchToolbarIcon } from "@/components/icons";

type Option<T extends string> = { tool: T; label: string; icon: string };

export function SketchToolMenu<T extends string>({ options, initialTool, activeTool, onChoose, renderIcon }: {
  options: Option<T>[];
  initialTool: T;
  activeTool: T | null;
  onChoose: (tool: T) => void;
  renderIcon?: (option: Option<T>) => ReactNode;
}) {
  const [lastTool, setLastTool] = useState(initialTool);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((option) => option.tool === lastTool) ?? options[0];

  useEffect(() => {
    if (activeTool !== null && options.some((option) => option.tool === activeTool)) setLastTool(activeTool);
  }, [activeTool, options]);

  useEffect(() => {
    if (!position) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setPosition(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPosition(null); trigger.current?.focus(); }
    };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  return <>
    <button ref={trigger} type="button" className={`toolbar-icon ${options.some((option) => option.tool === activeTool) ? "active" : ""}`} title={current.label} aria-label={current.label} aria-expanded={Boolean(position)} aria-controls={id} onClick={() => {
      const bounds = trigger.current?.getBoundingClientRect();
      setPosition(position || !bounds ? null : { top: bounds.bottom + 6, left: Math.max(8, Math.min(bounds.left, window.innerWidth - 208)) });
    }}>{renderIcon ? renderIcon(current) : <SketchToolbarIcon file={current.icon} />}</button>
    {position && createPortal(<div ref={menu} id={id} className="educad-polygon-menu" style={position}>
      {options.map((option) => <button key={option.tool} type="button" aria-pressed={activeTool === option.tool} onClick={() => {
        setLastTool(option.tool); onChoose(option.tool); setPosition(null);
      }}>{renderIcon ? renderIcon(option) : <SketchToolbarIcon file={option.icon} />}<span>{option.label}</span></button>)}
    </div>, document.body)}
  </>;
}
