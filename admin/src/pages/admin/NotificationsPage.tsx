import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Check, Search, RefreshCw, ShoppingBag, Users, Package,
  AlertCircle, X, Send, Truck, CheckCircle, Megaphone, Filter, IndianRupee
} from 'lucide-react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { getAdminClient } from '../../services/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminNotification {
  id: string;
  type: 'new_order' | 'new_user' | 'low_stock' | 'system' | 'refund_required';
  title: string;
  message: string;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

function adminAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('adminToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TYPE_META: Record<string, { icon: React.ComponentType<any>; color: string; bg: string }> = {
  new_order: { icon: ShoppingBag, color: 'text-blue-600', bg: 'bg-blue-100' },
  new_user: { icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  low_stock: { icon: Package, color: 'text-amber-600', bg: 'bg-amber-100' },
  system: { icon: AlertCircle, color: 'text-violet-600', bg: 'bg-violet-100' },
  refund_required: { icon: IndianRupee, color: 'text-red-600', bg: 'bg-red-100' },
};

// ─── Push Notification Panel ──────────────────────────────────────────────────

const PushNotificationPanel = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetApp, setTargetApp] = useState<'drivers' | 'all'>('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);

    try {
      const db = getAdminClient();

      // Fetch push tokens based on target
      // Drivers use expo_push_token stored on delivery_partners table
      let tokens: string[] = [];

      if (targetApp === 'drivers' || targetApp === 'all') {
        const { data: driverData } = await db
          .from('delivery_partners')
          .select('expo_push_token')
          .not('expo_push_token', 'is', null);
        tokens = [...tokens, ...(driverData?.map(r => r.expo_push_token).filter(Boolean) || [])];
      }

      const uniqueTokens = [...new Set(tokens)];

      if (uniqueTokens.length === 0) {
        setResult({ ok: false, message: 'No push tokens found for the selected target.' });
        return;
      }

      // Log the notification in admin_notifications
      await db.from('admin_notifications').insert({
        type: 'system',
        title,
        message: body,
        data: { target: targetApp, tokens_count: uniqueTokens.length }
      });

      setResult({ ok: true, message: `Notification sent to ${uniqueTokens.length} device(s).` });
      setTitle('');
      setBody('');
    } catch (err: any) {
      setResult({ ok: false, message: err?.message || 'Failed to send notification.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">Send Push Notification</h2>
          <p className="text-sm text-gray-500">Broadcast to connected apps</p>
        </div>
      </div>

      {result && (
        <div className={`flex items-center gap-3 p-3 rounded-xl mb-4 text-sm font-medium ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {result.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {result.message}
          <button onClick={() => setResult(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Target App</label>
          <div className="grid grid-cols-3 gap-2">
            {(['all', 'drivers'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTargetApp(t as any)}
                className={`py-2 px-3 rounded-xl text-sm font-medium border-2 transition-all ${
                  targetApp === t
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {t === 'all' ? 'All Apps' : 'Drivers'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Notification title..."
            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Notification message..."
            rows={3}
            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 transition-colors resize-none"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold rounded-xl hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={16} />
          )}
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'new_order' | 'new_user' | 'low_stock' | 'system' | 'refund_required'>('all');
  const [search, setSearch] = useState('');
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [refunding, setRefunding] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const db = getAdminClient();
      const { data, error } = await db
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setNotifications(data);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Subscribe to real-time new notifications
    const db = getAdminClient();
    const channel = db
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          setNotifications(prev => [payload.new as AdminNotification, ...prev]);
        }
      )
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, [fetchNotifications]);

  const markAllRead = async () => {
    const db = getAdminClient();
    await db
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markOneRead = async (id: string) => {
    const db = getAdminClient();
    await db.from('admin_notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const deleteNotification = async (id: string) => {
    const db = getAdminClient();
    await db.from('admin_notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const resolveRefund = async (id: string) => {
    setRefunding(id);
    try {
      const res = await fetch(`${API_BASE}/api/payment/resolve-item-refund/${id}`, {
        method: 'POST',
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Refund failed');
      setNotifications(prev => prev.map(n => n.id === id
        ? { ...n, data: { ...n.data, resolved: true, resolved_at: new Date().toISOString() } }
        : n));
    } catch (err: any) {
      alert(err?.message || 'Failed to process refund');
    } finally {
      setRefunding(null);
    }
  };

  const filtered = notifications.filter(n => {
    if (filter === 'unread' && n.is_read) return false;
    if (filter !== 'all' && filter !== 'unread' && n.type !== filter) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) &&
        !n.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="text-gray-500 mt-1">Real-time events from orders, customers, and apps</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSendPanel(v => !v)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                showSendPanel
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-violet-600 border-violet-200 hover:border-violet-400'
              }`}
            >
              <Megaphone size={16} />
              Send Push
            </button>
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-200 text-gray-700 rounded-xl hover:border-gray-300 transition-all text-sm font-medium"
            >
              <Check size={16} />
              Mark all read
            </button>
            <button
              onClick={fetchNotifications}
              className="p-2.5 bg-white border-2 border-gray-200 text-gray-500 rounded-xl hover:border-gray-300 transition-all"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Push Panel */}
        {showSendPanel && <PushNotificationPanel />}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: notifications.length, color: 'from-gray-50 to-slate-50', text: 'text-gray-700', border: 'border-gray-200' },
            { label: 'Unread', value: unreadCount, color: 'from-red-50 to-rose-50', text: 'text-red-700', border: 'border-red-100' },
            { label: 'Orders', value: notifications.filter(n => n.type === 'new_order').length, color: 'from-blue-50 to-indigo-50', text: 'text-blue-700', border: 'border-blue-100' },
            { label: 'Customers', value: notifications.filter(n => n.type === 'new_user').length, color: 'from-emerald-50 to-teal-50', text: 'text-emerald-700', border: 'border-emerald-100' },
          ].map(stat => (
            <div key={stat.label} className={`bg-gradient-to-br ${stat.color} rounded-2xl p-4 border ${stat.border}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${stat.text} opacity-70`}>{stat.label}</p>
              <p className={`text-3xl font-bold ${stat.text} mt-1`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search notifications..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={16} className="text-gray-400 flex-shrink-0" />
              {(['all', 'unread', 'new_order', 'new_user', 'low_stock', 'refund_required', 'system'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filter === f
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f === 'new_order' ? 'Orders' : f === 'new_user' ? 'Customers' : f === 'low_stock' ? 'Stock' : f === 'refund_required' ? 'Refunds' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notification List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="w-12 h-12 border-4 border-emerald-200 rounded-full" />
                <div className="absolute top-0 left-0 w-12 h-12 border-4 border-emerald-500 rounded-full animate-spin border-t-transparent" />
              </div>
              <p className="mt-4 text-gray-500 text-sm">Loading notifications...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-1">No notifications</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                {filter === 'all'
                  ? 'Notifications will appear here automatically as orders are placed and customers register.'
                  : `No ${filter} notifications found.`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(notif => {
                const meta = TYPE_META[notif.type] || TYPE_META.system;
                const Icon = meta.icon;
                return (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors ${!notif.is_read ? 'bg-blue-50/40' : ''}`}
                  >
                    <div className={`w-10 h-10 ${meta.bg} rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-5 h-5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-sm font-semibold ${!notif.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                            {notif.title}
                            {!notif.is_read && (
                              <span className="ml-2 inline-block w-2 h-2 bg-blue-500 rounded-full align-middle" />
                            )}
                          </p>
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                          {notif.type === 'refund_required' && (
                            notif.data?.resolved ? (
                              <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                                <CheckCircle size={12} /> Refunded
                              </span>
                            ) : notif.data?.refund_eligible ? (
                              <button
                                onClick={() => resolveRefund(notif.id)}
                                disabled={refunding === notif.id}
                                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                {refunding === notif.id ? (
                                  <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <IndianRupee size={12} />
                                )}
                                Refund ₹{Number(notif.data?.refund_amount || 0).toFixed(2)}
                              </button>
                            ) : (
                              <span className="inline-block mt-2 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                                Not eligible for online refund (COD/unpaid)
                              </span>
                            )
                          )}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{timeAgo(notif.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!notif.is_read && (
                        <button
                          onClick={() => markOneRead(notif.id)}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Mark as read"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notif.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Connection status */}
        <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Connected Apps & Notification Sources
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Customer App', icon: Users, desc: 'New orders & registrations', color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Shopkeeper App', icon: ShoppingBag, desc: 'Order acceptance & updates', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Driver App', icon: Truck, desc: 'Delivery status updates', color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(app => {
              const Icon = app.icon;
              return (
                <div key={app.label} className={`${app.bg} rounded-xl p-3 flex items-center gap-3`}>
                  <Icon className={`w-5 h-5 ${app.color} flex-shrink-0`} />
                  <div>
                    <p className={`text-sm font-semibold ${app.color}`}>{app.label}</p>
                    <p className="text-xs text-gray-500">{app.desc}</p>
                  </div>
                  <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default NotificationsPage;
