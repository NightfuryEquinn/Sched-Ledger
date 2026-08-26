import { createApiApp } from "@/api/app";
import { SESSION_COOKIE } from "@/api/lib/auth";
import { resetRateLimitsForTests } from "@/api/middleware/rate-limit";
import { Wallet } from "ethers";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { installMemoryDb, uninstallMemoryDb, type MemoryDb } from "../helpers/memory-db";

const app = createApiApp();

/** Sign in a fresh wallet and return its session cookie header value. */
async function signIn(): Promise<string> {
  const wallet = Wallet.createRandom();

  const challengeRes = await app.request("/api/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet.address }),
  });
  const challenge = (await challengeRes.json()) as { message: string };
  const signature = await wallet.signMessage(challenge.message);

  const verifyRes = await app.request("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet.address, message: challenge.message, signature }),
  });
  const setCookie = verifyRes.headers.get("set-cookie") || "";
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));

  return `${SESSION_COOKIE}=${match![1]!}`;
}

/** Create a vehicle for the given cookie's account and return its id. */
async function createVehicle(cookie: string, type = "car"): Promise<string> {
  const res = await app.request("/api/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ type, enc: 1, payload: "ciphertext" }),
  });
  expect(res.status).toBe(201);
  const { vehicle } = (await res.json()) as { vehicle: { id: string } };
  return vehicle.id;
}

describe("vehicles routes", () => {
  let memory: MemoryDb;

  beforeAll(() => {
    memory = installMemoryDb();
  });

  afterAll(() => {
    uninstallMemoryDb();
  });

  beforeEach(() => {
    memory._reset();
    resetRateLimitsForTests();
  });

  test("create and list a vehicle", async () => {
    const cookie = await signIn();
    const id = await createVehicle(cookie, "ev");

    const res = await app.request("/api/vehicles", { headers: { cookie } });
    expect(res.status).toBe(200);
    const { vehicles } = (await res.json()) as { vehicles: Array<{ id: string; type: string }> };
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]!.id).toBe(id);
    expect(vehicles[0]!.type).toBe("ev");
  });

  test("vehicle response withholds ownership keys", async () => {
    const cookie = await signIn();
    await createVehicle(cookie);

    const res = await app.request("/api/vehicles", { headers: { cookie } });
    const { vehicles } = (await res.json()) as { vehicles: Array<Record<string, unknown>> };
    expect(Object.keys(vehicles[0]!)).not.toContain("accountId");
  });

  test("update a vehicle's type and payload", async () => {
    const cookie = await signIn();
    const id = await createVehicle(cookie, "car");

    const res = await app.request(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ type: "van", enc: 1, payload: "updated" }),
    });
    expect(res.status).toBe(200);
    const { vehicle } = (await res.json()) as { vehicle: { type: string; payload: string } };
    expect(vehicle.type).toBe("van");
    expect(vehicle.payload).toBe("updated");
  });

  test("another account cannot read, update, or delete this vehicle", async () => {
    const ownerCookie = await signIn();
    const id = await createVehicle(ownerCookie);
    const otherCookie = await signIn();

    const listRes = await app.request("/api/vehicles", { headers: { cookie: otherCookie } });
    const { vehicles } = (await listRes.json()) as { vehicles: unknown[] };
    expect(vehicles).toHaveLength(0);

    const patchRes = await app.request(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: otherCookie },
      body: JSON.stringify({ enc: 1, payload: "hijacked" }),
    });
    expect(patchRes.status).toBe(404);

    const deleteRes = await app.request(`/api/vehicles/${id}`, {
      method: "DELETE",
      headers: { cookie: otherCookie },
    });
    expect(deleteRes.status).toBe(404);
  });

  test("create, list, update, and delete a fill", async () => {
    const cookie = await signIn();
    const vehicleId = await createVehicle(cookie);

    const createRes = await app.request("/api/vehicles/fills", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ vehicleId, date: "2026-08-01", partial: false, enc: 1, payload: "fill-1" }),
    });
    expect(createRes.status).toBe(201);
    const { fill } = (await createRes.json()) as { fill: { id: string; vehicleId: string } };
    expect(fill.vehicleId).toBe(vehicleId);

    const listRes = await app.request(`/api/vehicles/fills?vehicleId=${vehicleId}`, { headers: { cookie } });
    const { fills } = (await listRes.json()) as { fills: Array<{ id: string }> };
    expect(fills).toHaveLength(1);

    const patchRes = await app.request(`/api/vehicles/fills/${fill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ enc: 1, payload: "fill-1-updated", partial: true }),
    });
    expect(patchRes.status).toBe(200);
    const { fill: updated } = (await patchRes.json()) as { fill: { partial: boolean; payload: string } };
    expect(updated.partial).toBe(true);
    expect(updated.payload).toBe("fill-1-updated");

    const deleteRes = await app.request(`/api/vehicles/fills/${fill.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleteRes.status).toBe(200);

    const afterDelete = await app.request(`/api/vehicles/fills?vehicleId=${vehicleId}`, { headers: { cookie } });
    const { fills: remaining } = (await afterDelete.json()) as { fills: unknown[] };
    expect(remaining).toHaveLength(0);
  });

  test("deleting a vehicle cascades to its fills", async () => {
    const cookie = await signIn();
    const vehicleId = await createVehicle(cookie);

    await app.request("/api/vehicles/fills", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ vehicleId, date: "2026-08-01", partial: false, enc: 1, payload: "fill-1" }),
    });

    const deleteRes = await app.request(`/api/vehicles/${vehicleId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleteRes.status).toBe(200);

    const fillsRes = await app.request(`/api/vehicles/fills?vehicleId=${vehicleId}`, { headers: { cookie } });
    const { fills } = (await fillsRes.json()) as { fills: unknown[] };
    expect(fills).toHaveLength(0);
  });

  test("rejects an unknown vehicle type", async () => {
    const cookie = await signIn();
    const res = await app.request("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ type: "spaceship", enc: 1, payload: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
