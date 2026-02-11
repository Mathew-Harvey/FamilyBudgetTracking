import type {
  BasiqTokenResponse,
  BasiqUser,
  BasiqJob,
  BasiqAccount,
  BasiqTransaction,
} from "@/types";

const BASIQ_API_URL =
  process.env.BASIQ_API_URL || "https://au-api.basiq.io";
const BASIQ_API_KEY = process.env.BASIQ_API_KEY || "";

class BasiqClient {
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  async getToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.token && Date.now() < this.tokenExpiresAt - 60000) {
      return this.token;
    }

    const res = await fetch(`${BASIQ_API_URL}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${BASIQ_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "basiq-version": "3.0",
      },
      body: "scope=SERVER_ACCESS",
    });

    if (!res.ok) {
      throw new Error(`Basiq auth failed: ${res.status} ${await res.text()}`);
    }

    const data: BasiqTokenResponse = await res.json();
    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${BASIQ_API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "basiq-version": "3.0",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Basiq API error ${res.status}: ${text}`);
    }

    return res.json();
  }

  async createUser(email: string, mobile?: string): Promise<BasiqUser> {
    const body: Record<string, string> = { email };
    if (mobile) body.mobile = mobile;
    return this.request<BasiqUser>("/users", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getUser(userId: string): Promise<BasiqUser> {
    return this.request<BasiqUser>(`/users/${userId}`);
  }

  async createConnection(
    userId: string,
    institutionId: string
  ): Promise<BasiqJob> {
    return this.request<BasiqJob>(`/users/${userId}/connections`, {
      method: "POST",
      body: JSON.stringify({ institution: { id: institutionId } }),
    });
  }

  async refreshConnection(
    userId: string,
    connectionId: string
  ): Promise<BasiqJob> {
    return this.request<BasiqJob>(
      `/users/${userId}/connections/${connectionId}/refresh`,
      { method: "POST" }
    );
  }

  async getJobStatus(jobId: string): Promise<BasiqJob> {
    return this.request<BasiqJob>(`/jobs/${jobId}`);
  }

  async getAccounts(userId: string): Promise<BasiqAccount[]> {
    const data = await this.request<{ data: BasiqAccount[] }>(
      `/users/${userId}/accounts`
    );
    return data.data || [];
  }

  async getTransactions(
    userId: string,
    filters?: {
      fromDate?: string;
      toDate?: string;
      accountId?: string;
    }
  ): Promise<BasiqTransaction[]> {
    const params = new URLSearchParams();
    if (filters?.fromDate)
      params.set("filter[transaction.postDate][gte]", filters.fromDate);
    if (filters?.toDate)
      params.set("filter[transaction.postDate][lte]", filters.toDate);
    if (filters?.accountId)
      params.set("filter[account.id]", filters.accountId);

    const query = params.toString() ? `?${params.toString()}` : "";
    const allTransactions: BasiqTransaction[] = [];
    let nextUrl: string | null = `/users/${userId}/transactions${query}`;

    interface BasiqPagedResponse {
      data: BasiqTransaction[];
      links?: { next?: string };
    }

    // Paginate through all results
    while (nextUrl) {
      const page: BasiqPagedResponse = await this.request<BasiqPagedResponse>(nextUrl);
      allTransactions.push(...(page.data || []));
      nextUrl = page.links?.next
        ? new URL(page.links.next).pathname + new URL(page.links.next).search
        : null;
    }

    return allTransactions;
  }

  async getClientToken(userId: string): Promise<string> {
    const res = await fetch(`${BASIQ_API_URL}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${BASIQ_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "basiq-version": "3.0",
      },
      body: `scope=CLIENT_ACCESS&userId=${userId}`,
    });

    if (!res.ok) {
      throw new Error(
        `Basiq client token failed: ${res.status} ${await res.text()}`
      );
    }

    const data: BasiqTokenResponse = await res.json();
    return data.access_token;
  }

  async getConsentUrl(userId: string): Promise<string> {
    // Consent UI requires a CLIENT_ACCESS token bound to the userId
    const clientToken = await this.getClientToken(userId);
    return `https://consent.basiq.io/home?token=${clientToken}`;
  }
}

// Singleton
export const basiqClient = new BasiqClient();

// Helper to poll a job until completion
export async function pollJobUntilComplete(
  jobId: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<BasiqJob> {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await basiqClient.getJobStatus(jobId);
    const allDone = job.steps.every(
      (step) => step.status === "success" || step.status === "failed"
    );
    if (allDone) return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Job ${jobId} did not complete within timeout`);
}
