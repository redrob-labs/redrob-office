import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { CreditStateView } from "../../shared/office-api";
import { REDROB_CONSOLE_URL } from "../../shared/office-api";
import { ExternalLinkIcon } from "./icons";

/**
 * The sheet that appears when the console refuses a turn for want of credit.
 *
 * What it does not do is take a payment. Card details never touch Office: the
 * button opens the console's own payment page in the system browser, where Stripe
 * Checkout collects them and offers whatever payment methods the console has
 * enabled for that workspace. A card field drawn here would be a card field
 * inside an Electron window, which is not a thing to build for a payment someone
 * else is already doing properly.
 *
 * It also does not know the balance. `GET /v1/billing` is behind a console
 * session and Office holds a workspace API key, so the only figure it can quote
 * is the one the console put in its refusal. Everything else is stated as what it
 * is: the app cannot see the payment land, so paying is followed by sending the
 * request again, and the console gets the last word both times.
 */

/** Where a person pays. The console's first-payment screen, which Stripe drives. */
export const REDROB_PAY_URL = `${REDROB_CONSOLE_URL}/start`;
/** Where a person reads the balance and the movements behind it. */
export const REDROB_BILLING_URL = `${REDROB_CONSOLE_URL}/billing`;

export function PaySheet({
  credit,
  onClose,
  onCleared,
}: {
  /** The console's last word, or null when the sheet was opened by hand. */
  credit: CreditStateView | null;
  onClose: () => void;
  /** Fired after the block is cleared, so the caller can refresh its own copy. */
  onCleared?: (next: CreditStateView) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [clearing, setClearing] = useState(false);
  const [opened, setOpened] = useState(false);

  const openPayment = useCallback((): void => {
    setOpened(true);
    void window.office.openExternal(REDROB_PAY_URL);
  }, []);

  const clear = useCallback((): void => {
    if (clearing) return;
    setClearing(true);
    void window.office
      .clearCreditBlock()
      .then((next) => {
        onCleared?.(next);
        onClose();
      })
      .finally(() => {
        setClearing(false);
      });
  }, [clearing, onClose, onCleared]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t("paySheet.title")}
    >
      <section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">
          {t("paySheet.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {credit?.blocked ? t("paySheet.refused") : t("paySheet.body")}
        </p>

        {credit?.detail ? (
          <p className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-700">
            {credit.detail}
          </p>
        ) : null}

        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-gray-600">
          <li>{t("paySheet.whereItHappens")}</li>
          <li>{t("paySheet.noCardHere")}</li>
          <li>{t("paySheet.noBalanceHere")}</li>
        </ul>

        <button
          type="button"
          className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 py-3"
          onClick={openPayment}
        >
          <ExternalLinkIcon className="h-4 w-4" />
          {t("paySheet.openPayment")}
        </button>

        {opened ? (
          <p className="mt-3 text-xs leading-relaxed text-gray-600" role="status">
            {t("paySheet.afterPaying")}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="text-xs font-medium text-brand-600 underline underline-offset-2"
            disabled={clearing}
            onClick={clear}
          >
            {t("paySheet.paid")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
            onClick={() => {
              void window.office.openExternal(REDROB_BILLING_URL);
            }}
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            {t("paySheet.openBilling")}
          </button>
          <button
            type="button"
            className="ml-auto text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
            onClick={onClose}
          >
            {t("paySheet.close")}
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * Whether the console has refused a request for want of credit, so a screen can
 * offer the sheet without asking on every render.
 */
export function useCreditState(): {
  credit: CreditStateView | null;
  refresh: () => void;
  set: (next: CreditStateView) => void;
} {
  const [credit, setCredit] = useState<CreditStateView | null>(null);

  const refresh = useCallback((): void => {
    void window.office
      .getCreditState()
      .then(setCredit)
      .catch(() => {
        // Not knowing is not the same as knowing there is no credit, so this
        // leaves the last answer alone rather than inventing a state.
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { credit, refresh, set: setCredit };
}
