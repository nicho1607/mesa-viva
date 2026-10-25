"use client";

// Piezas de formulario de /staff/admin. Todas envían a la Server Action `adminMutate`
// (campo oculto `intent`) con useActionState; los campos leen su error del contexto.

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { adminMutate, type AdminIntent } from "@/app/actions/admin.actions";
import { INITIAL_FORM_STATE, type AdminFormState } from "@/lib/admin-form";
import { btn, inputClass } from "./styles";

type Ctx = { state: AdminFormState; pending: boolean };
const FormCtx = createContext<Ctx>({ state: INITIAL_FORM_STATE, pending: false });
const useForm = () => useContext(FormCtx);

type AdminFormProps = {
  intent: AdminIntent;
  /** Campos ocultos (p.ej. { id }). */
  hidden?: Record<string, string>;
  /** Cierra el <details> que contiene el formulario al guardar con éxito. */
  closeOnSuccess?: boolean;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
};

export function AdminForm({ intent, hidden, closeOnSuccess, className, children, ...rest }: AdminFormProps) {
  const [state, action, pending] = useActionState(adminMutate, INITIAL_FORM_STATE);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && closeOnSuccess) ref.current?.closest("details")?.removeAttribute("open");
  }, [state, closeOnSuccess]);

  return (
    <form ref={ref} action={action} noValidate className={className} aria-label={rest["aria-label"]}>
      <input type="hidden" name="intent" value={intent} />
      {hidden
        ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
        : null}
      <FormCtx.Provider value={{ state, pending }}>{children}</FormCtx.Provider>
    </form>
  );
}

function useFieldState(name: string, defaultValue?: string) {
  const { state } = useForm();
  const error = state.fieldErrors?.[name];
  const value = state.ok === false && state.values && name in state.values ? state.values[name] : defaultValue;
  return { error, value };
}

type FieldProps = {
  name: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  type?: "text" | "email" | "password" | "number";
  inputMode?: "text" | "numeric" | "decimal" | "email";
  autoComplete?: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
};

export function Field({ name, label, defaultValue, hint, multiline, className, type = "text", ...input }: FieldProps) {
  const id = useId();
  const { error, value } = useFieldState(name, defaultValue);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name,
    defaultValue: value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: `${inputClass} ${error ? "border-guindilla" : ""}`,
  };
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={2} className={`${common.className} py-2`} />
      ) : (
        <input {...common} type={type} {...input} spellCheck={type === "text" ? undefined : false} />
      )}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-tinta-suave">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-err`} error={error} />
    </div>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="text-sm font-bold text-guindilla">
      {error}
    </p>
  );
}

export function SelectField({
  name,
  label,
  defaultValue,
  options,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const id = useId();
  const { error, value } = useFieldState(name, defaultValue);
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`${inputClass} ${error ? "border-guindilla" : ""}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-err`} error={error} />
    </div>
  );
}

export function CheckboxField({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-2">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} className="size-5 accent-tinta" />
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Guardando…",
  variant = "primary",
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof btn;
  className?: string;
}) {
  const { pending } = useForm();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={`${btn[variant]} ${className ?? ""}`}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Resultado del envío: error (alerta) o confirmación (estado). */
export function FormStatus({ className }: { className?: string }) {
  const { state } = useForm();
  if (state.ok === false && state.error) {
    return (
      <p role="alert" className={`border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 font-bold text-guindilla ${className ?? ""}`}>
        {state.error}
      </p>
    );
  }
  return (
    <p role="status" className={state.ok && state.message ? `font-bold text-albahaca ${className ?? ""}` : "sr-only"}>
      {state.ok ? (state.message ?? "") : ""}
    </p>
  );
}

/**
 * Interruptor de dos estados ("Disponible / Agotado", "Activa / Inactiva"): el botón del estado
 * actual va marcado (aria-pressed) y el otro envía el cambio al instante.
 */
export function ToggleForm({
  intent,
  id,
  field,
  value,
  onLabel,
  offLabel,
  itemLabel,
  disabledReason,
}: {
  intent: AdminIntent;
  id: string;
  field: string;
  value: boolean;
  onLabel: string;
  offLabel: string;
  /** Para lectores de pantalla: "Empanadas", "Mesa 4". */
  itemLabel: string;
  /** Si se indica, no se puede cambiar (p.ej. tu propia cuenta). */
  disabledReason?: string;
}) {
  return (
    <AdminForm intent={intent} hidden={{ id }} aria-label={`Estado de ${itemLabel}`}>
      <ToggleButtons field={field} value={value} onLabel={onLabel} offLabel={offLabel} disabledReason={disabledReason} />
    </AdminForm>
  );
}

function ToggleButtons({
  field,
  value,
  onLabel,
  offLabel,
  disabledReason,
}: {
  field: string;
  value: boolean;
  onLabel: string;
  offLabel: string;
  disabledReason?: string;
}) {
  const { pending, state } = useForm();
  const opt = (v: boolean, label: string) => {
    const current = v === value;
    const tone = v ? "bg-albahaca text-white" : "bg-tinta text-plato";
    return (
      <button
        type={current || disabledReason ? "button" : "submit"}
        name={current ? undefined : field}
        value={current ? undefined : String(v)}
        aria-pressed={current}
        disabled={pending || (!!disabledReason && !current)}
        className={`min-h-11 min-w-11 px-3 font-bold first:rounded-l-md last:rounded-r-md ${
          current ? tone : "bg-white text-tinta-suave hover:text-tinta"
        } disabled:cursor-not-allowed`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-1">
      <div className={`inline-flex w-fit rounded-md border border-tinta/25 ${pending ? "opacity-60" : ""}`}>
        {opt(true, onLabel)}
        {opt(false, offLabel)}
      </div>
      {disabledReason ? <p className="text-sm text-tinta-suave">{disabledReason}</p> : null}
      {state.ok === false && state.error ? (
        <p role="alert" className="max-w-xs text-sm font-bold text-guindilla">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/** Disclosure nativo para editar o confirmar en línea (sin window.confirm). */
export function Disclosure({
  summary,
  tone = "secondary",
  children,
  className,
}: {
  summary: string;
  tone?: "secondary" | "danger" | "primary";
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className ?? ""}`}>
      <summary className={`${btn[tone === "primary" ? "primary" : tone === "danger" ? "dangerGhost" : "secondary"]} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <span className="group-open:hidden">{summary}</span>
        <span className="hidden group-open:inline">Cancelar</span>
      </summary>
      <div className="mt-3 border-l-2 border-tinta/25 pl-3">{children}</div>
    </details>
  );
}
