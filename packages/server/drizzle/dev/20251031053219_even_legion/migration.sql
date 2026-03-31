CREATE TABLE "order_counters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_counters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_code" varchar(10) NOT NULL,
	"date_str" varchar(6) NOT NULL,
	"last_number" integer DEFAULT 1 NOT NULL
);
