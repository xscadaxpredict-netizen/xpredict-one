/**
 * Tech Support module types.
 *
 * Types for user manuals, machine videos, and request-a-call entries.
 */

// ---- User Manuals ----------------------------------------------------------

export interface UserManual {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileSize: string;
  description: string;
}

// ---- Machine Videos --------------------------------------------------------

export interface MachineVideo {
  id: string;
  title: string;
  duration: string;
  resolution: string;
  fileName: string;
  category: string;
  description: string;
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
}
