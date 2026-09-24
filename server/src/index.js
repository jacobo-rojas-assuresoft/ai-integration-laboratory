import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import { productsRouter } from './routes/products.js';
import { ordersRouter } from './routes/orders.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);

const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get();
if (count === 0) {
  console.warn('No hay productos en la base de datos. Ejecuta "npm run seed" en /server.');
}

app.listen(PORT, () => {
  console.log(`Server escuchando en http://localhost:${PORT}`);
});
