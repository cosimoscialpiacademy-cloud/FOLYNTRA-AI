/**
 * Frasi che non devono comparire nelle etichette della copertina: Amazon le rifiuta (prezzi, promozioni, classifiche, premi,
 * recensioni) oppure sono promesse non verificabili di salute o di risultato. Euristica italiana/inglese: aiuta, non sostituisce
 * la lettura delle linee guida KDP sui contenuti e sulle copertine.
 */
const PATTERNS: [RegExp, string][] = [
  [/best[\s-]?sell|bestseller|#\s?1\b|\bn\.?\s?1\b|numero\s?1|\bno\.?\s?1\b|top\s?seller|classifica/i, 'classifica o «bestseller»'],
  [/award|premio|premiat|vincitore|winner|prize/i, 'premi o riconoscimenti'],
  [/as seen|visto (su|in|da)|featured (in|on)/i, '«visto su…»'],
  [/review|recension|\d\s?stelle|\bstars?\b|★|⭐/i, 'recensioni o stelle'],
  [/gratis|\bfree\b|sconto|scontat|offerta|\bsale\b|% ?off|\boff\b|[€$£]\s?\d|\d\s?[€$£]/i, 'prezzi, sconti o «gratis»'],
  [/\bcur[ae]\b|\bcures?\b|\bcured\b|guarisc|guarig|\bheal|lower(s|ing)? (your )?(blood|sugar|glucose)|abbassa|reverse (your )?diabetes|inverti il diabete|miracol|clinicamente|clinically|doctor[- ]approved|approvato (da|dai) (medic|dottor)/i, 'promesse di salute o cure'],
  [/garantit|guarantee|100% (sicuro|safe|efficace|effective)/i, 'garanzie di risultato'],
];

/** Restituisce il motivo se il testo contiene un'affermazione vietata, altrimenti null. */
export function forbiddenClaim(text: string): string | null {
  for (const [re, reason] of PATTERNS) if (re.test(text)) return reason;
  return null;
}
