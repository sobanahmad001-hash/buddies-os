// MetaAPI REST client — uses direct fetch, no SDK needed in serverless Next.js
// Docs: https://metaapi.cloud/docs/client/

const PROVISIONING_API = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT_API = "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai";

/** Provision + deploy an MT5 account on MetaAPI. Returns the MetaAPI accountId.
 *  The MT5 password is used here only — MetaAPI stores it, we never persist it. */
export async function provisionAndDeploy(
  token: string,
  login: string,
  password: string,
  server: string
): Promise<string> {
  const createRes = await fetch(`${PROVISIONING_API}/users/current/accounts`, {
    method: "POST",
    headers: { "auth-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Exness-${login}`,
      type: "cloud-g2",
      login,
      password,
      server,
      platform: "mt5",
      application: "buddies-os",
      magic: 0,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!createRes.ok) {
    // 409 = account already exists in MetaAPI — find and return its id
    if (createRes.status === 409) {
      const listRes = await fetch(`${PROVISIONING_API}/users/current/accounts`, {
        headers: { "auth-token": token },
        signal: AbortSignal.timeout(10000),
      });
      if (!listRes.ok) throw new Error("Failed to list MetaAPI accounts");
      const accounts: any[] = await listRes.json();
      const existing = accounts.find((a) => a.login === login && a.server === server);
      if (!existing) throw new Error("Account already exists on MetaAPI but could not be found");
      return existing.id as string;
    }
    const err = await createRes.json().catch(() => ({}));
    throw new Error((err as any).message ?? `MetaAPI provisioning failed (${createRes.status})`);
  }

  const { id: accountId } = await createRes.json();

  // Deploy so MetaAPI connects to the broker
  await fetch(`${PROVISIONING_API}/users/current/accounts/${accountId}/deploy`, {
    method: "POST",
    headers: { "auth-token": token },
    signal: AbortSignal.timeout(10000),
  });

  return accountId as string;
}

/** Check the deployment/connection state of a MetaAPI account.
 *  state values: DEPLOYING | DEPLOYED | UNDEPLOYING | UNDEPLOYED | DRAFT */
export async function getAccountState(
  token: string,
  metaapiAccountId: string
): Promise<{ state: string; connectionStatus?: string } | null> {
  const res = await fetch(`${PROVISIONING_API}/users/current/accounts/${metaapiAccountId}`, {
    headers: { "auth-token": token },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return { state: data.state, connectionStatus: data.connectionStatus };
}

/** Fetch live account info (balance, equity, margin, etc.) from MT5 via MetaAPI.
 *  The account must be in DEPLOYED state and connected to the broker first. */
export async function getLiveAccountInfo(
  token: string,
  metaapiAccountId: string
): Promise<{
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  currency: string;
  server: string;
  name: string;
} | null> {
  const res = await fetch(
    `${CLIENT_API}/users/current/accounts/${metaapiAccountId}/account-information`,
    {
      headers: { "auth-token": token },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) return null;
  return res.json();
}
