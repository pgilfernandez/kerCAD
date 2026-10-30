import { uiText, LOCALE_CHANGE_EVENT } from "@/lib/kercadI18n";

/** Mouse alternatives to native touch/trackpad scrolling. */
export function enableToolbarMouseScroll(toolbar: HTMLElement, vertical = false) {
  let drag: { pointerId: number; x: number; scroll: number } | null = null;
  const indicators = document.createElement("div");
  indicators.className = `kercad-toolbar-scroll-indicators${vertical ? " vertical" : ""}`;
  const left = document.createElement("button");
  const right = document.createElement("button");
  left.type = right.type = "button";
  const scrollToward = (direction: number) => {
    const distance = Math.max(48, (vertical ? toolbar.clientHeight : toolbar.clientWidth) * 0.7);
    toolbar.scrollBy({ [vertical ? "top" : "left"]: direction * distance, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  left.addEventListener("click", () => scrollToward(-1));
  right.addEventListener("click", () => scrollToward(1));
  left.className = `kercad-toolbar-scroll-edge ${vertical ? "top" : "left"}`;
  right.className = `kercad-toolbar-scroll-edge ${vertical ? "bottom" : "right"}`;
  const startIcon = document.createElement("img");
  const endIcon = document.createElement("img");
  startIcon.src = `/assets/kercad/toolbar-${vertical ? "vertical" : "horizontal"}/scroll-${vertical ? "up" : "left"}.svg`;
  endIcon.src = `/assets/kercad/toolbar-${vertical ? "vertical" : "horizontal"}/scroll-${vertical ? "down" : "right"}.svg`;
  startIcon.alt = endIcon.alt = "";
  startIcon.draggable = endIcon.draggable = false;
  left.append(startIcon);
  right.append(endIcon);
  indicators.append(left, right);
  toolbar.parentElement?.append(indicators);
  const updateIndicators = () => {
    left.title = uiText(vertical ? "scroll.up" : "scroll.left");
    right.title = uiText(vertical ? "scroll.down" : "scroll.right");
    left.setAttribute("aria-label", left.title);
    right.setAttribute("aria-label", right.title);
    const bounds = toolbar.getBoundingClientRect();
    const parentBounds = toolbar.parentElement?.getBoundingClientRect();
    indicators.style.top = `${bounds.top - (parentBounds?.top ?? 0)}px`;
    indicators.style.left = `${bounds.left - (parentBounds?.left ?? 0)}px`;
    indicators.style.width = `${bounds.width}px`;
    indicators.style.height = `${bounds.height}px`;
    if (vertical) {
      const style = getComputedStyle(toolbar);
      indicators.style.borderRadius = style.borderRadius;
      // Reserve the panel's border inside the overlay without painting over it.
      indicators.style.borderStyle = "solid";
      indicators.style.borderColor = "transparent";
      indicators.style.borderWidth = `${style.borderTopWidth} ${style.borderRightWidth} ${style.borderBottomWidth} ${style.borderLeftWidth}`;
    }
    left.hidden = (vertical ? toolbar.scrollTop : toolbar.scrollLeft) <= 1;
    right.hidden = vertical ? toolbar.scrollHeight - toolbar.clientHeight - toolbar.scrollTop <= 1 : toolbar.scrollWidth - toolbar.clientWidth - toolbar.scrollLeft <= 1;
  };
  const resizeObserver = new ResizeObserver(updateIndicators);
  resizeObserver.observe(toolbar);
  for (const child of toolbar.children) resizeObserver.observe(child);
  toolbar.addEventListener("scroll", updateIndicators, { passive: true });
  window.addEventListener("resize", updateIndicators);
  updateIndicators();
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || (vertical ? toolbar.scrollHeight <= toolbar.clientHeight : toolbar.scrollWidth <= toolbar.clientWidth)) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? toolbar.clientWidth : 1;
    event.preventDefault();
    if (vertical) toolbar.scrollTop += delta * scale;
    else toolbar.scrollLeft += delta * scale;
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 1 || (vertical ? toolbar.scrollHeight <= toolbar.clientHeight : toolbar.scrollWidth <= toolbar.clientWidth)) return;
    event.preventDefault();
    event.stopPropagation();
    drag = { pointerId: event.pointerId, x: vertical ? event.clientY : event.clientX, scroll: vertical ? toolbar.scrollTop : toolbar.scrollLeft };
    toolbar.setPointerCapture(event.pointerId);
    toolbar.classList.add("toolbar-scroll-dragging");
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (vertical) toolbar.scrollTop = drag.scroll + drag.x - event.clientY;
    else toolbar.scrollLeft = drag.scroll + drag.x - event.clientX;
  };
  const stop = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    toolbar.classList.remove("toolbar-scroll-dragging");
    if (toolbar.hasPointerCapture(event.pointerId)) toolbar.releasePointerCapture(event.pointerId);
  };
  const preventAutoscroll = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
  toolbar.addEventListener("wheel", wheel, { passive: false });
  indicators.addEventListener("wheel", wheel, { passive: false });
  indicators.addEventListener("pointerdown", down, true);
  indicators.addEventListener("mousedown", preventAutoscroll);
  indicators.addEventListener("auxclick", preventAutoscroll);
  toolbar.addEventListener("pointerdown", down, true);
  toolbar.addEventListener("pointermove", move);
  toolbar.addEventListener("pointerup", stop);
  toolbar.addEventListener("pointercancel", stop);
  toolbar.addEventListener("lostpointercapture", stop);
  toolbar.addEventListener("mousedown", preventAutoscroll);
  toolbar.addEventListener("auxclick", preventAutoscroll);
  window.addEventListener(LOCALE_CHANGE_EVENT, updateIndicators);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, updateIndicators);
    resizeObserver.disconnect();
    toolbar.removeEventListener("scroll", updateIndicators);
    window.removeEventListener("resize", updateIndicators);
    indicators.remove();
    if (drag && toolbar.hasPointerCapture(drag.pointerId)) toolbar.releasePointerCapture(drag.pointerId);
    toolbar.classList.remove("toolbar-scroll-dragging");
    toolbar.removeEventListener("wheel", wheel);
    indicators.removeEventListener("wheel", wheel);
    indicators.removeEventListener("pointerdown", down, true);
    indicators.removeEventListener("mousedown", preventAutoscroll);
    indicators.removeEventListener("auxclick", preventAutoscroll);
    toolbar.removeEventListener("pointerdown", down, true);
    toolbar.removeEventListener("pointermove", move);
    toolbar.removeEventListener("pointerup", stop);
    toolbar.removeEventListener("pointercancel", stop);
    toolbar.removeEventListener("lostpointercapture", stop);
    toolbar.removeEventListener("mousedown", preventAutoscroll);
    toolbar.removeEventListener("auxclick", preventAutoscroll);
  };
}
