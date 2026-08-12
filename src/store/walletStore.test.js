import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME_PRICE_CENTS, priceForGame } from '../../netlify/functions/_shared/prices.js';
import {
  adjustBalance,
  creditCheckoutSession,
  getWallet,
  purchaseGame,
} from '../../netlify/functions/_shared/walletStore.js';

describe('GAME_PRICE_CENTS', () => {
  it('covers every known catalog id', () => {
    expect(priceForGame('tictactoe')).toBe(499);
    expect(priceForGame('pinball')).toBe(999);
    expect(priceForGame('nope')).toBeNull();
    expect(Object.keys(GAME_PRICE_CENTS).length).toBeGreaterThanOrEqual(7);
  });
});

describe('walletStore', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wallet-'));
    process.env.WALLET_STORE_PATH = join(dir, 'wallets.json');
  });

  afterEach(() => {
    delete process.env.WALLET_STORE_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty and credits a checkout session once', async () => {
    const empty = await getWallet('alice');
    expect(empty.balanceCents).toBe(0);

    const first = await creditCheckoutSession('alice', 'cs_1', 1000);
    expect(first.credited).toBe(true);
    expect(first.wallet.balanceCents).toBe(1000);

    const second = await creditCheckoutSession('alice', 'cs_1', 1000);
    expect(second.credited).toBe(false);
    expect(second.wallet.balanceCents).toBe(1000);
  });

  it('purchases a game when funds allow and rejects otherwise', async () => {
    await creditCheckoutSession('bob', 'cs_2', 500);
    const tooPoor = await purchaseGame('bob', 'chess', 1299);
    expect(tooPoor.ok).toBe(false);
    expect(tooPoor.reason).toBe('insufficient_funds');

    await creditCheckoutSession('bob', 'cs_3', 1000);
    const bought = await purchaseGame('bob', 'tictactoe', 499);
    expect(bought.ok).toBe(true);
    expect(bought.wallet.ownedGameIds).toContain('tictactoe');
    expect(bought.wallet.balanceCents).toBe(1001);

    const again = await purchaseGame('bob', 'tictactoe', 499);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('already_owned');
  });

  it('adjusts balance for roulette-style deltas', async () => {
    await creditCheckoutSession('cara', 'cs_4', 1000);
    const win = await adjustBalance('cara', 350);
    expect(win.ok).toBe(true);
    expect(win.wallet.balanceCents).toBe(1350);

    const lose = await adjustBalance('cara', -2000);
    expect(lose.ok).toBe(false);
    expect(lose.reason).toBe('insufficient_funds');
  });
});
