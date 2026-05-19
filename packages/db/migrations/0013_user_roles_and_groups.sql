-- User roles and groups

-- 1. Create the role enum
CREATE TYPE "user_role" AS ENUM ('admin', 'user');

-- 2. Create groups table
CREATE TABLE IF NOT EXISTS "groups" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 3. Add role and group_id columns to user table
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;
ALTER TABLE "user" ADD COLUMN "group_id" text REFERENCES "groups"("id") ON DELETE SET NULL;

-- 4. Migrate existing users to admin (they all authenticated via GitHub)
UPDATE "user" SET "role" = 'admin';

-- 5. Create group_repositories join table
CREATE TABLE IF NOT EXISTS "group_repositories" (
  "group_id" text NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "repository_id" uuid NOT NULL REFERENCES "repositories"("id") ON DELETE CASCADE,
  "assigned_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "group_repositories_pkey" PRIMARY KEY ("group_id", "repository_id")
);
