/**
 * Découpe un texte en passages courts pour la synthèse vocale du navigateur.
 *
 * Les moteurs Web Speech coupent ou se figent sur les énoncés longs (Chrome
 * s'arrête au bout d'une quinzaine de secondes) : on enchaîne donc des
 * passages de `maxLen` caractères, coupés aux fins de phrase.
 */
export function splitForTts(text: string, maxLen = 200): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length > maxLen && cur) {
      out.push(cur.trim());
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
