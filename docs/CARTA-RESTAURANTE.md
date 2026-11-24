# Carta del restaurante

La carta de `prisma/restaurant-menu.ts` contiene 11 categorías y 59 productos, transcritos de las dos fotografías facilitadas por el propietario. Los importes se convierten de COP a centavos enteros.

`npm run db:menu` aplica únicamente la carta a `DATABASE_URL`, en una transacción. Reutiliza productos por nombre, conserva sus saldos y controles de disponibilidad, y retira los productos de demostración sobrantes a «Carta anterior (retirada)», visible en administración pero excluida del menú público. No modifica pedidos, comprobantes, mesas, usuarios ni parámetros de impuestos. Puede repetirse sin duplicar la carta.

Las carnes a elección, sabores y acompañamientos se solicitan mediante las notas existentes. Las preparaciones o presentaciones con precios distintos son productos separados.

En producción, el seed de arranque aplica esta carta una sola vez, con la marca `_restaurantMenu20261123` guardada en la misma transacción. Los reinicios posteriores conservan las ediciones realizadas desde administración.

La carta impresa anuncia precios con impuesto al consumo incluido y un adicional de $1.500 por plato para llevar. Ese adicional no se cobra automáticamente: la aplicación actual gestiona consumo en mesa. No se cambió la tasa tributaria configurada, ya que las fotos no indican su porcentaje. Los desayunos muestran su horario sin bloqueo automático de venta.

Los productos nuevos sin traducción inglesa aparecen con el original en español, conforme al comportamiento existente.
