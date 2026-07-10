export function parseCsv(buffer: Buffer) {
  const text = buffer.toString("utf-8");

  const lines = text.split("\n").filter(Boolean);
  const headers = lines[0].split(",");

  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};

    headers.forEach((h, i) => {
      row[h.trim()] = values[i]?.trim();
    });

    return row;
  });

  return { headers, rows };
}
