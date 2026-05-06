import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { closeBrowser } from "./browser.js";
import { navigateTool } from "./tools/navigate.js";
import { clickTool } from "./tools/click.js";
import { typeTool, pressKeyTool } from "./tools/type.js";
import { screenshotTool } from "./tools/screenshot.js";
import { snapshotTool } from "./tools/snapshot.js";
import { executeJsTool } from "./tools/execute-js.js";
import { scrollTool } from "./tools/scroll.js";
import { listTabsTool, switchTabTool, newTabTool, closeTabTool } from "./tools/tabs.js";
import { pageInfoTool, waitTool, waitForLoadTool, goBackTool, goForwardTool, reloadTool } from "./tools/page.js";
import { closeBrowserTool } from "./tools/close.js";

const ALL_TOOLS = [
  navigateTool,
  clickTool,
  typeTool,
  pressKeyTool,
  screenshotTool,
  snapshotTool,
  executeJsTool,
  scrollTool,
  listTabsTool,
  switchTabTool,
  newTabTool,
  closeTabTool,
  pageInfoTool,
  waitTool,
  waitForLoadTool,
  goBackTool,
  goForwardTool,
  reloadTool,
  closeBrowserTool,
];

export default function chromeDevToolsExtension(pi: ExtensionAPI): void {
  for (const tool of ALL_TOOLS) {
    pi.registerTool(tool);
  }

  pi.on("session_shutdown", async () => {
    await closeBrowser();
  });
}
