# Technical Debt

- **JWT auth duplication** — Same 15-line JWT extraction block is copy-pasted 10+ times in `cms/src/server.ts`. Should be extracted to middleware.
- **Missing database indexes** — `bids(product_id, amount DESC)`, `products(status, active)`, `messages(product_id, read)`, `products(auction_end_date)`.
- **No input validation** — No schema validation (Zod/Joi) on POST bodies in custom CMS endpoints.
- **40+ `any` casts** in `cms/src/server.ts` and `(global as any)` pattern throughout.
- **N+1 queries** in `/api/create-conversations` and `fetchMyPurchases`.
- **No rate limiting** on any endpoint.
- **No test suite** — Zero test files in the entire project.
