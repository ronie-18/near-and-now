import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllProducts } from '../services/supabase';
import { Product } from '../services/supabase';
import { getCategories, Category } from '../services/adminService';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatCategoryName';
import ProductCard from '../components/products/ProductCard';

/* ─────────────────────────────────────────────────────────
   HomePage — redesigned UI, identical logic
───────────────────────────────────────────────────────── */

const HomePage = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotification();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const [products, categoriesData] = await Promise.all([
          getAllProducts(),
          getCategories()
        ]);

        setAllProducts(products);

        const productCategories = new Set(products.map(p => p.category).filter(Boolean));

        const uniqueCategories = categoriesData.filter((category, index, self) => {
          const isUnique = index === self.findIndex(c =>
            c.name.toLowerCase() === category.name.toLowerCase()
          );
          const hasProducts = products.length === 0 || productCategories.has(category.name);
          return isUnique && hasProducts;
        });

        setCategories(uniqueCategories);
      } catch (error) {
        console.error('Error fetching data:', error);
        showNotification('Failed to load data. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

  return (
    <>
      {/* ── Global styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .hp-root { font-family: 'Plus Jakarta Sans', sans-serif; }
        .hp-root .font-display { font-family: 'Nunito', sans-serif; }

        /* Staggered fade-up on load */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }

        /* Shimmer skeleton */
        .skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e4e4e4 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Category tile hover */
        .cat-tile { transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease; }
        .cat-tile:hover { transform: translateY(-4px) scale(1.03); box-shadow: 0 10px 28px -6px rgba(0,0,0,0.14); }

        /* Section card */
        .section-card {
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 2px 20px -4px rgba(0,0,0,0.07);
          border: 1px solid #f0f0ee;
        }

        /* See-all button */
        .see-all-row {
          background: linear-gradient(135deg, #f6faf3 0%, #eef7e8 100%);
          transition: background 0.2s, transform 0.15s;
        }
        .see-all-row:hover { background: linear-gradient(135deg, #eef7e8 0%, #dff0d6 100%); transform: translateY(-1px); }

        /* Banner shimmer effect */
        .banner-wrap { position: relative; overflow: hidden; border-radius: 18px; }
        .banner-wrap::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.18) 100%);
          pointer-events: none;
        }

        /* Badge pill */
        .badge-pill {
          font-family: 'Nunito', sans-serif;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        /* Product section header underline accent */
        .section-heading::after {
          content: '';
          display: block;
          width: 36px;
          height: 3px;
          border-radius: 99px;
          background: var(--color-primary, #22c55e);
          margin-top: 5px;
        }
      `}</style>

      <div className="hp-root min-h-screen bg-[#f7f8f5]">

        {/* ══════════════════════════════════════
            BANNER
        ══════════════════════════════════════ */}
        <section className="px-3 sm:px-4 pt-3 pb-4 max-w-[1600px] mx-auto">
          <div className="banner-wrap w-full h-36 sm:h-44 md:h-52 bg-neutral-200">
            <img
              src="/near_and_now_banner.png"
              alt="Near & Now - Digital Dukan, Local Dil Se - Groceries, Essentials & More Delivered in Minutes"
              className="absolute inset-0 h-full w-full object-cover object-center"
              loading="eager"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        </section>

        {/* ══════════════════════════════════════
            CATEGORIES
        ══════════════════════════════════════ */}
        <section className="px-3 sm:px-4 pb-5 max-w-[1600px] mx-auto">
          <div className="section-card p-4 sm:p-5">

            {/* Section title */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-black text-gray-900 leading-none section-heading">
                  Shop by Category
                </h2>
              </div>
              <span className="text-xs text-gray-400 font-medium tracking-wide uppercase">Everything you need</span>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9 gap-2.5 sm:gap-3">
              {loading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2" style={{ animationDelay: `${i * 40}ms` }}>
                      <div className="w-full aspect-square rounded-2xl skeleton" />
                      <div className="h-2.5 w-14 rounded-full skeleton" />
                    </div>
                  ))
                : categories.map((category, i) => (
                    <Link
                      key={category.id}
                      to={`/category/${encodeURIComponent(category.name)}`}
                      className="cat-tile flex flex-col items-center group"
                      style={{ animationDelay: `${i * 35}ms` }}
                    >
                      <div className="w-full aspect-square rounded-2xl overflow-hidden border border-gray-100 bg-gradient-to-br from-green-50 to-emerald-50/30 mb-1.5 shadow-sm">
                        <img
                          src={category.image_url || `https://via.placeholder.com/300x300?text=${encodeURIComponent(category.name)}`}
                          alt={category.name}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = `https://via.placeholder.com/300x300?text=${encodeURIComponent(category.name)}`;
                          }}
                        />
                      </div>
                      <p className="text-[10px] sm:text-[11px] font-semibold text-gray-600 text-center leading-snug line-clamp-2 group-hover:text-primary transition-colors px-0.5">
                        {formatCategoryName(category.name)}
                      </p>
                    </Link>
                  ))
              }
            </div>

            {!loading && categories.length === 0 && (
              <div className="text-center py-10">
                <p className="text-gray-400 text-sm">No categories available at the moment.</p>
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════
            PRODUCTS BY CATEGORY
        ══════════════════════════════════════ */}
        <section className="px-3 sm:px-4 pb-10 max-w-[1600px] mx-auto">

          {loading ? (
            /* ── Loading skeletons ── */
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="section-card p-4 sm:p-5">
                  <div className="h-6 w-44 rounded-xl skeleton mb-4" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-2xl overflow-hidden border border-gray-100 skeleton" style={{ height: 200 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

          ) : categories.length > 0 ? (
            /* ── Category sections ── */
            <div className="space-y-5">
              {categories.map((category, sectionIdx) => {
                const categoryProducts = allProducts.filter(p => p.category === category.name);
                if (categoryProducts.length === 0) return null;

                const displayProducts = categoryProducts.slice(0, 6);
                const hasMore = categoryProducts.length > 6;

                return (
                  <div
                    key={category.id}
                    className="section-card p-4 sm:p-5 fade-up"
                    style={{ animationDelay: `${sectionIdx * 60}ms` }}
                  >
                    {/* Section header */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-display text-lg sm:text-xl font-black text-gray-900 leading-none section-heading">
                          {formatCategoryName(category.name)}
                        </h2>
                        <p className="text-xs text-gray-400 font-medium mt-1.5">Top picks for you</p>
                      </div>
                      {hasMore && (
                        <Link
                          to={`/category/${encodeURIComponent(category.name)}`}
                          className="flex items-center gap-1 text-xs sm:text-sm font-bold text-primary hover:opacity-75 transition-opacity shrink-0 bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-full"
                        >
                          See all
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}
                    </div>

                    {/* Product grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
                      {displayProducts.map((product, pi) => (
                        <div
                          key={product.id}
                          className="fade-up"
                          style={{ animationDelay: `${sectionIdx * 60 + pi * 40}ms` }}
                        >
                          <ProductCard product={product} />
                        </div>
                      ))}
                    </div>

                    {/* See all footer strip */}
                    {hasMore && (
                      <Link
                        to={`/category/${encodeURIComponent(category.name)}`}
                        className="see-all-row mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm font-bold text-primary"
                      >
                        View all {formatCategoryName(category.name)} products
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

          ) : (
            /* ── Empty state ── */
            <div className="section-card text-center py-20 px-6">
              <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center mx-auto mb-5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="font-display text-xl font-black text-gray-700 mb-2">No Products Yet</h3>
              <p className="text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">
                We're stocking up! Fresh products are on their way — check back soon.
              </p>
            </div>
          )}
        </section>

      </div>
    </>
  );
};

export default HomePage;