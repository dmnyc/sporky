let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function output(data: Record<string, unknown> | unknown[]): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, replacer, 2));
  } else {
    printHuman(data);
  }
}

export function outputSuccess(message: string, data?: Record<string, unknown>): void {
  if (jsonMode) {
    console.log(JSON.stringify({ success: true, message, ...data }, replacer, 2));
  } else {
    console.log(message);
    if (data) {
      printHuman(data);
    }
  }
}

export function outputError(message: string, details?: unknown): void {
  if (jsonMode) {
    console.error(
      JSON.stringify({ success: false, error: message, details }, replacer, 2)
    );
  } else {
    console.error(`Error: ${message}`);
    if (details) {
      console.error(details);
    }
  }
}

function printHuman(data: Record<string, unknown> | unknown[]): void {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log("(empty)");
      return;
    }
    // Print as table if array of objects
    if (typeof data[0] === "object" && data[0] !== null) {
      const keys = Object.keys(data[0] as Record<string, unknown>);
      const widths = keys.map((k) =>
        Math.max(
          k.length,
          ...data.map((row) => {
            const val = (row as Record<string, unknown>)[k];
            return formatValue(val).length;
          })
        )
      );

      // Header
      console.log(keys.map((k, i) => k.padEnd(widths[i])).join("  "));
      console.log(widths.map((w) => "─".repeat(w)).join("  "));

      // Rows
      for (const row of data) {
        const r = row as Record<string, unknown>;
        console.log(keys.map((k, i) => formatValue(r[k]).padEnd(widths[i])).join("  "));
      }
    } else {
      for (const item of data) {
        console.log(formatValue(item));
      }
    }
  } else {
    const entries = Object.entries(data);
    if (entries.length === 0) return;

    const maxKeyLen = Math.max(...entries.map(([k]) => k.length));
    for (const [key, value] of entries) {
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
      console.log(`  ${label.padEnd(maxKeyLen + 4)} ${formatValue(value)}`);
    }
  }
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "bigint") return val.toString();
  if (typeof val === "number") return val.toLocaleString();
  if (typeof val === "boolean") return val ? "yes" : "no";
  return String(val);
}

// JSON.stringify replacer that handles bigint
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}
