/** Mouse alternatives to native touch/trackpad scrolling. */
export function enableToolbarMouseScroll(toolbar: HTMLElement) {
  let drag: { pointerId: number; x: number; scroll: number } | null = null;
  const indicators = document.createElement("div");
  indicators.className = "educad-toolbar-scroll-indicators";
  indicators.setAttribute("aria-hidden", "true");
  const left = document.createElement("span");
  const right = document.createElement("span");
  left.className = "educad-toolbar-scroll-edge left";
  right.className = "educad-toolbar-scroll-edge right";
  left.textContent = "‹";
  right.textContent = "›";
  indicators.append(left, right);
  toolbar.parentElement?.append(indicators);
  const updateIndicators = () => {
    indicators.style.top = `${toolbar.offsetTop}px`;
    indicators.style.left = `${toolbar.offsetLeft}px`;
    indicators.style.width = `${toolbar.clientWidth}px`;
    indicators.style.height = `${toolbar.clientHeight}px`;
    left.hidden = toolbar.scrollLeft <= 1;
    right.hidden = toolbar.scrollWidth - toolbar.clientWidth - toolbar.scrollLeft <= 1;
  };
  const resizeObserver = new ResizeObserver(updateIndicators);
  resizeObserver.observe(toolbar);
  for (const child of toolbar.children) resizeObserver.observe(child);
  toolbar.addEventListener("scroll", updateIndicators, { passive: true });
  window.addEventListener("resize", updateIndicators);
  updateIndicators();
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || toolbar.scrollWidth <= toolbar.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? toolbar.clientWidth : 1;
    event.preventDefault();
    toolbar.scrollLeft += delta * scale;
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 1 || toolbar.scrollWidth <= toolbar.clientWidth) return;
    event.preventDefault();
    event.stopPropagation();
    drag = { pointerId: event.pointerId, x: event.clientX, scroll: toolbar.scrollLeft };
    toolbar.setPointerCapture(event.pointerId);
    toolbar.classList.add("toolbar-scroll-dragging");
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    toolbar.scrollLeft = drag.scroll + drag.x - event.clientX;
  };
  const stop = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    toolbar.classList.remove("toolbar-scroll-dragging");
    if (toolbar.hasPointerCapture(event.pointerId)) toolbar.releasePointerCapture(event.pointerId);
  };
  const preventAutoscroll = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
  toolbar.addEventListener("wheel", wheel, { passive: false });
  toolbar.addEventListener("pointerdown", down, true);
  toolbar.addEventListener("pointermove", move);
  toolbar.addEventListener("pointerup", stop);
  toolbar.addEventListener("pointercancel", stop);
  toolbar.addEventListener("lostpointercapture", stop);
  toolbar.addEventListener("mousedown", preventAutoscroll);
  toolbar.addEventListener("auxclick", preventAutoscroll);
  return () => {
    resizeObserver.disconnect();
    toolbar.removeEventListener("scroll", updateIndicators);
    window.removeEventListener("resize", updateIndicators);
    indicators.remove();
    if (drag && toolbar.hasPointerCapture(drag.pointerId)) toolbar.releasePointerCapture(drag.pointerId);
    toolbar.classList.remove("toolbar-scroll-dragging");
    toolbar.removeEventListener("wheel", wheel);
    toolbar.removeEventListener("pointerdown", down, true);
    toolbar.removeEventListener("pointermove", move);
    toolbar.removeEventListener("pointerup", stop);
    toolbar.removeEventListener("pointercancel", stop);
    toolbar.removeEventListener("lostpointercapture", stop);
    toolbar.removeEventListener("mousedown", preventAutoscroll);
    toolbar.removeEventListener("auxclick", preventAutoscroll);
  };
}
