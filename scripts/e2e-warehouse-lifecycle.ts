/**
 * Manual E2E lifecycle script for Central Warehouse → Sub-Hub flow.
 *
 * Prerequisites:
 * - Backend running on localhost:8000
 * - Seeded DB (central warehouse inventory, hub user, admin, products, fleet)
 *
 * Usage:
 *   npx tsx scripts/e2e-warehouse-lifecycle.ts
 */
const API = process.env.API_BASE_URL ?? 'http://localhost:8000/api/v1';

type Json = Record<string, unknown>;

async function request<T = Json>(
  method: string,
  path: string,
  options?: {
    token?: string;
    body?: unknown;
    query?: Record<string, string | number>;
  },
): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${API}${path}`);
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.token
        ? { Authorization: `Bearer ${options.token}` }
        : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status} ${path}`), {
      response: payload,
    });
  }
  return payload as T;
}

function unwrapData<T>(payload: { data?: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function main() {
  const adminLogin = unwrapData<{ accessToken: string }>(
    await request('POST', '/admin/auth/login', {
      body: {
        email: 'warehouse@bajriwala.in',
        password: 'Admin@1234',
      },
    }),
  );
  const adminToken = adminLogin.accessToken;

  const hubLogin = unwrapData<{
    accessToken: string;
    user: { hubId: string };
  }>(
    await request('POST', '/hub/auth/login', {
      body: {
        employeeId: 'hubmanager01',
        password: '123456',
      },
    }),
  );
  const hubToken = hubLogin.accessToken;
  const hubId = hubLogin.user.hubId;

  const materialsPayload = unwrapData<{
    data?: Array<{ id?: string; productId?: string; sku?: string; name?: string }>;
  } | Array<{ id?: string; productId?: string; sku?: string; name?: string }>>(
    await request('GET', '/hub/materials', {
      token: hubToken,
      query: { limit: 5 },
    }),
  );
  const product = Array.isArray(materialsPayload)
    ? materialsPayload[0]
    : materialsPayload.data?.[0];
  const productId = product?.productId ?? product?.id;
  if (!productId) throw new Error('No materials available for requisition');

  const inventoryBefore = unwrapData<{
    data: Array<Record<string, unknown>>;
  }>(
    await request('GET', '/admin/warehouse/inventory', {
      token: adminToken,
      query: { search: product.sku ?? product.name ?? '', limit: 1 },
    }),
  );
  console.log('Stock before:', inventoryBefore.data[0]);

  const created = unwrapData<{
    id: string;
    requestId?: string;
    requestNo?: string;
  }>(
    await request('POST', '/hub/requisitions', {
      token: hubToken,
      body: {
        expectedDate: new Date(Date.now() + 86400000).toISOString(),
        reason: 'LOW_STOCK',
        priority: 'HIGH',
        remarks: 'E2E test requisition',
        submit: true,
        items: [{ productId, requestedQty: 5 }],
      },
    }),
  );
  console.log(
    'Created requisition:',
    created.requestId ?? created.requestNo,
    created.id,
  );

  const detail = unwrapData<{ materials: Array<{ id: string }> }>(
    await request('GET', `/admin/requisitions/${created.id}`, {
      token: adminToken,
    }),
  );
  const itemId = detail.materials[0].id;

  await request('PATCH', `/admin/requisitions/${created.id}/approve`, {
    token: adminToken,
    body: {
      items: [{ itemId, approvedQty: 5 }],
      comment: 'E2E approved',
    },
  });
  console.log('Approved');

  await request('PATCH', `/admin/requisitions/${created.id}/allocate`, {
    token: adminToken,
    body: {
      items: [{ itemId, allocatedQty: 5 }],
    },
  });
  console.log('Allocated');

  const afterAlloc = unwrapData<{ data: Array<Record<string, unknown>> }>(
    await request('GET', '/admin/warehouse/inventory', {
      token: adminToken,
      query: { search: product.sku ?? product.name ?? '', limit: 1 },
    }),
  );
  console.log('Stock after allocate:', afterAlloc.data[0]);

  const vehicles = unwrapData<{
    data?: Array<{ id: string }>;
  } | Array<{ id: string }>>(
    await request('GET', '/admin/vehicles', {
      token: adminToken,
      query: { limit: 5 },
    }),
  );
  const drivers = unwrapData<{
    data?: Array<{ id: string }>;
  } | Array<{ id: string }>>(
    await request('GET', '/admin/drivers', {
      token: adminToken,
      query: { limit: 5 },
    }),
  );
  const vehicleId = Array.isArray(vehicles)
    ? vehicles[0]?.id
    : vehicles.data?.[0]?.id;
  const driverId = Array.isArray(drivers)
    ? drivers[0]?.id
    : drivers.data?.[0]?.id;
  if (!vehicleId || !driverId) {
    throw new Error('Need seeded vehicle + driver to dispatch');
  }

  await request('PATCH', `/admin/requisitions/${created.id}/assign-logistics`, {
    token: adminToken,
    body: { vehicleId, driverId },
  });
  console.log('Logistics assigned');

  await request('PATCH', `/admin/requisitions/${created.id}/dispatch`, {
    token: adminToken,
    body: {
      vehicleId,
      driverId,
      estimatedArrival: new Date(Date.now() + 3 * 3600000).toISOString(),
    },
  });
  console.log('Dispatched → IN_TRANSIT');

  const transfers = unwrapData<{
    data?: Array<{ id: string }>;
    transfers?: Array<{ id: string }>;
  } | Array<{ id: string }>>(
    await request('GET', '/hub/transfers', { token: hubToken }),
  );
  const transferList = Array.isArray(transfers)
    ? transfers
    : (transfers.data ?? transfers.transfers ?? []);
  const incoming = transferList.find((t) => t.id === created.id);
  console.log('Hub sees transfer:', Boolean(incoming));

  await request('PATCH', `/hub/requisitions/${created.id}/receive`, {
    token: hubToken,
    body: {
      items: [{ itemId, receivedQty: 5 }],
      photoUrls: ['https://example.com/e2e-delivery.jpg'],
    },
  });
  console.log('Received at hub');

  const finalDetail = unwrapData<{ rawStatus?: string; status?: string }>(
    await request('GET', `/admin/requisitions/${created.id}`, {
      token: adminToken,
    }),
  );
  console.log('Final status:', finalDetail.rawStatus ?? finalDetail.status);

  const afterRecv = unwrapData<{ data: Array<Record<string, unknown>> }>(
    await request('GET', '/admin/warehouse/inventory', {
      token: adminToken,
      query: { search: product.sku ?? product.name ?? '', limit: 1 },
    }),
  );
  console.log('Stock after receive (central):', afterRecv.data[0]);
  console.log('E2E lifecycle OK for hub', hubId);
}

main().catch((err: { response?: unknown; message?: string }) => {
  console.error(err?.response ?? err?.message ?? err);
  process.exit(1);
});
