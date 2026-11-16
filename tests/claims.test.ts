import { describe, expect, it } from 'vitest';
import { forbiddenClaim } from '../src/lib/kdp/claims';

describe('frasi vietate nelle etichette', () => {
  it.each([
    '#1 Bestseller', 'Amazon Best Seller', 'Premio Strega', 'Award winning', 'Visto su TV', '5 stelle', 'Gratis oggi', 'Free shipping', 'Sconto 20%', '9,99 €', '$4.99',
    'Abbassa la glicemia', 'Lowers blood sugar', 'Cura il diabete', 'Reverse diabetes', 'Risultati garantiti', 'Doctor-approved',
  ])('blocca «%s»', (t) => expect(forbiddenClaim(t)).not.toBeNull());

  it.each([
    'Includes 7-day meal plan', 'Piano alimentare di 7 giorni', '30+ RECIPES', 'Start cooking today', 'Lista della spesa inclusa', 'Large print', 'Ricette veloci',
  ])('lascia passare «%s»', (t) => expect(forbiddenClaim(t)).toBeNull());
});
