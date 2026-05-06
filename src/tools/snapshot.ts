import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { getActivePage } from "../browser.js";
import { textResult } from "../tool-result.js";

const SnapshotParams = Type.Object({
  interestingOnly: Type.Optional(
    Type.Boolean({ default: true, description: "Filter out uninteresting AX nodes" }),
  ),
  maxNodes: Type.Optional(
    Type.Integer({ default: 1000, minimum: 1, maximum: 5000, description: "Cap on nodes returned" }),
  ),
});

type AxValue = { value?: unknown };
type RawAxNode = {
  nodeId: string;
  parentId?: string;
  childIds?: readonly string[];
  ignored?: boolean;
  role?: AxValue;
  name?: AxValue;
  value?: AxValue;
  description?: AxValue;
  properties?: readonly { name?: string; value?: AxValue }[];
  backendDOMNodeId?: number;
};

type SlimNode = {
  role: string;
  name?: string;
  value?: string;
  state?: string;
  box?: { cx: number; cy: number };
  children: SlimNode[];
  _backendId?: number;
};

const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "checkbox", "radio", "combobox",
  "menuitem", "tab", "switch", "slider", "searchbox", "spinbutton",
]);

function stringOf(v: AxValue | undefined): string | undefined {
  const x = v?.value;
  if (typeof x === "string" && x !== "") return x;
  if (typeof x === "number") return String(x);
  return undefined;
}

function collectState(props: RawAxNode["properties"]): string | undefined {
  if (!props || props.length === 0) return undefined;
  const flags: string[] = [];
  for (const p of props) {
    const name = p.name;
    if (!name) continue;
    const raw = p.value?.value;
    if (raw === true && ["focused", "required", "disabled", "checked", "expanded", "selected", "pressed", "modal"].includes(name)) {
      flags.push(name);
    }
    if (typeof raw === "number" && name === "level") flags.push(`level ${raw}`);
  }
  return flags.length > 0 ? flags.join(", ") : undefined;
}

function buildTree(rawNodes: readonly RawAxNode[], opts: { interestingOnly: boolean; maxNodes: number }): SlimNode[] {
  const byId = new Map<string, RawAxNode>();
  for (const n of rawNodes) byId.set(n.nodeId, n);

  const rootIds: string[] = [];
  for (const n of rawNodes) {
    if (!n.parentId || !byId.has(n.parentId)) rootIds.push(n.nodeId);
  }

  let budget = opts.maxNodes;

  function slim(node: RawAxNode): SlimNode | undefined {
    if (budget <= 0) return undefined;
    if (opts.interestingOnly && node.ignored) {
      const out: SlimNode[] = [];
      for (const cid of node.childIds ?? []) {
        const child = byId.get(cid);
        if (!child) continue;
        const s = slim(child);
        if (s) {
          if (s.role === "_hoist") out.push(...s.children);
          else out.push(s);
        }
      }
      return out.length > 0 ? { role: "_hoist", children: out } : undefined;
    }
    budget--;
    const role = stringOf(node.role) ?? "unknown";
    const name = stringOf(node.name);
    const value = stringOf(node.value);
    const state = collectState(node.properties);
    const children: SlimNode[] = [];
    for (const cid of node.childIds ?? []) {
      const child = byId.get(cid);
      if (!child) continue;
      const s = slim(child);
      if (!s) continue;
      if (s.role === "_hoist") children.push(...s.children);
      else children.push(s);
    }
    const out: SlimNode = { role, children };
    if (name !== undefined) out.name = name;
    if (value !== undefined) out.value = value;
    if (state !== undefined) out.state = state;
    if (node.backendDOMNodeId !== undefined) out._backendId = node.backendDOMNodeId;
    return out;
  }

  const result: SlimNode[] = [];
  for (const rid of rootIds) {
    const root = byId.get(rid);
    if (!root) continue;
    const s = slim(root);
    if (!s) continue;
    if (s.role === "_hoist") result.push(...s.children);
    else result.push(s);
  }
  return result;
}

function collectInteractive(nodes: readonly SlimNode[]): { node: SlimNode; backendId: number }[] {
  const out: { node: SlimNode; backendId: number }[] = [];
  function walk(ns: readonly SlimNode[]) {
    for (const n of ns) {
      if (n._backendId !== undefined && INTERACTIVE_ROLES.has(n.role)) {
        out.push({ node: n, backendId: n._backendId });
      }
      walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

function renderOutline(nodes: readonly SlimNode[], depth = 0): string {
  const lines: string[] = [];
  for (const n of nodes) {
    const indent = "  ".repeat(depth);
    let line = `${indent}- ${n.role}`;
    if (n.name) line += ` "${n.name}"`;
    if (n.value && n.value !== n.name) line += ` = ${JSON.stringify(n.value)}`;
    if (n.state) line += ` (${n.state})`;
    if (n.box && INTERACTIVE_ROLES.has(n.role)) {
      line += ` @(${n.box.cx},${n.box.cy})`;
    }
    lines.push(line);
    const childText = renderOutline(n.children, depth + 1);
    if (childText) lines.push(childText);
  }
  return lines.join("\n");
}

export const snapshotTool: ToolDefinition<typeof SnapshotParams> = {
  name: "chrome_snapshot",
  label: "Chrome Snapshot",
  description:
    "DEFAULT tool for understanding what's on the page. Returns the accessibility tree with click coordinates @(x,y) for interactive elements. Use BEFORE deciding if you need a screenshot.",
  promptSnippet: "Get accessibility tree with click coordinates (default for page inspection)",
  promptGuidelines: [
    "Use this as your DEFAULT tool to understand page content.",
    "Interactive elements show @(x,y) coordinates — pass directly to chrome_click.",
    "Only use chrome_screenshot if you need to verify visual rendering.",
  ],
  parameters: SnapshotParams,
  async execute(_id, args) {
    const page = await getActivePage();
    const cdp = await page.context().newCDPSession(page);

    try {
      const axResult = await cdp.send("Accessibility.getFullAXTree") as { nodes: RawAxNode[] };
      const slim = buildTree(axResult.nodes, {
        interestingOnly: args.interestingOnly ?? true,
        maxNodes: args.maxNodes ?? 1000,
      });

      const targets = collectInteractive(slim);
      if (targets.length > 0) {
        await Promise.allSettled(
          targets.map(async ({ node, backendId }) => {
            try {
              const result = await cdp.send("DOM.getBoxModel", { backendNodeId: backendId }) as {
                model?: { content?: readonly number[]; width?: number; height?: number };
              };
              const content = result.model?.content;
              if (!content || content.length < 8) return;
              const x = content[0]!;
              const y = content[1]!;
              const width = result.model!.width ?? 0;
              const height = result.model!.height ?? 0;
              if (width <= 0 || height <= 0 || x < 0 || y < 0) return;
              node.box = {
                cx: Math.round(x + width / 2),
                cy: Math.round(y + height / 2),
              };
            } catch {
              // skip
            }
          }),
        );
      }

      const outline = renderOutline(slim);
      const title = await page.title();
      const url = page.url();

      return textResult(`URL: ${url}\nTitle: ${title}\n\n${outline}`);
    } finally {
      await cdp.detach();
    }
  },
};
