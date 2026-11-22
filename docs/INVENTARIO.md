# Inventario de porciones

Mesa Viva controla porciones vendibles por producto, no ingredientes ni recetas.

## Estados

- `Product.available = false`: el administrador retiró el producto. El saldo se conserva.
- `availableQuantity = null`: producto sin control cuantitativo.
- `availableQuantity > 0`: porciones que todavía pueden aceptarse.
- `availableQuantity = 0`: agotado por inventario aunque `available` siga en `true`.

Un producto puede pedirse cuando `available` es `true` y su saldo es `null` o mayor que cero.

## Ciclo de una porción

1. Al aceptar una ronda, la transacción bloquea los productos y suma la demanda de todas las líneas por `productId`.
2. Si alguna cantidad supera el saldo, se rechaza el envío completo sin crear ronda, ítems ni movimientos.
3. Si alcanza, cada producto controlado recibe un movimiento `RESERVATION` negativo y se reduce su saldo en la misma transacción que crea los ítems.
4. `PENDING` representa una porción reservada. `IN_PREPARATION` y `SERVED` representan una porción consumida. Esos cambios no vuelven a reducir el saldo.
5. Cancelar no libera porciones. Si una porción realmente puede venderse otra vez, un administrador registra un ajuste positivo después de verificarlo.
6. Cerrar la orden no cambia existencias, incluso si quedan ítems pendientes o en preparación.

## Ajustes

Solo `ADMIN` puede iniciar o ajustar inventario desde **Administración → Menú**.

- La apertura configura el primer saldo, incluido cero.
- Un ajuste positivo repone porciones.
- Un ajuste negativo corrige el saldo y nunca puede dejarlo debajo de cero.
- Cada ajuste exige motivo y conserva administrador, fecha, delta y saldos anterior/posterior.
- Reintentar el mismo ajuste aplica el delta una sola vez mediante `operationId`.

Los productos con movimientos ya no se eliminan; se retiran con `available = false`.

## Concurrencia e idempotencia

El orden de bloqueo al pedir es mesa → orden → productos ordenados por ID. Así, dos mesas que compiten por la última porción se serializan: una reserva y la otra recibe `INSUFFICIENT_STOCK`.

Cada envío lleva un UUID persistido por el cliente mientras la respuesta sea incierta. `OrderSubmission` guarda la mesa, orden, ronda y huella de la entrada normalizada. Repetir UUID y contenido devuelve la misma ronda sin otra reserva; reutilizarlo con otros datos produce conflicto.

Las señales de tiempo real siguen publicándose después del commit. Una señal repetida solo provoca otro refetch y no repite la mutación.

## Conciliación

Para un producto controlado:

```text
saldo actual = apertura + ajustes + reservas
```

Las reservas tienen delta negativo. La cadena es válida cuando el `balanceAfter` de cada movimiento coincide con el `balanceBefore` del siguiente y el último saldo coincide con `Product.availableQuantity`.

## Fuera de alcance

Ingredientes, recetas, unidades físicas, compras, proveedores, costos, mermas detalladas, pronósticos y analítica.
