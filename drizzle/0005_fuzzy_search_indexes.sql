-- Enable trigram extension for fuzzy search + GIN index support on ILIKE/similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Lower the similarity threshold so the % operator is more lenient (default 0.3 is too strict)
-- ALTER DATABASE sets it for all new connections from the pool
ALTER DATABASE clothing_pos SET pg_trgm.similarity_threshold = 0.15;

-- Product name: POS search, inventory search
CREATE INDEX IF NOT EXISTS product_name_trgm_idx ON products USING GIN (name gin_trgm_ops);

-- Customer name/phone: customer list, POS customer picker, order search
CREATE INDEX IF NOT EXISTS customer_name_trgm_idx ON customers USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customer_phone_trgm_idx ON customers USING GIN (phone gin_trgm_ops);

-- Cashbook description: transaction search
CREATE INDEX IF NOT EXISTS cashbook_description_trgm_idx ON cashbook USING GIN (description gin_trgm_ops);
