export enum AppointmentStatus {
  /** Booking intent created; no resource reserved yet */
  CREATED = 'CREATED',
  /** Slot reserved exclusively for HOLD_TTL_MINUTES; awaiting user confirmation */
  HOLD = 'HOLD',
  /** Confirmed by user; bay and technician assignment is durable */
  CONFIRMED = 'CONFIRMED',
  /** Terminated — by user, admin, or hold expiry */
  CANCELLED = 'CANCELLED',
}
