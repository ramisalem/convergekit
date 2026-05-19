ALTER TABLE "chat_sessions" ADD COLUMN "title" text;
ALTER TABLE "chat_sessions" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
