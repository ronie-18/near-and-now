import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bike,
  ChevronDown,
  FileText,
  Mail,
  MessageSquare,
  Package,
  ShoppingCart,
  Store,
  UserPlus,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  PageHeader,
  SearchInput,
  buttonClasses,
} from '../../components/ui';
import { cn } from '../../utils/cn';

// The customer site, footer and policy pages all standardised on
// support@nearnow.com (see bug_fixes_2026-07-23.md); this page was the
// last place still pointing at the non-existent nearandnow.com address.
const SUPPORT_EMAIL = 'support@nearnow.com';

type FaqSection = 'Catalog' | 'Orders & delivery' | 'Partners' | 'Marketing & notifications' | 'Admin & security';

const FAQ_SECTIONS: FaqSection[] = ['Catalog', 'Orders & delivery', 'Partners', 'Marketing & notifications', 'Admin & security'];

// Section names contain spaces and ampersands, which are not valid in an
// HTML id, so headings get a slug for aria-labelledby.
const sectionId = (section: FaqSection) => `faq-section-${section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

interface Faq {
  section: FaqSection;
  q: string;
  a: string;
  /** Route the answer refers to, rendered as a link under the answer. */
  to?: string;
  linkLabel?: string;
}

// Copy is checked against the pages it describes: status labels come from
// orderStatusMeta, push targets from NotificationsPage TARGET_ITEMS, roles
// from CreateAdminPage, and the rider/store approval rules from the
// Delivery and Stores pages. "A → B" paths follow the sidebar nesting in
// AdminSidebar (e.g. Store inventory and Reviews are children of Products;
// the change-request pages are top-level Operations items).
const faqs: Faq[] = [
  {
    section: 'Catalog',
    q: 'How do I add a new product?',
    a: 'Go to Products → Add product. Fill in the product details (name, price, category, images), set the stock status and save. For a quick entry with just the essentials, use Quick add product from the product list.',
    to: '/products/add',
    linkLabel: 'Add a product',
  },
  {
    section: 'Catalog',
    q: 'How do I manage categories?',
    a: 'Go to Categories to add, edit or delete categories. Categories control how products are grouped. A category that still has products cannot be deleted; move or remove its products first.',
    to: '/categories',
    linkLabel: 'Open Categories',
  },
  {
    section: 'Catalog',
    q: 'What are product submissions?',
    a: 'Custom products submitted by shopkeepers are listed under Products → Product submissions. Review each submission there before it joins the catalog.',
    to: '/products/submissions',
    linkLabel: 'Open Product submissions',
  },
  {
    section: 'Catalog',
    q: 'How do customer reviews get published?',
    a: 'Reviews submitted from delivered orders are listed under Products → Reviews, with Pending and Approved tabs. Approve a review to publish it; only approved reviews are shown to customers.',
    to: '/products/reviews',
    linkLabel: 'Open Reviews',
  },
  {
    section: 'Orders & delivery',
    q: 'How do I update order status?',
    a: 'Open Orders, click an order to view its details, then use the Move to select in the Order status card. Statuses only move forward: Placed → Confirmed → Preparing → Ready → Rider assigned → Picking up → Picked up → Out for delivery → Delivered. Cancelled can be chosen from any non-final status. Delivered and cancelled orders cannot be changed.',
    to: '/orders',
    linkLabel: 'Open Orders',
  },
  {
    section: 'Orders & delivery',
    q: 'How are riders assigned to orders?',
    a: 'Riders are not assigned from the admin console. Once an order is ready for pickup, approved riders accept it from the rider app and the order moves to Rider assigned. The assigned rider is shown in the Fulfillment section of the order detail page.',
    to: '/orders',
    linkLabel: 'Open Orders',
  },
  {
    section: 'Orders & delivery',
    q: 'How do I approve a new delivery partner?',
    a: 'Go to Delivery partners. A rider can only be approved once every document required for their vehicle type has been reviewed and approved; until then the Approve action stays disabled and lists the outstanding documents.',
    to: '/delivery',
    linkLabel: 'Open Delivery partners',
  },
  {
    section: 'Orders & delivery',
    q: 'How do rider payouts work?',
    a: 'Rider payouts lists pending and paid payouts for each rider. Payouts are transferred outside the console (bank or UPI); once the transfer has been made, use Mark paid to record the payout as settled. The console records the outcome and does not move money.',
    to: '/rider-payouts',
    linkLabel: 'Open Rider payouts',
  },
  {
    section: 'Partners',
    q: 'How do I approve a store?',
    a: 'Go to Stores. Open the store’s verification documents to review them, then approve the store from its row. Approval can be reversed from the same place if a store needs to be taken offline again.',
    to: '/stores',
    linkLabel: 'Open Stores',
  },
  {
    section: 'Partners',
    q: 'How do I manage a store’s inventory?',
    a: 'Go to Products → Store inventory and pick a store to view and manage its product listing.',
    to: '/stores/products',
    linkLabel: 'Open Store inventory',
  },
  {
    section: 'Partners',
    q: 'What are profile change requests?',
    a: 'When a shopkeeper or rider edits protected profile details, the change is held as a request. Review and approve or reject it under Store change requests or Rider change requests in the Operations section of the sidebar. Every decision is recorded in the Activity log.',
    to: '/activity-log',
    linkLabel: 'Open Activity log',
  },
  {
    section: 'Partners',
    q: 'How do I suspend a customer account?',
    a: 'Open Customers, find the customer and use Suspend. A suspended account can be reactivated from the same place.',
    to: '/customers',
    linkLabel: 'Open Customers',
  },
  {
    section: 'Marketing & notifications',
    q: 'How do I create a coupon?',
    a: 'Go to Offers & coupons → Create coupon. Set the code, discount and validity window; customers redeem the code at checkout.',
    to: '/offers',
    linkLabel: 'Open Offers & coupons',
  },
  {
    section: 'Marketing & notifications',
    q: 'How does the notification system work?',
    a: 'Admin notifications are generated automatically by database triggers for events from orders, customers, stores and riders. Read state is per admin, and the Notifications page refreshes every 15 seconds.',
    to: '/notifications',
    linkLabel: 'Open Notifications',
  },
  {
    section: 'Marketing & notifications',
    q: 'How do I send push notifications to riders?',
    a: 'Go to Notifications → Send push notification. Choose the target (All apps, Drivers, Stores or Customers), enter a title and message, and send. Pushes to drivers use the Expo push token stored for each rider.',
    to: '/notifications',
    linkLabel: 'Open Notifications',
  },
  {
    section: 'Marketing & notifications',
    q: 'Where do customer support messages go?',
    a: 'Messages customers send from the app arrive under Support messages. Open a message to reply and mark it resolved; replying requires the support_messages.edit permission.',
    to: '/support-messages',
    linkLabel: 'Open Support messages',
  },
  {
    section: 'Admin & security',
    q: 'How do I create admin accounts?',
    a: 'Super admins can go to Admin users → Create admin. Set the email, password and role (super_admin, admin, manager or viewer). Permissions are not picked by hand: each role comes with a default permission set, shown on the form before you save, and super_admin always holds every permission.',
    to: '/admins/create',
    linkLabel: 'Create an admin',
  },
  {
    section: 'Admin & security',
    q: 'How do I export reports?',
    a: 'In Reports, choose the period (7 days, 30 days, 90 days or 1 year), then click Export to download a JSON file with revenue, order and product data for that period.',
    to: '/reports',
    linkLabel: 'Open Reports',
  },
  {
    section: 'Admin & security',
    q: 'Where can I see sign-in and security activity?',
    a: 'Security log has three tabs: Admin actions (the audit trail of what each admin did), Security events and Failed logins. Activity log records every admin review action across profile changes, product submissions and verification documents.',
    to: '/security-log',
    linkLabel: 'Open Security log',
  },
  {
    section: 'Admin & security',
    q: 'How do I change my password or notification preferences?',
    a: 'Go to Settings. You can change your password, review recent sign-ins, set in-app notification preferences and check the connectivity and environment details for this console.',
    to: '/settings',
    linkLabel: 'Open Settings',
  },
];

interface QuickLink {
  to: string;
  label: string;
  description: string;
  icon: typeof Package;
}

// Every entry points at a route in AdminRoutes.tsx. The previous
// "Resources" cards advertised videos, live chat and a forum that do not
// exist and had no click handlers at all.
const quickLinks: QuickLink[] = [
  { to: '/products/add', label: 'Add a product', description: 'Create a new catalog product', icon: Package },
  { to: '/orders', label: 'Orders', description: 'Review orders and update status', icon: ShoppingCart },
  { to: '/delivery', label: 'Delivery partners', description: 'Approve and track riders', icon: Bike },
  { to: '/stores', label: 'Stores', description: 'Approve and manage store partners', icon: Store },
  { to: '/reports', label: 'Reports', description: 'Revenue, orders and exports', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', description: 'Admin alerts and push notifications', icon: Bell },
  { to: '/admins/create', label: 'Create admin', description: 'Add an administrator account', icon: UserPlus },
  { to: '/support-messages', label: 'Support messages', description: 'Reply to customer enquiries', icon: MessageSquare },
];

interface FaqItemProps {
  faq: Faq;
  open: boolean;
  onToggle: () => void;
}

// Accordion row: a real <button> with aria-expanded/aria-controls so it is
// focusable and keyboard-operable (it used to be a <div onClick>).
function FaqItem({ faq, open, onToggle }: FaqItemProps) {
  const id = useId();
  const buttonId = `${id}-question`;
  const panelId = `${id}-answer`;

  return (
    <li>
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
          open ? 'bg-brand-50' : 'hover:bg-gray-50',
        )}
      >
        <span className={cn('text-sm font-medium', open ? 'text-brand-700' : 'text-gray-900')}>{faq.q}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-4 w-4 flex-shrink-0', open ? 'rotate-180 text-brand-600' : 'text-gray-400')}
        />
      </button>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="px-5 pb-5 pt-4">
          <p className="text-sm leading-relaxed text-gray-700">{faq.a}</p>
          {faq.to ? (
            <Link
              to={faq.to}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded"
            >
              {faq.linkLabel ?? 'Open page'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const HelpPage = () => {
  const [search, setSearch] = useState('');
  // Open state lives here, keyed by question, so filtering the list never
  // moves an "open" flag onto a different question (the old list keyed
  // FAQItem by array index and kept the flag inside each item).
  const [openQuestions, setOpenQuestions] = useState<ReadonlySet<string>>(() => new Set());

  const toggleQuestion = (q: string) => {
    setOpenQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
  };

  // Case-insensitive match on both the question and the answer text.
  const term = search.trim().toLowerCase();
  const filteredFaqs = term
    ? faqs.filter((f) => f.q.toLowerCase().includes(term) || f.a.toLowerCase().includes(term))
    : faqs;

  const groups = FAQ_SECTIONS.map((section) => ({
    section,
    items: filteredFaqs.filter((f) => f.section === section),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Help"
        description="Answers to common questions about the admin console, plus shortcuts to everyday tasks."
        actions={
          <a href={`mailto:${SUPPORT_EMAIL}`} className={buttonClasses('secondary')}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            Contact support
          </a>
        }
      />

      <div className="space-y-6">
        {/* Quick links */}
        <Card>
          <CardHeader title="Quick links" description="Jump straight to the most common tasks." />
          <CardBody>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="flex h-full items-start gap-3 rounded-md border border-gray-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{link.label}</span>
                        <span className="mt-0.5 block text-xs text-gray-500">{link.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                Frequently asked questions
                <Badge tone="neutral">
                  {filteredFaqs.length}
                  <span className="sr-only"> topics</span>
                </Badge>
              </span>
            }
            description="Search by question or answer text."
            actions={
              <SearchInput
                id="help-search"
                aria-label="Search help topics"
                placeholder="Search help topics"
                value={search}
                onChange={setSearch}
              />
            }
          />
          <CardBody padding="none">
            {filteredFaqs.length === 0 ? (
              <EmptyState
                compact
                icon={FileText}
                title={`No results for "${search}"`}
                description="Try a different search term, or clear the search to see every topic."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-gray-200">
                {groups.map((group) => (
                  <section key={group.section} aria-labelledby={sectionId(group.section)}>
                    {/* h4: the card title above is CardHeader's h3. */}
                    <h4
                      id={sectionId(group.section)}
                      className="bg-gray-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {group.section}
                    </h4>
                    <ul className="divide-y divide-gray-200">
                      {group.items.map((faq) => (
                        <FaqItem
                          key={faq.q}
                          faq={faq}
                          open={openQuestions.has(faq.q)}
                          onToggle={() => toggleQuestion(faq.q)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader title="Contact support" description="For anything the questions above do not cover." />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                {
                  label: 'Support email',
                  value: (
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-700 hover:underline">
                      {SUPPORT_EMAIL}
                    </a>
                  ),
                },
                {
                  label: 'Customer enquiries',
                  value: (
                    <>
                      Messages customers send from the app arrive in{' '}
                      <Link to="/support-messages" className="font-medium text-brand-700 hover:underline">
                        Support messages
                      </Link>
                      .
                    </>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
};

export default HelpPage;
