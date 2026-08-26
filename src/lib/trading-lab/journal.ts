export function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index++; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(item => item.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const first = (row: Record<string, string>, aliases: string[]) => aliases.map(alias => row[alias]).find(value => value !== undefined && value !== "") ?? "";
const number = (value: string) => value === "" ? null : Number.isFinite(Number(value.replace(/[$,]/g, ""))) ? Number(value.replace(/[$,]/g, "")) : null;

export function normalizeTradeRow(row: Record<string, string>, index: number) {
  const directionRaw = first(row, ["direction", "side", "type", "action"]).toLowerCase();
  const direction = directionRaw.includes("sell") || directionRaw.includes("short") ? "sell" : "buy";
  const opened = first(row, ["opened_at", "open_time", "entry_time", "date", "time"]);
  const closed = first(row, ["closed_at", "close_time", "exit_time"]);
  const entry = number(first(row, ["entry_price", "entry", "open_price", "price"]));
  if (!opened || entry === null) throw new Error(`Row ${index + 2}: entry time and entry price are required`);
  const exit = number(first(row, ["exit_price", "exit", "close_price"]));
  const externalId = first(row, ["external_trade_id", "ticket", "trade_id", "order_id"]) || null;
  return {
    instrument: first(row, ["instrument", "symbol", "market"]) || "XAUUSD", direction, entry_price: entry,
    exit_price: exit, lot_size: number(first(row, ["lot_size", "lots", "size", "quantity"])) ?? .01,
    stop_loss: number(first(row, ["stop_loss", "sl"])), take_profit: number(first(row, ["take_profit", "tp"])),
    result_usd: number(first(row, ["result_usd", "pnl", "profit", "net_pnl"])), fees_usd: number(first(row, ["fees_usd", "fees", "commission"])) ?? 0,
    r_multiple: number(first(row, ["r_multiple", "r", "r_value"])), strategy: first(row, ["strategy", "system"]) || null,
    setup_name: first(row, ["setup_name", "setup", "tag"]) || null, timeframe: first(row, ["timeframe", "tf"]) || null,
    session: first(row, ["session"]) || null, notes: first(row, ["notes", "comment"]) || null,
    opened_at: new Date(opened).toISOString(), closed_at: closed ? new Date(closed).toISOString() : null,
    status: closed || exit !== null ? "closed" : "open", external_trade_id: externalId, source: "csv_import", account_type: "external", ladder_step: 1,
  };
}
