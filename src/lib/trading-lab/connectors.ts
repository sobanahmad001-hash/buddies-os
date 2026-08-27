export type ConnectorCapability =
  | "spot_quote"
  | "historical_bars"
  | "futures_volume"
  | "open_interest"
  | "trades"
  | "market_depth"
  | "macro_series"
  | "positioning"
  | "economic_calendar"
  | "news"
  | "chart_alerts";

export type ConnectorDefinition = {
  id: string;
  name: string;
  category: "market_data" | "macro" | "research" | "charting";
  auth: "api_key" | "webhook_secret" | "none";
  capabilities: ConnectorCapability[];
  phase: number;
  recommended?: boolean;
  note: string;
};

export const CONNECTOR_CATALOG: readonly ConnectorDefinition[] = [
  {
    id: "databento",
    name: "Databento",
    category: "market_data",
    auth: "api_key",
    capabilities: ["historical_bars", "futures_volume", "open_interest", "trades", "market_depth"],
    phase: 2,
    recommended: true,
    note: "Primary COMEX futures history, volume, open interest and later order-flow source.",
  },
  {
    id: "twelve_data",
    name: "Twelve Data",
    category: "market_data",
    auth: "api_key",
    capabilities: ["spot_quote", "historical_bars"],
    phase: 2,
    note: "Spot XAU/USD availability depends on your Twelve Data plan. The connection test shows the provider's exact response; demo research data remains available when the symbol is not included in your plan.",
  },
  {
    id: "fred",
    name: "FRED",
    category: "macro",
    auth: "api_key",
    capabilities: ["macro_series"],
    phase: 2,
    recommended: true,
    note: "Official economic series for nominal yields, real yields and macro context.",
  },
  {
    id: "cftc",
    name: "CFTC COT",
    category: "macro",
    auth: "none",
    capabilities: ["positioning"],
    phase: 2,
    recommended: true,
    note: "Weekly positioning context; never treated as an intraday trigger.",
  },
  {
    id: "tradingview_webhook",
    name: "TradingView Webhooks",
    category: "charting",
    auth: "webhook_secret",
    capabilities: ["chart_alerts"],
    phase: 8,
    note: "Receives authenticated and deduplicated TradingView alert events.",
  },
] as const;

export function connectorsForCapability(capability: ConnectorCapability) {
  return CONNECTOR_CATALOG.filter(connector => connector.capabilities.includes(capability));
}
