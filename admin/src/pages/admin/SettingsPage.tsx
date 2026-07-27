import { useState, useEffect } from 'react';
import {
  Shield, Bell, Palette, Monitor, Lock, Eye, EyeOff,
  CheckCircle, AlertCircle, X, Save, RefreshCw, Key,
  Globe, Database, Wifi, Activity
} from 'lucide-react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { updateAdmin } from '../../services/adminAuthService';
import { getAdminClient } from '../../services/supabase';
import { updateStoredAdminData } from '../../services/adminSession';

// ─── Shared helpers ──────────────────────────────────────────────────────────

const SectionCard = ({ title, description, icon: Icon, iconBg, children }: {
  title: string; description?: string;
  icon: React.ComponentType<any>; iconBg: string;
  children: React.ReactNode;
}) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <div className="p-6 border-b border-gray-50">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-800">{title}</h3>
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const Toggle = ({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void;
  label: string; description?: string;
}) => (
  <div className="flex items-center justify-between py-3">
    <div className="flex-1 min-w-0 pr-4">
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-emerald-500' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);

// ─── Account Tab ─────────────────────────────────────────────────────────────

const AccountTab = () => {
  const admin = getCurrentAdmin();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const db = getAdminClient();
        const { data } = await db
          .from('admin_sessions')
          .select('id, user_agent, created_at, expires_at, logged_out_at')
          .eq('admin_id', admin?.id)
          .order('created_at', { ascending: false })
          .limit(5);
        setSessions(data || []);
      } catch { /* ignore */ }
      finally { setLoadingSessions(false); }
    };
    if (admin?.id) fetchSessions();
    else setLoadingSessions(false);
  }, [admin?.id]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setResult({ ok: false, msg: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setResult({ ok: false, msg: 'Password must be at least 8 characters.' });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      if (!admin?.id) throw new Error('Not authenticated');
      await updateAdmin(admin.id, { password: newPassword });
      setResult({ ok: true, msg: 'Password updated successfully.' });
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      setResult({ ok: false, msg: err?.message || 'Failed to update password.' });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Change Password" description="Update your login credentials" icon={Key} iconBg="bg-blue-50 text-blue-600">
        {result && (
          <div className={`flex items-center gap-3 p-3 rounded-xl mb-4 text-sm font-medium ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {result.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            {result.msg}
            <button onClick={() => setResult(null)} className="ml-auto"><X size={13} /></button>
          </div>
        )}
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full pl-9 pr-10 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-colors"
              />
              <button type="button" onClick={() => setShowOld(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full pl-9 pr-10 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-colors"
                />
                <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !oldPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Update Password'}
            </button>
            <div className="text-xs text-gray-500">
              {newPassword && newPassword.length < 8 && <span className="text-red-500">Too short</span>}
              {newPassword && newPassword.length >= 8 && confirmPassword && newPassword !== confirmPassword && <span className="text-red-500">Passwords don't match</span>}
              {newPassword && newPassword.length >= 8 && confirmPassword && newPassword === confirmPassword && <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={12} /> Looks good</span>}
            </div>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Active Sessions" description="Devices currently signed in to your account" icon={Activity} iconBg="bg-emerald-50 text-emerald-600">
        {loadingSessions ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <RefreshCw size={14} className="animate-spin" /> Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No active sessions found.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => {
              const isActive = !session.logged_out_at && new Date(session.expires_at) > new Date();
              return (
                <div key={session.id} className={`flex items-center gap-4 p-3 rounded-xl border ${isActive ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100 bg-gray-50'}`}>
                  <Monitor size={18} className={isActive ? 'text-emerald-500' : 'text-gray-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {session.user_agent?.split('(')[0]?.trim() || 'Browser session'}
                    </p>
                    <p className="text-xs text-gray-500">Started {new Date(session.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {isActive ? 'Active' : 'Expired'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

// ─── Notifications Tab ───────────────────────────────────────────────────────

const DEFAULT_NOTIF_PREFS = {
  newOrders: true, newCustomers: true,
  orderStatus: true, deliveryUpdates: true, systemAlerts: true,
};

const NotificationsTab = () => {
  const admin = getCurrentAdmin();
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_NOTIF_PREFS, ...(admin?.notification_preferences || {}) }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, value: boolean) => {
    setPrefs((p: any) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    if (!admin?.id) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdmin(admin.id, { notification_preferences: prefs });
      if (updated) updateStoredAdminData(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="In-App Notifications" description="Control which events appear in your notification centre" icon={Bell} iconBg="bg-violet-50 text-violet-600">
        <div className="divide-y divide-gray-100">
          <Toggle checked={prefs.newOrders} onChange={v => update('newOrders', v)} label="New Orders" description="When a customer places a new order" />
          <Toggle checked={prefs.newCustomers} onChange={v => update('newCustomers', v)} label="New Customers" description="When someone registers on the customer app" />
          <Toggle checked={prefs.orderStatus} onChange={v => update('orderStatus', v)} label="Order Status Changes" description="Order accepted, preparing, dispatched, delivered" />
          <Toggle checked={prefs.deliveryUpdates} onChange={v => update('deliveryUpdates', v)} label="Delivery Updates" description="Partner pickup and delivery confirmations" />
          <Toggle checked={prefs.systemAlerts} onChange={v => update('systemAlerts', v)} label="System Alerts" description="Security events and important system notices" />
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="mt-4 flex items-center gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Save Preferences
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
              <CheckCircle size={14} /> Saved
            </span>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

// ─── Appearance Tab ──────────────────────────────────────────────────────────

const DEFAULT_DISPLAY_PREFS = { compactMode: false, showAnimations: true, language: 'en', timezone: 'Asia/Kolkata', currency: 'INR' };

const AppearanceTab = () => {
  const admin = getCurrentAdmin();
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_DISPLAY_PREFS, ...(admin?.display_preferences || {}) }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, value: any) => {
    setPrefs((p: any) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    if (!admin?.id) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdmin(admin.id, { display_preferences: prefs });
      if (updated) updateStoredAdminData(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Display Preferences" description="Customise how the admin panel looks for you" icon={Palette} iconBg="bg-amber-50 text-amber-600">
        <div className="divide-y divide-gray-100">
          <Toggle checked={prefs.compactMode} onChange={v => update('compactMode', v)} label="Compact Mode" description="Reduce spacing for a denser layout" />
          <Toggle checked={prefs.showAnimations} onChange={v => update('showAnimations', v)} label="Animations" description="Enable UI transition animations" />
        </div>
      </SectionCard>

      <SectionCard title="Regional Settings" description="Language, timezone, and currency display" icon={Globe} iconBg="bg-teal-50 text-teal-600">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Language</label>
            <select value={prefs.language} onChange={e => update('language', e.target.value)} className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400">
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="bn">Bengali</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
            <select value={prefs.timezone} onChange={e => update('timezone', e.target.value)} className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400">
              <option value="Asia/Kolkata">IST (UTC+5:30)</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Dubai">UAE (UTC+4)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
            <select value={prefs.currency} onChange={e => update('currency', e.target.value)} className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400">
              <option value="INR">₹ Indian Rupee</option>
              <option value="USD">$ US Dollar</option>
              <option value="EUR">€ Euro</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="mt-4 flex items-center gap-3 pt-4 border-t border-gray-100">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-semibold rounded-xl hover:from-teal-600 hover:to-emerald-700 transition-all disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}Save Settings
          </button>
          {saved && <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium"><CheckCircle size={14} /> Saved</span>}
        </div>
      </SectionCard>
    </div>
  );
};

// ─── System Tab ───────────────────────────────────────────────────────────────

const SystemTab = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'Not configured';
  const isConnected = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  return (
    <div className="space-y-6">
      <SectionCard title="Connection Status" description="Live status of system integrations" icon={Wifi} iconBg="bg-emerald-50 text-emerald-600">
        <div className="space-y-3">
          {[
            { label: 'Supabase Database', status: isConnected, detail: supabaseUrl.replace('https://', '').split('.')[0] + '.supabase.co' },
            { label: 'Supabase Realtime', status: isConnected, detail: 'Websocket channel active' },
            { label: 'Storage Bucket', status: isConnected, detail: 'product-images bucket' },
            { label: 'Edge Functions', status: isConnected, detail: 'admin-auth deployed' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.status ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-500">{item.detail}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                {item.status ? 'Connected' : 'Error'}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="System Information" description="Admin panel build and environment details" icon={Database} iconBg="bg-gray-100 text-gray-600">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Admin Panel Version', value: '1.0.0' },
            { label: 'Environment', value: import.meta.env.MODE || 'production' },
            { label: 'Framework', value: 'React 18 + Vite + TypeScript' },
            { label: 'Database', value: 'Supabase (PostgreSQL)' },
            { label: 'Auth Method', value: 'Custom JWT + bcrypt' },
            { label: 'Currency', value: 'INR (₹)' },
          ].map(item => (
            <div key={item.label} className="p-3 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{item.label}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'account', label: 'Account & Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'system', label: 'System', icon: Database },
];

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('account');

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Manage your account, notifications, and display preferences</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar nav */}
          <aside className="lg:w-56 flex-shrink-0">
            <nav className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 space-y-1">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={16} className={active ? 'text-white' : 'text-gray-400'} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'account' && <AccountTab />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'system' && <SystemTab />}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SettingsPage;
