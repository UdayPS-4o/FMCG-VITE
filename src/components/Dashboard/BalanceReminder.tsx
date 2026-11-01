import React, { useCallback, useEffect, useRef, useState } from 'react';
import constants from '../../constants';

// Balance reminder sending for the Balance Uddhari card.
// WhatsApp uses the approved CXBot "balrem" template; SMS uses the DLT-registered text.
// Statuses are remembered for the day on this device so a reload keeps the green/red buttons
// and "Send all" can skip parties already reminded today.

export type ReminderChannel = 'wa' | 'sms';
type Status = 'sending' | 'ok' | 'fail';
interface Entry {
  status: Status;
  error?: string;
}

interface ReminderParty {
  partyCode: string;
  partyName: string;
  balance: number;
}

// Pause between sends in "Send all" (same 1s spacing the merge screens use for SMS)
const SEND_GAP_MS: Record<ReminderChannel, number> = { wa: 400, sms: 1000 };
const CHANNEL_LABEL: Record<ReminderChannel, string> = { wa: 'WhatsApp', sms: 'SMS' };

const todayKey = () => `balrem-status:${new Date().toLocaleDateString('en-CA')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useBalanceReminders() {
  const [entries, setEntries] = useState<Record<string, Entry>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(todayKey()) || '{}');
      // A send that was in flight when the page closed has an unknown result
      return Object.fromEntries(Object.entries(saved).filter(([, e]) => (e as Entry).status !== 'sending')) as Record<string, Entry>;
    } catch {
      return {};
    }
  });
  const [bulk, setBulk] = useState<{ key: string; done: number; total: number } | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(todayKey(), JSON.stringify(entries));
  }, [entries]);

  const setEntry = (key: string, entry: Entry) => setEntries((prev) => ({ ...prev, [key]: entry }));
  const entryOf = useCallback((channel: ReminderChannel, partyCode: string) => entries[`${channel}:${partyCode}`], [entries]);

  const send = useCallback(async (channel: ReminderChannel, party: ReminderParty): Promise<boolean> => {
    const key = `${channel}:${party.partyCode}`;
    setEntry(key, { status: 'sending' });
    try {
      const res = await fetch(`${constants.baseURL}/api/dashboard/kpis/balance-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ channel, ...party }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setEntry(key, { status: 'ok' });
        return true;
      }
      setEntry(key, { status: 'fail', error: data.error || data.message || `Server error (HTTP ${res.status})` });
    } catch {
      setEntry(key, { status: 'fail', error: 'Cannot reach the server' });
    }
    return false;
  }, []);

  const sendAll = useCallback(
    async (channel: ReminderChannel, groupKey: string, groupName: string, parties: ReminderParty[]) => {
      const pending = parties.filter((p) => p.balance > 0 && entries[`${channel}:${p.partyCode}`]?.status !== 'ok');
      const alreadySent = parties.length - pending.length;
      if (pending.length === 0) {
        window.alert(`All ${parties.length} parties in ${groupName} were already sent a ${CHANNEL_LABEL[channel]} reminder today.`);
        return;
      }
      const ok = window.confirm(
        `Send ${CHANNEL_LABEL[channel]} balance reminder to ${pending.length} parties in ${groupName}?` +
          (alreadySent ? `\n\n${alreadySent} already sent today will be skipped.` : '')
      );
      if (!ok) return;

      cancelRef.current = false;
      setBulk({ key: `${channel}:${groupKey}`, done: 0, total: pending.length });
      for (let i = 0; i < pending.length; i++) {
        if (cancelRef.current) break;
        await send(channel, pending[i]);
        setBulk({ key: `${channel}:${groupKey}`, done: i + 1, total: pending.length });
        if (i < pending.length - 1) await sleep(SEND_GAP_MS[channel]);
      }
      setBulk(null);
    },
    [entries, send]
  );

  const cancelBulk = () => {
    cancelRef.current = true;
  };

  return { entryOf, send, sendAll, bulk, cancelBulk };
}

export type BalanceReminders = ReturnType<typeof useBalanceReminders>;

const statusClass = (entry?: Entry) => {
  if (entry?.status === 'ok') return 'bg-green-600 text-white border-green-600 hover:bg-green-700';
  if (entry?.status === 'fail') return 'bg-red-600 text-white border-red-600 hover:bg-red-700';
  if (entry?.status === 'sending') return 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait';
  return 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-transparent dark:text-gray-200 dark:border-gray-600';
};

const ChannelButton: React.FC<{
  channel: ReminderChannel;
  party: ReminderParty;
  reminders: BalanceReminders;
  disabled: boolean;
}> = ({ channel, party, reminders, disabled }) => {
  const entry = reminders.entryOf(channel, party.partyCode);
  const label = channel === 'wa' ? 'WA' : 'SMS';
  const title =
    entry?.status === 'ok'
      ? `${CHANNEL_LABEL[channel]} reminder sent today — click to send again`
      : entry?.status === 'fail'
        ? `Failed: ${entry.error} — click to retry`
        : entry?.status === 'sending'
          ? 'Sending…'
          : `Send ${CHANNEL_LABEL[channel]} balance reminder`;

  const onClick = () => {
    if (entry?.status === 'ok' && !window.confirm(`${CHANNEL_LABEL[channel]} reminder was already sent to ${party.partyName} today. Send again?`)) {
      return;
    }
    reminders.send(channel, party);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || entry?.status === 'sending'}
      title={title}
      className={`min-w-[42px] rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors disabled:opacity-60 ${statusClass(entry)}`}
    >
      {entry?.status === 'sending' ? '…' : label}
    </button>
  );
};

export const ReminderButtons: React.FC<{ party: ReminderParty; reminders: BalanceReminders }> = ({ party, reminders }) => {
  const busy = !!reminders.bulk;
  return (
    <div className="flex items-center gap-1.5">
      <ChannelButton channel="wa" party={party} reminders={reminders} disabled={busy} />
      <ChannelButton channel="sms" party={party} reminders={reminders} disabled={busy} />
    </div>
  );
};

export const SendAllButtons: React.FC<{
  groupKey: string;
  groupName: string;
  parties: ReminderParty[];
  reminders: BalanceReminders;
}> = ({ groupKey, groupName, parties, reminders }) => {
  const { bulk } = reminders;
  const running = (channel: ReminderChannel) => bulk?.key === `${channel}:${groupKey}`;

  const button = (channel: ReminderChannel) => {
    const sent = parties.filter((p) => reminders.entryOf(channel, p.partyCode)?.status === 'ok').length;
    const failed = parties.filter((p) => reminders.entryOf(channel, p.partyCode)?.status === 'fail').length;
    return running(channel) ? (
      <button
        key={channel}
        type="button"
        onClick={reminders.cancelBulk}
        className="rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
        title="Stop after the current message"
      >
        Sending {bulk!.done}/{bulk!.total} · Stop
      </button>
    ) : (
      <button
        key={channel}
        type="button"
        disabled={!!bulk}
        onClick={() => reminders.sendAll(channel, groupKey, groupName, parties)}
        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-transparent dark:text-gray-200"
        title={`Send ${CHANNEL_LABEL[channel]} reminder to every party in this group (skips ones already sent today)`}
      >
        Send all {channel === 'wa' ? 'WA' : 'SMS'}
        {(sent > 0 || failed > 0) && (
          <span className="ml-1 font-normal">
            {sent > 0 && <span className="text-green-600">✓{sent}</span>}
            {failed > 0 && <span className="ml-1 text-red-600">✗{failed}</span>}
          </span>
        )}
      </button>
    );
  };

  // Clicks here must not toggle the subgroup row they sit in
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {button('wa')}
      {button('sms')}
    </div>
  );
};
