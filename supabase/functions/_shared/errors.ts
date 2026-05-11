export class AppError extends Error {
  constructor(public code: string, public httpStatus: number, message: string, public extra?: unknown) {
    super(message);
  }
}

export const ERR = {
  SEATS_TAKEN:    (extra: unknown) => new AppError('SEATS_TAKEN', 409, 'Algunos asientos no están disponibles', extra),
  SOLD_OUT:       () => new AppError('SOLD_OUT', 409, 'Zona agotada'),
  INVALID_COUPON: (r: string) => new AppError('INVALID_COUPON', 400, r),
  VALIDATION:     (field: string) => new AppError('VALIDATION', 400, `Campo inválido: ${field}`),
  RATE_LIMIT:     () => new AppError('RATE_LIMIT', 429, 'Demasiadas solicitudes. Reintenta en un minuto.'),
  TICKET_INVALID: () => new AppError('INVALID', 404, 'Boleta no válida'),
  TICKET_USED:    (extra: unknown) => new AppError('ALREADY_USED', 409, 'Boleta ya utilizada', extra),
  TICKET_UNPAID:  () => new AppError('UNPAID', 402, 'Boleta sin pago confirmado'),
  WRONG_DATE:     () => new AppError('WRONG_DATE', 400, 'Boleta no es para hoy'),
};

/**
 * Pure pricing function — exported for unit testing without DB.
 * Returns the final total in COP after applying a fixed-amount discount.
 */
export function calculateTotal(price_cop: number, quantity: number, discount_cop = 0): {
  subtotal: number;
  discount: number;
  total: number;
} {
  const subtotal = price_cop * quantity;
  const discount = Math.max(0, discount_cop);
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total };
}
