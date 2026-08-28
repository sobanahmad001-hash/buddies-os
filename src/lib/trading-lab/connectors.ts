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
  access: "required_free" | "optional_paid";
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
    access: "optional_paid",
    note: "Optional and not yet wired into the live Lab pipeline. Historical data is usage-priced; the Standard live-data plan is currently $199/month.",
  },
  {
    id: "twelve_data",
    name: "Twelve Data",
    category: "market_data",
    auth: "api_key",
    capabilities: ["spot_quote", "historical_bars"],
    phase: 2,
    access: "required_free",
    note: "Spot XAU/USD availability depends on your Twelve Data plan. The connection test shows the provider's exact response; demo research data remains available when the symbol is not included in your plan.",
  },
  {
    id: "fred",
    name: "FRED",
    category: "macro",
    auth: "api_key",
    capabilities: ["macro_series"],
    phase: 2,
    access: "required_free",
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
    access: "required_free",
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
    access: "optional_paid",
    note: "Optional authenticated alert input. TradingView webhook notifications require a paid Essential plan or higher; the free Basic plan cannot send them.",
  },
] as const;

export function connectorsForCapability(capability: ConnectorCapability) {
  return CONNECTOR_CATALOG.filter(connector => connector.capabilities.includes(capability));
}
