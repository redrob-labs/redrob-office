import type { OfficeApi } from "../../shared/office-api";

declare global {
  interface Window {
    office: OfficeApi;
    /** @deprecated use window.office */
    desk: OfficeApi;
  }
}

export {};
