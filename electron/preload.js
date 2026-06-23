import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronApp", {
  isDesktop: true,
});
