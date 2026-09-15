import { assertAllowlistedEvent, type DeskEvent } from "./index.js";

export interface OtlpTransportOptions {
  optedIn?: boolean;
  endpoint?: string;
  send?: (endpoint: string, event: DeskEvent) => Promise<void>;
}

/** Minimal OTLP boundary: events are never sent until an explicit opt-in. */
export class OtlpTransport {
  private optedIn: boolean;
  private readonly endpoint: string | undefined;
  private readonly sendRequest: ((endpoint: string, event: DeskEvent) => Promise<void>) | undefined;
  private readonly buffered: DeskEvent[] = [];

  constructor(options: OtlpTransportOptions = {}) {
    this.optedIn = options.optedIn ?? true;
    this.endpoint = options.endpoint;
    this.sendRequest = options.send;
  }

  setOptedIn(optedIn: boolean): void {
    this.optedIn = optedIn;
  }

  getBufferedEvents(): readonly DeskEvent[] {
    return structuredClone(this.buffered);
  }

  async record(event: object): Promise<"sent" | "buffered"> {
    assertAllowlistedEvent(event);
    const safeEvent = structuredClone(event);
    if (!this.optedIn || !this.endpoint) {
      this.buffered.push(safeEvent);
      return "buffered";
    }
    if (this.sendRequest) {
      await this.sendRequest(this.endpoint, safeEvent);
    }
    return "sent";
  }
}
