# Pruebas públicas en Render

El archivo `render.yaml` crea un servicio Node y una base PostgreSQL, ambos en el plan Free y en la misma región. La base solo acepta conexiones desde la red privada de Render. No se utiliza la base del PC.

1. En Render, entra a **New → Blueprint** y conecta el repositorio `nicho1607/mesa-viva`, rama `main`.
2. Comprueba que los dos recursos tienen plan **Free** antes de confirmar. No elijas planes de pago para esta prueba.
3. Render instala dependencias, genera Prisma y compila Next.js. Al arrancar aplica migraciones e inicializa menú, mesas y usuarios. Si falla cualquier paso, no inicia el servidor.
4. En el servicio, abre **Environment**. Render genera `SESSION_SECRET`, `SEED_ADMIN_PASSWORD` y `SEED_WAITER_PASSWORD`; no se guardan en Git. Consulta las contraseñas allí sin publicarlas ni pegarlas en logs.
5. Abre la URL HTTPS del servicio y entra a `/staff/login`. Admin: `admin@mesaviva.co` con `SEED_ADMIN_PASSWORD`. Meseros: `laura@mesaviva.co` y `andres@mesaviva.co` con `SEED_WAITER_PASSWORD`.
6. Como administrador, abre `/staff/admin/qr` desde la URL HTTPS pública. Sin `PUBLIC_BASE_URL`, los QR usan el origen de esa petición. No copies la URL `localhost` ni la IP Wi-Fi del PC a Render. Si luego configuras un dominio, define `PUBLIC_BASE_URL` con su URL HTTPS, sin barra final.
7. Desactiva el Wi-Fi del celular, escanea el QR y prueba pedido → confirmar → servir → cerrar. El cliente debe ver los cambios desde **Mi cuenta**, sin recargar.

## Reinicios y datos

El seed de producción exige dos contraseñas diferentes de al menos 12 caracteres. Tras completar la primera inicialización guarda `_seedInitialized` en `Setting` y omite el seed en siguientes arranques: no cambia contraseñas, menú ni asignaciones. Cambiar las variables de seed después no cambia las contraseñas de usuarios existentes; hazlo desde Administración → Equipo. No borres ese marcador para intentar restablecer contraseñas.

Las migraciones se ejecutan al arrancar porque el comando pre-deploy no está disponible para servicios gratuitos. Se usa una sola instancia; el límite de peticiones vive en memoria por proceso.

El plan Free puede suspender el servicio tras 15 minutos sin tráfico y tardar aproximadamente un minuto en despertar. La base gratuita caduca a los 30 días: exporta lo que quieras conservar antes de esa fecha. Este despliegue es para pruebas, no para operar un restaurante permanentemente.

Fuentes: [Next.js en Render](https://render.com/docs/deploy-nextjs-app), [Blueprints](https://render.com/docs/blueprint-spec), [límites gratuitos](https://render.com/docs/free).
