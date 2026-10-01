/**
 * Tech Support API layer.
 *
 * Placeholder — currently all data is managed in-memory from screens.
 * When the backend is ready, these functions will make HTTP requests.
 */

import type { UserManual, MachineVideo, RequestCall } from "./types";

// ---- Seed Data (will come from API later) ----------------------------------

export const SEED_MANUALS: UserManual[] = [];

export const SEED_MACHINE_VIDEOS: MachineVideo[] = [];

export const SEED_REQUEST_CALLS: RequestCall[] = [];

// ---- API stubs -------------------------------------------------------------

export function fetchManuals(): Promise<UserManual[]> {
  return Promise.resolve(SEED_MANUALS);
}

export function fetchMachineVideos(): Promise<MachineVideo[]> {
  return Promise.resolve(SEED_MACHINE_VIDEOS);
}

export function fetchRequestCalls(): Promise<RequestCall[]> {
  return Promise.resolve(SEED_REQUEST_CALLS);
}
