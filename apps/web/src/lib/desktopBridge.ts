type DesktopBridge = { onBeforeClose: (save: () => Promise<void>) => () => void };

/** No desktop APIs or Node privileges are exposed to ordinary web sessions. */
export function registerDesktopCloseHandler(save: () => Promise<void>) {
  const bridge = (window as Window & { kerCADDesktop?: DesktopBridge }).kerCADDesktop;
  return bridge?.onBeforeClose(save);
}
