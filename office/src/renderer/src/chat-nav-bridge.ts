import { useEffect, useState } from "react";
import type { ChatRow } from "./ChatSessionsPanel";

export type ChatNavTarget =
  | { kind: "channel"; channelId: string }
  | { kind: "dm"; memberId: string }
  | { kind: "new" };

export type ChatNavListener = (target: ChatNavTarget) => void;
export type ChatStateListener = () => void;

class ChatNavBridge {
  private navListeners = new Set<ChatNavListener>();
  private stateListeners = new Set<ChatStateListener>();

  activeId = "general";
  busy = false;
  ready = false;
  rooms: ChatRow[] = [];
  dms: ChatRow[] = [];

  setChatState(partial: {
    activeId?: string;
    busy?: boolean;
    ready?: boolean;
    rooms?: ChatRow[];
    dms?: ChatRow[];
  }): void {
    let changed = false;
    if (partial.activeId !== undefined && partial.activeId !== this.activeId) {
      this.activeId = partial.activeId;
      changed = true;
    }
    if (partial.busy !== undefined && partial.busy !== this.busy) {
      this.busy = partial.busy;
      changed = true;
    }
    if (partial.ready !== undefined && partial.ready !== this.ready) {
      this.ready = partial.ready;
      changed = true;
    }
    if (partial.rooms !== undefined && partial.rooms !== this.rooms) {
      this.rooms = partial.rooms;
      changed = true;
    }
    if (partial.dms !== undefined && partial.dms !== this.dms) {
      this.dms = partial.dms;
      changed = true;
    }
    if (changed) {
      this.notifyState();
    }
  }

  navigateTo(target: ChatNavTarget): void {
    if (target.kind === "channel") this.activeId = target.channelId;
    else if (target.kind === "dm") this.activeId = target.memberId;
    for (const listener of this.navListeners) {
      listener(target);
    }
    this.notifyState();
  }

  onNavigate(listener: ChatNavListener): () => void {
    this.navListeners.add(listener);
    return () => {
      this.navListeners.delete(listener);
    };
  }

  subscribe(listener: ChatStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private notifyState(): void {
    for (const listener of this.stateListeners) {
      listener();
    }
  }
}

export const chatNavBridge = new ChatNavBridge();

export function useChatNavState(): {
  activeId: string;
  busy: boolean;
  ready: boolean;
  rooms: ChatRow[];
  dms: ChatRow[];
} {
  const [state, setState] = useState(() => ({
    activeId: chatNavBridge.activeId,
    busy: chatNavBridge.busy,
    ready: chatNavBridge.ready,
    rooms: chatNavBridge.rooms,
    dms: chatNavBridge.dms,
  }));

  useEffect(() => {
    return chatNavBridge.subscribe(() => {
      setState({
        activeId: chatNavBridge.activeId,
        busy: chatNavBridge.busy,
        ready: chatNavBridge.ready,
        rooms: chatNavBridge.rooms,
        dms: chatNavBridge.dms,
      });
    });
  }, []);

  return state;
}
