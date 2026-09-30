import { Router } from 'express';
import { db } from '../db/index.js';

export const productsRouter = Router();

const SELECT_ALL = db.prepare('SELECT id, name, category, price, stock FROM products ORDER BY id');
const SELECT_BY_CATEGORY = db.prepare(
  'SELECT id, name, category, price, stock FROM products WHERE category = ? ORDER BY id',
);
const SELECT_BY_PRICE_RANGE = db.prepare(
  'SELECT id, name, category, price, stock FROM products WHERE price BETWEEN ? AND ? ORDER BY id',
);
const SELECT_BY_CATEGORY_AND_PRICE_RANGE = db.prepare(
  'SELECT id, name, category, price, stock FROM products WHERE category = ? AND price BETWEEN ? AND ? ORDER BY id',
);
const COUNT_CHEAPER_IN_CATEGORY = db.prepare(
  'SELECT COUNT(*) AS count FROM products WHERE category = ? AND price < ?',
);

productsRouter.get('/', (req, res) => {
  const { category, minPrice, maxPrice } = req.query;
  const min = minPrice !== undefined ? Number(minPrice) : 0;
  const max = maxPrice !== undefined ? Number(maxPrice) : Number.MAX_SAFE_INTEGER;
  const hasPriceRange = minPrice !== undefined || maxPrice !== undefined;

  let rows;
  if (category && hasPriceRange) {
    rows = SELECT_BY_CATEGORY_AND_PRICE_RANGE.all(category, min, max);
  } else if (hasPriceRange) {
    rows = SELECT_BY_PRICE_RANGE.all(min, max);
  } else if (category) {
    rows = SELECT_BY_CATEGORY.all(category);
  } else {
    rows = SELECT_ALL.all();
  }

  const withRanking = rows.map((row) => {
    const { count } = COUNT_CHEAPER_IN_CATEGORY.get(row.category, row.price);
    return { ...row, cheaperInCategory: count };
  });

  res.json(withRanking);
});
