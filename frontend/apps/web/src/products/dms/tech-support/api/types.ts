/**
 * Tech Support module types.
 *
 * Types for user manuals, machine videos, and request-a-call entries.
 */

// ---- User Manuals ----------------------------------------------------------

/*
 * SNAKE_CASE, BECAUSE THAT IS WHAT THE SERIALIZER SENDS. These were
 * `fileName` and `fileSize`, which no response has ever contained -- so
 * `manual.fileName` was `undefined` at runtime and the download silently fell
 * back to "manual.pdf". Somebody had already noticed one half of it and
 * patched a single line with `(manual as any).file_size`.
 *
 * This is the standing cost of C43: the types are hand-written and nothing
 * checks them against Django. `UserManualSerializer` is the contract.
 */
export interface UserManual {
  id: string;
  title: string;
  category: string;
  description: string;
  /** URL of the stored file. Read-only; uploads send a FileList instead. */
  file: string;
  file_name: string;
  file_size: string;
}

// ---- Machine Videos --------------------------------------------------------

/** Same correction as `UserManual` above; `MachineVideoSerializer` is the contract. */
export interface MachineVideo {
  id: string;
  title: string;
  category: string;
  description: string;
  /** URL of the stored file. Read-only; uploads send a FileList instead. */
  file: string;
  file_name: string;
  duration: string;
  resolution: string;
}

// ---- Request Call ----------------------------------------------------------

export type CallStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface RequestCall {
  id: string;
  name: string;
  phone: string;
  email: string;
  subject: string;
  message: string;
  date: string;
  status: CallStatus;
  attachment?: string | File | null;
  attachment_name?: string;
}
