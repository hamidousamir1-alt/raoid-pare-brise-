"use client";

export type OfflineVisit = {
  id: string;
  prospectId: string;
  prospectName: string;
  outcome: string;
  note: string;
  latitude?: number;
  longitude?: number;
  queuedAt: string;
};

const VISITS_KEY = "rapid-crm:offline-visits:v1";
const ROUTE_KEY = "rapid-crm:route-cache:v1";
const read = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
};
export function queuedVisits() {
  return read<OfflineVisit[]>(VISITS_KEY, []);
}
export function queueVisit(visit: Omit<OfflineVisit, "id" | "queuedAt">) {
  const item: OfflineVisit = {
    ...visit,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };
  localStorage.setItem(
    VISITS_KEY,
    JSON.stringify([...queuedVisits(), item].slice(-100)),
  );
  return item;
}
export function removeQueuedVisit(id: string) {
  localStorage.setItem(
    VISITS_KEY,
    JSON.stringify(queuedVisits().filter((visit) => visit.id !== id)),
  );
}
export function cacheRoute<T>(items: T[]) {
  localStorage.setItem(
    ROUTE_KEY,
    JSON.stringify({ savedAt: new Date().toISOString(), items }),
  );
}
export function cachedRoute<T>() {
  return read<{ savedAt: string; items: T[] }>(ROUTE_KEY, {
    savedAt: "",
    items: [],
  });
}
export function clearOfflineFieldData() {
  localStorage.removeItem(VISITS_KEY);
  localStorage.removeItem(ROUTE_KEY);
}
