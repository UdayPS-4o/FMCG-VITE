import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import constants from '../constants';

interface AlexaAction {
  type: 'update_field' | 'search_party' | 'print_receipt';
  field?: string;
  value?: string;
  searchTerm?: string;
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
  pollInterval = 3000,
  enabled = true,
}: UseAlexaCommandsProps) => {
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    [partyOptions]
  );

  const executeCommand = useCallback(
    async (command: AlexaCommand) => {
      console.log('[Alexa] Executing command:', command.voiceText);
      toast.info(`🔊 Alexa: "${command.voiceText}"`, { autoClose: 4000 });

      for (const action of command.actions) {
        switch (action.type) {
          case 'update_field':
            if (action.field && action.value !== undefined) {
              onSuggestion?.(action.field, action.value);
              console.log(`[Alexa] Updated field "${action.field}" = "${action.value}"`);
            }
            break;

          case 'search_party':
            if (action.searchTerm) {
              const party = fuzzyFindParty(action.searchTerm);
              if (party) {
                onSuggestion?.('party', party.label);
                toast.success(`✅ Party selected: ${party.label}`);
                console.log('[Alexa] Party found:', party.label);
              } else {
                toast.warning(`❌ Party not found: "${action.searchTerm}"`);
                console.warn('[Alexa] Party not found for:', action.searchTerm);
              }
            }
            break;

          case 'print_receipt':
            onPrint?.();
            toast.success('🖨️ Alexa triggered print');
            console.log('[Alexa] Print triggered');
            break;

          default:
            console.warn('[Alexa] Unknown action type:', (action as any).type);
        }
      }

      await markComplete(command.id);
    },
    [onSuggestion, fuzzyFindParty, onPrint, markComplete]
  );

  const pollForCommands = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return; // Not logged in

      const res = await fetch(`${constants.baseURL}/api/alexa/commands/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data: { commands: AlexaCommand[] } = await res.json();
      for (const command of data.commands) {
        await executeCommand(command);
      }
    } catch (err) {
      // Silently ignore network errors during polling
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
