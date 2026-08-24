export enum BookingStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    DECLINED = 'DECLINED',
    CANCELLED = 'CANCELLED',
    // Nobody acted and the dates ran out. Distinct from DECLINED (the provider
    // said no) and CANCELLED (the customer withdrew) — attributing a lapse to
    // either party would put a refusal on someone's record that they never made.
    EXPIRED = 'EXPIRED',
}
