# nodejs-sandbox

AI practice lab for Node.js/React developers: a simple monorepo (product catalog +
cart) designed as a sandbox for exercising AI prompts and tools on a real codebase.

## Structure

```
.
├── .devcontainer/       # devcontainer.json + post-create.sh (do not modify)
├── server/              # Express + SQLite API (better-sqlite3)
│   ├── src/
│   │   ├── db/          # SQLite connection + reproducible seed
│   │   ├── routes/      # /api/products, /api/orders
│   │   └── index.js     # server entrypoint
│   └── data/            # app.db (generated, not versioned)
└── client/              # React + Vite: catalog and cart
    └── src/
        └── App.jsx
```

## Requirements

- Node.js 20.x (already provided by the devcontainer)
- npm

## Starting the environment

If you're using the devcontainer, `postCreateCommand` already runs `npm install` in
`server/` and `client/` automatically when the container is created.

If you're outside the devcontainer, install the dependencies manually:

```bash
cd server && npm install
cd ../client && npm install
```

## Seeding synthetic data

The server needs the database seeded before it can serve `/api/products`.
The seed is deterministic (same numeric seed on every run ⇒ the same ~500
synthetic products, with no real customer data):

```bash
cd server
npm run seed
```

This creates/recreates `server/data/app.db` with the `products` table populated.

## Running the server (API)

```bash
cd server
npm run dev
```

Runs on `http://localhost:3000`.

- `GET /api/products` — lists products (`id`, `name`, `category`, `price`, `stock`).
  Accepts `?category=<name>` to filter.
- `POST /api/orders` — creates an order. Body:
  ```json
  { "items": [{ "productId": 1, "quantity": 2 }] }
  ```
- `GET /api/health` — health check.

## Running the client (React)

In another terminal:

```bash
cd client
npm run dev
```

Runs on `http://localhost:5173`. The client uses a Vite proxy (`/api` →
`http://localhost:3000`), so make sure the server is running first.

## Locators for testing

The catalog/cart view exposes accessible locators (`getByRole`, `getByLabel`)
and `data-testid` on key elements: category filter (`category-filter`), product
list (`product-list`), add-to-cart buttons (`add-to-cart-<id>`), cart (`cart`),
cart items (`cart-item-<id>`), total (`cart-total`), and checkout button
(`checkout-button`).

## Prompt log

| Initial prompt | Result | Corrected prompt | Why it was corrected |
|---|---|---|---|
| | | | |
