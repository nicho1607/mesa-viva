// Clases compartidas de /staff/admin (back-office: denso, legible, sin decoración).

export const inputClass =
  "min-h-11 w-full rounded-md border border-tinta-suave/50 bg-white px-3 text-base text-tinta " +
  "placeholder:text-tinta-suave/70 focus:border-tinta focus-visible:outline-azafran";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-bold " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export const btn = {
  primary: `${base} bg-tinta text-plato hover:bg-tinta/90`,
  secondary: `${base} border border-tinta/40 bg-white text-tinta hover:border-tinta`,
  danger: `${base} bg-guindilla text-white hover:bg-guindilla/90`,
  dangerGhost: `${base} border border-guindilla/50 bg-white text-guindilla hover:border-guindilla`,
};

/** Encabezado de sección dentro de una página de administración. */
export const sectionTitle = "font-display text-2xl font-semibold tracking-tight [font-stretch:87.5%]";
