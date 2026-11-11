import React from "react";

/**
 * Normalizes early migration content artifacts (Submodules 1–9) without modifying stored data.
 * - Separates Learning Objectives into a dedicated array.
 * - Strips planning document headers, source file paths, and migration summaries.
 * - Unwraps text from artificial ```text ``` code fences and removes decorative ASCII title boxes.
 *
 * @param {string} rawContent
 * @param {number|string} submoduleOrder Or ID, to identify if early migration format applies
 * @returns {{ objectives: string[], cleanedContent: string }}
 */
export function normalizeLessonContent(rawContent, submoduleOrder) {
  if (!rawContent || typeof rawContent !== "string") {
    return { objectives: [], cleanedContent: "" };
  }

  let text = rawContent.trim();
  const objectives = [];

  // Check if content exhibits early migration markers (Cohorts 1–9)
  const hasEarlyMarkers =
    /Source Documents?:/i.test(text) ||
    /Ready for `Submodule\.description`/i.test(text) ||
    /Summary of Output Draft/i.test(text);

  if (!hasEarlyMarkers) {
    // Cohort 2 (Submodules 10–36): Modern markdown format
    // Extract learning objectives if present as a Markdown section
    const objMatch = text.match(/###\s*Learning Objectives\s*[\r\n]+([\s\S]*?)(?=[\r\n]+###|[\r\n]+##|[\r\n]+---|$)/i);
    if (objMatch) {
      const objLines = objMatch[1].split(/[\r\n]+/);
      objLines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          objectives.push(trimmed.replace(/^[-*]\s+/, ""));
        }
      });
    }

    return {
      objectives,
      cleanedContent: text,
    };
  }

  // --- Normalizing Cohort 1 (Submodules 1–9) ---

  // 1. Extract Learning Objectives from planning header if present
  const earlyObjMatch = text.match(/-\s*\*\*Learning Objectives:\*\*([\s\S]*?)(?=\n+###|\n+##|\n*```|\n*$)/i);
  if (earlyObjMatch) {
    const lines = earlyObjMatch[1].split("\n");
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        objectives.push(trimmed.replace(/^[-*]\s+/, ""));
      }
    });
  }

  // 2. Strip trailing migration draft summaries (e.g. "## 7. Summary of Output Draft...")
  const draftSummaryIdx = text.search(/##\s*\d+\.\s*Summary of Output Draft/i);
  if (draftSummaryIdx !== -1) {
    text = text.substring(0, draftSummaryIdx).trim();
  }

  // 3. Remove planning header section up to "### Instructional Content" or the first "```text"
  const instContentMatch = text.match(/###\s*Instructional Content[^\n]*\n+/i);
  if (instContentMatch) {
    const splitIdx = text.indexOf(instContentMatch[0]) + instContentMatch[0].length;
    text = text.substring(splitIdx).trim();
  } else {
    // Fallback: if "```text" occurs after planning metadata, slice from "```text"
    const codeBlockIdx = text.indexOf("```text");
    if (codeBlockIdx !== -1 && codeBlockIdx < 1500) {
      text = text.substring(codeBlockIdx).trim();
    }
  }

  // 4. Unwrap code fences (```text ... ```) and strip wrapping artifacts
  // First, strip trailing horizontal rules or whitespace that may follow closing ```
  text = text.replace(/```[\s\r\n]*---[\s\r\n]*$/, "").trim();
  text = text.replace(/```[\s\r\n]*$/, "").trim();

  // Strip leading code fence
  text = text.replace(/^```[a-zA-Z]*[\r\n]+/, "").trim();

  // 5. Remove decorative ASCII title boxes (e.g. === LESSON 1.1: ... ===)
  text = text.replace(/={10,}[\s\r\n]+[^\r\n]+[\s\r\n]+={10,}[\s\r\n]*/g, "");
  // Remove decorative divider dashes under section headings (e.g. 1. COMPANY OVERVIEW \n ---------)
  text = text.replace(/^([0-9]+\.[^\r\n]+)[\r\n]+-{5,}\s*$/gm, "### $1");

  // 6. Clean up trailing horizontal rules
  text = text.replace(/[\r\n]+---\s*$/, "").trim();

  return {
    objectives,
    cleanedContent: text,
  };
}

/**
 * Parses inline formatting: **bold**, *italic*, `code`.
 * Returns an array of React nodes.
 */
function renderInlineFormatting(text) {
  if (!text) return "";

  // Split on bold, italic, code
  // Regex matches: `code`, **bold**, *italic*
  const tokens = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push(text.substring(lastIdx, match.index));
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith("`") && matchedStr.endsWith("`")) {
      tokens.push(
        <code
          key={`code-${match.index}`}
          style={{
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.9em",
            color: "var(--accent-primary, #6366f1)",
          }}
        >
          {matchedStr.slice(1, -1)}
        </code>
      );
    } else if (matchedStr.startsWith("**") && matchedStr.endsWith("**")) {
      tokens.push(
        <strong key={`bold-${match.index}`} style={{ fontWeight: "700", color: "var(--text-main)" }}>
          {matchedStr.slice(2, -2)}
        </strong>
      );
    } else if (matchedStr.startsWith("*") && matchedStr.endsWith("*")) {
      tokens.push(
        <em key={`italic-${match.index}`}>
          {matchedStr.slice(1, -1)}
        </em>
      );
    }

    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    tokens.push(text.substring(lastIdx));
  }

  return tokens.length > 0 ? tokens : text;
}

/**
 * Safe, zero-HTML-injection Markdown renderer tailored for LMS lesson content.
 * Converts markdown blocks into semantic, accessible, and responsive React elements.
 */
export default function LessonContentRenderer({ content, submoduleOrder }) {
  const { objectives, cleanedContent } = normalizeLessonContent(content, submoduleOrder);

  if (!cleanedContent) {
    return (
      <p style={{ margin: 0, fontStyle: "italic", color: "var(--text-secondary)" }}>
        No extended written text provided for this lesson. Review the concepts outlined by your instructor.
      </p>
    );
  }

  // Parse lines into structured blocks
  const lines = cleanedContent.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Skip blank lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Horizontal divider
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: "none",
            borderTop: "1px solid var(--border-color)",
            margin: "24px 0",
          }}
        />
      );
      i++;
      continue;
    }

    // 3. Headings (#, ##, ###, ####)
    if (trimmed.startsWith("#")) {
      const level = trimmed.match(/^#+/)[0].length;
      const headingText = trimmed.replace(/^#+\s*/, "");

      // If the heading is "Learning Objectives", skip rendering it here since it's displayed in the top banner
      if (/Learning Objectives/i.test(headingText) && objectives.length > 0) {
        // Advance past list items of learning objectives
        i++;
        while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* ") || !lines[i].trim())) {
          i++;
        }
        continue;
      }

      const styleBase = {
        color: "var(--text-main)",
        fontWeight: "700",
        marginTop: "24px",
        marginBottom: "12px",
        lineHeight: "1.3",
      };

      if (level === 1) {
        blocks.push(<h2 key={`h1-${i}`} style={{ ...styleBase, fontSize: "20px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>{renderInlineFormatting(headingText)}</h2>);
      } else if (level === 2) {
        blocks.push(<h3 key={`h2-${i}`} style={{ ...styleBase, fontSize: "17px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>{renderInlineFormatting(headingText)}</h3>);
      } else if (level === 3) {
        blocks.push(<h4 key={`h3-${i}`} style={{ ...styleBase, fontSize: "15px", color: "var(--accent-primary, #6366f1)" }}>{renderInlineFormatting(headingText)}</h4>);
      } else {
        blocks.push(<h5 key={`h4-${i}`} style={{ ...styleBase, fontSize: "14px" }}>{renderInlineFormatting(headingText)}</h5>);
      }
      i++;
      continue;
    }

    // 4. Code Blocks (``` ... ```)
    if (trimmed.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing ```
      blocks.push(
        <pre
          key={`codeblock-${i}`}
          style={{
            backgroundColor: "var(--bg-surface, #1e293b)",
            color: "var(--text-main, #f8fafc)",
            padding: "14px 16px",
            borderRadius: "6px",
            overflowX: "auto",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "12.5px",
            lineHeight: "1.5",
            margin: "14px 0",
            border: "1px solid var(--border-color)",
          }}
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // 5. Blockquotes (> ...)
    if (trimmed.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={`quote-${i}`}
          style={{
            borderLeft: "4px solid var(--accent-primary, #6366f1)",
            margin: "16px 0",
            padding: "10px 16px",
            backgroundColor: "rgba(99, 102, 241, 0.05)",
            borderRadius: "0 6px 6px 0",
            fontStyle: "italic",
            color: "var(--text-main)",
            fontSize: "13.5px",
          }}
        >
          {renderInlineFormatting(quoteLines.join(" "))}
        </blockquote>
      );
      continue;
    }

    // 6. Markdown Tables (| col1 | col2 |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0].split("|").slice(1, -1).map((c) => c.trim());
        // Second line is typically |:---|:---| separator; skip it if it contains dashes
        const dataRows = tableLines.slice(1).filter((l) => !/^\|[\s\-:|]+\|$/.test(l));

        blocks.push(
          <div key={`table-wrapper-${i}`} style={{ overflowX: "auto", margin: "18px 0" }}>
            <table
              className="data-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "var(--bg-surface, #f8fafc)" }}>
                  {headerRow.map((h, colIdx) => (
                    <th key={`th-${colIdx}`} style={{ padding: "8px 12px", textAlign: "left", fontWeight: "700", borderBottom: "2px solid var(--border-color)" }}>
                      {renderInlineFormatting(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((rowStr, rowIdx) => {
                  const cells = rowStr.split("|").slice(1, -1).map((c) => c.trim());
                  return (
                    <tr key={`tr-${rowIdx}`} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      {cells.map((cell, cIdx) => (
                        <td key={`td-${rowIdx}-${cIdx}`} style={{ padding: "8px 12px", verticalAlign: "top" }}>
                          {renderInlineFormatting(cell)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 7. Bulleted Lists (- or *)
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const listItems = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        listItems.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} style={{ margin: "12px 0 16px 20px", padding: 0, fontSize: "14px", lineHeight: "1.6" }}>
          {listItems.map((item, itemIdx) => (
            <li key={`li-${itemIdx}`} style={{ marginBottom: "6px" }}>
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 8. Numbered Lists (1. 2. 3.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} style={{ margin: "12px 0 16px 22px", padding: 0, fontSize: "14px", lineHeight: "1.6" }}>
          {listItems.map((item, itemIdx) => (
            <li key={`oli-${itemIdx}`} style={{ marginBottom: "6px" }}>
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 9. Standard Paragraphs
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("- ") &&
      !lines[i].trim().startsWith("* ") &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) &&
      lines[i].trim() !== "---"
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    blocks.push(
      <p
        key={`p-${i}`}
        style={{
          margin: "0 0 14px 0",
          fontSize: "14px",
          lineHeight: "1.7",
          color: "var(--text-main)",
        }}
      >
        {renderInlineFormatting(paraLines.join(" "))}
      </p>
    );
  }

  return (
    <div className="lesson-rendered-body" style={{ color: "var(--text-main)" }}>
      {/* Learning Objectives Callout Banner */}
      {objectives.length > 0 && (
        <div
          style={{
            backgroundColor: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: "6px",
            padding: "14px 18px",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "16px" }}>🎯</span>
            <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--accent-primary, #6366f1)" }}>
              Learning Objectives
            </h4>
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", lineHeight: "1.5", color: "var(--text-main)" }}>
            {objectives.map((obj, idx) => (
              <li key={`obj-${idx}`} style={{ marginBottom: "4px" }}>
                {renderInlineFormatting(obj)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Structured Lesson Content */}
      <div className="lesson-markdown-content">{blocks}</div>
    </div>
  );
}
