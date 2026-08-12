import { useCallback, useRef } from 'react';
import { useActionTrigger, useConfig, useVariable } from '@sigmacomputing/plugin';

// Mirror of game-library waitForEcho: setVariable / triggerAction are
// fire-and-forget postMessages with no documented ordering guarantee.
const ECHO_POLL_INTERVAL_MS = 50;
const ECHO_TIMEOUT_MS = 1500;

function waitForEcho(getCurrentValue, expectedValue) {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      if (getCurrentValue() === expectedValue || Date.now() - start > ECHO_TIMEOUT_MS) {
        resolve();
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
export function useSigmaWalletWrite() {
  const config = useConfig();
  const [walletMoneyVar, setWalletMoneyVar] = useVariable(config.walletMoneyControl);
  const triggerCreditWallet = useActionTrigger(config.creditWalletEvent);

  const walletVarsRef = useRef();
  walletVarsRef.current = { walletMoneyVar };

  const configured = Boolean(config.walletMoneyControl && config.creditWalletEvent);

  const writeBalance = useCallback(
    async (newBalanceDollars) => {
      if (!configured) return { written: false, reason: 'not_configured' };

      const newBalance = Number(newBalanceDollars);
      if (!Number.isFinite(newBalance)) {
        return { written: false, reason: 'invalid_balance' };
      }

      setWalletMoneyVar(newBalance);
      await waitForEcho(
        () => walletVarsRef.current.walletMoneyVar?.defaultValue?.value,
        newBalance,
      );
      triggerCreditWallet();
      return { written: true };
    },
    [configured, setWalletMoneyVar, triggerCreditWallet],
  );

  return { configured, writeBalance };
}
