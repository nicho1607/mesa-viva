"use client";

// Pestañas de categoría pegajosas. Son enlaces de navegación (#seccion), no un tablist:
// Tab/Enter funcionan solos. Scroll-spy con IntersectionObserver resalta la sección visible.

import { useEffect, useRef, useState } from "react";

type Props = { categories: { id: string; name: string }[] };

export const sectionId = (categoryId: string) => `cat-${categoryId}`;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function CategoryTabs({ categories }: Props) {
  const [active, setActive] = useState(categories[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);
  // Mientras dura el scroll provocado por un toque, no dejar que el observer "salte" de pestaña.
  const lockUntil = useRef(0);

  useEffect(() => {
    const sections = categories
      .map((c) => document.getElementById(sectionId(c.id)))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        if (Date.now() < lockUntil.current) return;
        const first = sections.find((s) => visible.get(s.id));
        if (first) setActive(first.id.slice(4));
      },
      // franja estrecha bajo las pestañas: la sección que la cruza es la actual
      { rootMargin: "-72px 0px -65% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    // La última sección suele ser corta y nunca llega a la franja: al tocar fondo, activarla.
    const onScroll = () => {
      if (Date.now() < lockUntil.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) setActive(sections[sections.length - 1].id.slice(4));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [categories]);

  // Mantener visible la pestaña activa dentro de la barra horizontal.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    if (!nav || !link) return;
    const left = link.offsetLeft - nav.clientWidth / 2 + link.clientWidth / 2;
    nav.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Categorías del menú"
      className="sticky top-0 z-10 -mx-4 overflow-x-auto border-b border-tinta/15 bg-plato/95 px-2 backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max min-w-full gap-1">
        {categories.map((c) => {
          const isActive = c.id === active;
          return (
            <li key={c.id}>
              <a
                href={`#${sectionId(c.id)}`}
                data-cat={c.id}
                aria-current={isActive ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  const target = document.getElementById(sectionId(c.id));
                  if (!target) return;
                  setActive(c.id);
                  lockUntil.current = Date.now() + 700;
                  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
                  history.replaceState(null, "", `#${sectionId(c.id)}`);
                }}
                className={`relative flex min-h-12 items-center px-3 text-base whitespace-nowrap focus-visible:-outline-offset-3 ${
                  isActive ? "font-bold text-tinta" : "text-tinta-suave hover:text-tinta"
                }`}
              >
                {c.name}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 bottom-0 h-[3px] rounded-t-sm ${isActive ? "bg-tinta" : "bg-transparent"}`}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
