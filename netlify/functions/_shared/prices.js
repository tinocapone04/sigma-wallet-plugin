// Server-side game prices in cents. Must stay in sync with `priceCents` on
// each entry in src/games/registry.js - the purchase endpoint never trusts
// a client-supplied price.
export const GAME_PRICE_CENTS = {
  tictactoe: 499,
  chess: 1299,
  pinball: 999,
  angrybirds: 674,
  roulette: 559,
  numberguess: 99,
  monopoly_lite: 1199,
  risk: 1499,
};

export function priceForGame(gameId) {
  if (!Object.prototype.hasOwnProperty.call(GAME_PRICE_CENTS, gameId)) {
    return null;
  }
  return GAME_PRICE_CENTS[gameId];
}
