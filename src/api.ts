// Talks to Tiko (Supabase) as the linked computer. No Supabase user here:
// every call is a public RPC that takes this computer's token.

const URL_ = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!URL_ || !KEY) throw new ApiError('not_configured');
  let res: Response;
  try {
    res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        // The legacy anon key is a JWT and also goes as the bearer token; the
        // new publishable key (sb_publishable_…) isn't a JWT and must only go
        // as apikey, or the API rejects it.
        ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch {
    throw new ApiError('offline');
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg: string = body?.message ?? 'error';
    // Our functions raise short codes ('device_unlinked', 'too_many_attempts').
    throw new ApiError(/^[a-z_]+$/.test(msg) ? msg : 'error');
  }
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    throw new ApiError(body.error);
  }
  return body as T;
}

export type CodeInfo = { account_name: string; branches: { id: string; name: string; address: string | null }[] };
export type Job = {
  id: string;
  kind: 'kitchen' | 'customer' | 'test';
  reason: 'accept' | 'arrival' | 'manual' | 'test';
  created_at: string;
  order: any | null;
  requested_by: string | null;
};
export type Poll = {
  device: { id: string; name: string; branch_id: string };
  jobs: Job[];
  bundle: { branch: any; account: { id: string; name: string; slug: string } } | null;
};
export type DeviceInfo = { device_id: string; name: string; branch_id: string; branch_name: string; account_name: string };

export const api = {
  checkCode: (code: string) => rpc<CodeInfo>('print_check_code', { p_code: code }),
  link: (code: string, branchId: string, name: string, platform: string, version: string) =>
    rpc<{ device_id: string; token: string }>('print_link_device', {
      p_code: code,
      p_branch_id: branchId,
      p_name: name,
      p_platform: platform,
      p_app_version: version,
    }),
  poll: (token: string, version: string) => rpc<Poll>('print_device_poll', { p_token: token, p_app_version: version }),
  done: (token: string, jobId: string, ok: boolean, error?: string) =>
    rpc<null>('print_job_done', { p_token: token, p_job_id: jobId, p_ok: ok, p_error: error ?? null }),
  info: (token: string, printers?: unknown) =>
    rpc<DeviceInfo>('print_device_info', { p_token: token, p_printers: printers ?? null }),
  unlink: (token: string) => rpc<null>('print_device_unlink', { p_token: token }),
};
