"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/staff.actions";

const inputClass =
  "min-h-11 w-full rounded-md border border-tinta-suave/50 bg-white px-3 text-base text-tinta " +
  "placeholder:text-tinta-suave/70 focus:border-tinta focus-visible:outline-azafran";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="font-bold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="font-bold">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={inputClass}
        />
      </div>

      <p
        id="login-error"
        role="alert"
        aria-live="polite"
        className={state.error ? "border-l-4 border-guindilla pl-3 text-guindilla font-bold" : "sr-only"}
      >
        {state.error ?? ""}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-tinta px-4 font-display text-lg font-semibold text-plato transition-opacity disabled:opacity-70 motion-reduce:transition-none"
      >
        {pending ? "Entrando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
