import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getProductsByCategory, Product } from '../services/supabase';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatters';

type SortOption = 'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'default', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name-asc', label: 'Name: A → Z' },
  { value: 'name-desc', label: 'Name: Z → A' },
];

/* ─── Inline styles injected once ─────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,400&family=DM+Sans:wght@300;400;500&display=swap');

  :root {
    --cream:   #f8f5f0;
    --ink:     #1a1a18;
    --muted:   #6b6b68;
    --accent:  #c8622a;
    --accent2: #e8a87c;
    --surface: #ffffff;
    --border:  #e4dfd8;
    --radius:  14px;
    --ease-smooth: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  }

  .cp-root {
    font-family: 'DM Sans', sans-serif;
    background: var(--cream);
    min-height: 100vh;
    color: var(--ink);
  }

  /* ── header ── */
  .cp-hero {
    position: relative;
    overflow: hidden;
    padding: 4rem 2rem 3rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .cp-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 70% 60% at 110% -10%, #f2d9c8 0%, transparent 60%),
                radial-gradient(ellipse 50% 50% at -10% 110%, #ede8e0 0%, transparent 60%);
    pointer-events: none;
  }
  .cp-hero-inner {
    position: relative;
    max-width: 1280px;
    margin: 0 auto;
    animation: cpFadeUp 0.6s var(--ease-out) both;
  }
  .cp-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.75rem;
  }
  .cp-eyebrow-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--accent);
    display: inline-block;
  }
  .cp-title {
    font-family: 'Fraunces', serif;
    font-size: clamp(2.4rem, 5vw, 3.8rem);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--ink);
    margin: 0 0 0.5rem;
  }
  .cp-subtitle {
    font-size: 1rem;
    color: var(--muted);
    font-weight: 300;
    margin: 0;
  }

  /* ── toolbar ── */
  .cp-toolbar {
    max-width: 1280px;
    margin: 0 auto;
    padding: 1.5rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    animation: cpFadeUp 0.6s var(--ease-out) 0.1s both;
  }
  .cp-count {
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cp-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 500;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 100px;
    line-height: 1;
    transition: transform 0.3s var(--ease-smooth), opacity 0.2s;
  }
  .cp-count-badge.loading {
    opacity: 0.5;
    animation: cpPulse 1.4s ease-in-out infinite;
  }

  /* ── sort pills ── */
  .cp-sort-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cp-sort-label {
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 500;
    white-space: nowrap;
  }
  .cp-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .cp-pill {
    padding: 6px 14px;
    border-radius: 100px;
    border: 1.5px solid var(--border);
    background: transparent;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    white-space: nowrap;
    letter-spacing: 0.01em;
  }
  .cp-pill:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: #fdf4ef;
  }
  .cp-pill.active {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
    font-weight: 500;
  }
  .cp-pill:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── divider ── */
  .cp-divider {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 2rem;
  }
  .cp-divider hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 0;
  }

  /* ── content area ── */
  .cp-content {
    max-width: 1280px;
    margin: 0 auto;
    padding: 2rem 2rem 4rem;
    animation: cpFadeUp 0.5s var(--ease-out) 0.18s both;
  }

  /* ── error state ── */
  .cp-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 5rem 2rem;
    text-align: center;
    color: var(--muted);
  }
  .cp-error-icon {
    width: 48px; height: 48px;
    border-radius: 50%;
    background: #fdecea;
    color: #c0392b;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
  }
  .cp-error-title { font-weight: 600; color: var(--ink); margin: 0; font-size: 1rem; }
  .cp-error-msg { font-size: 0.875rem; margin: 0; }
  .cp-retry-btn {
    margin-top: 4px;
    padding: 9px 22px;
    border-radius: 100px;
    border: 1.5px solid var(--ink);
    background: transparent;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--ink);
    cursor: pointer;
    transition: all 0.2s;
  }
  .cp-retry-btn:hover { background: var(--ink); color: #fff; }

  /* ── empty state ── */
  .cp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 5rem 2rem;
    text-align: center;
  }
  .cp-empty-icon {
    font-size: 3rem;
    margin-bottom: 4px;
    opacity: 0.25;
  }
  .cp-empty-title {
    font-family: 'Fraunces', serif;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--ink);
    margin: 0;
  }
  .cp-empty-msg {
    font-size: 0.9rem;
    color: var(--muted);
    margin: 0;
  }

  /* ── animations ── */
  @keyframes cpFadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes cpPulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(0.88); }
  }

  /* ── responsive ── */
  @media (max-width: 600px) {
    .cp-hero { padding: 2.5rem 1.25rem 2rem; }
    .cp-toolbar, .cp-content, .cp-divider { padding-left: 1.25rem; padding-right: 1.25rem; }
    .cp-pills { gap: 4px; }
    .cp-pill { padding: 5px 11px; font-size: 0.75rem; }
  }
`;

/* ─── Component ───────────────────────────────────────────────────────── */
const CategoryPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const { showNotification } = useNotification();

  /* ── inject styles once ── */
  useEffect(() => {
    if (document.getElementById('cp-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'cp-styles';
    tag.textContent = STYLES;
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, []);

  /* ── fetch ── */
  const fetchProducts = useCallback(async () => {
    if (!categoryId) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      console.log('🔍 CategoryPage - Fetching products for category:', categoryId);
      const categoryProducts = await getProductsByCategory(categoryId);
      console.log('📦 CategoryPage - Products found:', categoryProducts.length);
      setProducts(categoryProducts);
    } catch (err) {
      const errorMessage = 'Failed to load products. Please try again.';
      console.error('Error fetching products:', err);
      setError(errorMessage);
      showNotification(errorMessage, 'error');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [categoryId, showNotification]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  /* ── sort ── */
  const sortedProducts = useMemo(() => {
    const shuffled = [...products];
    if (sortBy === 'default') {
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    return shuffled.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':  return a.price - b.price;
        case 'price-desc': return b.price - a.price;
        case 'name-asc':   return a.name.localeCompare(b.name);
        case 'name-desc':  return b.name.localeCompare(a.name);
        default:           return 0;
      }
    });
  }, [products, sortBy]);

  const categoryName = useMemo(
    () => (categoryId ? formatCategoryName(categoryId) : 'Category'),
    [categoryId],
  );

  const handleSortChange = useCallback((val: SortOption) => {
    setSortBy(val);
  }, []);

  /* ── derived UI state ── */
  const count = products.length;
  const isDisabled = loading || error !== null;

  return (
    <div className="cp-root">
      {/* Hero Header */}
      <header className="cp-hero">
        <div className="cp-hero-inner">
          <span className="cp-eyebrow">
            <span className="cp-eyebrow-dot" />
            Collection
          </span>
          <h1 className="cp-title">{categoryName}</h1>
          <p className="cp-subtitle">Browse our selection of {categoryName.toLowerCase()}</p>
        </div>
      </header>

      {/* Toolbar */}
      <div className="cp-toolbar">
        {/* Count badge */}
        <div className="cp-count">
          <span
            className={`cp-count-badge${loading ? ' loading' : ''}`}
            aria-live="polite"
          >
            {loading ? '…' : error ? '!' : count}
          </span>
          {loading
            ? 'Loading products…'
            : error
              ? 'Failed to load'
              : count === 1 ? '1 product found' : `${count} products found`}
        </div>

        {/* Sort pills */}
        <div className="cp-sort-wrap">
          <span className="cp-sort-label">Sort</span>
          <div className="cp-pills" role="group" aria-label="Sort products">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`cp-pill${sortBy === opt.value ? ' active' : ''}`}
                onClick={() => handleSortChange(opt.value)}
                disabled={isDisabled}
                aria-pressed={sortBy === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="cp-divider"><hr /></div>

      {/* Main Content */}
      <main className="cp-content">
        {error ? (
          <div className="cp-error" role="alert">
            <div className="cp-error-icon">✕</div>
            <p className="cp-error-title">Something went wrong</p>
            <p className="cp-error-msg">{error}</p>
            <button className="cp-retry-btn" onClick={fetchProducts}>Try again</button>
          </div>
        ) : !loading && count === 0 ? (
          <div className="cp-empty">
            <div className="cp-empty-icon">◻</div>
            <h2 className="cp-empty-title">Nothing here yet</h2>
            <p className="cp-empty-msg">No products found in this category.</p>
          </div>
        ) : (
          <ProductGrid products={sortedProducts} loading={loading} />
        )}
      </main>
    </div>
  );
};

export default CategoryPage;