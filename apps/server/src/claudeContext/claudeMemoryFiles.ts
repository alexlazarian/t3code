// Claude Code's on-disk memory format: `<home>/projects/<folder key>/memory/` holds a MEMORY.md
// index (one `- [Title](file.md) — hook` line per memory) and one markdown file per memory with
// `name`, `description` and `metadata.type` frontmatter. Edits keep every line we do not own.

export const MEMORY_INDEX_FILE_NAME = "MEMORY.md";
// Claude separates an index line's link from its hook with an em dash; this is its file format, not copy.
const INDEX_HOOK_SEPARATOR = ` ${String.fromCharCode(0x2014)} `;

export function claudeFolderKey(directory: string): string {
  return directory.replace(/[^A-Za-z0-9]/g, "-");
}

export type ParsedMemoryFile = {
  readonly name: string | null;
  readonly description: string | null;
  readonly type: string | null;
  readonly body: string;
};

type Frontmatter = { readonly lines: ReadonlyArray<string>; readonly body: string };

function splitFrontmatter(raw: string): Frontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  if (!match) return null;
  return { lines: match[1]!.split(/\r?\n/), body: raw.slice(match[0].length) };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (trimmed.startsWith('"') || trimmed.startsWith("'"))) {
    const quote = trimmed[0]!;
    if (trimmed.endsWith(quote)) {
      const inner = trimmed.slice(1, -1);
      return quote === '"'
        ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : inner.replace(/''/g, "'");
    }
  }
  return trimmed;
}

function quote(value: string): string {
  const flat = value.replace(/\s*\r?\n\s*/g, " ").trim();
  return /^[\w(][^:#\n]*$/.test(flat) && !/^(true|false|null|yes|no)$/i.test(flat)
    ? flat
    : JSON.stringify(flat);
}

export function parseMemoryFile(raw: string): ParsedMemoryFile {
  const frontmatter = splitFrontmatter(raw);
  if (!frontmatter) return { name: null, description: null, type: null, body: raw };
  let name: string | null = null;
  let description: string | null = null;
  let type: string | null = null;
  let inMetadata = false;
  for (const line of frontmatter.lines) {
    const top = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (top) {
      inMetadata = top[1] === "metadata" && top[2]!.trim() === "";
      if (top[1] === "name") name = unquote(top[2]!);
      else if (top[1] === "description") description = unquote(top[2]!);
      else if (top[1] === "type") type = unquote(top[2]!);
      continue;
    }
    const nested = /^\s+([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (inMetadata && nested && nested[1] === "type") type = unquote(nested[2]!);
  }
  return { name, description, type, body: frontmatter.body.replace(/^\r?\n/, "") };
}

export function renderMemoryFile(input: {
  readonly existingRaw: string | null;
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly body: string;
  readonly modifiedAt: string;
}): string {
  const body = input.body.replace(/\s+$/, "");
  const existing = input.existingRaw === null ? null : splitFrontmatter(input.existingRaw);
  if (!existing) {
    return [
      "---",
      `name: ${quote(input.name)}`,
      `description: ${quote(input.description)}`,
      "metadata:",
      `  type: ${input.type}`,
      `  modified: ${input.modifiedAt}`,
      "---",
      "",
      body,
      "",
    ].join("\n");
  }
  const lines: Array<string> = [];
  let inMetadata = false;
  let wroteDescription = false;
  let wroteType = false;
  let wroteModified = false;
  for (const line of existing.lines) {
    const top = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (top) {
      if (inMetadata && !wroteType) {
        lines.push(`  type: ${input.type}`);
        wroteType = true;
      }
      if (inMetadata && !wroteModified) {
        lines.push(`  modified: ${input.modifiedAt}`);
        wroteModified = true;
      }
      inMetadata = top[1] === "metadata" && top[2]!.trim() === "";
      if (top[1] === "description") {
        lines.push(`description: ${quote(input.description)}`);
        wroteDescription = true;
        continue;
      }
      if (top[1] === "type") {
        lines.push(`type: ${input.type}`);
        wroteType = true;
        continue;
      }
      lines.push(line);
      continue;
    }
    const nested = /^(\s+)([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (inMetadata && nested?.[2] === "type") {
      lines.push(`${nested[1]}type: ${input.type}`);
      wroteType = true;
      continue;
    }
    if (inMetadata && nested?.[2] === "modified") {
      lines.push(`${nested[1]}modified: ${input.modifiedAt}`);
      wroteModified = true;
      continue;
    }
    lines.push(line);
  }
  if (inMetadata && !wroteType) lines.push(`  type: ${input.type}`);
  if (inMetadata && !wroteModified) lines.push(`  modified: ${input.modifiedAt}`);
  if (!wroteDescription) lines.splice(1, 0, `description: ${quote(input.description)}`);
  if (!wroteType && !lines.some((line) => line === "metadata:")) {
    lines.push("metadata:", `  type: ${input.type}`);
  }
  if (!lines.some((line) => /^name:/.test(line))) lines.unshift(`name: ${quote(input.name)}`);
  return ["---", ...lines, "---", "", body, ""].join("\n");
}

export function slugifyMemoryName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "memory";
}

function indexLinkPattern(fileName: string): RegExp {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\]\\(\\s*(?:\\./)?${escaped}\\s*\\)`);
}

export function findIndexEntry(
  index: string | null,
  fileName: string,
): { readonly line: string; readonly title: string } | null {
  if (index === null) return null;
  const pattern = indexLinkPattern(fileName);
  for (const line of index.split(/\r?\n/)) {
    if (!pattern.test(line)) continue;
    const title = /\[([^\]]+)\]\(/.exec(line)?.[1]?.trim();
    return { line, title: title && title.length > 0 ? title : fileName };
  }
  return null;
}

export function formatIndexLine(input: {
  readonly fileName: string;
  readonly title: string;
  readonly description: string;
}): string {
  const title = input.title.replace(/[[\]\r\n]+/g, " ").trim();
  const hook = input.description.replace(/\s*\r?\n\s*/g, " ").trim();
  return hook.length > 0
    ? `- [${title}](${input.fileName})${INDEX_HOOK_SEPARATOR}${hook}`
    : `- [${title}](${input.fileName})`;
}

function withTrailingNewline(text: string): string {
  return text.length === 0 || text.endsWith("\n") ? text : `${text}\n`;
}

/** Replaces the memory's line in place, or appends one; other lines stay as Claude wrote them. */
export function upsertIndexLine(index: string | null, fileName: string, line: string): string {
  if (index === null || index.trim().length === 0) return `# Memory Index\n\n${line}\n`;
  const pattern = indexLinkPattern(fileName);
  const lines = index.split("\n");
  const at = lines.findIndex((existing) => pattern.test(existing));
  if (at >= 0) {
    lines[at] = line;
    return lines.join("\n");
  }
  return `${withTrailingNewline(index)}${line}\n`;
}

export function removeIndexLine(
  index: string | null,
  fileName: string,
): { readonly index: string | null; readonly removed: string | null } {
  if (index === null) return { index: null, removed: null };
  const pattern = indexLinkPattern(fileName);
  const lines = index.split("\n");
  const at = lines.findIndex((existing) => pattern.test(existing));
  if (at < 0) return { index, removed: null };
  const removed = lines[at]!;
  lines.splice(at, 1);
  return { index: lines.join("\n"), removed };
}

/** `@path` imports Claude follows from an instruction file, skipping code spans and fences. */
export function instructionImports(content: string): ReadonlyArray<string> {
  const imports: Array<string> = [];
  let inFence = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const text = line.replace(/`[^`]*`/g, "");
    for (const match of text.matchAll(/(?:^|\s)@((?:~\/|\.{0,2}\/)?[\w./~-]+)/g)) {
      const target = match[1]!;
      if (/\.\w+$/.test(target) && !imports.includes(target)) imports.push(target);
    }
  }
  return imports;
}
