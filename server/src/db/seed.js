import { db } from './index.js';

// PRNG determinista (mulberry32) para que el seed sea 100% reproducible.
const SEED = 20260920;

function mulberry32(seed) {
  let state = seed;
  return function () {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = [
  'Electrónica',
  'Hogar',
  'Ropa',
  'Deportes',
  'Juguetes',
  'Libros',
  'Alimentos',
  'Belleza',
  'Jardín',
  'Oficina',
];

const ADJECTIVES = [
  'Clásico',
  'Moderno',
  'Compacto',
  'Premium',
  'Portátil',
  'Elegante',
  'Duradero',
  'Ecológico',
  'Inteligente',
  'Básico',
];

const NOUNS_BY_CATEGORY = {
  Electrónica: ['Auriculares', 'Cargador', 'Teclado', 'Mouse', 'Altavoz', 'Cámara', 'Tablet', 'Router'],
  Hogar: ['Lámpara', 'Cojín', 'Manta', 'Espejo', 'Florero', 'Reloj de Pared', 'Organizador', 'Alfombra'],
  Ropa: ['Camiseta', 'Pantalón', 'Chaqueta', 'Bufanda', 'Gorra', 'Zapatillas', 'Suéter', 'Vestido'],
  Deportes: ['Balón', 'Mancuerna', 'Bicicleta', 'Colchoneta', 'Cuerda de Saltar', 'Casco', 'Mochila Deportiva', 'Botella'],
  Juguetes: ['Rompecabezas', 'Muñeco', 'Bloques', 'Peluche', 'Carrito', 'Cometa', 'Juego de Mesa', 'Yo-yo'],
  Libros: ['Novela', 'Manual', 'Cuaderno', 'Diario', 'Cómic', 'Enciclopedia', 'Biografía', 'Atlas'],
  Alimentos: ['Café', 'Té', 'Snack', 'Aceite de Oliva', 'Especias', 'Cereal', 'Miel', 'Pasta'],
  Belleza: ['Crema', 'Perfume', 'Champú', 'Labial', 'Esmalte', 'Jabón', 'Serum', 'Cepillo'],
  Jardín: ['Maceta', 'Regadera', 'Semillas', 'Pala', 'Guantes de Jardín', 'Manguera', 'Fertilizante', 'Banco de Jardín'],
  Oficina: ['Bolígrafo', 'Grapadora', 'Carpeta', 'Agenda', 'Calculadora', 'Silla', 'Escritorio', 'Post-it'],
};

const TOTAL_PRODUCTS = 500;

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function randomPrice(rng) {
  return Math.round((rng() * 495 + 5) * 100) / 100;
}

function randomStock(rng) {
  return Math.floor(rng() * 500);
}

function seed() {
  const rng = mulberry32(SEED);
  const insert = db.prepare('INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)');

  const seedAll = db.transaction(() => {
    db.exec('DELETE FROM order_items');
    db.exec('DELETE FROM orders');
    db.exec('DELETE FROM products');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('products', 'orders', 'order_items')");

    for (let i = 0; i < TOTAL_PRODUCTS; i += 1) {
      const category = pick(rng, CATEGORIES);
      const noun = pick(rng, NOUNS_BY_CATEGORY[category]);
      const adjective = pick(rng, ADJECTIVES);
      const name = `${noun} ${adjective}`;
      insert.run(name, category, randomPrice(rng), randomStock(rng));
    }
  });

  seedAll();
  console.log(`Se sembraron ${TOTAL_PRODUCTS} productos sintéticos (seed=${SEED}).`);
}

seed();
