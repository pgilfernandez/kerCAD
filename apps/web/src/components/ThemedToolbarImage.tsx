"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useAppTheme } from "@/lib/useAppTheme";

// Keep the editable source SVGs untouched; share each generated dark image.
const darkImages = new Map<string, Promise<string>>();

function darkPaint(hex: string) {
  const color = hex.toLowerCase();
  if (color === "currentcolor") return "#ebeaeb";
  const accents: Record<string, string> = {
    "#292422": "#ebeaeb",
    "#ebeaeb": "#292422",
    "#173b5a": "#b7d5ed",
    "#729fcf": "#91bae7",
    "#8ae234": "#a3ed61",
  };
  if (accents[color]) return accents[color];
  if (color.length !== 7) return hex;
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  // Preserve saturated colors rather than inverting their hue.
  if (Math.max(...channels) - Math.min(...channels) > 24) return hex;
  const luminance = channels.reduce((sum, channel) => sum + channel, 0) / 3;
  const value = Math.round(235 - luminance * 0.72);
  return `#${[value, value, value].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function darkImage(src: string) {
  let image = darkImages.get(src);
  if (!image) {
    image = fetch(src).then((response) => {
      if (!response.ok) throw new Error(`SVG ${response.status}`);
      return response.text();
    }).then((svg) => {
      // Only paint properties, never Inkscape metadata, opacity or geometry.
      const themed = svg.replace(/\b(fill|stroke|stop-color)(\s*[:=]\s*["']?)(#[0-9a-fA-F]{6}|currentColor)\b/g,
        (_match, property: string, separator: string, color: string) => `${property}${separator}${darkPaint(color)}`);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(themed)}`;
    }).catch(() => {
      darkImages.delete(src);
      return src;
    });
    darkImages.set(src, image);
  }
  return image;
}

export function ThemedToolbarImage({ src, className = "", ...props }: ComponentProps<"img"> & { src: string }) {
  const { theme } = useAppTheme();
  const [image, setImage] = useState<{ src: string; themed: string } | null>(null);
  const eligible = /^\/assets\/kercad\/toolbar-(3d|sketch)\//.test(src)
    || src.startsWith("/assets/kercad/toolbar-horizontal/annotations/")
    || /^\/assets\/kercad\/toolbar-horizontal\/manipulator-[a-z-]+\.svg$/.test(src);
  useEffect(() => {
    if (theme !== "dark" || !eligible) return;
    let cancelled = false;
    void darkImage(src).then((themed) => { if (!cancelled) setImage({ src, themed }); });
    return () => { cancelled = true; };
  }, [src, theme, eligible]);
  const resolved = theme === "dark" && eligible && image?.src === src ? image.themed : src;
  return <img {...props} src={resolved} className={`${className}${eligible ? " kercad-themed-toolbar-image" : ""}`} />;
}
