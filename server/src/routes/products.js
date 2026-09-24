import { Router } from 'express';
import { db } from '../db/index.js';

export const productsRouter = Router();

const SELECT_ALL = db.prepare('SELECT id, name, category, price, stock FROM products ORDER BY id');
const SELECT_BY_CATEGORY = db.prepare(
  'SELECT id, name, category, price, stock FROM products WHERE category = ? ORDER BY id',
);
const COUNT_CHEAPER_IN_CATEGORY = db.prepare(
  'SELECT COUNT(*) AS count FROM products WHERE category = ? AND price < ?',
);

productsRouter.get('/', (req, res) => {
  const { category } = req.query;
  const rows = category ? SELECT_BY_CATEGORY.all(category) : SELECT_ALL.all();

  const withRanking = rows.map((row) => {
    const { count } = COUNT_CHEAPER_IN_CATEGORY.get(row.category, row.price);
    return { ...row, cheaperInCategory: count };
  });

  res.json(withRanking);
});
