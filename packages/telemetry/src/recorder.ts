import { assertAllowlistedEvent, type DeskEvent } from "./index.js";

export interface TelemetryRecorderOptions {
  optedIn?: boolean;
  maxPayloads?: number;
}

export class TelemetryRecorder {
  readonly maxPayloads: number;
  private optedIn: boolean;
  private readonly payloads: DeskEvent[] = [];

  constructor(options: TelemetryRecorderOptions = {}) {
    this.optedIn = options.optedIn ?? true;
    this.maxPayloads = options.maxPayloads ?? 50;
  }

  get isOptedIn(): boolean {
    return this.optedIn;
  }

  setOptedIn(optedIn: boolean): void {
    this.optedIn = optedIn;
  }

  record(event: object): boolean {
    assertAllowlistedEvent(event);
    this.payloads.push(structuredClone(event));
    if (this.payloads.length > this.maxPayloads) this.payloads.shift();
    return this.optedIn;
  }

  getPayloads(): readonly DeskEvent[] {
    return structuredClone(this.payloads);
  }
}
