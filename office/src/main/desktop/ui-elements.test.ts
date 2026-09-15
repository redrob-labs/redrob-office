import { describe, expect, it } from "vitest";
import {
  calibrationFrom,
  centerOf,
  describeElement,
  fieldHolds,
  findByRect,
  selectElements,
  StaleElementError,
  stripControlType,
  UiElementStore,
  type RawUiElement,
} from "./ui-elements.js";

const WINDOW = { x: 367, y: -964, width: 1200, height: 800 };

function raw(
  name: string,
  role: string,
  rect: { x: number; y: number; width: number; height: number },
): RawUiElement {
  return { name, role, rect };
}

describe("calibrationFrom", () => {
  it("is identity when the reader already agrees with the app", () => {
    const map = calibrationFrom(
      { x: 0, y: -1080, width: 1927, height: 2160 },
      { x: 0, y: -1080, width: 1927, height: 2160 },
    );
    expect(map({ x: 630, y: -922, width: 34, height: 34 })).toEqual({
      x: 630,
      y: -922,
      width: 34,
      height: 34,
    });
  });

  it("undoes a DPI-unaware reader reporting scaled rects", () => {
    // Reader saw a 1536x864 desktop; the app measures 1920x1080 (125%).
    const map = calibrationFrom(
      { x: 0, y: 0, width: 1536, height: 864 },
      { x: 0, y: 0, width: 1920, height: 1080 },
    );
    expect(map({ x: 100, y: 200, width: 80, height: 40 })).toEqual({
      x: 125,
      y: 250,
      width: 100,
      height: 50,
    });
  });

  it("refuses a nonsense ratio rather than flinging the pointer", () => {
    const map = calibrationFrom(
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 1920, height: 1080 },
    );
    expect(map({ x: 10, y: 10, width: 5, height: 5 })).toEqual({
      x: 10,
      y: 10,
      width: 5,
      height: 5,
    });
  });
});

describe("selectElements", () => {
  it("keeps named targets in reading order and addresses them", () => {
    const elements = selectElements(
      [
        raw("New message", "Button", {
          x: 630,
          y: -922,
          width: 34,
          height: 34,
        }),
        raw("Search", "Button", { x: 707, y: -959, width: 412, height: 26 }),
        raw("Slackbot", "TreeItem", {
          x: 431,
          y: -800,
          width: 240,
          height: 26,
        }),
      ],
      { window: WINDOW, generation: 3 },
    );
    expect(elements.map((item) => item.name)).toEqual([
      "Search",
      "New message",
      "Slackbot",
    ]);
    expect(elements[0]!.id).toBe("e3.0");
    expect(elements[1]!.center).toEqual({ x: 647, y: -905 });
  });

  it("drops rows scrolled outside the window", () => {
    const elements = selectElements(
      [
        raw("Scrolled away", "TreeItem", {
          x: 431,
          y: -1118,
          width: 240,
          height: 26,
        }),
      ],
      { window: WINDOW, generation: 1 },
    );
    expect(elements).toEqual([]);
  });

  it("drops the unnamed, the empty and the window-sized container", () => {
    const elements = selectElements(
      [
        raw("   ", "Button", { x: 400, y: -900, width: 20, height: 20 }),
        raw("zero", "Button", { x: 400, y: -900, width: 0, height: 20 }),
        raw("whole window", "Button", {
          x: 367,
          y: -964,
          width: 1200,
          height: 800,
        }),
        raw("Pane", "Pane", { x: 400, y: -900, width: 20, height: 20 }),
        raw("elsewhere", "Button", {
          x: 5000,
          y: 5000,
          width: 20,
          height: 20,
        }),
        raw("real", "Button", { x: 400, y: -900, width: 20, height: 20 }),
      ],
      { window: WINDOW, generation: 1 },
    );
    expect(elements.map((item) => item.name)).toEqual(["real"]);
  });

  it("spends its budget on targets before loose text", () => {
    const many: RawUiElement[] = [];
    for (let i = 0; i < 30; i++) {
      many.push(
        raw(`text ${i}`, "Text", { x: 400, y: -900 + i, width: 20, height: 8 }),
      );
    }
    many.push(raw("Send", "Button", { x: 400, y: -500, width: 20, height: 20 }));
    const elements = selectElements(many, {
      window: WINDOW,
      generation: 1,
      max: 5,
    });
    expect(elements.map((item) => item.name)).toContain("Send");
    expect(elements).toHaveLength(5);
  });

  it("keeps duplicates apart by position", () => {
    const elements = selectElements(
      [
        raw("Close", "Button", { x: 400, y: -900, width: 20, height: 20 }),
        raw("Close", "Button", { x: 400, y: -900, width: 20, height: 20 }),
        raw("Close", "Button", { x: 600, y: -900, width: 20, height: 20 }),
      ],
      { window: WINDOW, generation: 1 },
    );
    expect(elements).toHaveLength(2);
  });
});

describe("keeping the fields", () => {
  it("keeps a text field that has no label, and only a text field", () => {
    const elements = selectElements(
      [
        raw("", "Edit", { x: 400, y: -500, width: 300, height: 30 }),
        raw("", "Button", { x: 400, y: -400, width: 40, height: 20 }),
      ],
      { window: WINDOW, generation: 1 },
    );
    expect(elements.map((item) => `${item.role} ${item.name}`)).toEqual([
      "Edit text field",
    ]);
  });
});

// The search box still held "redrob-labs" and typing appended, so the run went
// looking for "redrob-labsredrob-labs" and opened whatever came closest.
describe("fieldHolds", () => {
  it("refuses the doubled text that comes from typing into a full box", () => {
    expect(fieldHolds("redrob-labsredrob-labs", "redrob-labs")).toBe(false);
    expect(fieldHolds("redrob-labs", "redrob-labs")).toBe(true);
  });

  it("ignores the whitespace a field adds around what it holds", () => {
    expect(fieldHolds("  redrob labs ", "redrob  labs")).toBe(true);
  });

  it("cannot confirm a field that reports nothing", () => {
    expect(fieldHolds(undefined, "redrob-labs")).toBe(false);
  });

  it("only asks for the tail when the text was appended on purpose", () => {
    expect(fieldHolds("안녕하세요 반갑습니다", "반갑습니다", "append")).toBe(true);
    expect(fieldHolds("안녕하세요 반갑습니다", "반갑습니다")).toBe(false);
  });
});

describe("findByRect", () => {
  const window = { x: 0, y: 0, width: 1200, height: 800 };
  const elements = selectElements(
    [
      raw("Search", "Edit", { x: 400, y: 40, width: 300, height: 30 }),
      raw("Message", "Edit", { x: 400, y: 700, width: 300, height: 40 }),
    ],
    { window, generation: 1 },
  );

  it("finds the same field again after the ids have been reissued", () => {
    const again = findByRect(
      elements,
      { x: 402, y: 43, width: 300, height: 30 },
      "Edit",
    );
    expect(again?.name).toBe("Search");
  });

  it("does not settle for a different control that happens to be nearby", () => {
    expect(findByRect(elements, { x: 400, y: 40, width: 300, height: 30 }, "Button")).toBe(
      null,
    );
    expect(findByRect(elements, { x: 400, y: 400, width: 300, height: 30 })).toBe(
      null,
    );
  });
});

describe("UiElementStore", () => {
  const window = {
    hwnd: 1,
    title: "Slack",
    process: "Slack",
    rect: WINDOW,
  };

  it("resolves an id from the current read", () => {
    const store = new UiElementStore();
    const elements = selectElements(
      [raw("Send", "Button", { x: 400, y: -500, width: 20, height: 20 })],
      { window: WINDOW, generation: store.nextGeneration() },
    );
    store.replace(window, elements);
    expect(store.resolve(elements[0]!.id).name).toBe("Send");
  });

  it("expires ids from an earlier read instead of clicking the new slot", () => {
    const store = new UiElementStore();
    const first = selectElements(
      [raw("Send", "Button", { x: 400, y: -500, width: 20, height: 20 })],
      { window: WINDOW, generation: store.nextGeneration() },
    );
    store.replace(window, first);
    const second = selectElements(
      [raw("Delete", "Button", { x: 400, y: -500, width: 20, height: 20 })],
      { window: WINDOW, generation: store.nextGeneration() },
    );
    store.replace(window, second);
    expect(() => store.resolve(first[0]!.id)).toThrow(StaleElementError);
    expect(store.resolve(second[0]!.id).name).toBe("Delete");
  });
});

describe("formatting", () => {
  it("strips the UIA prefix", () => {
    expect(stripControlType("ControlType.Button")).toBe("Button");
    expect(stripControlType("Button")).toBe("Button");
  });

  it("describes an element in one line", () => {
    expect(centerOf({ x: 10, y: 10, width: 10, height: 20 })).toEqual({
      x: 15,
      y: 20,
    });
    const [element] = selectElements(
      [raw("Send", "Button", { x: 400, y: -500, width: 20, height: 20 })],
      { window: WINDOW, generation: 2 },
    );
    expect(describeElement(element!)).toBe('e2.0 Button "Send" at 410,-490');
  });

  it("says what a field is already holding", () => {
    const [element] = selectElements(
      [
        {
          name: "Search",
          role: "Edit",
          rect: { x: 400, y: -500, width: 200, height: 20 },
          value: "redrob-labs",
        },
      ],
      { window: WINDOW, generation: 2 },
    );
    expect(describeElement(element!)).toBe(
      'e2.0 Edit "Search" holding "redrob-labs" at 500,-490',
    );
  });
});
