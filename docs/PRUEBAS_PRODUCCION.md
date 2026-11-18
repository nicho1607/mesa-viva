# Pruebas de Mesa Viva en producción

El 17 de noviembre de 2026, Render mostraba el commit `c86c6e4` como **Live** en la rama `main`. Las pruebas se hicieron en la Mesa 1. [Commit desplegado](https://github.com/nicho1607/mesa-viva/commit/c86c6e45682e93b275efaf910954ef6f867936b5)

| Prueba | Resultado observado |
| --- | --- |
| Observaciones | En WebKit con vista de iPhone y teclado simulado, «Nota para la cocina» siguió visible al escribir. La nota se conservó al agregar el plato al carrito. |
| Pago mixto | Al elegir «Pago mixto» desde «Pedir la cuenta», apareció «Piden la cuenta · Pago mixto» en el plano del personal sin recargar. El aviso desapareció al marcar «Atendido». |
| Cierre del servicio | Se canceló el plato de prueba que seguía sin servir y se cerró la cuenta. El cliente vio «Servicio finalizado» y un total de **$0**. La Mesa 1 quedó «Libre» y «Sin pedido». |
| Nuevo carrito | El menú abrió con el carrito vacío. Se agregó un plato y se comprobó que el carrito solo contenía ese plato, sin ítems ni notas del pedido anterior. Se retiró el plato de prueba sin enviar otro pedido. |
| Ventas | Después de la prueba del carrito, el 17 de noviembre seguía figurando **1 cuenta cerrada**, correspondiente a la Mesa 1, con **$0 cobrados**. |

## Enlaces de producción

- [Menú de la Mesa 1](https://mesa-viva-jhac.onrender.com/m/hWBMFYiynpPK5qG4RtuUAdHI)
- [Administración → Ventas](https://mesa-viva-jhac.onrender.com/staff/admin/ventas)
