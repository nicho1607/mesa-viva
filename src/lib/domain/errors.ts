// Errores de dominio tipados. Las Server Actions los traducen a mensajes para la UI
// (`error instanceof DomainError` → `error.message` es apto para mostrar, en español).

export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** La orden ya no está OPEN (cerrada o anulada): es inmutable. */
export class OrderClosedError extends DomainError {
  readonly code = "ORDER_CLOSED";
  constructor() {
    super("El servicio de esta mesa ya se cerró. Pide al mesero abrir una nueva cuenta.");
  }
}

/** Algún producto pedido no existe o está agotado (`available = false`). */
export class UnavailableProductsError extends DomainError {
  readonly code = "UNAVAILABLE_PRODUCTS";
  constructor(public readonly productIds: string[]) {
    super("Algunos productos ya no están disponibles");
  }
}

/** Token/mesa inexistente o mesa INACTIVE. */
export class InvalidTableError extends DomainError {
  readonly code = "INVALID_TABLE";
  constructor() {
    super("Este código no es válido, pide ayuda al mesero");
  }
}

/** Cambio de estado de ítem no permitido (p.ej. SERVED → PENDING). */
export class InvalidTransitionError extends DomainError {
  readonly code = "INVALID_TRANSITION";
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`No se puede pasar de ${from} a ${to}`);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  constructor(public readonly entity: string) {
    super(`${entity} no encontrado`);
  }
}

/** El usuario de staff no es responsable del recurso (p.ej. una mesa de otro mesero). */
export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  constructor(message = "Esta mesa no está asignada a ti") {
    super(message);
  }
}
