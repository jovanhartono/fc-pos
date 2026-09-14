-- Nothing can use it: the picker searches with ILIKE '%…%', which no btree
-- answers, and the origin report joins on the primary key instead.
DROP INDEX "postal_code_city_idx";
