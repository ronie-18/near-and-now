import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getAdminToken } from '../../services/adminSession';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasPermission } from '../../services/adminAuthService';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { MessageCircle, CheckCircle, Loader2, AlertCircle, RefreshCw, Send } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface SupportMessage {
  id: string;
  sender_role: 'shopkeeper' | 'rider' | 'customer';
  sender_id: string;
  sender_name: string | null;
  sender_phone: string | null;
  store_id: string | null;
  message: string;
  status: 'open' | 'resolved';
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

const ROLE_LABEL: Record<SupportMessage['sender_role'], string> = {
  shopkeeper: 'Shopkeeper',
  rider: 'Rider',
  customer: 'Customer',
};

/**
 * Previously nothing here at all — support_messages accumulated with only a
 * truncated admin_notifications snippet, no way to read the full message or
 * respond. Found 2026-08-11 during a support-flow audit.
 */
const SupportMessagesPage = () => {
  // A support_message admin notification links here with a specific :id —
  // previously this page ignored it entirely and just showed the default
  // "open" list, so clicking a notification about an already-resolved (and
  // so filtered-out) message landed on a page with no sign the message ever
  // existed. Found 2026-08-11.
  const { id: targetId } = useParams<{ id?: string }>();
  const currentAdmin = getCurrentAdmin();
  const canReply = Boolean(currentAdmin && hasPermission(currentAdmin, 'support_messages.edit'));
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A deep-linked id must never be hidden by the default "open" filter — a
  // resolved message linked from a notification needs "all" to be visible.
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>(targetId ? 'all' : 'open');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(targetId ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
      const res = await fetch(`${API_BASE}/api/admin/support-messages${qs}`, { headers: adminAuthHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load support messages');
      let list: SupportMessage[] = json.messages;
      // The general list only ever returns messages matching statusFilter —
      // even 'all' could theoretically miss a message under some future
      // status this page doesn't know about, so fall back to fetching the
      // single target directly rather than assuming it's always present.
      if (targetId && !list.some((m) => m.id === targetId)) {
        try {
          const detailRes = await fetch(`${API_BASE}/api/admin/support-messages/${targetId}`, { headers: adminAuthHeaders() });
          const detailJson = await detailRes.json();
          if (detailRes.ok && detailJson.success && detailJson.message) {
            list = [detailJson.message, ...list];
          }
        } catch {
          /* non-fatal — the rest of the list still renders */
        }
      }
      setMessages(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support messages');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, targetId]);

  useEffect(() => { load(); }, [load]);

  // Scroll the deep-linked message into view and briefly highlight it once
  // it's actually on screen, then clear the highlight so it doesn't linger
  // through subsequent reloads/replies.
  useEffect(() => {
    if (!targetId || messages.length === 0) return;
    targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, messages.length]);

  const handleReply = async (id: string) => {
    const reply = (replyDrafts[id] || '').trim();
    if (!reply) return;
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/support-messages/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ reply }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to send reply');
      setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/support-messages/${id}/resolve`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to resolve message');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve message');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Support Messages</h1>
            <p className="text-gray-500 mt-1">Messages submitted from the shopkeeper/rider/customer apps</p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {(['open', 'resolved', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors capitalize ${
                statusFilter === s ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <p className="text-gray-500">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">No messages</h3>
            <p className="text-gray-500">Nothing here for this filter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                ref={m.id === targetId ? targetRef : undefined}
                className={`bg-white rounded-2xl shadow-sm border p-6 transition-colors ${
                  m.id === highlightId ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{m.sender_name || 'Unknown sender'}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ROLE_LABEL[m.sender_role]}</span>
                      {m.status === 'resolved' && (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                          <CheckCircle size={12} className="mr-1" /> Resolved
                        </span>
                      )}
                    </div>
                    {m.sender_phone && <p className="text-xs text-gray-400 mt-0.5">{m.sender_phone}</p>}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(m.created_at).toLocaleString('en-IN')}</span>
                </div>

                <p className="text-gray-800 mt-3 whitespace-pre-wrap">{m.message}</p>

                {m.admin_reply && (
                  <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-emerald-700 mb-1">Your reply</p>
                    <p className="text-sm text-emerald-900 whitespace-pre-wrap">{m.admin_reply}</p>
                  </div>
                )}

                {m.status === 'open' && !canReply && (
                  <p className="mt-4 text-xs text-gray-400">You don&apos;t have permission to reply to messages.</p>
                )}
                {m.status === 'open' && canReply && (
                  <div className="mt-4 flex items-start gap-2">
                    <textarea
                      value={replyDrafts[m.id] || ''}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="Type a reply..."
                      rows={2}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleReply(m.id)}
                        disabled={actionLoading === m.id || !(replyDrafts[m.id] || '').trim()}
                        className="inline-flex items-center px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-emerald-700"
                      >
                        <Send size={14} className="mr-1" /> Reply
                      </button>
                      <button
                        onClick={() => handleResolve(m.id)}
                        disabled={actionLoading === m.id}
                        className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-gray-50"
                      >
                        Mark resolved
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default SupportMessagesPage;
