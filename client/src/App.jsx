import { useEffect, useState } from 'react';
import './App.css';

const CATEGORY_ALL = 'todas';

function formatPrice(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(value);
}

function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_ALL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]);
  const [orderStatus, setOrderStatus] = useState(null);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        const unique = Array.from(new Set(data.map((p) => p.category))).sort();
        setCategories(unique);
      })
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url =
      selectedCategory === CATEGORY_ALL
        ? '/api/products'
        : `/api/products?category=${encodeURIComponent(selectedCategory)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('No se pudieron cargar los productos.');
        return res.json();
      })
      .then(setProducts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedCategory]);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity > product.stock) return prev;
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      if (product.stock <= 0) return prev;
      return [
        ...prev,
        { productId: product.id, name: product.name, price: product.price, quantity: 1, stock: product.stock },
      ];
    });
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.max(1, Math.min(quantity, item.stock)) }
          : item,
      ),
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const checkout = async () => {
    setOrderStatus(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la orden.');
      setOrderStatus({ type: 'success', message: `Orden #${data.id} creada. Total: ${formatPrice(data.total)}` });
      setCart([]);
    } catch (err) {
      setOrderStatus({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="app">
      <header>
        <h1>Catálogo de Productos</h1>
      </header>

      <main className="layout">
        <section className="catalog" aria-labelledby="catalog-heading">
          <h2 id="catalog-heading">Productos</h2>

          <div className="filter">
            <label htmlFor="category-filter">Categoría</label>
            <select
              id="category-filter"
              data-testid="category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value={CATEGORY_ALL}>Todas las categorías</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          {loading && <p role="status">Cargando productos...</p>}
          {error && <p role="alert">{error}</p>}

          {!loading && !error && (
            <ul className="product-list" data-testid="product-list">
              {products.map((product) => (
                <li key={product.id} className="product-card" data-testid={`product-${product.id}`}>
                  <div className="product-info">
                    <h3>{product.name}</h3>
                    <p className="category">{product.category}</p>
                    <p className="price">{formatPrice(product.price)}</p>
                    <p className="stock">Stock: {product.stock}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={product.stock <= 0}
                    aria-label={`Agregar ${product.name} al carrito`}
                    data-testid={`add-to-cart-${product.id}`}
                  >
                    {product.stock <= 0 ? 'Sin stock' : 'Agregar al carrito'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="cart" aria-labelledby="cart-heading" data-testid="cart">
          <h2 id="cart-heading">Carrito</h2>

          {cart.length === 0 ? (
            <p>El carrito está vacío.</p>
          ) : (
            <ul className="cart-list">
              {cart.map((item) => (
                <li key={item.productId} className="cart-item" data-testid={`cart-item-${item.productId}`}>
                  <span className="cart-item-name">{item.name}</span>

                  <label htmlFor={`quantity-${item.productId}`}>Cantidad de {item.name}</label>
                  <input
                    id={`quantity-${item.productId}`}
                    data-testid={`quantity-${item.productId}`}
                    type="number"
                    min="1"
                    max={item.stock}
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                  />

                  <span>{formatPrice(item.price * item.quantity)}</span>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.productId)}
                    aria-label={`Quitar ${item.name} del carrito`}
                    data-testid={`remove-from-cart-${item.productId}`}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="cart-total" data-testid="cart-total">
            Total: {formatPrice(cartTotal)}
          </p>

          <button type="button" onClick={checkout} disabled={cart.length === 0} data-testid="checkout-button">
            Confirmar compra
          </button>

          {orderStatus && (
            <p
              role={orderStatus.type === 'error' ? 'alert' : 'status'}
              data-testid="order-status"
              className={orderStatus.type}
            >
              {orderStatus.message}
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
