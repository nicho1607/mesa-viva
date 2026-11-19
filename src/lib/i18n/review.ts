/** Solo conservar traducciones del mismo original o aprobadas expresamente al guardar. */
export function reviewedTranslation(original: string | null, english: string | null | undefined, reviewed: boolean,
  previous?: { original: string | null; english: string | null }) {
  const candidate = english === undefined ? previous?.english ?? null : english;
  if (!original || !candidate) return null;
  if (reviewed) return candidate;
  return previous?.original === original && previous.english === candidate ? candidate : null;
}
