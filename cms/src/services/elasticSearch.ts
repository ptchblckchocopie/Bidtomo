import { Client } from '@elastic/elasticsearch';

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

const INDEX_NAME = 'products';

let client: Client | null = null;

export function getElasticClient(): Client | null {
  if (!ELASTICSEARCH_URL) return null;
  if (!client) {
    client = new Client({
      node: ELASTICSEARCH_URL,
      requestTimeout: 5000,
      maxRetries: 2,
    });
  }
  return client;
}

export async function isElasticAvailable(): Promise<boolean> {
  try {
    const es = getElasticClient();
    if (!es) return false;
    await es.ping();
    return true;
  } catch {
    return false;
  }
}

// Create the products index with proper mappings for search
export async function ensureProductIndex(): Promise<void> {
  const es = getElasticClient();
  if (!es) return;

  try {
    const exists = await es.indices.exists({ index: INDEX_NAME });
    if (exists) return;

    await es.indices.create({
      index: INDEX_NAME,
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            product_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'edge_ngram_filter'],
            },
            product_search_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase'],
            },
          },
          filter: {
            edge_ngram_filter: {
              type: 'edge_ngram',
              min_gram: 2,
              max_gram: 15,
            },
          },
        },
      },
      mappings: {
        properties: {
          title: {
            type: 'text',
            analyzer: 'product_analyzer',
            search_analyzer: 'product_search_analyzer',
            fields: {
              exact: { type: 'keyword' },
            },
          },
          description: {
            type: 'text',
            analyzer: 'product_analyzer',
            search_analyzer: 'product_search_analyzer',
          },
          keywords: {
            type: 'text',
            analyzer: 'product_analyzer',
            search_analyzer: 'product_search_analyzer',
            fields: {
              exact: { type: 'keyword' },
            },
          },
          startingPrice: { type: 'float' },
          currentBid: { type: 'float' },
          bidInterval: { type: 'float' },
          status: { type: 'keyword' },
          active: { type: 'boolean' },
          region: { type: 'keyword' },
          city: { type: 'keyword' },
          sellerId: { type: 'integer' },
          sellerName: { type: 'text' },
          auctionEndDate: { type: 'date' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
    });
    console.log('[Elasticsearch] Created products index');
  } catch (error: any) {
    console.error('[Elasticsearch] Error creating index:', error.message);
  }
}

function buildProductDoc(product: any) {
  const sellerId = typeof product.seller === 'object' ? product.seller?.id : product.seller;
  const sellerName = typeof product.seller === 'object' ? product.seller?.name : undefined;
  const keywords = (product.keywords || [])
    .map((k: any) => k.keyword || k)
    .filter(Boolean);

  return {
    title: product.title,
    description: product.description,
    keywords: keywords.join(' '),
    startingPrice: product.startingPrice,
    currentBid: product.currentBid || 0,
    bidInterval: product.bidInterval || 1,
    status: product.status || 'available',
    active: product.active !== false,
    region: product.region || '',
    city: product.city || '',
    sellerId,
    sellerName,
    auctionEndDate: product.auctionEndDate,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// Index a single product
export async function indexProduct(product: any): Promise<void> {
  const es = getElasticClient();
  if (!es) return;

  try {
    await es.index({
      index: INDEX_NAME,
      id: String(product.id),
      document: buildProductDoc(product),
    });
  } catch (error: any) {
    console.error(`[Elasticsearch] Error indexing product ${product.id}:`, error.message);
  }
}

// Update specific fields on a product
export async function updateProductIndex(productId: string | number, fields: Record<string, any>): Promise<void> {
  const es = getElasticClient();
  if (!es) return;

  try {
    await es.update({
      index: INDEX_NAME,
      id: String(productId),
      doc: fields,
    });
  } catch (error: any) {
    if (error.statusCode === 404) return;
    console.error(`[Elasticsearch] Error updating product ${productId}:`, error.message);
  }
}

// Remove a product from the index
export async function removeProductFromIndex(productId: string | number): Promise<void> {
  const es = getElasticClient();
  if (!es) return;

  try {
    await es.delete({ index: INDEX_NAME, id: String(productId) });
  } catch (error: any) {
    if (error.statusCode === 404) return;
    console.error(`[Elasticsearch] Error removing product ${productId}:`, error.message);
  }
}

// Search products with Elasticsearch
export async function searchProducts(params: {
  query?: string;
  status?: string;
  active?: boolean;
  region?: string;
  city?: string;
  page?: number;
  limit?: number;
  sort?: string;
}): Promise<{ ids: number[]; total: number }> {
  const es = getElasticClient();
  if (!es) return { ids: [], total: 0 };

  const { query, status, active, region, city, page = 1, limit = 12, sort } = params;

  const must: any[] = [];
  const filter: any[] = [];

  // Full-text search across title, description, keywords
  if (query && query.trim()) {
    must.push({
      multi_match: {
        query: query.trim(),
        fields: ['title^3', 'description', 'keywords^2', 'sellerName'],
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    });
  }

  // Filters
  if (status) {
    filter.push({ term: { status } });
  }
  if (active !== undefined) {
    filter.push({ term: { active } });
  }
  if (region) {
    filter.push({ term: { region } });
  }
  if (city) {
    filter.push({ term: { city } });
  }

  const from = (page - 1) * limit;

  // Build sort
  const sortClause: any[] = [];
  if (query && query.trim()) {
    sortClause.push({ _score: 'desc' as const });
  }
  if (sort === '-createdAt' || !sort) {
    sortClause.push({ createdAt: 'desc' as const });
  } else if (sort === 'createdAt') {
    sortClause.push({ createdAt: 'asc' as const });
  }

  try {
    const result = await es.search({
      index: INDEX_NAME,
      query: {
        bool: {
          must: must.length > 0 ? must : [{ match_all: {} }],
          filter,
        },
      },
      from,
      size: limit,
      sort: sortClause.length > 0 ? sortClause : undefined,
      _source: false,
    });

    const hits = result.hits.hits;
    const total = typeof result.hits.total === 'number'
      ? result.hits.total
      : (result.hits.total as any)?.value || 0;

    return {
      ids: hits.map((hit: any) => parseInt(hit._id, 10)),
      total,
    };
  } catch (error: any) {
    console.error('[Elasticsearch] Search error:', error.message);
    return { ids: [], total: 0 };
  }
}

// Bulk sync all products from Payload to Elasticsearch
export async function bulkSyncProducts(payload: any): Promise<{ indexed: number; errors: number }> {
  const es = getElasticClient();
  if (!es) return { indexed: 0, errors: 0 };

  let indexed = 0;
  let errors = 0;
  let page = 1;
  const limit = 100;

  while (true) {
    const result = await payload.find({
      collection: 'products',
      limit,
      page,
      depth: 1,
    });

    if (!result.docs || result.docs.length === 0) break;

    const operations: any[] = [];
    for (const product of result.docs) {
      operations.push({ index: { _index: INDEX_NAME, _id: String(product.id) } });
      operations.push(buildProductDoc(product));
    }

    if (operations.length > 0) {
      const bulkResult = await es.bulk({ operations });
      if (bulkResult.errors) {
        const failedItems = bulkResult.items.filter((item: any) => item.index?.error);
        errors += failedItems.length;
        indexed += result.docs.length - failedItems.length;
      } else {
        indexed += result.docs.length;
      }
    }

    if (!result.hasNextPage) break;
    page++;
  }

  return { indexed, errors };
}
