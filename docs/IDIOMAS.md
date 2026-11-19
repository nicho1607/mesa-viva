# Idiomas del cliente — publicación con revisión pendiente

Español e inglés para turistas en `/m/*`. El personal y su comprobante siguen en español. Sin rutas nuevas, conversión monetaria ni traducción automática de notas.

## Estado de publicación

**Publicación autorizada el 19 de noviembre de 2026. Las traducciones siguen pendientes de revisión humana y se muestran con aviso.**

- Interfaz: pares español/inglés en `src/lib/i18n/messages.ts`. Todas las entradas inglesas son borradores; revisor bilingüe y fecha: pendientes.
- Menú de demostración: `docs/translations/menu.en.draft.json`, original y propuesta por campo. Se superpone por lectura cuando `ENGLISH_RELEASED=true`, también en producción; no se carga en la BD, migración ni seed. Contrastar con el menú real antes de aprobar.
- Revisión gastronómica por responsable del restaurante: pendiente. No deducir ingredientes, alérgenos ni propiedades dietarias.
- Prueba con tres turistas angloparlantes: pendiente. Deben elegir plato, añadir nota, enviar y pedir la cuenta sin ayuda. Resolver toda confusión sobre ingredientes, moneda o confirmación.
- Cobertura revisada de todo el menú visible, incluidos agotados: pendiente.

`ENGLISH_RELEASED = true` habilita la interfaz y el catálogo inglés en producción sin variables adicionales. `ENGLISH_REVIEWED = false` conserva el aviso de revisión pendiente. Publicar no equivale a certificar una revisión bilingüe o gastronómica. El cambio de `ENGLISH_REVIEWED` exige documentar esas revisiones; no se ha cambiado en esta publicación. La variable `CUSTOMER_ENGLISH_PREVIEW` queda disponible para revisiones previas si se desactiva la publicación.

## Mantenimiento

Los campos ingleses opcionales de categorías/productos almacenan solo contenido aprobado. La administración permanece en español: confirmar la revisión al guardar una traducción nueva o modificada. Sin confirmación se descarta el texto nuevo; si cambia el original español se invalida su equivalente inglés. Los demás campos aprobados no se invalidan por cambios ajenos, como precio o disponibilidad. El formulario avisa de esta política. No usarlo como editor de borradores.

La migración es aditiva: `20261119120000_customer_english`. No rellena históricos. Cada ítem nuevo copia el nombre inglés aprobado existente en servidor, venga del cliente o del personal. La cuenta muestra esa copia; los ítems anteriores muestran el español identificado como original. El comprobante español no cambia su snapshot ni agrupación.

Presentación del catálogo publicado: el carrito recibe los nombres provisionales del menú y la cuenta abierta o cerrada puede mostrar un borrador cuando coincide exactamente con el nombre español histórico del ítem. Esta superposición se aplica en la lectura pública, nunca en las mutaciones ni consultando el nombre actual del producto. Tiene prioridad el snapshot inglés aprobado, si existe. Cambiar idioma conserva el español original, notas e importes. Ningún borrador se escribe en `Product`, `OrderItem` ni `Bill.lines`; el personal y su comprobante siguen mostrando los datos originales. La presentación está habilitada en producción por `ENGLISH_RELEASED`; no cambia los registros históricos.

La cookie `mv_customer_locale` solo admite es/en, dura un año y tiene Path=/m y SameSite=Lax; usa Secure en producción o con HTTPS. Sin almacenamiento, la preferencia vive en el layout del cliente hasta recargar. No hay detección automática ni sincronización de la elección entre pestañas. Los QR y las URLs permanecen iguales. El carrito conserva su clave y formato existentes.

Las sugerencias de nota insertan español para cocina y muestran la nota enviada. El texto libre no se traduce. La interfaz inglesa explica la diferencia y remite al botón existente de llamar al mesero. No se modifica una nota al cambiar de idioma.

## Verificación reproducible

- `npm run db:generate`, `npm run typecheck`, `npm run lint`.
- `npm test`: unidad e integración; esta última migra exclusivamente `TEST_DATABASE_URL`, protegida contra la BD de desarrollo.
- `npm run test:e2e`: build y navegador Edge con inglés publicado y la variable de vista previa desactivada; resetea exclusivamente `E2E_DATABASE_URL` con las salvaguardas existentes. Sus traducciones aprobadas son fixtures sintéticos, no aprobaciones reales.
- La batería incluye mensajes/parámetros/plurales, fallback, aprobación e invalidación, snapshots históricos, estado del carrito/borradores, errores, SSE, pagos y regresión española. La prueba de textos largos usa pseudolocalización de un fixture; no añade un tercer idioma al producto.

Las pruebas automatizadas no sustituyen la revisión bilingüe, gastronómica ni las pruebas humanas. No ejecutar migraciones sobre la BD real hasta el paso explícito de instalación; no usar `db:reset` para instalar esta función.
