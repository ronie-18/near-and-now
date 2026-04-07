import { useState, useEffect } from 'react';

import { Link } from 'react-router-dom';

import { getAllProducts } from '../services/supabase';

import { Product } from '../services/supabase';

import { getCategories, Category } from '../services/adminService';

import { useNotification } from '../context/NotificationContext';

import { formatCategoryName } from '../utils/formatCategoryName';



const HomePage = () => {

  const [allProducts, setAllProducts] = useState<Product[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);

  const { showNotification } = useNotification();



  // Fetch all products and categories on mount

  useEffect(() => {

    const fetchData = async () => {

      try {

        setLoading(true);

        const [products, categoriesData] = await Promise.all([

          getAllProducts(),

          getCategories()

        ]);

        setAllProducts(products);



        // Filter categories: remove duplicates. When we have products, only show categories that have products; when no products, show all so the section isn't empty.

        const productCategories = new Set(products.map(p => p.category).filter(Boolean));

        const uniqueCategories = categoriesData.filter((category, index, self) => {

          // Remove duplicates by name (case-insensitive)

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

      {/* Categories Section - Centered Grid Layout */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-4">
          {/* Categories Grid - Centered, 10 per row on large screens */}
          <div className="flex justify-center">
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4 md:gap-6 max-w-7xl">
              {loading ? (
                // Category Skeleton Loaders
                Array.from({ length: 20 }).map((_, index) => (
                  <div
                    key={`skeleton-cat-${index}`}
                    className="flex flex-col items-center animate-pulse"
                  >
                    <div className="w-20 h-20 md:w-24 md:h-24 bg-gray-200 rounded-lg mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                ))
              ) : (
                categories.map((category) => (
                  <Link
                    key={category.id}
                    to={`/category/${encodeURIComponent(category.name)}`}
                    className="flex flex-col items-center group"
                  >
                    <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden mb-2 transform group-hover:scale-105">
                      <img
                        src={category.image_url || `https://via.placeholder.com/100?text=${encodeURIComponent(category.name)}`}
                        alt={category.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://via.placeholder.com/100?text=${encodeURIComponent(category.name)}`;
                        }}
                      />
                    </div>
                    <p className="text-xs md:text-sm text-gray-700 text-center font-medium leading-tight max-w-[80px] md:max-w-[100px] group-hover:text-primary transition-colors">
                      {formatCategoryName(category.name)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Empty State */}
          {!loading && categories.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No categories available at the moment.</p>
            </div>
          )}
        </div>
      </section>



      {/* Products by Category Section */}
      <section className="py-8 bg-white">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="space-y-12">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx}>
                  <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse"></div>
                  <div className="flex gap-4 overflow-hidden">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex-shrink-0 w-44 bg-white rounded-lg border border-gray-200 p-3 animate-pulse">
                        <div className="h-32 bg-gray-200 rounded mb-3"></div>
                        <div className="h-3 bg-gray-200 rounded w-16 mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-20 mb-3"></div>
                        <div className="h-8 bg-gray-200 rounded"></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : categories.length > 0 ? (
            <div className="space-y-12">
              {categories.map((category) => {
                const categoryProducts = allProducts.filter(p => p.category === category.name).slice(0, 12);
                if (categoryProducts.length === 0) return null;

                return (
                  <div key={category.id}>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-gray-900">
                        {formatCategoryName(category.name)}
                      </h2>
                      <Link
                        to={`/category/${encodeURIComponent(category.name)}`}
                        className="text-green-600 hover:text-green-700 font-semibold text-sm flex items-center gap-1"
                      >
                        see all
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>

                    <div className="relative">
                      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                        {categoryProducts.map((product) => (
                          <Link
                            key={product.id}
                            to={`/product/${product.id}`}
                            className="flex-shrink-0 w-44 bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow duration-200 overflow-hidden group"
                          >
                            <div className="p-3">
                              <div className="relative h-32 mb-3 bg-gray-50 rounded overflow-hidden">
                                <img
                                  src={product.image || 'https://via.placeholder.com/150'}
                                  alt={product.name}
                                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                                  loading="lazy"
                                />
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                                </svg>
                                <span>14 MINS</span>
                              </div>
                              <h3 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2 min-h-[2.5rem]">
                                {product.name}
                              </h3>
                              <p className="text-xs text-gray-500 mb-3">
                                {product.unit || 'per unit'}
                              </p>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-900">
                                  ₹{Math.round(product.price)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    // Add to cart functionality would go here
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-green-600 border border-green-600 rounded hover:bg-green-50 transition-colors"
                                >
                                  ADD
                                </button>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-24 w-24 mx-auto text-gray-300 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                No Products Available
              </h3>
              <p className="text-gray-500">
                We're working on adding new products. Check back soon!
              </p>
            </div>
          )}
        </div>
      </section>



    </>

  );

};



export default HomePage;