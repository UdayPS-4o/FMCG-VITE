import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import constants from '../constants';

interface AlexaAction {
  type: 'update_field' | 'search_party' | 'print_receipt' | 'show_toast';
  field?: string;
  value?: string;
  searchTerm?: string;
  message?: string;
}

interface AlexaCommand {
  id: string;
  voiceText: string;
  actions: AlexaAction[];
  status: 'pending' | 'completed';
  createdAt: string;
}

interface UseAlexaCommandsProps {
  onSuggestion?: (field: string, value: string) => void;
  partyOptions?: { label: string; value: string }[];
  onPrint?: () => void;
  /** Current page state sent with each poll, so Alexa only asks for what is missing */
  getStatus?: () => Record<string, string>;
  /** How often to poll in ms. Default: 3000 */
  pollInterval?: number;
  enabled?: boolean;
}

/**
 * useAlexaCommands — polls the server for commands queued by the Alexa skill
 * and executes them by calling the same callbacks as SarthakAssistant.
 */
export const useAlexaCommands = ({
  onSuggestion,
  partyOptions,
  onPrint,
  getStatus,
  pollInterval = 3000,
  enabled = true,
}: UseAlexaCommandsProps) => {
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  // Keep the latest callbacks in refs so polling isn't restarted on every render
  // of the host page (its handlers are recreated each render).
  const onSuggestionRef = useRef(onSuggestion);
  const onPrintRef = useRef(onPrint);
  const partyOptionsRef = useRef(partyOptions);
  const getStatusRef = useRef(getStatus);
  getStatusRef.current = getStatus;
  onSuggestionRef.current = onSuggestion;
  onPrintRef.current = onPrint;
  partyOptionsRef.current = partyOptions;

  const markComplete = useCallback(async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${constants.baseURL}/api/alexa/commands/${id}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('[Alexa] Failed to mark command complete:', err);
    }
  }, []);

  const fuzzyFindParty = useCallback(
    (searchTerm: string): { label: string; value: string } | null => {
      const partyOptions = partyOptionsRef.current;
      if (!partyOptions || partyOptions.length === 0) return null;
      const term = searchTerm.toLowerCase();
      // Exact match first
      let found = partyOptions.find(p => p.label.toLowerCase() === term);
      if (found) return found;
      // Starts-with match
      found = partyOptions.find(p => p.label.toLowerCase().startsWith(term));
      if (found) return found;
      // Contains match
      found = partyOptions.find(p => p.label.toLowerCase().includes(term));
      return found || null;
    },
    []
  );

  const executeCommand = useCallback(
    async (command: AlexaCommand) => {
      console.log('[Alexa] Executing command:', command.voiceText);
      toast.info(`🔊 Alexa: "${command.voiceText}"`, { autoClose: 4000 });

      for (const action of command.actions) {
        switch (action.type) {
          case 'update_field':
            if (action.field && action.value !== undefined) {
              onSuggestionRef.current?.(action.field, action.value);
              console.log(`[Alexa] Updated field "${action.field}" = "${action.value}"`);
            }
            break;

          case 'search_party':
            if (action.searchTerm) {
              const party = fuzzyFindParty(action.searchTerm);
              if (party) {
                onSuggestionRef.current?.('party', party.label);
                toast.success(`✅ Party selected: ${party.label}`);
                console.log('[Alexa] Party found:', party.label);
              } else {
                toast.warning(`❌ Party not found: "${action.searchTerm}"`);
                console.warn('[Alexa] Party not found for:', action.searchTerm);
              }
            }
            break;

          case 'print_receipt':
            onPrintRef.current?.();
            toast.success('🖨️ Alexa triggered print');
            console.log('[Alexa] Print triggered');
            break;

          case 'show_toast':
            if (action.message) toast.info(action.message);
            break;

          default:
            console.warn('[Alexa] Unknown action type:', (action as any).type);
        }
      }

      await markComplete(command.id);
    },
    [fuzzyFindParty, markComplete]
  );

  const pollForCommands = useCallback(async () => {
    if (inFlightRef.current) return; // previous poll still executing — avoid running a command twice
    inFlightRef.current = true;
    try {
      const token = localStorage.getItem('token');
      if (!token) return; // Not logged in

      const query = new URLSearchParams(getStatusRef.current?.() || {}).toString();
      const res = await fetch(`${constants.baseURL}/api/alexa/commands/pending${query ? `?${query}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data: { commands: AlexaCommand[] } = await res.json();
      for (const command of data.commands) {
        await executeCommand(command);
      }
    } catch (err) {
      // Silently ignore network errors during polling
    } finally {
      inFlightRef.current = false;
    }
  }, [executeCommand]);

  useEffect(() => {
    if (!enabled) return;

    // Poll immediately on mount, then at interval
    pollForCommands();
    pollingRef.current = setInterval(pollForCommands, pollInterval);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [enabled, pollInterval, pollForCommands]);
};
