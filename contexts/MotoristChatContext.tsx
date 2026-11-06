import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

type MotoristChatContextValue = {
  setConversationOpen: Dispatch<SetStateAction<boolean>>;
};

const MotoristChatContext =
  createContext<MotoristChatContextValue | null>(null);

export const MotoristChatProvider = MotoristChatContext.Provider;

export function useOptionalMotoristChat() {
  return useContext(MotoristChatContext);
}
