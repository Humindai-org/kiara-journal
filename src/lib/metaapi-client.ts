const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

function clientBase(region: string) {
  return `https://mt-client-api-v1.${region}.agiliumtrade.agiliumtrade.ai`;
}

function authHeaders(token: string) {
  return { "auth-token": token, "Content-Type": "application/json" };
}

// ── Account provisioning ────────────────────────────────────────────────────

export async function provisionAccount(token: string, params: {
  login: string;
  password: string;
  name: string;
  server: string;
  platform?: "mt5" | "mt4";
}): Promise<{ id: string }> {
  const res = await fetch(`${PROVISIONING}/users/current/accounts`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      login:       params.login,
      password:    params.password,
      name:        params.name,
      server:      params.server,
      platform:    params.platform ?? "mt5",
      magic:       0,
      application: "MetaApi",
      type:        "cloud",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi provision ${res.status}: ${text}`);
  }
  return res.json();
}

export async function deployAccount(token: string, accountId: string): Promise<void> {
  const res = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}/deploy`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi deploy ${res.status}: ${text}`);
  }
}

export async function undeployAccount(token: string, accountId: string): Promise<void> {
  const res = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}/undeploy`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`MetaApi undeploy ${res.status}: ${text}`);
  }
}

export async function removeAccount(token: string, accountId: string): Promise<void> {
  const res = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`MetaApi delete ${res.status}: ${text}`);
  }
}

export type MetaApiAccountInfo = {
  id:       string;
  name:     string;
  login:    string;
  server:   string;
  platform: "mt5" | "mt4";
  region:   string;
  state:    "CREATED" | "DEPLOYING" | "DEPLOYED" | "UNDEPLOYING" | "UNDEPLOYED" | "ERROR";
};

export async function getAccountInfo(token: string, accountId: string): Promise<MetaApiAccountInfo> {
  const res = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}`, {
    headers: { "auth-token": token },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi getAccount ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Trade history ───────────────────────────────────────────────────────────

export type MetaApiDeal = {
  id:         string;
  type:       string; // "DEAL_TYPE_BUY" | "DEAL_TYPE_SELL" | ...
  entryType:  string; // "DEAL_ENTRY_IN" | "DEAL_ENTRY_OUT" | "DEAL_ENTRY_OUT_BY" | "DEAL_ENTRY_INOUT"
  positionId: string;
  time:       string; // ISO UTC
  symbol?:    string;
  volume?:    number;
  price?:     number;
  commission?: number;
  swap?:      number;
  profit?:    number;
};

export async function getHistoryDeals(
  token:     string,
  region:    string,
  accountId: string,
  startTime: string,
  endTime:   string,
): Promise<MetaApiDeal[]> {
  const start = encodeURIComponent(startTime);
  const end   = encodeURIComponent(endTime);
  const url   = `${clientBase(region)}/users/current/accounts/${accountId}/history-deals/time/${start}/${end}`;
  const res   = await fetch(url, { headers: { "auth-token": token } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi history ${res.status}: ${text}`);
  }
  const json = await res.json();
  return (json.deals ?? json) as MetaApiDeal[];
}

// ── Open positions ──────────────────────────────────────────────────────────

export type MetaApiPosition = {
  id:               string;
  type:             "POSITION_TYPE_BUY" | "POSITION_TYPE_SELL";
  symbol:           string;
  volume:           number;
  openPrice:        number;
  unrealizedProfit?: number;
  profit?:          number;
  commission?:      number;
  swap?:            number;
  time?:            string;
  sl?:              number;
  tp?:              number;
};

export async function getOpenPositions(
  token:     string,
  region:    string,
  accountId: string,
): Promise<MetaApiPosition[]> {
  const url = `${clientBase(region)}/users/current/accounts/${accountId}/positions`;
  const res = await fetch(url, { headers: { "auth-token": token } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MetaApi positions ${res.status}: ${text}`);
  }
  const json = await res.json();
  return (json.positions ?? json) as MetaApiPosition[];
}
