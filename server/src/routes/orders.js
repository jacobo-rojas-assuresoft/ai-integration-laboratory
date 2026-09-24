import { Router } from 'express';
import { db } from '../db/index.js';

export const ordersRouter = Router();

const getProduct = db.prepare('SELECT id, price, stock FROM products WHERE id = ?');
const insertOrder = db.prepare('INSERT INTO orders DEFAULT VALUES');
const insertItem = db.prepare(
  'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
);
const decrementStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

ordersRouter.post('/', (req, res) => {
  const { items } = req.body ?? {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La orden debe incluir al menos un item.' });
  }

  const invalidItem = items.find(
    (item) => !Number.isInteger(item.productId) || !Number.isInteger(item.quantity) || item.quantity <= 0,
  );
  if (invalidItem) {
    return res.status(400).json({ error: 'Cada item requiere productId y quantity (entero positivo).' });
  }

  try {
    const result = db.transaction(() => {
      const products = items.map((item) => {
        const product = getProduct.get(item.productId);
        if (!product) {
          throw new Error(`Producto ${item.productId} no encontrado.`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Stock insuficiente para el producto ${item.productId}.`);
        }
        return { ...item, product };
      });

      const { lastInsertRowid: orderId } = insertOrder.run();

      let total = 0;
      for (const { productId, quantity, product } of products) {
        insertItem.run(orderId, productId, quantity, product.price);
        decrementStock.run(quantity, productId);
        total += product.price * quantity;
      }

      return { orderId, total: Math.round(total * 100) / 100 };
    })();

    res.status(201).json({ id: result.orderId, total: result.total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
