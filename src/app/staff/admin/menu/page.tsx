import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import {
  AdminForm,
  CheckboxField,
  Disclosure,
  Field,
  FormStatus,
  SelectField,
  SubmitButton,
  ToggleForm,
} from "@/components/admin/AdminForm";
import { sectionTitle } from "@/components/admin/styles";
import { requireAdminPage } from "@/lib/auth";
import { centsToPesosInput, getAdminMenu, type AdminMenu } from "@/lib/domain/admin";
import { inventoryLabel } from "@/lib/domain/inventory";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Menú · Administración · Mesa Viva" };

type Category = AdminMenu[number];
type Product = Category["products"][number];
type Option = { value: string; label: string };

export default async function AdminMenuPage() {
  const user = await requireAdminPage();
  const categories = await getAdminMenu(user);
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="cats" className="flex flex-col gap-3">
        <h2 id="cats" className={sectionTitle}>
          Categorías
        </h2>
        <ul className="divide-y divide-tinta/12 border-y border-tinta/12">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </ul>
        <AdminForm intent="category.create" className="flex flex-col gap-3" aria-label="Nueva categoría">
          <div className="flex flex-wrap items-start gap-3">
            <Field name="name" label="Nueva categoría" placeholder="Ej. Sopas" className="min-w-0 flex-1 basis-56" />
            <Field name="nameEn" label="Nombre en inglés (revisado)" />
            <Field name="sortOrder" label="Orden" type="number" inputMode="numeric" defaultValue="0" className="w-24" />
            <SubmitButton className="mt-7" pendingLabel="Creando…">
              Crear categoría
            </SubmitButton>
          </div>
          <EnglishReview />
          <FormStatus />
        </AdminForm>
      </section>

      <section aria-labelledby="prods" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="prods" className={sectionTitle}>
            Productos
          </h2>
        </div>
        {categories.length === 0 ? (
          <p className="text-tinta-suave">Crea una categoría para empezar a agregar productos.</p>
        ) : (
          <Disclosure summary="Nuevo producto" tone="primary">
            <ProductForm intent="product.create" categoryOptions={categoryOptions} />
          </Disclosure>
        )}
        {categories.map((c) => (
          <div key={c.id} className="flex flex-col gap-1">
            <h3 className="pt-2 font-display text-lg font-semibold [font-stretch:87.5%]">{c.name}</h3>
            {c.products.length === 0 ? (
              <p className="text-tinta-suave">Sin productos.</p>
            ) : (
              <ul className="divide-y divide-tinta/12 border-y border-tinta/12">
                {c.products.map((p) => (
                  <ProductRow key={p.id} product={p} categoryOptions={categoryOptions} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function CategoryRow({ category: c }: { category: Category }) {
  const n = c.products.length;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="font-bold">{c.name}</p>
        <p className="text-sm text-tinta-suave">
          Orden {c.sortOrder}, {n} {n === 1 ? "producto" : "productos"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Disclosure summary="Editar" className="open:basis-full">
          <AdminForm intent="category.update" hidden={{ id: c.id }} closeOnSuccess className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start gap-3">
              <Field name="name" label="Nombre" defaultValue={c.name} className="min-w-0 flex-1 basis-56" />
              <Field name="nameEn" label="Nombre en inglés (revisado)" defaultValue={c.nameEn ?? ""} />
              <Field
                name="sortOrder"
                label="Orden"
                type="number"
                inputMode="numeric"
                defaultValue={String(c.sortOrder)}
                className="w-24"
              />
            </div>
            <EnglishReview />
            <FormStatus />
            <SubmitButton className="w-fit">Guardar categoría</SubmitButton>
          </AdminForm>
        </Disclosure>
        <Disclosure summary="Eliminar" tone="danger" className="open:basis-full">
          <AdminForm intent="category.delete" hidden={{ id: c.id }} className="flex flex-col gap-3">
            <p>
              {n > 0
                ? `Tiene ${n} ${n === 1 ? "producto" : "productos"}: muévelos o elimínalos antes de borrar la categoría.`
                : `Se eliminará la categoría "${c.name}".`}
            </p>
            <FormStatus />
            <SubmitButton variant="danger" pendingLabel="Eliminando…" className="w-fit">
              Eliminar categoría
            </SubmitButton>
          </AdminForm>
        </Disclosure>
      </div>
    </li>
  );
}

function ProductRow({ product: p, categoryOptions }: { product: Product; categoryOptions: Option[] }) {
  const hasHistory = p._count.orderItems > 0 || p._count.inventoryMovements > 0;
  const stockLabel = inventoryLabel(p.available, p.availableQuantity);
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className={`font-bold ${p.available ? "" : "text-tinta-suave line-through decoration-1"}`}>
              {p.name}
            </span>
            <span className="tabular-nums">{formatMoney(p.price)}</span>
            <span className={`text-sm font-bold ${p.availableQuantity === 0 || !p.available ? "text-guindilla" : "text-tinta-suave"}`}>
              {stockLabel}
            </span>
          </p>
          {p.description ? <p className="line-clamp-2 text-sm text-tinta-suave">{p.description}</p> : null}
        </div>
        <ToggleForm
          intent="product.available"
          id={p.id}
          field="available"
          value={p.available}
          onLabel="Disponible"
          offLabel="No disponible"
          itemLabel={p.name}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Disclosure summary="Editar" className="open:basis-full">
          <ProductForm intent="product.update" product={p} categoryOptions={categoryOptions} />
        </Disclosure>
        <Disclosure summary={p.availableQuantity === null ? "Configurar inventario" : "Ajustar porciones"} className="open:basis-full">
          <InventoryForm product={p} />
        </Disclosure>
        {hasHistory ? (
          p.available ? (
            <Disclosure summary="Retirar del menú" tone="danger" className="open:basis-full">
              <AdminForm
                intent="product.available"
                hidden={{ id: p.id, available: "false" }}
                className="flex flex-col gap-3"
              >
                <p className="max-w-prose">
                  {p.name} ya tiene historial. Al retirarlo nadie podrá pedirlo y su saldo no cambiará.
                </p>
                <FormStatus />
                <SubmitButton variant="danger" pendingLabel="Retirando…" className="w-fit">
                  Retirar del menú
                </SubmitButton>
              </AdminForm>
            </Disclosure>
          ) : null
        ) : (
          <Disclosure summary="Eliminar" tone="danger" className="open:basis-full">
            <AdminForm intent="product.delete" hidden={{ id: p.id }} className="flex flex-col gap-3">
              <p>Se eliminará {p.name} para siempre. Nunca se ha pedido ni ha tenido inventario.</p>
              <FormStatus />
              <SubmitButton variant="danger" pendingLabel="Eliminando…" className="w-fit">
                Eliminar producto
              </SubmitButton>
            </AdminForm>
          </Disclosure>
        )}
      </div>
    </li>
  );
}

function InventoryForm({ product: p }: { product: Product }) {
  if (p.availableQuantity === null) {
    return (
      <AdminForm
        intent="product.inventory.open"
        hidden={{ id: p.id, operationId: randomUUID() }}
        closeOnSuccess
        className="flex max-w-lg flex-col gap-3"
      >
        <p className="text-sm text-tinta-suave">
          Registra las porciones que pueden venderse ahora. Los pedidos anteriores no se descuentan retroactivamente.
        </p>
        <Field name="quantity" label="Saldo inicial" type="number" inputMode="numeric" defaultValue="0" />
        <FormStatus />
        <SubmitButton className="w-fit">Iniciar inventario</SubmitButton>
      </AdminForm>
    );
  }
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <AdminForm
        intent="product.inventory.adjust"
        hidden={{ id: p.id, operationId: randomUUID() }}
        closeOnSuccess
        className="flex flex-col gap-3"
      >
        <p>
          Saldo actual: <strong className="tabular-nums">{p.availableQuantity}</strong> porciones. Usa un número positivo
          para reponer o negativo para corregir. Las cancelaciones no devuelven porciones automáticamente.
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <Field
            name="delta"
            label="Ajuste"
            type="number"
            inputMode="numeric"
            placeholder="Ej. 5 o -2"
            className="w-40"
          />
          <Field name="reason" label="Motivo" placeholder="Ej. Reposición de cocina" className="min-w-0 flex-1 basis-56" />
        </div>
        <FormStatus />
        <SubmitButton className="w-fit">Aplicar ajuste</SubmitButton>
      </AdminForm>
      {p.inventoryMovements.length ? (
        <div>
          <h4 className="font-bold">Movimientos recientes</h4>
          <ul className="mt-1 divide-y divide-tinta/12 text-sm">
            {p.inventoryMovements.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-x-4 py-2">
                <span>
                  {movementLabel(m.type)}: <strong className="tabular-nums">{m.delta > 0 ? `+${m.delta}` : m.delta}</strong>
                  {m.reason ? ` · ${m.reason}` : ""}
                </span>
                <span className="text-tinta-suave">
                  saldo {m.balanceAfter} · {m.actor?.name ?? "Pedido"} · {formatInventoryDate(m.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function movementLabel(type: Product["inventoryMovements"][number]["type"]): string {
  if (type === "OPENING") return "Apertura";
  if (type === "RESERVATION") return "Reserva";
  return "Ajuste";
}

function formatInventoryDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ProductForm({
  intent,
  product,
  categoryOptions,
}: {
  intent: "product.create" | "product.update";
  product?: Product;
  categoryOptions: Option[];
}) {
  const p = product;
  return (
    <AdminForm
      intent={intent}
      hidden={p ? { id: p.id } : undefined}
      closeOnSuccess={!!p}
      className="flex max-w-2xl flex-col gap-3"
      aria-label={p ? `Editar ${p.name}` : "Nuevo producto"}
    >
      <Field name="name" label="Nombre" defaultValue={p?.name} />
      <Field name="description" label="Descripción" defaultValue={p?.description ?? ""} multiline />
      <Field name="nameEn" label="Nombre en inglés (revisado)" defaultValue={p?.nameEn ?? ""} />
      <Field name="descriptionEn" label="Descripción en inglés (revisada)" defaultValue={p?.descriptionEn ?? ""} multiline />
      <EnglishReview />
      <div className="flex flex-wrap items-start gap-3">
        <Field
          name="price"
          label="Precio (pesos)"
          inputMode="decimal"
          placeholder="28.000"
          hint="Ej. 28.000"
          defaultValue={p ? centsToPesosInput(p.price) : undefined}
          className="w-40"
        />
        <SelectField
          name="categoryId"
          label="Categoría"
          options={categoryOptions}
          defaultValue={p?.categoryId ?? categoryOptions[0]?.value}
          className="min-w-0 flex-1 basis-48"
        />
        <Field
          name="sortOrder"
          label="Orden"
          type="number"
          inputMode="numeric"
          defaultValue={String(p?.sortOrder ?? 0)}
          className="w-24"
        />
      </div>
      {p ? <input type="hidden" name="available" value={String(p.available)} /> : <CheckboxField name="available" label="Disponible" defaultChecked />}
      <FormStatus />
      <SubmitButton className="w-fit" pendingLabel={p ? "Guardando…" : "Creando…"}>
        {p ? "Guardar producto" : "Crear producto"}
      </SubmitButton>
    </AdminForm>
  );
}

function EnglishReview() {
  return <div className="flex flex-col gap-1">
    <CheckboxField name="englishReviewed" label="Confirmo la revisión bilingüe y gastronómica del inglés para esta versión en español" />
    <p className="text-sm text-tinta-suave">Solo guarda traducciones aprobadas. Sin confirmar, los textos ingleses nuevos o cuyo original cambió se descartan. Los borradores se revisan fuera del menú publicado.</p>
  </div>;
}
