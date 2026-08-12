import { useCallback, useMemo, useRef } from 'react';
import { useActionTrigger, useConfig, useElementData, useVariable } from '@sigmacomputing/plugin';

// Mirror of game-library waitForEcho: setVariable / triggerAction are
// fire-and-forget postMessages with no documented ordering guarantee.
const ECHO_POLL_INTERVAL_MS = 50;
const ECHO_TIMEOUT_MS = 1500;
const TABLE_ECHO_TIMEOUT_MS = 5000;

function waitForEcho(getCurrentValue, expectedValue, timeoutMs = ECHO_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      const currentValue = getCurrentValue();
      const currentNumber = Number(currentValue);
      const expectedNumber = Number(expectedValue);
      const matches =
        currentValue === expectedValue ||
        (Number.isFinite(currentNumber) &&
          Number.isFinite(expectedNumber) &&
          Math.abs(currentNumber - expectedNumber) < 0.000001);
      if (matches || Date.now() - start > timeoutMs) {
        resolve(matches);
        return;
      }
      setTimeout(check, ECHO_POLL_INTERVAL_MS);
    }
    check();
  });
}

/**
 * Stages the new wallet total into a workbook control, then fires
 * creditWalletEvent so the author-wired Update row action can run.
 * No-ops when the editor bindings are missing (Stripe + Blobs still work).
 */
function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function useSigmaWalletWrite(playerId) {
  const config = useConfig();
  const [walletMoneyVar, setWalletMoneyVar] = useVariable(config.walletMoneyControl);
  const triggerCreditWallet = useActionTrigger(config.creditWalletEvent);
  const walletData = useElementData(config.walletSource);

  const walletVarsRef = useRef();
  walletVarsRef.current = { walletMoneyVar };

  const balance = useMemo(() => {
    if (!config.walletEmailCol || !config.walletMoneyCol || !playerId) return null;
    const emails = walletData[config.walletEmailCol] || [];
    const balances = walletData[config.walletMoneyCol] || [];
    const wantedEmail = normalizedEmail(playerId);
    const index = emails.findIndex((email) => normalizedEmail(email) === wantedEmail);
    if (index === -1) return null;
    const value = Number(balances[index]);
    return Number.isFinite(value) ? value : null;
  }, [walletData, config.walletEmailCol, config.walletMoneyCol, playerId]);

  const tableRef = useRef();
  tableRef.current = { balance };

  const readConfigured = Boolean(config.walletSource && config.walletEmailCol && config.walletMoneyCol);
  const configured = Boolean(readConfigured && config.walletMoneyControl && config.creditWalletEvent);

  const addToBalance = useCallback(
    async (amountDollars) => {
      if (!configured) return { written: false, reason: 'not_configured' };

      const currentBalance = Number(tableRef.current.balance);
      const amount = Number(amountDollars);
      if (!Number.isFinite(currentBalance)) {
        return { written: false, reason: 'balance_not_found' };
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return { written: false, reason: 'invalid_amount' };
      }

      const newBalance = currentBalance + amount;
      setWalletMoneyVar(newBalance);
      await waitForEcho(
        () => walletVarsRef.current.walletMoneyVar?.defaultValue?.value,
        newBalance,
      );
      triggerCreditWallet();

      // The workbook action should update and refresh the input table. Waiting
      // for the reactive table value keeps Stripe's success transition visible
      // until Sigma has actually reflected the new balance.
      const confirmed = await waitForEcho(
        () => tableRef.current.balance,
        newBalance,
        TABLE_ECHO_TIMEOUT_MS,
      );
      return { written: true, confirmed, balance: newBalance };
    },
    [configured, setWalletMoneyVar, triggerCreditWallet],
  );

  return { configured, readConfigured, balance, addToBalance };
}
